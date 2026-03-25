from datetime import datetime, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, and_

from app.db.session import get_db
from app.core.security import (
    get_current_user,
    require_rol,
    create_token,
    verify_password,
    hash_password,
)
from app.models.models import (
    Ticket,
    Usuario,
    Tipificacion,
    Grupo,
    Tienda,
    ReglaRuteo,
    Zona,
    EstatusTicket,
    RolUsuario,
    BitacoraEvento,
    AreaTecnica,
    TipoComentario,
    Evidencia,
    UrgenciaTipificacion,
    TipoTicket,
    PlantillaRespuesta,
    PrioridadTicket,
)
from app.schemas.schemas import (
    LoginRequest,
    TokenResponse,
    TicketCreate,
    TicketUpdate,
    TicketOut,
    TicketListItem,
    ClasificacionRequest,
    ClasificacionResponse,
    DashboardMetrics,
    EscalacionRequest,
    GrupoOut,
    EvidenciaOut,
    UsuarioCreate,
    UsuarioUpdate,
    UsuarioAdminOut,
    TipificacionCreate,
    TipificacionUpdate,
    TipificacionAdminOut,
    ReglaRuteoCreate,
    ReglaRuteoOut,
    GrupoCreate,
    GrupoUpdate,
    TiendaCreate,
    TiendaOut,
    PlantillaCreate,
    PlantillaOut,
    KpiAgente,
    CsatRequest,
)
from app.services.ia_service import classify_with_ai, suggest_solution
from app.services.ticket_service import (
    create_ticket_in_db,
    log_event,
    assign_agent_round_robin,
)
from app.services.storage_service import save_file, validate_file, delete_file

router = APIRouter()


# ─── Auth ──────────────────────────────────────────────────────────────────────


def _notify_slack_critico(ticket, db) -> None:
    try:
        if ticket.prioridad.value != "CRITICA":
            return
        token = settings.SLACK_BOT_TOKEN
        if not token:
            return
        import httpx

        grupo = (
            db.query(Grupo).filter(Grupo.id == ticket.grupo_id).first()
            if ticket.grupo_id
            else None
        )
        canal = (
            grupo.slack_canal if grupo and grupo.slack_canal else None
        ) or settings.SLACK_DEFAULT_CHANNEL
        tip = (
            db.query(Tipificacion)
            .filter(Tipificacion.id == ticket.tipificacion_id)
            .first()
        )
        sla_str = (
            ticket.sla_limite.strftime("%d/%m %H:%M")
            if ticket.sla_limite
            else "sin SLA"
        )
        problema = tip.problema if tip else "Sin clasificar"
        lineas = [
            ":rotating_light: *Ticket CRITICO* " + ticket.folio,
            "Tienda: #" + str(ticket.tienda_id),
            "Problema: " + problema,
            "Desc: " + ticket.descripcion[:200],
            "SLA: " + sla_str,
        ]
        httpx.post(
            "https://slack.com/api/chat.postMessage",
            headers={"Authorization": "Bearer " + token},
            json={"channel": canal, "text": "\n".join(lineas)},
            timeout=5,
        )
    except Exception:
        pass


@router.post("/auth/login", response_model=TokenResponse)
def login(req: LoginRequest, db: Session = Depends(get_db)):
    user = (
        db.query(Usuario)
        .filter(Usuario.email == req.email, Usuario.activo == True)
        .first()
    )
    if not user or not verify_password(req.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Credenciales incorrectas")

    user.last_login = datetime.utcnow()
    db.commit()

    tienda = db.query(Tienda).filter(Tienda.id == user.tienda_id).first() if user.tienda_id else None

    token = create_token({"sub": str(user.id), "rol": user.rol.value})
    return TokenResponse(
        access_token=token,
        rol=user.rol,
        nombre=user.nombre,
        tienda_id=user.tienda_id,
        tienda_nombre=tienda.nombre if tienda else None,
    )


@router.get("/auth/me")
def me(
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    grupo_nombre = None
    if current_user.grupo_id:
        g = db.query(Grupo).filter(Grupo.id == current_user.grupo_id).first()
        grupo_nombre = g.nombre if g else None
    
    tienda_nombre = None
    if current_user.tienda_id:
        t = db.query(Tienda).filter(Tienda.id == current_user.tienda_id).first()
        tienda_nombre = t.nombre if t else None

    return {
        "id": current_user.id,
        "email": current_user.email,
        "nombre": current_user.nombre,
        "rol": current_user.rol,
        "tienda_id": current_user.tienda_id,
        "tienda_nombre": tienda_nombre,
        "grupo_id": current_user.grupo_id,
        "grupo_nombre": grupo_nombre,
        "activo": current_user.activo,
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
        raise HTTPException(
            status_code=400, detail="Usuario de tienda sin tienda asignada"
        )

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
    aceptada = (
        body.ia_clasificacion_aceptada
        if body.ia_clasificacion_aceptada is not None
        else (body.tipificacion_id is None)  # si no modificó, se asume aceptada
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

    return (
        db.query(Ticket)
        .options(
            joinedload(Ticket.tipificacion),
            joinedload(Ticket.eventos).joinedload(BitacoraEvento.usuario),
        )
        .filter(Ticket.id == ticket.id)
        .first()
    )


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

    if (
        solo_mios and current_user.agente_id
        if hasattr(current_user, "agente_id")
        else False
    ):
        q = q.filter(Ticket.agente_id == current_user.id)

    if estatus:
        q = q.filter(Ticket.estatus == estatus.upper())

    if prioridad:
        q = q.filter(Ticket.prioridad == prioridad.upper())

    if area:
        q = q.join(Tipificacion, Ticket.tipificacion_id == Tipificacion.id).filter(
            Tipificacion.area_tecnica == area.upper()
        )

    tickets = q.order_by(Ticket.fecha_apertura.desc()).offset(offset).limit(limit).all()

    # Recalcular sla_vencido y sla_porcentaje en tiempo real
    # (sla_vencido en DB no se actualiza automáticamente con el tiempo)
    now = datetime.utcnow()
    estados_activos = [
        EstatusTicket.NUEVO,
        EstatusTicket.ASIGNADO,
        EstatusTicket.EN_PROCESO,
        EstatusTicket.ESPERANDO_TIENDA,
        EstatusTicket.ESPERANDO_AGENTE,
        EstatusTicket.RECHAZADO,
    ]
    for t in tickets:
        es_activo = t.estatus in estados_activos
        if t.sla_limite:
            vencido = es_activo and (t.sla_limite < now)
            t.sla_vencido = vencido
            if es_activo and t.fecha_apertura:
                total_secs = (t.sla_limite - t.fecha_apertura).total_seconds()
                elapsed_secs = (now - t.fecha_apertura).total_seconds()
                t.sla_porcentaje = (
                    min(100, int((elapsed_secs / total_secs) * 100))
                    if total_secs > 0
                    else 0
                )
            else:
                t.sla_porcentaje = None
        else:
            t.sla_vencido = False
            t.sla_porcentaje = None

    return tickets


@router.get("/tickets/{ticket_id}", response_model=TicketOut)
def get_ticket(
    ticket_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    ticket = (
        db.query(Ticket)
        .options(
            joinedload(Ticket.tipificacion),
            joinedload(Ticket.eventos).joinedload(BitacoraEvento.usuario),
        )
        .filter(Ticket.id == ticket_id)
        .first()
    )

    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket no encontrado")

    # Tienda solo puede ver sus propios tickets
    if (
        current_user.rol == RolUsuario.TIENDA
        and ticket.tienda_id != current_user.tienda_id
    ):
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
        # La tienda puede resolver desde cualquier estado activo
        # (ej: ya se compuso solo antes de que el agente intervenga)
        es_tienda_o_admin = rol in (RolUsuario.TIENDA, RolUsuario.ADMIN)
        estados_activos_tienda = [
            EstatusTicket.NUEVO,
            EstatusTicket.ASIGNADO,
            EstatusTicket.EN_PROCESO,
            EstatusTicket.RECHAZADO,
            EstatusTicket.ESPERANDO_TIENDA,
            EstatusTicket.ESPERANDO_AGENTE,
        ]

        valid_transitions = {
            EstatusTicket.NUEVO: [EstatusTicket.EN_PROCESO]
            + ([EstatusTicket.RESUELTO] if es_tienda_o_admin else []),
            EstatusTicket.ASIGNADO: [EstatusTicket.EN_PROCESO]
            + ([EstatusTicket.RESUELTO] if es_tienda_o_admin else []),
            EstatusTicket.EN_PROCESO: [EstatusTicket.ESPERANDO_TIENDA]
            + ([EstatusTicket.RESUELTO] if es_tienda_o_admin else []),
            EstatusTicket.ESPERANDO_TIENDA: [
                EstatusTicket.ESPERANDO_AGENTE,
                EstatusTicket.RESUELTO,
                EstatusTicket.RECHAZADO,
            ],
            EstatusTicket.ESPERANDO_AGENTE: [
                EstatusTicket.EN_PROCESO,
                EstatusTicket.ESPERANDO_TIENDA,
                EstatusTicket.RESUELTO,
            ],
            EstatusTicket.RECHAZADO: [EstatusTicket.EN_PROCESO]
            + ([EstatusTicket.RESUELTO] if es_tienda_o_admin else []),
            EstatusTicket.RESUELTO: [EstatusTicket.CERRADO],
        }
        # Admin puede cancelar desde cualquier estado activo
        estados_activos = [
            EstatusTicket.NUEVO,
            EstatusTicket.ASIGNADO,
            EstatusTicket.EN_PROCESO,
            EstatusTicket.ESPERANDO_TIENDA,
            EstatusTicket.ESPERANDO_AGENTE,
            EstatusTicket.RECHAZADO,
        ]
        if rol == RolUsuario.ADMIN and body.estatus == EstatusTicket.CANCELADO:
            if ticket.estatus not in estados_activos:
                raise HTTPException(
                    400, detail="Solo se pueden cancelar tickets activos"
                )
        else:
            allowed = valid_transitions.get(ticket.estatus, [])
            if body.estatus not in allowed:
                raise HTTPException(
                    status_code=400,
                    detail=f"Transición no permitida: {ticket.estatus.value} → {body.estatus.value}",
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
                    detail="Debes describir la solución propuesta (mínimo 10 caracteres)",
                )

        # ESPERANDO_AGENTE: la tienda respondió pero no confirmó → agente debe continuar
        if body.estatus == EstatusTicket.ESPERANDO_AGENTE:
            if rol == RolUsuario.AGENTE:
                raise HTTPException(
                    403,
                    detail="Solo la tienda puede enviar una respuesta de seguimiento",
                )

        # Confirmar/Rechazar: Tienda/Admin pueden siempre; Agente puede confirmar desde los estados "ESPERANDO"
        if body.estatus == EstatusTicket.RECHAZADO:
            if rol == RolUsuario.AGENTE:
                raise HTTPException(
                    403, detail="Solo la tienda puede rechazar la solución"
                )
        if body.estatus == EstatusTicket.RESUELTO:
            if rol == RolUsuario.AGENTE and ticket.estatus not in (
                EstatusTicket.ESPERANDO_TIENDA,
                EstatusTicket.ESPERANDO_AGENTE,
            ):
                raise HTTPException(
                    403, detail="El agente solo puede marcar como resuelto desde estados en espera"
                )

        # Rechazar requiere motivo
        if body.estatus == EstatusTicket.RECHAZADO:
            if not body.comentario or len(body.comentario.strip()) < 5:
                raise HTTPException(
                    400, detail="Debes indicar por qué rechazas la solución"
                )

        # Cerrar: solo agente o admin (después de RESUELTO)
        if body.estatus == EstatusTicket.CERRADO:
            if rol == RolUsuario.TIENDA:
                raise HTTPException(403, detail="La tienda no puede cerrar tickets")

        # ── Aplicar cambio de estado ──────────────────────────────────────────
        ticket.estatus = body.estatus

        if body.estatus == EstatusTicket.RESUELTO:
            ticket.fecha_resolucion = datetime.utcnow()

        if body.estatus in (
            EstatusTicket.RESUELTO,
            EstatusTicket.CERRADO,
            EstatusTicket.CANCELADO,
        ):
            ticket.fecha_cierre = datetime.utcnow()

        if (
            body.estatus == EstatusTicket.EN_PROCESO
            and not ticket.fecha_primera_respuesta
        ):
            ticket.fecha_primera_respuesta = datetime.utcnow()

        # Subir prioridad si la tienda rechaza
        if body.estatus == EstatusTicket.RECHAZADO:
            from app.models.models import PrioridadTicket

            rank = {"BAJA": 0, "MEDIA": 1, "ALTA": 2, "CRITICA": 3}
            if rank.get(ticket.prioridad.value, 0) < 2:
                ticket.prioridad = PrioridadTicket.ALTA

    if body.solucion_propuesta:
        ticket.solucion_propuesta = body.solucion_propuesta

    # Tipificacion: solo ADMIN puede cambiarla en un ticket ya creado
    if body.tipificacion_id is not None:
        if rol != RolUsuario.ADMIN:
            raise HTTPException(
                403,
                detail="Solo un administrador puede cambiar la tipificacion de un ticket",
            )
        ticket.tipificacion_id = body.tipificacion_id

    if body.agente_id and rol in (RolUsuario.ADMIN,):
        ticket.agente_id = body.agente_id

    # ── Bitácora con tipo de comentario (PUBLICO | INTERNO) ───────────────────
    tipo_com = (body.tipo_comentario or "PUBLICO").upper()
    log_event(
        db,
        ticket,
        current_user.id,
        accion="CAMBIO_ESTADO" if body.estatus else "ACTUALIZACION",
        estado_anterior=estado_anterior,
        estado_nuevo=ticket.estatus.value if body.estatus else None,
        comentario=body.comentario,
        tipo_comentario=tipo_com,
        evidencia_id=body.evidencia_id,
    )

    db.commit()
    db.refresh(ticket)

    return (
        db.query(Ticket)
        .options(
            joinedload(Ticket.tipificacion),
            joinedload(Ticket.eventos).joinedload(BitacoraEvento.usuario),
        )
        .filter(Ticket.id == ticket.id)
        .first()
    )


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
        EstatusTicket.NUEVO,
        EstatusTicket.ASIGNADO,
        EstatusTicket.EN_PROCESO,
        EstatusTicket.RECHAZADO,
    ]
    if ticket.estatus not in estados_escalables:
        raise HTTPException(
            400,
            detail=f"No se puede escalar un ticket en estado {ticket.estatus.value}",
        )

    # Validar motivo
    if not body.motivo or len(body.motivo.strip()) < 10:
        raise HTTPException(
            400, detail="El motivo de escalación debe tener mínimo 10 caracteres"
        )

    # Validar que el grupo destino existe y es diferente
    grupo_destino = (
        db.query(Grupo)
        .filter(Grupo.id == body.grupo_destino_id, Grupo.activo == True)
        .first()
    )
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
        db,
        ticket,
        current_user.id,
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

    return (
        db.query(Ticket)
        .options(
            joinedload(Ticket.tipificacion),
            joinedload(Ticket.eventos).joinedload(BitacoraEvento.usuario),
        )
        .filter(Ticket.id == ticket.id)
        .first()
    )


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
    if (
        current_user.rol == RolUsuario.TIENDA
        and ticket.tienda_id != current_user.tienda_id
    ):
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
        db,
        ticket,
        current_user.id,
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

    if (
        current_user.rol == RolUsuario.TIENDA
        and ticket.tienda_id != current_user.tienda_id
    ):
        raise HTTPException(403, detail="Sin acceso a este ticket")

    return (
        db.query(Evidencia)
        .filter(Evidencia.ticket_id == ticket_id)
        .order_by(Evidencia.timestamp)
        .all()
    )


@router.delete("/tickets/{ticket_id}/evidencias/{evidencia_id}", status_code=204)
def delete_evidencia(
    ticket_id: int,
    evidencia_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """Elimina una evidencia. Solo el que la subió o un admin."""
    evidencia = (
        db.query(Evidencia)
        .filter(
            Evidencia.id == evidencia_id,
            Evidencia.ticket_id == ticket_id,
        )
        .first()
    )
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
):
    # Sin autenticación — las URLs de evidencia las genera el propio sistema
    # y son UUIDs imposibles de adivinar. En GCS las URLs son públicas también.
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
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".webp": "image/webp",
        ".gif": "image/gif",
        ".mp4": "video/mp4",
        ".mov": "video/quicktime",
        ".pdf": "application/pdf",
    }
    media_type = media_types.get(ext, "application/octet-stream")
    return FileResponse(str(filepath), media_type=media_type)


# ─── CSAT ────────────────────────────────────────────────────────────────────────


@router.post("/tickets/{ticket_id}/csat", response_model=TicketOut)
def submit_csat(
    ticket_id: int,
    body: CsatRequest,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """
    La tienda (o admin) califica el servicio recibido.
    Solo se permite en tickets RESUELTO o CERRADO y si no tiene csat ya.
    """
    ticket = db.query(Ticket).filter(Ticket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(404, detail="Ticket no encontrado")

    # Solo la tienda dueña o admin
    if (
        current_user.rol == RolUsuario.TIENDA
        and ticket.tienda_id != current_user.tienda_id
    ):
        raise HTTPException(403, detail="Sin acceso a este ticket")

    if ticket.estatus not in (EstatusTicket.RESUELTO, EstatusTicket.CERRADO):
        raise HTTPException(
            400, detail="Solo se puede calificar un ticket resuelto o cerrado"
        )

    if ticket.csat_score is not None:
        raise HTTPException(400, detail="El ticket ya fue calificado")

    if not (1 <= body.score <= 5):
        raise HTTPException(400, detail="El puntaje debe ser entre 1 y 5")

    ticket.csat_score = body.score
    ticket.csat_comentario = body.comentario
    ticket.csat_fecha = datetime.utcnow()
    db.commit()
    db.refresh(ticket)

    return (
        db.query(Ticket)
        .options(
            joinedload(Ticket.tipificacion),
            joinedload(Ticket.eventos).joinedload(BitacoraEvento.usuario),
        )
        .filter(Ticket.id == ticket.id)
        .first()
    )


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
        .filter(
            Ticket.estatus.notin_(
                [EstatusTicket.CERRADO, EstatusTicket.RESUELTO, EstatusTicket.CANCELADO]
            )
        )
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
    closed = (
        base.filter(
            Ticket.fecha_cierre.isnot(None),
            Ticket.fecha_apertura.isnot(None),
        )
        .with_entities(Ticket.fecha_apertura, Ticket.fecha_cierre)
        .all()
    )

    avg_hours = None
    if closed:
        total_hours = sum(
            (c.fecha_cierre - c.fecha_apertura).total_seconds() / 3600
            for c in closed
            if c.fecha_cierre and c.fecha_apertura
        )
        avg_hours = round(total_hours / len(closed), 1) if closed else None

    # Tasa IA aceptada
    ia_total = base.filter(Ticket.ia_clasificacion_aceptada.isnot(None)).count()
    ia_aceptada = base.filter(Ticket.ia_clasificacion_aceptada == True).count()
    tasa_ia = round((ia_aceptada / ia_total) * 100, 1) if ia_total > 0 else None

    return DashboardMetrics(
        # Pendientes = NUEVO + ASIGNADO (aún sin agente activo trabajando)
        total_abiertos=base.filter(
            Ticket.estatus.in_([EstatusTicket.NUEVO, EstatusTicket.ASIGNADO])
        ).count(),
        # En proceso = agente trabajando activamente
        total_en_proceso=base.filter(
            Ticket.estatus.in_(
                [EstatusTicket.EN_PROCESO, EstatusTicket.ESPERANDO_AGENTE]
            )
        ).count(),
        # Esperando tienda = solución enviada, tienda debe responder
        total_confirmar_solucion=base.filter(
            Ticket.estatus == EstatusTicket.ESPERANDO_TIENDA
        ).count(),
        total_cerrados_hoy=base.filter(
            Ticket.estatus.in_([EstatusTicket.RESUELTO, EstatusTicket.CERRADO]),
            func.date(Ticket.fecha_cierre) == today,
        ).count(),
        total_vencidos=base.filter(
            Ticket.sla_limite < now,
            Ticket.estatus.notin_(
                [EstatusTicket.RESUELTO, EstatusTicket.CERRADO, EstatusTicket.CANCELADO]
            ),
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
        raise HTTPException(
            400, detail="Los usuarios de tienda deben tener una tienda asignada"
        )

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

    if body.nombre is not None:
        usuario.nombre = body.nombre
    if body.email is not None:
        usuario.email = body.email
    if body.rol is not None:
        usuario.rol = body.rol
    if body.grupo_id is not None:
        usuario.grupo_id = body.grupo_id
    if body.tienda_id is not None:
        usuario.tienda_id = body.tienda_id
    if body.activo is not None:
        usuario.activo = body.activo
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


@router.post(
    "/admin/tipificaciones", response_model=TipificacionAdminOut, status_code=201
)
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

    if body.area_tecnica is not None:
        tip.area_tecnica = body.area_tecnica.upper()
    if body.categoria is not None:
        tip.categoria = body.categoria
    if body.problema is not None:
        tip.problema = body.problema
    if body.sla_horas is not None:
        tip.sla_horas = body.sla_horas
    if body.urgencia is not None:
        tip.urgencia = body.urgencia.upper()
    if body.palabras_clave is not None:
        tip.palabras_clave = body.palabras_clave
    if body.requiere_foto is not None:
        tip.requiere_foto = body.requiere_foto
    if body.activo is not None:
        tip.activo = body.activo

    db.commit()
    db.refresh(tip)
    return tip


# ─── Grupos ───────────────────────────────────────────────────────────────────


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

    if body.nombre is not None:
        grupo.nombre = body.nombre
    if body.area_tecnica is not None:
        grupo.area_tecnica = body.area_tecnica.upper()
    if body.slack_canal is not None:
        grupo.slack_canal = body.slack_canal
    if body.activo is not None:
        grupo.activo = body.activo

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
    existe = (
        db.query(ReglaRuteo)
        .filter(
            ReglaRuteo.tipificacion_id == body.tipificacion_id,
            ReglaRuteo.zona_id == body.zona_id,
            ReglaRuteo.grupo_id == body.grupo_id,
        )
        .first()
    )
    if existe:
        raise HTTPException(
            400,
            detail="Ya existe una regla con esa combinación tipificación/zona/grupo",
        )

    regla = ReglaRuteo(
        tipificacion_id=body.tipificacion_id,
        grupo_id=body.grupo_id,
        zona_id=body.zona_id,
        prioridad=body.prioridad,
    )
    db.add(regla)
    db.commit()
    db.refresh(regla)
    return (
        db.query(ReglaRuteo)
        .options(
            joinedload(ReglaRuteo.tipificacion),
            joinedload(ReglaRuteo.grupo),
        )
        .filter(ReglaRuteo.id == regla.id)
        .first()
    )


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
    if body.centro_costos:
        tienda.centro_costos = body.centro_costos
    db.commit()
    db.refresh(tienda)
    return tienda


# ═══════════════════════════════════════════════════════════════════════════════
# NOTIFICACIONES — polling liviano para badge en navbar
# El frontend llama GET /notificaciones cada 30s para ver si hay cambios
# ═══════════════════════════════════════════════════════════════════════════════


@router.get("/notificaciones")
def get_notificaciones(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """
    Devuelve contadores de actividad pendiente según el rol:
    - TIENDA: tickets que cambiaron de estado y no ha visto (ESPERANDO_TIENDA)
    - AGENTE: tickets nuevos/asignados sin tomar en su grupo
    - ADMIN: tickets críticos sin asignar
    """
    data = {}

    if current_user.rol == RolUsuario.TIENDA:
        # Tickets propios que están esperando su acción
        data["esperando_respuesta"] = (
            db.query(Ticket)
            .filter(
                Ticket.tienda_id == current_user.tienda_id,
                Ticket.estatus == EstatusTicket.ESPERANDO_TIENDA,
            )
            .count()
        )

        data["total_activos"] = (
            db.query(Ticket)
            .filter(
                Ticket.tienda_id == current_user.tienda_id,
                Ticket.estatus.notin_([EstatusTicket.CERRADO, EstatusTicket.CANCELADO]),
            )
            .count()
        )

    elif current_user.rol == RolUsuario.AGENTE:
        # Tickets pendientes de tomar en el grupo del agente
        data["pendientes_tomar"] = (
            db.query(Ticket)
            .filter(
                Ticket.grupo_id == current_user.grupo_id,
                Ticket.estatus.in_([EstatusTicket.NUEVO, EstatusTicket.ASIGNADO]),
            )
            .count()
        )

        # Tickets asignados específicamente al agente
        data["mis_activos"] = (
            db.query(Ticket)
            .filter(
                Ticket.agente_id == current_user.id,
                Ticket.estatus.notin_(
                    [
                        EstatusTicket.CERRADO,
                        EstatusTicket.RESUELTO,
                        EstatusTicket.CANCELADO,
                    ]
                ),
            )
            .count()
        )

        # SLA vencidos en el grupo
        data["sla_vencidos"] = (
            db.query(Ticket)
            .filter(
                Ticket.grupo_id == current_user.grupo_id,
                Ticket.sla_limite < datetime.utcnow(),
                Ticket.estatus.notin_(
                    [
                        EstatusTicket.CERRADO,
                        EstatusTicket.RESUELTO,
                        EstatusTicket.CANCELADO,
                    ]
                ),
            )
            .count()
        )

    elif current_user.rol == RolUsuario.ADMIN:
        data["sin_asignar"] = (
            db.query(Ticket)
            .filter(
                Ticket.agente_id == None,
                Ticket.estatus.in_([EstatusTicket.NUEVO]),
            )
            .count()
        )

        data["sla_vencidos"] = (
            db.query(Ticket)
            .filter(
                Ticket.sla_limite < datetime.utcnow(),
                Ticket.estatus.notin_(
                    [
                        EstatusTicket.CERRADO,
                        EstatusTicket.RESUELTO,
                        EstatusTicket.CANCELADO,
                    ]
                ),
            )
            .count()
        )

        data["criticos"] = (
            db.query(Ticket)
            .filter(
                Ticket.prioridad == PrioridadTicket.CRITICA,
                Ticket.estatus.notin_(
                    [
                        EstatusTicket.CERRADO,
                        EstatusTicket.RESUELTO,
                        EstatusTicket.CANCELADO,
                    ]
                ),
            )
            .count()
        )

    return data


# ═══════════════════════════════════════════════════════════════════════════════
# AUTO-CIERRE — endpoint que el scheduler llama periódicamente
# En producción: Cloud Scheduler llama POST /internal/auto-cierre cada hora
# En desarrollo: llamar manualmente o con un cron local
# ═══════════════════════════════════════════════════════════════════════════════


@router.post("/internal/auto-cierre", include_in_schema=False)
def auto_cierre_tickets(
    horas: int = 72,
    db: Session = Depends(get_db),
):
    """
    Cierra automáticamente tickets en estado RESUELTO que llevan más de
    {horas} horas sin actividad después de la resolución.
    Este endpoint debe ser llamado por Cloud Scheduler en producción.
    En desarrollo se puede llamar manualmente desde /docs.
    """
    limite = datetime.utcnow() - timedelta(hours=horas)

    tickets_a_cerrar = (
        db.query(Ticket)
        .filter(
            Ticket.estatus == EstatusTicket.RESUELTO,
            Ticket.fecha_resolucion.isnot(None),
            Ticket.fecha_resolucion < limite,
        )
        .all()
    )

    cerrados = 0
    for ticket in tickets_a_cerrar:
        ticket.estatus = EstatusTicket.CERRADO
        ticket.fecha_cierre = datetime.utcnow()

        # Buscar usuario sistema (admin con id más bajo) para la bitácora
        sistema = (
            db.query(Usuario)
            .filter(Usuario.rol == RolUsuario.ADMIN)
            .order_by(Usuario.id)
            .first()
        )

        if sistema:
            from app.services.ticket_service import log_event

            log_event(
                db,
                ticket,
                sistema.id,
                accion="CAMBIO_ESTADO",
                estado_anterior=EstatusTicket.RESUELTO.value,
                estado_nuevo=EstatusTicket.CERRADO.value,
                comentario=f"Cierre automático: sin actividad por {horas} horas después de resolución.",
                tipo_comentario="INTERNO",
            )
        cerrados += 1

    db.commit()
    return {"cerrados": cerrados, "horas_limite": horas}


# ═══════════════════════════════════════════════════════════════════════════════
# PLANTILLAS DE RESPUESTA RÁPIDA (macros del agente)
# ═══════════════════════════════════════════════════════════════════════════════


@router.get("/plantillas", response_model=list[PlantillaOut])
def list_plantillas(
    area: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """
    Lista plantillas disponibles para el agente.
    Devuelve las globales (area_tecnica=None) + las del área solicitada.
    """
    q = db.query(PlantillaRespuesta).filter(PlantillaRespuesta.activo == True)
    if area:
        q = q.filter(
            (PlantillaRespuesta.area_tecnica == area.upper())
            | (PlantillaRespuesta.area_tecnica == None)
        )
    return q.order_by(
        PlantillaRespuesta.area_tecnica.nullsfirst(), PlantillaRespuesta.titulo
    ).all()


@router.post("/plantillas", response_model=PlantillaOut, status_code=201)
def create_plantilla(
    body: PlantillaCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """Crea una plantilla. Disponible para AGENTE y ADMIN."""
    if current_user.rol == RolUsuario.TIENDA:
        raise HTTPException(403, detail="Solo los agentes pueden crear plantillas")

    plantilla = PlantillaRespuesta(
        titulo=body.titulo,
        contenido=body.contenido,
        area_tecnica=body.area_tecnica.upper() if body.area_tecnica else None,
        creado_por=current_user.id,
    )
    db.add(plantilla)
    db.commit()
    db.refresh(plantilla)
    return plantilla


@router.delete("/plantillas/{plantilla_id}", status_code=204)
def delete_plantilla(
    plantilla_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """Elimina (desactiva) una plantilla. Solo el creador o un admin."""
    p = (
        db.query(PlantillaRespuesta)
        .filter(PlantillaRespuesta.id == plantilla_id)
        .first()
    )
    if not p:
        raise HTTPException(404, detail="Plantilla no encontrada")
    if current_user.rol != RolUsuario.ADMIN and p.creado_por != current_user.id:
        raise HTTPException(403, detail="Solo puedes eliminar tus propias plantillas")
    p.activo = False
    db.commit()


# ═══════════════════════════════════════════════════════════════════════════════
# KPIs POR AGENTE
# ═══════════════════════════════════════════════════════════════════════════════


@router.get("/admin/kpis-agentes", response_model=list[KpiAgente])
def get_kpis_agentes(
    desde: Optional[str] = None,  # ISO date string YYYY-MM-DD
    hasta: Optional[str] = None,
    grupo_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """
    KPIs de rendimiento por agente.
    - Admin: ve todos los agentes.
    - Agente: solo ve sus propios KPIs.
    """
    from sqlalchemy import func as sqlfunc

    # Filtro de fechas
    fecha_desde = datetime.fromisoformat(desde) if desde else None
    fecha_hasta = datetime.fromisoformat(hasta) if hasta else None

    # Agentes a incluir
    agentes_q = db.query(Usuario).filter(
        Usuario.rol == RolUsuario.AGENTE,
        Usuario.activo == True,
    )
    if current_user.rol == RolUsuario.AGENTE:
        agentes_q = agentes_q.filter(Usuario.id == current_user.id)
    if grupo_id:
        agentes_q = agentes_q.filter(Usuario.grupo_id == grupo_id)

    agentes = agentes_q.all()
    result = []

    for agente in agentes:
        # Base query de tickets del agente
        tq = db.query(Ticket).filter(Ticket.agente_id == agente.id)
        if fecha_desde:
            tq = tq.filter(Ticket.fecha_apertura >= fecha_desde)
        if fecha_hasta:
            tq = tq.filter(Ticket.fecha_apertura <= fecha_hasta)

        tickets = tq.all()
        cerrados = [
            t
            for t in tickets
            if t.estatus in (EstatusTicket.CERRADO, EstatusTicket.RESUELTO)
        ]
        activos = [
            t
            for t in tickets
            if t.estatus
            not in (
                EstatusTicket.CERRADO,
                EstatusTicket.RESUELTO,
                EstatusTicket.CANCELADO,
            )
        ]

        # Tiempo promedio resolución
        tiempos = [
            (t.fecha_cierre - t.fecha_apertura).total_seconds() / 3600
            for t in cerrados
            if t.fecha_cierre and t.fecha_apertura
        ]
        tiempo_prom = round(sum(tiempos) / len(tiempos), 1) if tiempos else None

        # % SLA cumplido (tickets cerrados antes del límite)
        con_sla = [t for t in cerrados if t.sla_limite]
        sla_ok = [
            t for t in con_sla if t.fecha_cierre and t.fecha_cierre <= t.sla_limite
        ]
        sla_pct = round(len(sla_ok) / len(con_sla) * 100, 1) if con_sla else None

        # CSAT promedio
        con_csat = [t for t in tickets if getattr(t, "csat_score", None)]
        csat_prom = (
            round(sum(getattr(t, "csat_score", 0) for t in con_csat) / len(con_csat), 2)
            if con_csat
            else None
        )

        # Escalaciones realizadas por este agente
        escalaciones = (
            db.query(BitacoraEvento)
            .filter(
                BitacoraEvento.usuario_id == agente.id,
                BitacoraEvento.accion == "ESCALACION",
            )
            .count()
        )

        grupo = (
            db.query(Grupo).filter(Grupo.id == agente.grupo_id).first()
            if agente.grupo_id
            else None
        )

        result.append(
            KpiAgente(
                agente_id=agente.id,
                nombre=agente.nombre,
                email=agente.email,
                grupo=grupo.nombre if grupo else None,
                tickets_cerrados=len(cerrados),
                tickets_activos=len(activos),
                tiempo_promedio_horas=tiempo_prom,
                sla_cumplido_pct=sla_pct,
                csat_promedio=csat_prom,
                total_escalados=escalaciones,
            )
        )

    # Ordenar por tickets cerrados desc
    result.sort(key=lambda x: x.tickets_cerrados, reverse=True)
    return result
