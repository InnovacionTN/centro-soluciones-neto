from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, and_

from app.db.session import get_db
from app.core.security import get_current_user, require_rol, create_token, verify_password, hash_password
from app.models.models import (
    Ticket, Usuario, Tipificacion, Grupo, Tienda, ReglaRuteo, Zona,
    Region, Compania,
    EstatusTicket, RolUsuario, BitacoraEvento, AreaTecnica,
    TipoComentario, Evidencia, UrgenciaTipificacion, TipoTicket
)
from app.schemas.schemas import (
    LoginRequest, TokenResponse, TicketCreate, TicketUpdate,
    TicketOut, TicketListItem, ClasificacionRequest, ClasificacionResponse,
    DashboardMetrics, EscalacionRequest, GrupoOut, EvidenciaOut,
    UsuarioCreate, UsuarioUpdate, UsuarioAdminOut,
    TipificacionCreate, TipificacionUpdate, TipificacionAdminOut,
    ReglaRuteoCreate, ReglaRuteoOut,
    GrupoCreate, GrupoUpdate,
    TiendaCreate, TiendaOut,
    CompaniaOut,
)
from app.services.ia_service import classify_with_ai, suggest_solution
from app.services.ticket_service import create_ticket_in_db, log_event, assign_agent_round_robin
from app.services.storage_service import save_file, validate_file, delete_file

router = APIRouter()


# ─── Auth ──────────────────────────────────────────────────────────────────────

@router.post("/auth/login", response_model=TokenResponse)
def login(req: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(Usuario).filter(
        Usuario.email == req.email,
        Usuario.activo == True
    ).first()
    if not user or not verify_password(req.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Credenciales incorrectas")

    user.last_login = datetime.utcnow()
    db.commit()

    token = create_token({"sub": str(user.id), "rol": user.rol.value})
    return TokenResponse(
        access_token=token,
        rol=user.rol,
        nombre=user.nombre,
        tienda_id=user.tienda_id,
    )


@router.get("/auth/me")
def me(current_user: Usuario = Depends(get_current_user)):
    return {
        "id": current_user.id,
        "email": current_user.email,
        "nombre": current_user.nombre,
        "rol": current_user.rol,
        "tienda_id": current_user.tienda_id,
        "grupo_id": current_user.grupo_id,
    }


# ─── IA ────────────────────────────────────────────────────────────────────────

@router.post("/ai/classify", response_model=ClasificacionResponse)
async def classify_ticket(
    req: ClasificacionRequest,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """Clasifica texto libre → devuelve tipificación sugerida con confianza."""
    return await classify_with_ai(req.descripcion, db)


@router.get("/tipificaciones")
def get_tipificaciones(
    area: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    q = db.query(Tipificacion).filter(Tipificacion.activo == True)
    if area:
        q = q.filter(Tipificacion.area_tecnica == area.upper())
    return q.order_by(Tipificacion.area_tecnica, Tipificacion.categoria).all()


# ─── Tickets ───────────────────────────────────────────────────────────────────

@router.post("/tickets", response_model=TicketOut, status_code=201)
async def create_ticket(
    body: TicketCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """
    Crea un ticket. Flujo completo:
    1. Clasifica con IA
    2. Determina grupo por zona + área
    3. Asigna agente Round Robin
    4. Calcula SLA
    5. Registra en bitácora
    """
    tienda_id = current_user.tienda_id
    if not tienda_id and current_user.rol == RolUsuario.TIENDA:
        raise HTTPException(status_code=400, detail="Usuario de tienda sin tienda asignada")

    # Si es admin o agente abriendo a nombre de tienda
    if not tienda_id:
        raise HTTPException(status_code=400, detail="Se requiere tienda_id")

    # Clasificación IA
    clasificacion = await classify_with_ai(body.descripcion, db)

    # Sugerencia de solución para el agente
    solucion_ia = await suggest_solution(
        body.descripcion,
        clasificacion.tipificacion_nombre,
        clasificacion.area_tecnica.value,
        db,
    )

    # Usar tipificación confirmada por usuario o la de la IA
    tip_id = body.tipificacion_id or clasificacion.tipificacion_id
    aceptada = body.ia_clasificacion_aceptada if body.ia_clasificacion_aceptada is not None else (
        body.tipificacion_id is None  # si no modificó, se asume aceptada
    )

    ticket = create_ticket_in_db(
        db=db,
        tienda_id=tienda_id,
        descripcion=body.descripcion,
        usuario_id=current_user.id,
        tipificacion_id=body.tipificacion_id,
        ia_clasificacion_aceptada=aceptada,
        ia_area=clasificacion.area_tecnica.value,
        ia_tipificacion_id=clasificacion.tipificacion_id,
        ia_confianza=clasificacion.confianza,
        ia_sugerencia_solucion=solucion_ia,
        metadata_extra=body.metadata_extra,
    )

    return db.query(Ticket).options(
        joinedload(Ticket.tipificacion),
        joinedload(Ticket.eventos).joinedload(BitacoraEvento.usuario),
    ).filter(Ticket.id == ticket.id).first()


@router.get("/tickets", response_model=list[TicketListItem])
def list_tickets(
    estatus: Optional[str] = None,
    area: Optional[str] = None,
    prioridad: Optional[str] = None,
    solo_mios: bool = False,
    limit: int = Query(50, le=200),
    offset: int = 0,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    q = db.query(Ticket).options(joinedload(Ticket.tipificacion))

    # Tienda solo ve sus propios tickets
    if current_user.rol == RolUsuario.TIENDA:
        q = q.filter(Ticket.tienda_id == current_user.tienda_id)

    # Agente ve los de su grupo
    elif current_user.rol == RolUsuario.AGENTE and not solo_mios:
        q = q.filter(Ticket.grupo_id == current_user.grupo_id)

    if solo_mios and current_user.agente_id if hasattr(current_user, 'agente_id') else False:
        q = q.filter(Ticket.agente_id == current_user.id)

    if estatus:
        q = q.filter(Ticket.estatus == estatus.upper())

    if prioridad:
        q = q.filter(Ticket.prioridad == prioridad.upper())

    if area:
        q = q.join(Tipificacion, Ticket.tipificacion_id == Tipificacion.id).filter(Tipificacion.area_tecnica == area.upper())

    return q.order_by(Ticket.fecha_apertura.desc()).offset(offset).limit(limit).all()


@router.get("/tickets/{ticket_id}", response_model=TicketOut)
def get_ticket(
    ticket_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    ticket = db.query(Ticket).options(
        joinedload(Ticket.tipificacion),
        joinedload(Ticket.eventos).joinedload(BitacoraEvento.usuario),
    ).filter(Ticket.id == ticket_id).first()

    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket no encontrado")

    # Tienda solo puede ver sus propios tickets
    if current_user.rol == RolUsuario.TIENDA and ticket.tienda_id != current_user.tienda_id:
        raise HTTPException(status_code=403, detail="Sin acceso a este ticket")

    return ticket


@router.patch("/tickets/{ticket_id}", response_model=TicketOut)
def update_ticket(
    ticket_id: int,
    body: TicketUpdate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    ticket = db.query(Ticket).filter(Ticket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket no encontrado")

    estado_anterior = ticket.estatus.value
    rol = current_user.rol

    if body.estatus:
        # ── Transiciones válidas por estado ──────────────────────────────────
        valid_transitions = {
            EstatusTicket.NUEVO:            [EstatusTicket.EN_PROCESO],
            EstatusTicket.ASIGNADO:         [EstatusTicket.EN_PROCESO],
            EstatusTicket.EN_PROCESO:       [EstatusTicket.ESPERANDO_TIENDA],
            EstatusTicket.ESPERANDO_TIENDA: [EstatusTicket.RESUELTO, EstatusTicket.RECHAZADO],
            EstatusTicket.RECHAZADO:        [EstatusTicket.EN_PROCESO],
            EstatusTicket.RESUELTO:         [EstatusTicket.CERRADO],
        }
        # Admin puede cancelar desde cualquier estado activo
        estados_activos = [
            EstatusTicket.NUEVO, EstatusTicket.ASIGNADO,
            EstatusTicket.EN_PROCESO, EstatusTicket.ESPERANDO_TIENDA,
            EstatusTicket.RECHAZADO,
        ]
        if rol == RolUsuario.ADMIN and body.estatus == EstatusTicket.CANCELADO:
            if ticket.estatus not in estados_activos:
                raise HTTPException(400, detail="Solo se pueden cancelar tickets activos")
        else:
            allowed = valid_transitions.get(ticket.estatus, [])
            if body.estatus not in allowed:
                raise HTTPException(
                    status_code=400,
                    detail=f"Transición no permitida: {ticket.estatus.value} → {body.estatus.value}"
                )

        # ── Validaciones de permisos por rol ─────────────────────────────────

        # "Tomar ticket" → EN_PROCESO: solo agente/admin, sin texto requerido
        if body.estatus == EstatusTicket.EN_PROCESO:
            if rol == RolUsuario.TIENDA:
                raise HTTPException(403, detail="La tienda no puede tomar tickets")

        # "Enviar solución" → ESPERANDO_TIENDA: solo agente/admin, texto obligatorio
        if body.estatus == EstatusTicket.ESPERANDO_TIENDA:
            if rol == RolUsuario.TIENDA:
                raise HTTPException(403, detail="La tienda no puede enviar soluciones")
            solucion = body.solucion_propuesta or ""
            if len(solucion.strip()) < 10:
                raise HTTPException(
                    400,
                    detail="Debes describir la solución propuesta (mínimo 10 caracteres)"
                )

        # Confirmar/Rechazar: SOLO la tienda o admin
        if body.estatus in (EstatusTicket.RESUELTO, EstatusTicket.RECHAZADO):
            if rol == RolUsuario.AGENTE:
                raise HTTPException(
                    403,
                    detail="Solo la tienda puede confirmar o rechazar la solución"
                )

        # Rechazar requiere motivo
        if body.estatus == EstatusTicket.RECHAZADO:
            if not body.comentario or len(body.comentario.strip()) < 5:
                raise HTTPException(
                    400,
                    detail="Debes indicar por qué rechazas la solución"
                )

        # Cerrar: solo agente o admin (después de RESUELTO)
        if body.estatus == EstatusTicket.CERRADO:
            if rol == RolUsuario.TIENDA:
                raise HTTPException(403, detail="La tienda no puede cerrar tickets")

        # ── Aplicar cambio de estado ──────────────────────────────────────────
        ticket.estatus = body.estatus

        if body.estatus in (EstatusTicket.RESUELTO, EstatusTicket.CERRADO, EstatusTicket.CANCELADO):
            ticket.fecha_cierre = datetime.utcnow()

        if body.estatus == EstatusTicket.EN_PROCESO and not ticket.fecha_primera_respuesta:
            ticket.fecha_primera_respuesta = datetime.utcnow()

        # Subir prioridad si la tienda rechaza
        if body.estatus == EstatusTicket.RECHAZADO:
            from app.models.models import PrioridadTicket
            rank = {"BAJA": 0, "MEDIA": 1, "ALTA": 2, "CRITICA": 3}
            if rank.get(ticket.prioridad.value, 0) < 2:
                ticket.prioridad = PrioridadTicket.ALTA

    if body.solucion_propuesta:
        ticket.solucion_propuesta = body.solucion_propuesta

    if body.agente_id and rol in (RolUsuario.ADMIN,):
        ticket.agente_id = body.agente_id

    # ── Bitácora con tipo de comentario (PUBLICO | INTERNO) ───────────────────
    tipo_com = (body.tipo_comentario or "PUBLICO").upper()
    log_event(
        db, ticket, current_user.id,
        accion="CAMBIO_ESTADO" if body.estatus else "ACTUALIZACION",
        estado_anterior=estado_anterior,
        estado_nuevo=ticket.estatus.value if body.estatus else None,
        comentario=body.comentario,
        tipo_comentario=tipo_com,
    )

    db.commit()
    db.refresh(ticket)

    return db.query(Ticket).options(
        joinedload(Ticket.tipificacion),
        joinedload(Ticket.eventos).joinedload(BitacoraEvento.usuario),
    ).filter(Ticket.id == ticket.id).first()


# ─── Dashboard ─────────────────────────────────────────────────────────────────


@router.get("/grupos", response_model=list[GrupoOut])
def list_grupos(
    area: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """Lista los grupos disponibles. Usado para el selector de escalación."""
    q = db.query(Grupo).filter(Grupo.activo == True)
    if area:
        q = q.filter(Grupo.area_tecnica == area.upper())
    return q.order_by(Grupo.area_tecnica, Grupo.nombre).all()


@router.post("/tickets/{ticket_id}/escalar", response_model=TicketOut)
def escalar_ticket(
    ticket_id: int,
    body: EscalacionRequest,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """
    Escala un ticket a otro grupo.
    - Solo AGENTE o ADMIN pueden escalar.
    - El motivo es obligatorio.
    - El ticket se reasigna por Round Robin en el nuevo grupo.
    """
    # Solo agentes y admin pueden escalar
    if current_user.rol == RolUsuario.TIENDA:
        raise HTTPException(403, detail="Solo los agentes pueden escalar tickets")

    ticket = db.query(Ticket).filter(Ticket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(404, detail="Ticket no encontrado")

    # Solo se pueden escalar tickets activos
    estados_escalables = [
        EstatusTicket.NUEVO, EstatusTicket.ASIGNADO,
        EstatusTicket.EN_PROCESO, EstatusTicket.RECHAZADO,
    ]
    if ticket.estatus not in estados_escalables:
        raise HTTPException(
            400,
            detail=f"No se puede escalar un ticket en estado {ticket.estatus.value}"
        )

    # Validar motivo
    if not body.motivo or len(body.motivo.strip()) < 10:
        raise HTTPException(400, detail="El motivo de escalación debe tener mínimo 10 caracteres")

    # Validar que el grupo destino existe y es diferente
    grupo_destino = db.query(Grupo).filter(
        Grupo.id == body.grupo_destino_id,
        Grupo.activo == True
    ).first()
    if not grupo_destino:
        raise HTTPException(404, detail="Grupo destino no encontrado")
    if grupo_destino.id == ticket.grupo_id:
        raise HTTPException(400, detail="El ticket ya está asignado a ese grupo")

    grupo_origen_nombre = "Sin grupo"
    if ticket.grupo_id:
        g = db.query(Grupo).filter(Grupo.id == ticket.grupo_id).first()
        if g:
            grupo_origen_nombre = g.nombre

    # Asignar nuevo agente por Round Robin en el grupo destino
    nuevo_agente = assign_agent_round_robin(grupo_destino, db)

    agente_anterior_id = ticket.agente_id
    ticket.grupo_id = grupo_destino.id
    ticket.agente_id = nuevo_agente.id if nuevo_agente else None
    ticket.estatus = EstatusTicket.ASIGNADO  # Vuelve a ASIGNADO en nuevo grupo

    nuevo_agente_nombre = nuevo_agente.nombre if nuevo_agente else "Sin asignar"

    # Registrar en bitácora — nota interna con el motivo
    log_event(
        db, ticket, current_user.id,
        accion="ESCALACION",
        estado_anterior=EstatusTicket.EN_PROCESO.value,
        estado_nuevo=EstatusTicket.ASIGNADO.value,
        comentario=(
            f"Escalado de '{grupo_origen_nombre}' a '{grupo_destino.nombre}'. "
            f"Motivo: {body.motivo.strip()}. "
            f"Nuevo agente: {nuevo_agente_nombre}"
        ),
        tipo_comentario="INTERNO",
    )

    db.commit()
    db.refresh(ticket)

    return db.query(Ticket).options(
        joinedload(Ticket.tipificacion),
        joinedload(Ticket.eventos).joinedload(BitacoraEvento.usuario),
    ).filter(Ticket.id == ticket.id).first()



@router.post("/tickets/{ticket_id}/evidencias", response_model=EvidenciaOut)
async def upload_evidencia(
    ticket_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """
    Sube una evidencia (foto, video, PDF) al ticket.
    - Tienda: solo en sus propios tickets.
    - Agente/Admin: en cualquier ticket activo.
    - Límite: 10 MB. Formatos: jpg, png, webp, gif, mp4, mov, pdf.
    """
    ticket = db.query(Ticket).filter(Ticket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(404, detail="Ticket no encontrado")

    # Tienda solo puede subir a sus propios tickets
    if current_user.rol == RolUsuario.TIENDA and ticket.tienda_id != current_user.tienda_id:
        raise HTTPException(403, detail="Sin acceso a este ticket")

    # Leer contenido del archivo
    content = await file.read()

    # Validar tipo y tamaño
    try:
        validate_file(
            filename=file.filename or "archivo",
            content_type=file.content_type or "",
            size_bytes=len(content),
        )
    except ValueError as e:
        raise HTTPException(400, detail=str(e))

    # Guardar (local en dev, GCS en prod)
    try:
        nombre_guardado, url = save_file(file.filename or "archivo", content)
    except Exception as e:
        raise HTTPException(500, detail=f"Error al guardar el archivo: {str(e)}")

    # Registrar en DB
    evidencia = Evidencia(
        ticket_id=ticket_id,
        usuario_id=current_user.id,
        nombre_archivo=file.filename or "archivo",
        nombre_guardado=nombre_guardado,
        url=url,
        tipo_mime=file.content_type,
        tamanio_bytes=len(content),
    )
    db.add(evidencia)

    # Registrar en bitácora
    log_event(
        db, ticket, current_user.id,
        accion="EVIDENCIA",
        comentario=f"Evidencia adjuntada: {file.filename} ({len(content) // 1024} KB)",
        tipo_comentario="PUBLICO",
    )

    db.commit()
    db.refresh(evidencia)
    return evidencia


@router.get("/tickets/{ticket_id}/evidencias", response_model=list[EvidenciaOut])
def list_evidencias(
    ticket_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """Lista todas las evidencias de un ticket."""
    ticket = db.query(Ticket).filter(Ticket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(404, detail="Ticket no encontrado")

    if current_user.rol == RolUsuario.TIENDA and ticket.tienda_id != current_user.tienda_id:
        raise HTTPException(403, detail="Sin acceso a este ticket")

    return db.query(Evidencia).filter(
        Evidencia.ticket_id == ticket_id
    ).order_by(Evidencia.timestamp).all()


@router.delete("/tickets/{ticket_id}/evidencias/{evidencia_id}", status_code=204)
def delete_evidencia(
    ticket_id: int,
    evidencia_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """Elimina una evidencia. Solo el que la subió o un admin."""
    evidencia = db.query(Evidencia).filter(
        Evidencia.id == evidencia_id,
        Evidencia.ticket_id == ticket_id,
    ).first()
    if not evidencia:
        raise HTTPException(404, detail="Evidencia no encontrada")

    if current_user.rol != RolUsuario.ADMIN and evidencia.usuario_id != current_user.id:
        raise HTTPException(403, detail="Solo puedes eliminar tus propias evidencias")

    delete_file(evidencia.nombre_guardado)
    db.delete(evidencia)
    db.commit()


@router.get("/evidencias/{nombre_guardado}")
def serve_evidencia(
    nombre_guardado: str,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """
    Sirve un archivo de evidencia almacenado localmente (solo en dev).
    En producción con GCS las URLs son públicas y no pasan por aquí.
    """
    from pathlib import Path
    from app.services.storage_service import _get_upload_dir
    from app.core.config import get_settings
    settings = get_settings()

    if settings.STORAGE_BACKEND != "local":
        raise HTTPException(404, detail="Endpoint solo disponible en modo local")

    filepath = _get_upload_dir() / nombre_guardado
    if not filepath.exists():
        raise HTTPException(404, detail="Archivo no encontrado")

    # Determinar media type
    ext = Path(nombre_guardado).suffix.lower()
    media_types = {
        ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
        ".webp": "image/webp", ".gif": "image/gif",
        ".mp4": "video/mp4", ".mov": "video/quicktime",
        ".pdf": "application/pdf",
    }
    media_type = media_types.get(ext, "application/octet-stream")
    return FileResponse(str(filepath), media_type=media_type)


@router.get("/dashboard", response_model=DashboardMetrics)
def get_dashboard(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    base = db.query(Ticket)
    if current_user.rol == RolUsuario.AGENTE:
        base = base.filter(Ticket.grupo_id == current_user.grupo_id)
    elif current_user.rol == RolUsuario.TIENDA:
        base = base.filter(Ticket.tienda_id == current_user.tienda_id)

    today = datetime.utcnow().date()
    now = datetime.utcnow()

    por_area: dict = {}
    area_rows = (
        base.join(Tipificacion, Ticket.tipificacion_id == Tipificacion.id, isouter=True)
        .with_entities(Tipificacion.area_tecnica, func.count(Ticket.id))
        .filter(Ticket.estatus.notin_([EstatusTicket.CERRADO, EstatusTicket.RESUELTO, EstatusTicket.CANCELADO]))
        .group_by(Tipificacion.area_tecnica)
        .all()
    )
    for area, count in area_rows:
        por_area[area.value if area else "SIN_AREA"] = count

    por_prioridad: dict = {}
    prio_rows = (
        base.with_entities(Ticket.prioridad, func.count(Ticket.id))
        .group_by(Ticket.prioridad)
        .all()
    )
    for prio, count in prio_rows:
        por_prioridad[prio.value] = count

    # Tiempo promedio de resolución
    closed = base.filter(
        Ticket.fecha_cierre.isnot(None),
        Ticket.fecha_apertura.isnot(None),
    ).with_entities(Ticket.fecha_apertura, Ticket.fecha_cierre).all()

    avg_hours = None
    if closed:
        total_hours = sum(
            (c.fecha_cierre - c.fecha_apertura).total_seconds() / 3600
            for c in closed if c.fecha_cierre and c.fecha_apertura
        )
        avg_hours = round(total_hours / len(closed), 1) if closed else None

    # Tasa IA aceptada
    ia_total = base.filter(Ticket.ia_clasificacion_aceptada.isnot(None)).count()
    ia_aceptada = base.filter(Ticket.ia_clasificacion_aceptada == True).count()
    tasa_ia = round((ia_aceptada / ia_total) * 100, 1) if ia_total > 0 else None

    return DashboardMetrics(
        total_abiertos=base.filter(Ticket.estatus.in_([EstatusTicket.NUEVO, EstatusTicket.ASIGNADO])).count(),
        total_en_proceso=base.filter(Ticket.estatus == EstatusTicket.EN_PROCESO).count(),
        total_confirmar_solucion=base.filter(Ticket.estatus == EstatusTicket.ESPERANDO_TIENDA).count(),
        total_cerrados_hoy=base.filter(
            Ticket.estatus.in_([EstatusTicket.RESUELTO, EstatusTicket.CERRADO]),
            func.date(Ticket.fecha_cierre) == today
        ).count(),
        total_vencidos=base.filter(
            Ticket.sla_limite < now,
            Ticket.estatus.notin_([EstatusTicket.RESUELTO, EstatusTicket.CERRADO, EstatusTicket.CANCELADO]),
        ).count(),
        por_area=por_area,
        por_prioridad=por_prioridad,
        tiempo_promedio_resolucion_horas=avg_hours,
        tasa_ia_aceptada=tasa_ia,
    )


# ═══════════════════════════════════════════════════════════════════════════════
# ADMIN — Módulos de configuración
# Todos requieren rol ADMIN
# ═══════════════════════════════════════════════════════════════════════════════

def _require_admin(current_user: Usuario = Depends(get_current_user)) -> Usuario:
    """Dependency que lanza 403 si el usuario no es ADMIN."""
    if current_user.rol != RolUsuario.ADMIN:
        raise HTTPException(403, detail="Acceso restringido a administradores")
    return current_user


# ─── Usuarios ─────────────────────────────────────────────────────────────────

@router.get("/admin/usuarios", response_model=list[UsuarioAdminOut])
def admin_list_usuarios(
    rol: Optional[str] = None,
    activo: Optional[bool] = None,
    db: Session = Depends(get_db),
    _: Usuario = Depends(_require_admin),
):
    q = db.query(Usuario)
    if rol:
        q = q.filter(Usuario.rol == rol.upper())
    if activo is not None:
        q = q.filter(Usuario.activo == activo)
    return q.order_by(Usuario.rol, Usuario.nombre).all()


@router.post("/admin/usuarios", response_model=UsuarioAdminOut, status_code=201)
def admin_create_usuario(
    body: UsuarioCreate,
    db: Session = Depends(get_db),
    _: Usuario = Depends(_require_admin),
):
    # Verificar email único
    if db.query(Usuario).filter(Usuario.email == body.email).first():
        raise HTTPException(400, detail="Ya existe un usuario con ese email")

    # Validar asignaciones por rol
    if body.rol == "AGENTE" and not body.grupo_id:
        raise HTTPException(400, detail="Los agentes deben tener un grupo asignado")
    if body.rol == "TIENDA" and not body.tienda_id:
        raise HTTPException(400, detail="Los usuarios de tienda deben tener una tienda asignada")

    usuario = Usuario(
        email=body.email,
        nombre=body.nombre,
        hashed_password=hash_password(body.password),
        rol=body.rol,
        grupo_id=body.grupo_id,
        tienda_id=body.tienda_id,
    )
    db.add(usuario)
    db.commit()
    db.refresh(usuario)
    return usuario


@router.patch("/admin/usuarios/{usuario_id}", response_model=UsuarioAdminOut)
def admin_update_usuario(
    usuario_id: int,
    body: UsuarioUpdate,
    db: Session = Depends(get_db),
    _: Usuario = Depends(_require_admin),
):
    usuario = db.query(Usuario).filter(Usuario.id == usuario_id).first()
    if not usuario:
        raise HTTPException(404, detail="Usuario no encontrado")

    if body.nombre is not None:    usuario.nombre   = body.nombre
    if body.email is not None:     usuario.email    = body.email
    if body.rol is not None:       usuario.rol      = body.rol
    if body.grupo_id is not None:  usuario.grupo_id = body.grupo_id
    if body.tienda_id is not None: usuario.tienda_id = body.tienda_id
    if body.activo is not None:    usuario.activo   = body.activo
    if body.password:
        usuario.hashed_password = hash_password(body.password)

    db.commit()
    db.refresh(usuario)
    return usuario


# ─── Tipificaciones ───────────────────────────────────────────────────────────

@router.get("/admin/tipificaciones", response_model=list[TipificacionAdminOut])
def admin_list_tipificaciones(
    activo: Optional[bool] = None,
    area: Optional[str] = None,
    db: Session = Depends(get_db),
    _: Usuario = Depends(_require_admin),
):
    q = db.query(Tipificacion)
    if activo is not None:
        q = q.filter(Tipificacion.activo == activo)
    if area:
        q = q.filter(Tipificacion.area_tecnica == area.upper())
    return q.order_by(Tipificacion.area_tecnica, Tipificacion.categoria).all()


@router.post("/admin/tipificaciones", response_model=TipificacionAdminOut, status_code=201)
def admin_create_tipificacion(
    body: TipificacionCreate,
    db: Session = Depends(get_db),
    _: Usuario = Depends(_require_admin),
):
    tip = Tipificacion(
        area_tecnica=body.area_tecnica.upper(),
        categoria=body.categoria,
        problema=body.problema,
        sla_horas=body.sla_horas,
        urgencia=body.urgencia.upper(),
        palabras_clave=body.palabras_clave,
        requiere_foto=body.requiere_foto,
    )
    db.add(tip)
    db.commit()
    db.refresh(tip)
    return tip


@router.patch("/admin/tipificaciones/{tip_id}", response_model=TipificacionAdminOut)
def admin_update_tipificacion(
    tip_id: int,
    body: TipificacionUpdate,
    db: Session = Depends(get_db),
    _: Usuario = Depends(_require_admin),
):
    tip = db.query(Tipificacion).filter(Tipificacion.id == tip_id).first()
    if not tip:
        raise HTTPException(404, detail="Tipificación no encontrada")

    if body.area_tecnica is not None:  tip.area_tecnica  = body.area_tecnica.upper()
    if body.categoria is not None:     tip.categoria     = body.categoria
    if body.problema is not None:      tip.problema      = body.problema
    if body.sla_horas is not None:     tip.sla_horas     = body.sla_horas
    if body.urgencia is not None:      tip.urgencia      = body.urgencia.upper()
    if body.palabras_clave is not None: tip.palabras_clave = body.palabras_clave
    if body.requiere_foto is not None: tip.requiere_foto = body.requiere_foto
    if body.activo is not None:        tip.activo        = body.activo

    db.commit()
    db.refresh(tip)
    return tip


# ─── Grupos ───────────────────────────────────────────────────────────────────

@router.get("/admin/companias", response_model=list[CompaniaOut])
def admin_list_companias(
    db: Session = Depends(get_db),
    _: Usuario = Depends(_require_admin),
):
    return db.query(Compania).filter(Compania.activo == True).order_by(Compania.nombre).all()


@router.post("/admin/grupos", response_model=GrupoOut, status_code=201)
def admin_create_grupo(
    body: GrupoCreate,
    db: Session = Depends(get_db),
    _: Usuario = Depends(_require_admin),
):
    grupo = Grupo(
        nombre=body.nombre,
        area_tecnica=body.area_tecnica.upper(),
        slack_canal=body.slack_canal,
        compania_id=body.compania_id,
    )
    db.add(grupo)
    db.commit()
    db.refresh(grupo)
    return grupo


@router.patch("/admin/grupos/{grupo_id}", response_model=GrupoOut)
def admin_update_grupo(
    grupo_id: int,
    body: GrupoUpdate,
    db: Session = Depends(get_db),
    _: Usuario = Depends(_require_admin),
):
    grupo = db.query(Grupo).filter(Grupo.id == grupo_id).first()
    if not grupo:
        raise HTTPException(404, detail="Grupo no encontrado")

    if body.nombre is not None:       grupo.nombre       = body.nombre
    if body.area_tecnica is not None: grupo.area_tecnica = body.area_tecnica.upper()
    if body.slack_canal is not None:  grupo.slack_canal  = body.slack_canal
    if body.activo is not None:       grupo.activo       = body.activo
    if body.compania_id is not None:  grupo.compania_id  = body.compania_id

    db.commit()
    db.refresh(grupo)
    return grupo


# ─── Matriz de Ruteo ──────────────────────────────────────────────────────────

@router.get("/admin/ruteo", response_model=list[ReglaRuteoOut])
def admin_list_ruteo(
    db: Session = Depends(get_db),
    _: Usuario = Depends(_require_admin),
):
    from sqlalchemy.orm import joinedload
    return (
        db.query(ReglaRuteo)
        .options(
            joinedload(ReglaRuteo.tipificacion),
            joinedload(ReglaRuteo.grupo),
        )
        .order_by(ReglaRuteo.tipificacion_id, ReglaRuteo.prioridad)
        .all()
    )


@router.post("/admin/ruteo", response_model=ReglaRuteoOut, status_code=201)
def admin_create_regla(
    body: ReglaRuteoCreate,
    db: Session = Depends(get_db),
    _: Usuario = Depends(_require_admin),
):
    # Verificar que no exista la misma combinación
    existe = db.query(ReglaRuteo).filter(
        ReglaRuteo.tipificacion_id == body.tipificacion_id,
        ReglaRuteo.zona_id == body.zona_id,
        ReglaRuteo.region_id == body.region_id,
        ReglaRuteo.compania_id == body.compania_id,
        ReglaRuteo.grupo_id == body.grupo_id,
    ).first()
    if existe:
        raise HTTPException(400, detail="Ya existe una regla con esa combinacion tipificacion/zona/region/compania/grupo")

    regla = ReglaRuteo(
        tipificacion_id=body.tipificacion_id,
        grupo_id=body.grupo_id,
        zona_id=body.zona_id,
        region_id=body.region_id,
        compania_id=body.compania_id,
        prioridad=body.prioridad,
    )
    db.add(regla)
    db.commit()
    db.refresh(regla)
    return db.query(ReglaRuteo).options(
        joinedload(ReglaRuteo.tipificacion),
        joinedload(ReglaRuteo.grupo),
    ).filter(ReglaRuteo.id == regla.id).first()


@router.delete("/admin/ruteo/{regla_id}", status_code=204)
def admin_delete_regla(
    regla_id: int,
    db: Session = Depends(get_db),
    _: Usuario = Depends(_require_admin),
):
    regla = db.query(ReglaRuteo).filter(ReglaRuteo.id == regla_id).first()
    if not regla:
        raise HTTPException(404, detail="Regla no encontrada")
    db.delete(regla)
    db.commit()


# ─── Tiendas ──────────────────────────────────────────────────────────────────

@router.get("/admin/tiendas", response_model=list[TiendaOut])
def admin_list_tiendas(
    activo: Optional[bool] = None,
    db: Session = Depends(get_db),
    _: Usuario = Depends(_require_admin),
):
    q = db.query(Tienda)
    if activo is not None:
        q = q.filter(Tienda.activo == activo)
    return q.order_by(Tienda.nombre).all()


@router.post("/admin/tiendas", response_model=TiendaOut, status_code=201)
def admin_create_tienda(
    body: TiendaCreate,
    db: Session = Depends(get_db),
    _: Usuario = Depends(_require_admin),
):
    if db.query(Tienda).filter(Tienda.id == body.id).first():
        raise HTTPException(400, detail=f"Ya existe la tienda #{body.id}")

    tienda = Tienda(
        id=body.id,
        nombre=body.nombre,
        zona_id=body.zona_id,
        correo_corporativo=body.correo_corporativo,
        centro_costos=body.centro_costos,
    )
    db.add(tienda)
    db.commit()
    db.refresh(tienda)
    return tienda


@router.patch("/admin/tiendas/{tienda_id}", response_model=TiendaOut)
def admin_update_tienda(
    tienda_id: int,
    body: TiendaCreate,
    db: Session = Depends(get_db),
    _: Usuario = Depends(_require_admin),
):
    tienda = db.query(Tienda).filter(Tienda.id == tienda_id).first()
    if not tienda:
        raise HTTPException(404, detail="Tienda no encontrada")
    tienda.nombre = body.nombre
    tienda.zona_id = body.zona_id
    tienda.correo_corporativo = body.correo_corporativo
    if body.centro_costos: tienda.centro_costos = body.centro_costos
    db.commit()
    db.refresh(tienda)
    return tienda


