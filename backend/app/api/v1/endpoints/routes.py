from datetime import datetime, timedelta
from typing import Optional
import httpx
from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Query,
    UploadFile,
    File,
    Request,
    Header,
)
from fastapi.security import OAuth2PasswordRequestForm
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, and_, text as sql_text
from fastapi.responses import StreamingResponse
import csv, io

from app.db.session import get_db
from app.core.security import (
    get_current_user,
    require_rol,
    create_token,
    verify_password,
    hash_password,
    verify_dany_token,
)
from app.core.config import get_settings
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
    IncidenteMasivo,
    SlaPolicy,
    OrigenTicket,
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
    TicketSimilarOut,
    TicketIntakeRequest,
    TicketIntakeResponse,
    TorreAlertaItem,
    IncidenteMasivoCreate,
    IncidenteMasivoOut,
    IncidenteMasivoUpdate,
    AgentDisponibilidadUpdate,
    SlaPolicyOut,
    TicketDanyOut,
    TicketDanyCreate,
    VisitaProgRequest,
    EsperandoPiezaRequest,
    CierresMasivosRequest,
    CierresMasivosOut,
    TicketCoordinadorItem,
    KpiEjecutivo,
    KpiTendencia,
    KpiPorArea,
    KpiPorGrupo,
    KpiAgenteExtendido,
    ExportRequest,
    CsatReminderResult,
    DanySesionInicioRequest,
    DanySesionInicioOut,
    DanySesionCierreRequest,
    DanySesionCierreOut,
    KpiDany,
)
from app.services.ia_service import classify_with_ai, suggest_solution
from app.services.ticket_service import (
    create_ticket_in_db,
    log_event,
    assign_agent_round_robin,
    create_ticket_desde_dany,
    get_sla_status,
    get_sla_pct,
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


# ─── Helper: enriquecer ticket con campos Sprint 1 ────────────────────────────
# Llamar en TODOS los lugares donde se devuelve un ticket o lista de tickets.


def _enriquecer_sla(ticket, es_activo: bool = None):
    """
    Calcula y asigna sla_status y sla_porcentaje dinámicamente.
    No persiste nada en DB.
    'es_activo' se infiere si no se pasa.
    """
    ESTADOS_ACTIVOS = {
        "NUEVO",
        "ASIGNADO",
        "EN_PROCESO",
        "ESPERANDO_TIENDA",
        "ESPERANDO_AGENTE",
        "RECHAZADO",
        "PROGRAMADO_VISITA",
        "EN_VISITA",
        "ESPERANDO_PIEZA",
    }
    if es_activo is None:
        es_activo = ticket.estatus.value in ESTADOS_ACTIVOS

    # sla_status — semáforo
    ticket.sla_status = get_sla_status(ticket)

    # sla_porcentaje — número 0–999
    pct = get_sla_pct(ticket)
    ticket.sla_porcentaje = pct

    # sla_vencido — mantener por retrocompatibilidad
    ticket.sla_vencido = (ticket.sla_status == "ROJO") and es_activo

    return ticket


DOMINIOS_PERMITIDOS = {"soyneto.com", "tiendasneto.com"}


@router.post("/auth/login", response_model=TokenResponse)
def login(req: LoginRequest, db: Session = Depends(get_db)):
    # ── Validar dominio ────────────────────────────────────────────────────────
    email_lower = req.email.strip().lower()
    dominio = email_lower.split("@")[-1] if "@" in email_lower else ""
    if dominio not in DOMINIOS_PERMITIDOS:
        raise HTTPException(
            status_code=401,
            detail=f"Solo se permiten correos @soyneto.com o @tiendasneto.com",
        )

    user = (
        db.query(Usuario)
        .filter(Usuario.email == email_lower, Usuario.activo == True)
        .first()
    )
    if not user or not verify_password(req.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Credenciales incorrectas")

    user.last_login = datetime.utcnow()
    db.commit()

    tienda = (
        db.query(Tienda).filter(Tienda.id == user.tienda_id).first()
        if user.tienda_id
        else None
    )
    token = create_token({"sub": str(user.id), "rol": user.rol.value})
    return TokenResponse(
        access_token=token,
        rol=user.rol,
        nombre=user.nombre,
        tienda_id=user.tienda_id,
        tienda_nombre=tienda.nombre if tienda else None,
    )


@router.post(
    "/auth/swagger-login", response_model=TokenResponse, include_in_schema=False
)
def swagger_login(
    form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)
):
    """Endpoint dedicado para Swagger UI que acepta form-data en lugar de JSON"""
    print(
        f"DEBUG swagger_login: username='{form_data.username}', password='{form_data.password}'"
    )
    user = (
        db.query(Usuario)
        .filter(Usuario.email == form_data.username.strip(), Usuario.activo == True)
        .first()
    )
    if not user or not verify_password(
        form_data.password.strip(), user.hashed_password
    ):
        raise HTTPException(status_code=401, detail="Credenciales incorrectas")

    user.last_login = datetime.utcnow()
    db.commit()

    tienda = (
        db.query(Tienda).filter(Tienda.id == user.tienda_id).first()
        if user.tienda_id
        else None
    )

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
        "disponible": current_user.disponible,
    }


# ─── IA ────────────────────────────────────────────────────────────────────────


@router.post("/ai/classify", response_model=ClasificacionResponse)
async def classify_ticket(
    req: ClasificacionRequest,
    db: Session = Depends(get_db),
    _: None = Depends(verify_dany_token),
):
    """Clasifica texto libre → tipificación sugerida con confianza.
    Autenticación: header X-Dany-Token.
    """
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


UMBRAL_CONFIANZA_IA = (
    40  # < 40% → ticket sin tipificación ni agente, queda en revisión manual
)


@router.post("/tickets", response_model=TicketOut, status_code=201)
async def create_ticket(
    body: TicketCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """
    Crea un ticket. Flujo completo:
    1. Clasifica con IA
    2. Si confianza < 40%: ticket queda en NUEVO sin tipificación (revisión manual)
    3. Determina grupo por zona + área
    4. Asigna agente Round Robin
    5. Calcula SLA
    6. Registra en bitácora
    """
    tienda_id = current_user.tienda_id
    if not tienda_id and current_user.rol == RolUsuario.TIENDA:
        raise HTTPException(
            status_code=400, detail="Usuario de tienda sin tienda asignada"
        )

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

    # Umbral de confianza: si < 40% y el usuario no eligió tipificación manualmente,
    # el ticket queda en NUEVO sin asignar para revisión del área correspondiente
    baja_confianza = (
        clasificacion.confianza < UMBRAL_CONFIANZA_IA and not body.tipificacion_id
    )

    tip_id_final = (
        None
        if baja_confianza
        else (body.tipificacion_id or clasificacion.tipificacion_id)
    )

    aceptada = (
        False
        if baja_confianza
        else (
            body.ia_clasificacion_aceptada
            if body.ia_clasificacion_aceptada is not None
            else (body.tipificacion_id is None)
        )
    )

    ticket = create_ticket_in_db(
        db=db,
        tienda_id=tienda_id,
        descripcion=body.descripcion,
        usuario_id=current_user.id,
        tipificacion_id=tip_id_final,
        ia_clasificacion_aceptada=aceptada,
        ia_area=clasificacion.area_tecnica.value,
        ia_tipificacion_id=clasificacion.tipificacion_id,
        ia_confianza=clasificacion.confianza,
        ia_sugerencia_solucion=solucion_ia,
        metadata_extra=body.metadata_extra,
    )

    # Marcar en metadata si quedó pendiente de revisión por baja confianza
    if baja_confianza:
        ticket.metadata_extra = {
            **(ticket.metadata_extra or {}),
            "revision_manual": True,
            "motivo": f"Confianza IA baja: {clasificacion.confianza}%",
        }
        db.flush()

    return (
        db.query(Ticket)
        .options(
            joinedload(Ticket.tipificacion),
            joinedload(Ticket.eventos).joinedload(BitacoraEvento.usuario),
        )
        .filter(Ticket.id == ticket.id)
        .first()
    )


@router.post("/tickets/intake", response_model=TicketIntakeResponse, status_code=201)
async def ticket_intake(
    body: TicketIntakeRequest,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_rol(RolUsuario.ADMIN, RolUsuario.AGENTE)),
):
    """
    Endpoint de ingesta para agentes externos (Javier/WhatsApp).
    Acepta el formato nativo de Javier y hace el mapeo internamente:
    - store_name → tienda_id (lookup por nombre)
    - priority  → PrioridadTicket
    - status    → si "completo" → marca RESUELTO y registra CSAT si rating presente
    - area      → ignorado, la IA determina el área
    """
    # 1. Buscar tienda por nombre (insensible a mayúsculas, match parcial)
    store_name_clean = body.store_name.strip()
    tienda = (
        db.query(Tienda).filter(Tienda.nombre.ilike(f"%{store_name_clean}%")).first()
    )
    if not tienda:
        raise HTTPException(
            status_code=422,
            detail=f"Tienda no encontrada: '{store_name_clean}'. Verifique el nombre exacto.",
        )

    # 2. Mapear prioridad
    prioridad_map = {
        "alta": PrioridadTicket.ALTA,
        "media": PrioridadTicket.MEDIA,
        "baja": PrioridadTicket.BAJA,
        "critica": PrioridadTicket.CRITICA,
    }
    prioridad = prioridad_map.get(
        (body.priority or "media").lower(), PrioridadTicket.MEDIA
    )

    # 3. Descripción completa
    descripcion = body.summary
    if body.reason:
        descripcion = f"{body.summary}\n\nContexto: {body.reason}"

    # 4. Clasificación IA
    clasificacion = await classify_with_ai(descripcion, db)
    solucion_ia = await suggest_solution(
        descripcion,
        clasificacion.tipificacion_nombre,
        clasificacion.area_tecnica.value,
        db,
    )

    # 5. Metadata con datos originales de Javier
    metadata_extra = {}
    if body.javier_folio:
        metadata_extra["javier_folio"] = body.javier_folio
    if body.customer_phone:
        metadata_extra["customer_phone"] = body.customer_phone
    if body.sentiment:
        metadata_extra["sentiment"] = body.sentiment

    # 6. Crear ticket
    ticket = create_ticket_in_db(
        db=db,
        tienda_id=tienda.id,
        descripcion=descripcion,
        usuario_id=current_user.id,
        tipificacion_id=clasificacion.tipificacion_id,
        ia_clasificacion_aceptada=True,
        ia_area=clasificacion.area_tecnica.value,
        ia_tipificacion_id=clasificacion.tipificacion_id,
        ia_confianza=clasificacion.confianza,
        ia_sugerencia_solucion=solucion_ia,
        metadata_extra=metadata_extra or None,
    )

    # Sobreescribir prioridad si Javier envió una explícita
    if prioridad != ticket.prioridad:
        ticket.prioridad = prioridad
        db.commit()

    # 7. Si ya está resuelto, marcar RESUELTO
    csat_registrado = False
    if (body.status or "").lower() == "completo":
        ticket.estatus = EstatusTicket.RESUELTO
        ticket.fecha_primera_respuesta = (
            ticket.fecha_primera_respuesta or datetime.utcnow()
        )
        ticket.fecha_resolucion = datetime.utcnow()
        ticket.fecha_cierre = datetime.utcnow()
        log_event(
            db,
            ticket,
            current_user.id,
            "RESUELTO",
            comentario="Resuelto por agente externo (Javier)",
        )
        db.commit()

        # 7b. Registrar CSAT si Javier envió rating
        if body.rating and 1 <= body.rating <= 5:
            ticket.csat_score = body.rating
            ticket.csat_fecha = datetime.utcnow()
            csat_registrado = True
            db.commit()

    db.refresh(ticket)

    return TicketIntakeResponse(
        folio=ticket.folio,
        ticket_id=ticket.id,
        estatus=ticket.estatus.value,
        tienda_encontrada=tienda.nombre,
        csat_registrado=csat_registrado,
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
    q = db.query(Ticket).options(
        joinedload(Ticket.tipificacion).joinedload(Tipificacion.sla_policy)
    )

    if current_user.rol == RolUsuario.TIENDA:
        q = q.filter(Ticket.tienda_id == current_user.tienda_id)
    elif current_user.rol == RolUsuario.AGENTE and not solo_mios:
        q = q.filter(Ticket.grupo_id == current_user.grupo_id)
    elif current_user.rol.value == "COORDINADOR":
        # Coordinador ve tickets de su zona
        if current_user.zona_id:
            q = q.join(Tienda, Ticket.tienda_id == Tienda.id).filter(
                Tienda.zona_id == current_user.zona_id
            )

    if solo_mios:
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

    # Enriquecer con SLA dinámico y nombre de tienda
    for t in tickets:
        _enriquecer_sla(t)
        # Inyectar tienda_nombre para el frontend (no es columna del modelo)
        if not hasattr(t, "_tienda_nombre_cache"):
            tienda = db.query(Tienda).filter(Tienda.id == t.tienda_id).first()
            t.tienda_nombre = tienda.nombre if tienda else None

    return tickets


# ─── GET /tickets/{ticket_id} ─────────────────────────────────────────────────


@router.get("/tickets/{ticket_id}", response_model=TicketOut)
def get_ticket(
    ticket_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    ticket = (
        db.query(Ticket)
        .options(
            joinedload(Ticket.tipificacion).joinedload(Tipificacion.sla_policy),
            joinedload(Ticket.eventos).joinedload(BitacoraEvento.usuario),
        )
        .filter(Ticket.id == ticket_id)
        .first()
    )

    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket no encontrado")

    if (
        current_user.rol == RolUsuario.TIENDA
        and ticket.tienda_id != current_user.tienda_id
    ):
        raise HTTPException(status_code=403, detail="Sin acceso a este ticket")

    _enriquecer_sla(ticket)
    return ticket


# ─── POST /tickets/desde-dany ─────────────────────────────────────────────────
# Sprint 1: endpoint para que Dany cree tickets pre-tipificados.


@router.post("/tickets/desde-dany", response_model=TicketDanyOut, status_code=201)
async def crear_ticket_desde_dany(
    body: TicketDanyCreate,
    db: Session = Depends(get_db),
    _: None = Depends(verify_dany_token),
):
    """Crea un ticket originado por Dany.
    Autenticación: header X-Dany-Token.
    """
    ticket = create_ticket_desde_dany(
        db=db,
        tienda_id=body.tienda_id,
        descripcion=body.descripcion,
        sesion_id=body.sesion_id,
        tipificacion_id=body.tipificacion_id,
        ia_area=body.ia_area,
        ia_tipificacion_id=body.ia_tipificacion_id,
        ia_confianza=body.ia_confianza,
        pasos_intentados=body.pasos_intentados,
    )

    _enriquecer_sla(ticket)

    grupo_nombre = None
    if ticket.grupo_id:
        g = db.query(Grupo).filter(Grupo.id == ticket.grupo_id).first()
        grupo_nombre = g.nombre if g else None

    agente_nombre = None
    if ticket.agente_id:
        a = db.query(Usuario).filter(Usuario.id == ticket.agente_id).first()
        agente_nombre = a.nombre if a else None

    return TicketDanyOut(
        ticket_id=ticket.id,
        folio=ticket.folio,
        estatus=ticket.estatus.value,
        sla_limite=ticket.sla_limite,
        sla_status=ticket.sla_status,
        grupo_nombre=grupo_nombre,
        agente_nombre=agente_nombre,
        mensaje=f"Ticket {ticket.folio} creado. Asignado a {agente_nombre or 'cola de ' + (grupo_nombre or 'sin grupo')}",
    )


# ─── GET /sla-policies ────────────────────────────────────────────────────────
# Sprint 1: catálogo de políticas SLA para el frontend.


@router.get("/sla-policies", response_model=list[SlaPolicyOut])
def list_sla_policies(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    from app.models.models import SlaPolicy

    return (
        db.query(SlaPolicy)
        .filter(SlaPolicy.activo == True)
        .order_by(SlaPolicy.horas_limite)
        .all()
    )


# ─── Copiloto del Agente — Soluciones históricas ───────────────────────────────


@router.get("/tickets/{ticket_id}/similares", response_model=list[TicketSimilarOut])
def get_tickets_similares(
    ticket_id: int,
    limit: int = Query(default=5, ge=1, le=10),
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_rol(RolUsuario.AGENTE, RolUsuario.ADMIN)),
):
    """
    Devuelve hasta {limit} tickets CERRADOS con la misma tipificación,
    ordenados por CSAT descendente (mejores soluciones primero) y luego
    por fecha de cierre. Excluye el ticket actual.
    Uso: panel "Soluciones Anteriores" en la vista del agente.
    """
    ticket = db.query(Ticket).filter(Ticket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket no encontrado")

    if not ticket.tipificacion_id:
        return []

    similares = (
        db.query(Ticket)
        .filter(
            Ticket.tipificacion_id == ticket.tipificacion_id,
            Ticket.estatus == EstatusTicket.CERRADO,
            Ticket.solucion_propuesta.isnot(None),
            Ticket.id != ticket_id,
        )
        .order_by(
            Ticket.csat_score.desc().nullslast(),
            Ticket.fecha_cierre.desc(),
        )
        .limit(limit)
        .all()
    )

    result = []
    for s in similares:
        tiempo = None
        if s.fecha_apertura and s.fecha_cierre:
            tiempo = round(
                (s.fecha_cierre - s.fecha_apertura).total_seconds() / 3600, 1
            )
        result.append(
            TicketSimilarOut(
                id=s.id,
                folio=s.folio,
                descripcion=(s.descripcion or "")[:150],
                solucion_propuesta=s.solucion_propuesta,
                csat_score=s.csat_score,
                fecha_cierre=s.fecha_cierre,
                tiempo_resolucion_horas=tiempo,
            )
        )

    return result


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

        es_mantenimiento = (
            ticket.tipificacion
            and ticket.tipificacion.area_tecnica.value == "MANTENIMIENTO"
        ) or (ticket.grupo and ticket.grupo.area_tecnica.value == "MANTENIMIENTO")

        valid_transitions = {
            EstatusTicket.NUEVO: [EstatusTicket.EN_PROCESO]
            + ([EstatusTicket.RESUELTO] if es_tienda_o_admin else []),
            EstatusTicket.ASIGNADO: [EstatusTicket.EN_PROCESO]
            + ([EstatusTicket.RESUELTO] if es_tienda_o_admin else []),
            EstatusTicket.EN_PROCESO: [EstatusTicket.ESPERANDO_TIENDA]
            + ([EstatusTicket.PROGRAMADO_VISITA] if es_mantenimiento else [])
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
            EstatusTicket.RESUELTO: [EstatusTicket.CERRADO]
            + ([EstatusTicket.RECHAZADO] if es_tienda_o_admin else []),
            EstatusTicket.PROGRAMADO_VISITA: [
                EstatusTicket.EN_VISITA,
                EstatusTicket.ESPERANDO_PIEZA,
                EstatusTicket.EN_PROCESO,
            ],
            EstatusTicket.EN_VISITA: [
                EstatusTicket.ESPERANDO_PIEZA,
                EstatusTicket.ESPERANDO_TIENDA,
                EstatusTicket.RESUELTO,
            ],
            EstatusTicket.ESPERANDO_PIEZA: [
                EstatusTicket.PROGRAMADO_VISITA,
                EstatusTicket.EN_PROCESO,
            ],
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
                    403,
                    detail="El agente solo puede marcar como resuelto desde estados en espera",
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
    todos: bool = False,  # admin puede pedir incluyendo inactivos
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """Lista grupos. Admin con ?todos=true ve también los inactivos."""
    q = db.query(Grupo)

    # Solo ADMIN puede ver inactivos
    if not todos or current_user.rol != RolUsuario.ADMIN:
        q = q.filter(Grupo.activo == True)

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


# ── POST /tickets/{id}/programar-visita ───────────────────────────────────────


@router.post("/tickets/{ticket_id}/programar-visita", response_model=TicketOut)
def programar_visita(
    ticket_id: int,
    body: VisitaProgRequest,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """
    Programa la visita técnica de Mantenimiento.
    Solo AGENTE o ADMIN. Solo tickets de área MANTENIMIENTO.
    Mueve el ticket a PROGRAMADO_VISITA.
    """
    if current_user.rol == RolUsuario.TIENDA:
        raise HTTPException(403, detail="Solo agentes pueden programar visitas")

    ticket = (
        db.query(Ticket)
        .options(joinedload(Ticket.tipificacion))
        .filter(Ticket.id == ticket_id)
        .first()
    )
    if not ticket:
        raise HTTPException(404, detail="Ticket no encontrado")

    # Validar que es Mantenimiento
    es_mantto = (
        ticket.tipificacion
        and ticket.tipificacion.area_tecnica.value == "MANTENIMIENTO"
    ) or (ticket.grupo and ticket.grupo.area_tecnica.value == "MANTENIMIENTO")
    if not es_mantto:
        raise HTTPException(
            400, detail="Solo tickets de Mantenimiento pueden tener visita programada"
        )

    estados_validos = {
        EstatusTicket.EN_PROCESO,
        EstatusTicket.ASIGNADO,
        EstatusTicket.NUEVO,
        EstatusTicket.ESPERANDO_PIEZA,
    }
    if ticket.estatus not in estados_validos:
        raise HTTPException(
            400, detail=f"No se puede programar visita en estado {ticket.estatus.value}"
        )

    estado_anterior = ticket.estatus.value
    ticket.estatus = EstatusTicket.PROGRAMADO_VISITA
    ticket.fecha_visita_programada = body.fecha_visita
    if body.pieza_requerida:
        ticket.pieza_requerida = body.pieza_requerida

    comentario = (
        f"Visita programada para {body.fecha_visita.strftime('%d/%m/%Y %H:%M')}"
    )
    if body.comentario:
        comentario += f". {body.comentario}"
    if body.pieza_requerida:
        comentario += f". Pieza requerida: {body.pieza_requerida}"

    log_event(
        db,
        ticket,
        current_user.id,
        accion="VISITA_PROGRAMADA",
        estado_anterior=estado_anterior,
        estado_nuevo=EstatusTicket.PROGRAMADO_VISITA.value,
        comentario=comentario,
        tipo_comentario="PUBLICO",
    )
    db.commit()
    db.refresh(ticket)
    _enriquecer_sla(ticket)
    return ticket


# ── POST /tickets/{id}/iniciar-visita ─────────────────────────────────────────


@router.post("/tickets/{ticket_id}/iniciar-visita", response_model=TicketOut)
def iniciar_visita(
    ticket_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """Técnico llegó a la tienda. Mueve a EN_VISITA."""
    if current_user.rol == RolUsuario.TIENDA:
        raise HTTPException(403, detail="Solo agentes pueden iniciar visitas")

    ticket = db.query(Ticket).filter(Ticket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(404, detail="Ticket no encontrado")
    if ticket.estatus != EstatusTicket.PROGRAMADO_VISITA:
        raise HTTPException(400, detail="El ticket debe estar en PROGRAMADO_VISITA")

    ticket.estatus = EstatusTicket.EN_VISITA
    log_event(
        db,
        ticket,
        current_user.id,
        accion="VISITA_INICIADA",
        estado_anterior=EstatusTicket.PROGRAMADO_VISITA.value,
        estado_nuevo=EstatusTicket.EN_VISITA.value,
        comentario="Técnico en tienda — visita en curso",
        tipo_comentario="PUBLICO",
    )
    db.commit()
    db.refresh(ticket)
    _enriquecer_sla(ticket)
    return ticket


# ── POST /tickets/{id}/esperar-pieza ─────────────────────────────────────────


@router.post("/tickets/{ticket_id}/esperar-pieza", response_model=TicketOut)
def esperar_pieza(
    ticket_id: int,
    body: EsperandoPiezaRequest,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """Registra que se requiere una pieza. Mueve a ESPERANDO_PIEZA."""
    if current_user.rol == RolUsuario.TIENDA:
        raise HTTPException(403, detail="Solo agentes pueden registrar piezas")

    ticket = db.query(Ticket).filter(Ticket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(404, detail="Ticket no encontrado")

    estados_validos = {
        EstatusTicket.EN_VISITA,
        EstatusTicket.EN_PROCESO,
        EstatusTicket.PROGRAMADO_VISITA,
    }
    if ticket.estatus not in estados_validos:
        raise HTTPException(
            400, detail=f"No se puede registrar pieza en estado {ticket.estatus.value}"
        )

    estado_anterior = ticket.estatus.value
    ticket.estatus = EstatusTicket.ESPERANDO_PIEZA
    ticket.pieza_requerida = body.pieza_requerida
    ticket.proveedor_pendiente = body.proveedor

    comentario = f"Esperando pieza: {body.pieza_requerida}"
    if body.proveedor:
        comentario += f" | Proveedor: {body.proveedor}"
    if body.comentario:
        comentario += f" | {body.comentario}"

    log_event(
        db,
        ticket,
        current_user.id,
        accion="ESPERANDO_PIEZA",
        estado_anterior=estado_anterior,
        estado_nuevo=EstatusTicket.ESPERANDO_PIEZA.value,
        comentario=comentario,
        tipo_comentario="PUBLICO",
    )
    db.commit()
    db.refresh(ticket)
    _enriquecer_sla(ticket)
    return ticket


# ── GET /coordinador/tickets ──────────────────────────────────────────────────


@router.get("/coordinador/tickets", response_model=list[TicketCoordinadorItem])
def lista_tickets_coordinador(
    estatus: Optional[str] = None,
    limit: int = Query(100, le=300),
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """
    Vista del Coordinador de zona: tickets de Mantenimiento de su zona.
    Solo lectura — el coordinador no puede editar tickets.
    """
    if current_user.rol.value not in ("COORDINADOR", "ADMIN"):
        raise HTTPException(
            403, detail="Solo coordinadores y admin pueden ver esta vista"
        )

    q = (
        db.query(Ticket)
        .options(joinedload(Ticket.tipificacion).joinedload(Tipificacion.sla_policy))
        .join(Grupo, Ticket.grupo_id == Grupo.id, isouter=True)
        .filter(Grupo.area_tecnica == AreaTecnica.MANTENIMIENTO)
    )

    # Filtrar por zona del coordinador
    if current_user.rol.value == "COORDINADOR" and current_user.zona_id:
        q = q.join(Tienda, Ticket.tienda_id == Tienda.id).filter(
            Tienda.zona_id == current_user.zona_id
        )

    if estatus:
        q = q.filter(Ticket.estatus == estatus.upper())

    tickets = q.order_by(Ticket.fecha_apertura.desc()).limit(limit).all()

    result = []
    for t in tickets:
        _enriquecer_sla(t)
        tienda = db.query(Tienda).filter(Tienda.id == t.tienda_id).first()
        agente = (
            db.query(Usuario).filter(Usuario.id == t.agente_id).first()
            if t.agente_id
            else None
        )
        result.append(
            TicketCoordinadorItem(
                id=t.id,
                folio=t.folio,
                estatus=t.estatus.value,
                prioridad=t.prioridad.value,
                descripcion=t.descripcion,
                cat_nivel1=t.cat_nivel1,
                cat_nivel2=t.cat_nivel2,
                tienda_id=t.tienda_id,
                tienda_nombre=tienda.nombre if tienda else None,
                agente_nombre=agente.nombre if agente else None,
                fecha_apertura=t.fecha_apertura,
                fecha_visita_programada=t.fecha_visita_programada,
                pieza_requerida=t.pieza_requerida,
                sla_status=t.sla_status,
                sla_porcentaje=t.sla_porcentaje,
            )
        )
    return result


# ── POST /admin/tickets/cierre-masivo ─────────────────────────────────────────


@router.post("/admin/tickets/cierre-masivo", response_model=CierresMasivosOut)
def cierre_masivo_resueltos(
    body: CierresMasivosRequest,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """
    Cierra en lote tickets que llevan más de N horas en estado RESUELTO.
    Solo ADMIN.
    """
    if current_user.rol != RolUsuario.ADMIN:
        raise HTTPException(
            403, detail="Solo administradores pueden hacer cierre masivo"
        )

    limite_tiempo = datetime.utcnow() - timedelta(hours=body.horas_minimo)

    q = db.query(Ticket).filter(
        Ticket.estatus == EstatusTicket.RESUELTO,
        Ticket.fecha_resolucion <= limite_tiempo,
    )

    if body.ticket_ids:
        q = q.filter(Ticket.id.in_(body.ticket_ids))

    tickets = q.all()
    folios = []
    for t in tickets:
        t.estatus = EstatusTicket.CERRADO
        t.fecha_cierre = datetime.utcnow()
        folios.append(t.folio)
        log_event(
            db,
            t,
            current_user.id,
            accion="CIERRE_MASIVO",
            estado_anterior=EstatusTicket.RESUELTO.value,
            estado_nuevo=EstatusTicket.CERRADO.value,
            comentario=f"Cierre masivo automático después de {body.horas_minimo}h en RESUELTO",
            tipo_comentario="INTERNO",
        )

    db.commit()
    return CierresMasivosOut(cerrados=len(folios), folios=folios)


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


# ─── GET /dashboard ── actualizado con métricas SLA Sprint 1 ──────────────────
# Reemplaza la función get_dashboard existente.
# NOTA: busca en routes.py la función decorada con @router.get("/dashboard")
# y reemplázala completamente con esta.


@router.get("/dashboard", response_model=DashboardMetrics)
def get_dashboard(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    from datetime import date

    ESTADOS_ACTIVOS = [
        EstatusTicket.NUEVO,
        EstatusTicket.ASIGNADO,
        EstatusTicket.EN_PROCESO,
        EstatusTicket.ESPERANDO_TIENDA,
        EstatusTicket.ESPERANDO_AGENTE,
        EstatusTicket.RECHAZADO,
        EstatusTicket.PROGRAMADO_VISITA,
        EstatusTicket.EN_VISITA,
        EstatusTicket.ESPERANDO_PIEZA,
    ]

    # Filtro base por rol
    base = db.query(Ticket)
    if current_user.rol == RolUsuario.AGENTE:
        base = base.filter(Ticket.grupo_id == current_user.grupo_id)
    elif current_user.rol == RolUsuario.TIENDA:
        base = base.filter(Ticket.tienda_id == current_user.tienda_id)

    abiertos = base.filter(Ticket.estatus.in_(ESTADOS_ACTIVOS)).all()

    # Semáforos SLA — calcular dinámicamente
    sla_counts = {"VERDE": 0, "AMARILLO": 0, "ROJO": 0, "SIN_SLA": 0}
    for t in abiertos:
        status = get_sla_status(t)
        sla_counts[status] = sla_counts.get(status, 0) + 1

    hoy = date.today()
    cerrados_hoy = base.filter(
        Ticket.estatus.in_([EstatusTicket.CERRADO, EstatusTicket.RESUELTO]),
        func.date(Ticket.fecha_cierre) == hoy,
    ).count()

    en_proceso = base.filter(
        Ticket.estatus.in_([EstatusTicket.EN_PROCESO, EstatusTicket.ESPERANDO_AGENTE])
    ).count()

    confirmar = base.filter(Ticket.estatus == EstatusTicket.ESPERANDO_TIENDA).count()

    # Por área
    from sqlalchemy import case

    por_area: dict[str, int] = {}
    for t in abiertos:
        area = t.tipificacion.area_tecnica.value if t.tipificacion else "SIN_AREA"
        por_area[area] = por_area.get(area, 0) + 1

    # Por prioridad
    por_prioridad: dict[str, int] = {}
    for t in abiertos:
        p = t.prioridad.value if t.prioridad else "MEDIA"
        por_prioridad[p] = por_prioridad.get(p, 0) + 1

    # Tiempo promedio resolución (últimos 30 días)
    desde = datetime.utcnow() - timedelta(days=30)
    resueltos = base.filter(
        Ticket.estatus.in_([EstatusTicket.CERRADO, EstatusTicket.RESUELTO]),
        Ticket.fecha_cierre >= desde,
        Ticket.fecha_cierre.isnot(None),
    ).all()
    tiempos = [
        (t.fecha_cierre - t.fecha_apertura).total_seconds() / 3600
        for t in resueltos
        if t.fecha_cierre and t.fecha_apertura
    ]
    tiempo_prom = round(sum(tiempos) / len(tiempos), 1) if tiempos else None

    # Tasa IA aceptada
    con_ia = base.filter(Ticket.ia_clasificacion_aceptada.isnot(None)).count()
    aceptada = base.filter(Ticket.ia_clasificacion_aceptada == True).count()
    tasa_ia = round(aceptada / con_ia * 100, 1) if con_ia else None

    return DashboardMetrics(
        total_abiertos=len(abiertos),
        total_en_proceso=en_proceso,
        total_confirmar_solucion=confirmar,
        total_cerrados_hoy=cerrados_hoy,
        total_vencidos=sla_counts["ROJO"],
        total_sin_sla=sla_counts["SIN_SLA"],
        por_area=por_area,
        por_prioridad=por_prioridad,
        por_sla_status=sla_counts,
        tiempo_promedio_resolucion_horas=tiempo_prom,
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

    # ── Recordatorio 12h: tickets ESPERANDO_TIENDA sin respuesta ────────────────
    # Busca tickets donde la solución fue enviada hace entre 12 y 13 horas
    # (ventana de 1h para no duplicar notas en cada ejecución del job)
    limite_12h = datetime.utcnow() - timedelta(hours=12)
    limite_13h = datetime.utcnow() - timedelta(hours=13)

    tickets_sin_respuesta = (
        db.query(Ticket)
        .filter(
            Ticket.estatus == EstatusTicket.ESPERANDO_TIENDA,
            Ticket.fecha_primera_respuesta.isnot(None),
            Ticket.fecha_primera_respuesta < limite_12h,
            Ticket.fecha_primera_respuesta > limite_13h,
        )
        .all()
    )

    recordatorios = 0
    sistema = (
        db.query(Usuario)
        .filter(Usuario.rol == RolUsuario.ADMIN)
        .order_by(Usuario.id)
        .first()
    )
    if sistema:
        for ticket in tickets_sin_respuesta:
            log_event(
                db,
                ticket,
                sistema.id,
                accion="ACTUALIZACION",
                comentario=(
                    "⏰ Recordatorio: la solución fue enviada hace 12 horas "
                    "y la tienda aún no ha confirmado. Considera hacer seguimiento."
                ),
                tipo_comentario="INTERNO",
            )
            recordatorios += 1

    db.commit()

    # ── Detección automática de incidentes masivos ───────────────────────────────
    # Si ≥3 tickets con la misma tipificación se abrieron en las últimas 2h
    # y NO tienen ya un incidente vinculado → crear incidente automáticamente
    hace_2h = datetime.utcnow() - timedelta(hours=2)
    incidentes_creados = 0

    tipificaciones_recientes = (
        db.query(Ticket.tipificacion_id, func.count(Ticket.id).label("total"))
        .filter(
            Ticket.fecha_apertura >= hace_2h,
            Ticket.tipificacion_id.isnot(None),
            Ticket.incidente_id.is_(None),
            Ticket.estatus.notin_([EstatusTicket.CANCELADO]),
        )
        .group_by(Ticket.tipificacion_id)
        .having(func.count(Ticket.id) >= 3)
        .all()
    )

    sistema_admin = (
        db.query(Usuario)
        .filter(Usuario.rol == RolUsuario.ADMIN)
        .order_by(Usuario.id)
        .first()
    )

    for tip_id, total in tipificaciones_recientes:
        tip = db.query(Tipificacion).filter(Tipificacion.id == tip_id).first()
        titulo = f"Incidente masivo: {tip.problema if tip else f'tipificación #{tip_id}'} ({total} tickets)"

        incidente = IncidenteMasivo(
            titulo=titulo,
            descripcion=f"Detección automática: {total} tickets con la misma tipificación en las últimas 2 horas.",
            tipificacion_id=tip_id,
            estado="ACTIVO",
            creado_por=sistema_admin.id if sistema_admin else 1,
        )
        db.add(incidente)
        db.flush()

        tickets_afectados = (
            db.query(Ticket)
            .filter(
                Ticket.fecha_apertura >= hace_2h,
                Ticket.tipificacion_id == tip_id,
                Ticket.incidente_id.is_(None),
            )
            .all()
        )
        tiendas = set()
        for t in tickets_afectados:
            t.incidente_id = incidente.id
            tiendas.add(t.tienda_id)

        incidente.impacto_tiendas = len(tiendas)
        incidentes_creados += 1

    db.commit()

    return {
        "cerrados": cerrados,
        "horas_limite": horas,
        "recordatorios_12h": recordatorios,
        "incidentes_detectados": incidentes_creados,
    }


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


# ── Helpers internos ──────────────────────────────────────────────────────────


def _percentil(valores: list[float], p: int) -> Optional[float]:
    if not valores:
        return None
    s = sorted(valores)
    idx = int(len(s) * p / 100)
    return round(s[min(idx, len(s) - 1)], 1)


def _periodo(desde_str: Optional[str], hasta_str: Optional[str]):
    """Devuelve (desde, hasta) como datetime. Default: últimos 30 días."""
    hasta = datetime.fromisoformat(hasta_str) if hasta_str else datetime.utcnow()
    desde = (
        datetime.fromisoformat(desde_str) if desde_str else hasta - timedelta(days=30)
    )
    return desde, hasta


def _sla_cumplido_pct(tickets_cerrados: list) -> Optional[float]:
    con_sla = [t for t in tickets_cerrados if t.sla_limite]
    if not con_sla:
        return None
    ok = [t for t in con_sla if t.fecha_cierre and t.fecha_cierre <= t.sla_limite]
    return round(len(ok) / len(con_sla) * 100, 1)


def _calcular_deflexion(db, dt_desde, dt_hasta) -> float:
    rows = db.execute(
        sql_text(
            "SELECT COUNT(*) FILTER (WHERE resuelto_sin_ticket=TRUE) AS res, COUNT(*) AS tot "
            "FROM dany_sesiones WHERE fecha_inicio >= :d AND fecha_inicio <= :h"
        ),
        {"d": dt_desde, "h": dt_hasta},
    ).first()
    if not rows or not rows.tot:
        return 0.0
    return round(rows.res / rows.tot * 100, 1)


# ─── GET /admin/kpis/ejecutivo ────────────────────────────────────────────────


@router.get("/admin/kpis/ejecutivo", response_model=KpiEjecutivo)
def kpi_ejecutivo(
    desde: Optional[str] = None,
    hasta: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_rol(RolUsuario.ADMIN)),
):
    """
    Nivel 1 — Vista ejecutiva global.
    Solo ADMIN. Parámetros: desde/hasta en YYYY-MM-DD.
    """
    dt_desde, dt_hasta = _periodo(desde, hasta)
    dias = max((dt_hasta - dt_desde).days, 1)

    todos = (
        db.query(Ticket)
        .filter(
            Ticket.fecha_apertura >= dt_desde,
            Ticket.fecha_apertura <= dt_hasta,
        )
        .all()
    )

    cerrados = [
        t for t in todos if t.estatus in (EstatusTicket.CERRADO, EstatusTicket.RESUELTO)
    ]
    activos = [
        t
        for t in todos
        if t.estatus
        not in (EstatusTicket.CERRADO, EstatusTicket.RESUELTO, EstatusTicket.CANCELADO)
    ]

    # Tiempos
    tiempos = [
        (t.fecha_cierre - t.fecha_apertura).total_seconds() / 3600
        for t in cerrados
        if t.fecha_cierre and t.fecha_apertura
    ]

    # SLA
    sla_pct = _sla_cumplido_pct(cerrados) or 0.0
    sin_sla = len([t for t in todos if not t.sla_limite])

    # CSAT
    con_csat = [t for t in todos if t.csat_score is not None]
    csat_pos = [t for t in con_csat if t.csat_score and t.csat_score >= 4]
    tasa_resp = round(len(con_csat) / len(todos) * 100, 1) if todos else 0.0
    tasa_sat = round(len(csat_pos) / len(con_csat) * 100, 1) if con_csat else 0.0

    # Origen Dany (preparado para Sprint 3)
    t_dany = len(
        [t for t in todos if getattr(t, "origen", None) and t.origen.value == "DANY"]
    )
    t_portal = len(
        [
            t
            for t in todos
            if not (getattr(t, "origen", None) and t.origen.value == "DANY")
        ]
    )

    # Reaperturas (tickets que pasaron por RECHAZADO)
    reaperturas = sum(
        1
        for t in todos
        for e in (t.eventos if hasattr(t, "eventos") else [])
        if e.estado_nuevo == "RECHAZADO"
    )

    return KpiEjecutivo(
        periodo_desde=dt_desde,
        periodo_hasta=dt_hasta,
        total_tickets=len(todos),
        tickets_abiertos=len(activos),
        tickets_cerrados=len(cerrados),
        tickets_por_dia_promedio=round(len(todos) / dias, 1),
        sla_cumplido_pct=sla_pct,
        tickets_sin_sla=sin_sla,
        tiempo_resolucion_p50_horas=_percentil(tiempos, 50),
        tiempo_resolucion_p90_horas=_percentil(tiempos, 90),
        csat_respuestas=len(con_csat),
        csat_tasa_respuesta_pct=tasa_resp,
        csat_satisfaccion_pct=tasa_sat,
        tickets_origen_dany=t_dany,
        tickets_origen_portal=t_portal,
        tasa_deflexion_dany_pct=_calcular_deflexion(db, dt_desde, dt_hasta),
        total_reaperturas=reaperturas,
        tasa_reapertura_pct=round(reaperturas / len(todos) * 100, 1) if todos else 0.0,
    )


# ─── GET /admin/kpis/tendencia ────────────────────────────────────────────────


@router.get("/admin/kpis/tendencia", response_model=list[KpiTendencia])
def kpi_tendencia(
    meses: int = Query(6, ge=1, le=18),
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_rol(RolUsuario.ADMIN)),
):
    """
    Últimos N meses de datos para gráficas de tendencia.
    Devuelve un punto por mes.
    """
    ahora = datetime.utcnow()
    resultado = []

    for i in range(meses - 1, -1, -1):
        # Inicio y fin del mes
        primer_dia = (ahora.replace(day=1) - timedelta(days=i * 28)).replace(day=1)
        if primer_dia.month == 12:
            ultimo_dia = primer_dia.replace(year=primer_dia.year + 1, month=1, day=1)
        else:
            ultimo_dia = primer_dia.replace(month=primer_dia.month + 1, day=1)

        mes_str = primer_dia.strftime("%Y-%m")

        tickets = (
            db.query(Ticket)
            .filter(
                Ticket.fecha_apertura >= primer_dia,
                Ticket.fecha_apertura < ultimo_dia,
            )
            .all()
        )

        cerrados = [
            t
            for t in tickets
            if t.estatus in (EstatusTicket.CERRADO, EstatusTicket.RESUELTO)
        ]
        tiempos = [
            (t.fecha_cierre - t.fecha_apertura).total_seconds() / 3600
            for t in cerrados
            if t.fecha_cierre and t.fecha_apertura
        ]
        con_csat = [t for t in tickets if t.csat_score is not None]
        csat_pos = [t for t in con_csat if t.csat_score and t.csat_score >= 4]
        t_dany = len(
            [
                t
                for t in tickets
                if getattr(t, "origen", None) and t.origen.value == "DANY"
            ]
        )

        resultado.append(
            KpiTendencia(
                mes=mes_str,
                total_tickets=len(tickets),
                sla_cumplido_pct=_sla_cumplido_pct(cerrados),
                tiempo_p50_horas=_percentil(tiempos, 50),
                csat_pct=(
                    round(len(csat_pos) / len(con_csat) * 100, 1) if con_csat else None
                ),
                tickets_dany=t_dany,
            )
        )

    return resultado


# ─── GET /admin/kpis/por-area ─────────────────────────────────────────────────


@router.get("/admin/kpis/por-area", response_model=list[KpiPorArea])
def kpi_por_area(
    desde: Optional[str] = None,
    hasta: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_rol(RolUsuario.ADMIN)),
):
    """Nivel 2 — KPIs desglosados por área técnica."""
    dt_desde, dt_hasta = _periodo(desde, hasta)

    todos = (
        db.query(Ticket)
        .options(joinedload(Ticket.tipificacion))
        .filter(Ticket.fecha_apertura >= dt_desde, Ticket.fecha_apertura <= dt_hasta)
        .all()
    )
    total_global = len(todos) or 1

    # Agrupar
    por_area: dict[str, list] = {}
    for t in todos:
        area = t.tipificacion.area_tecnica.value if t.tipificacion else "SIN_AREA"
        por_area.setdefault(area, []).append(t)

    resultado = []
    for area, ts in sorted(por_area.items(), key=lambda x: -len(x[1])):
        cerrados = [
            t
            for t in ts
            if t.estatus in (EstatusTicket.CERRADO, EstatusTicket.RESUELTO)
        ]
        tiempos = [
            (t.fecha_cierre - t.fecha_apertura).total_seconds() / 3600
            for t in cerrados
            if t.fecha_cierre and t.fecha_apertura
        ]
        con_csat = [t for t in ts if t.csat_score is not None]
        csat_pos = [t for t in con_csat if t.csat_score and t.csat_score >= 4]
        activos = [
            t
            for t in ts
            if t.estatus
            not in (
                EstatusTicket.CERRADO,
                EstatusTicket.RESUELTO,
                EstatusTicket.CANCELADO,
            )
        ]

        resultado.append(
            KpiPorArea(
                area=area,
                total_tickets=len(ts),
                pct_del_total=round(len(ts) / total_global * 100, 1),
                sla_cumplido_pct=_sla_cumplido_pct(cerrados),
                tiempo_p50_horas=_percentil(tiempos, 50),
                tiempo_p90_horas=_percentil(tiempos, 90),
                csat_pct=(
                    round(len(csat_pos) / len(con_csat) * 100, 1) if con_csat else None
                ),
                tickets_vencidos=len(
                    [t for t in activos if get_sla_status(t) == "ROJO"]
                ),
                tickets_sin_sla=len([t for t in ts if not t.sla_limite]),
                reaperturas=sum(
                    1
                    for t in ts
                    for e in (t.eventos if hasattr(t, "eventos") else [])
                    if e.estado_nuevo == "RECHAZADO"
                ),
            )
        )

    return resultado


# ─── GET /admin/kpis/por-grupo ────────────────────────────────────────────────


@router.get("/admin/kpis/por-grupo", response_model=list[KpiPorGrupo])
def kpi_por_grupo(
    desde: Optional[str] = None,
    hasta: Optional[str] = None,
    area: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_rol(RolUsuario.ADMIN)),
):
    """Nivel 3 — KPIs por grupo de soporte."""
    dt_desde, dt_hasta = _periodo(desde, hasta)

    grupos_q = db.query(Grupo).filter(Grupo.activo == True)
    if area:
        grupos_q = grupos_q.filter(Grupo.area_tecnica == area.upper())
    grupos = grupos_q.all()

    resultado = []
    for g in grupos:
        ts = (
            db.query(Ticket)
            .filter(
                Ticket.grupo_id == g.id,
                Ticket.fecha_apertura >= dt_desde,
                Ticket.fecha_apertura <= dt_hasta,
            )
            .all()
        )

        if not ts:
            continue

        cerrados = [
            t
            for t in ts
            if t.estatus in (EstatusTicket.CERRADO, EstatusTicket.RESUELTO)
        ]
        activos = [
            t
            for t in ts
            if t.estatus
            not in (
                EstatusTicket.CERRADO,
                EstatusTicket.RESUELTO,
                EstatusTicket.CANCELADO,
            )
        ]
        tiempos = [
            (t.fecha_cierre - t.fecha_apertura).total_seconds() / 3600
            for t in cerrados
            if t.fecha_cierre and t.fecha_apertura
        ]
        con_csat = [t for t in ts if t.csat_score is not None]
        csat_pos = [t for t in con_csat if t.csat_score and t.csat_score >= 4]
        agentes_activos = (
            db.query(Usuario)
            .filter(
                Usuario.grupo_id == g.id,
                Usuario.rol == RolUsuario.AGENTE,
                Usuario.activo == True,
                Usuario.disponible == True,
            )
            .count()
        )

        resultado.append(
            KpiPorGrupo(
                grupo_id=g.id,
                grupo_nombre=g.nombre,
                area=g.area_tecnica.value,
                total_tickets=len(ts),
                tickets_activos=len(activos),
                tickets_cerrados=len(cerrados),
                sla_cumplido_pct=_sla_cumplido_pct(cerrados),
                tiempo_p50_horas=_percentil(tiempos, 50),
                csat_pct=(
                    round(len(csat_pos) / len(con_csat) * 100, 1) if con_csat else None
                ),
                agentes_activos=agentes_activos,
                tickets_vencidos=len(
                    [t for t in activos if get_sla_status(t) == "ROJO"]
                ),
            )
        )

    resultado.sort(key=lambda x: -x.total_tickets)
    return resultado


# ─── GET /admin/kpis/por-agente (extendido) ───────────────────────────────────


@router.get("/admin/kpis/por-agente", response_model=list[KpiAgenteExtendido])
def kpi_por_agente(
    desde: Optional[str] = None,
    hasta: Optional[str] = None,
    grupo_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_rol(RolUsuario.ADMIN)),
):
    """Nivel 4 — KPIs individuales por agente, versión extendida."""
    dt_desde, dt_hasta = _periodo(desde, hasta)

    aq = db.query(Usuario).filter(
        Usuario.rol == RolUsuario.AGENTE, Usuario.activo == True
    )
    if grupo_id:
        aq = aq.filter(Usuario.grupo_id == grupo_id)
    agentes = aq.all()

    resultado = []
    for a in agentes:
        ts = (
            db.query(Ticket)
            .filter(
                Ticket.agente_id == a.id,
                Ticket.fecha_apertura >= dt_desde,
                Ticket.fecha_apertura <= dt_hasta,
            )
            .all()
        )

        cerrados = [
            t
            for t in ts
            if t.estatus in (EstatusTicket.CERRADO, EstatusTicket.RESUELTO)
        ]
        activos = [
            t
            for t in ts
            if t.estatus
            not in (
                EstatusTicket.CERRADO,
                EstatusTicket.RESUELTO,
                EstatusTicket.CANCELADO,
            )
        ]

        tiempos_res = [
            (t.fecha_cierre - t.fecha_apertura).total_seconds() / 3600
            for t in cerrados
            if t.fecha_cierre and t.fecha_apertura
        ]
        tiempos_1ra = [
            (t.fecha_primera_respuesta - t.fecha_apertura).total_seconds() / 3600
            for t in ts
            if t.fecha_primera_respuesta and t.fecha_apertura
        ]

        con_csat = [t for t in ts if t.csat_score is not None]
        csat_sum = sum(t.csat_score for t in con_csat if t.csat_score)

        reaperturas = sum(
            1
            for t in ts
            for e in (t.eventos if hasattr(t, "eventos") else [])
            if e.estado_nuevo == "RECHAZADO"
        )

        grupo = (
            db.query(Grupo).filter(Grupo.id == a.grupo_id).first()
            if a.grupo_id
            else None
        )

        resultado.append(
            KpiAgenteExtendido(
                agente_id=a.id,
                nombre=a.nombre,
                email=a.email,
                grupo=grupo.nombre if grupo else None,
                area=grupo.area_tecnica.value if grupo else None,
                tickets_cerrados=len(cerrados),
                tickets_activos=len(activos),
                tiempo_promedio_horas=(
                    round(sum(tiempos_res) / len(tiempos_res), 1)
                    if tiempos_res
                    else None
                ),
                tiempo_primera_respuesta_horas=(
                    round(sum(tiempos_1ra) / len(tiempos_1ra), 1)
                    if tiempos_1ra
                    else None
                ),
                sla_cumplido_pct=_sla_cumplido_pct(cerrados),
                csat_promedio=round(csat_sum / len(con_csat), 2) if con_csat else None,
                csat_respuestas=len(con_csat),
                total_escalados=db.query(BitacoraEvento)
                .filter(
                    BitacoraEvento.usuario_id == a.id,
                    BitacoraEvento.accion == "ESCALACION",
                )
                .count(),
                tasa_reapertura_pct=(
                    round(reaperturas / len(ts) * 100, 1) if ts else None
                ),
                disponible=a.disponible,
            )
        )

    resultado.sort(key=lambda x: -x.tickets_cerrados)
    return resultado


# ─── POST /admin/tickets/exportar ─────────────────────────────────────────────


@router.post("/admin/tickets/exportar")
def exportar_tickets(
    body: ExportRequest,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_rol(RolUsuario.ADMIN)),
):
    """
    Genera y descarga un CSV con los tickets del período.
    Solo ADMIN.
    """
    dt_desde, dt_hasta = _periodo(body.desde, body.hasta)

    q = (
        db.query(Ticket)
        .options(
            joinedload(Ticket.tipificacion),
            joinedload(Ticket.tienda),
            joinedload(Ticket.agente),
            joinedload(Ticket.grupo),
        )
        .filter(
            Ticket.fecha_apertura >= dt_desde,
            Ticket.fecha_apertura <= dt_hasta,
        )
    )

    if body.area:
        q = q.join(Tipificacion, Ticket.tipificacion_id == Tipificacion.id).filter(
            Tipificacion.area_tecnica == body.area.upper()
        )
    if body.grupo_id:
        q = q.filter(Ticket.grupo_id == body.grupo_id)
    if body.estatus:
        q = q.filter(Ticket.estatus == body.estatus.upper())

    tickets = q.order_by(Ticket.fecha_apertura.desc()).all()

    # Construir CSV en memoria
    output = io.StringIO()
    writer = csv.writer(output)

    # Cabecera
    headers = [
        "folio",
        "estatus",
        "prioridad",
        "tipo",
        "origen",
        "tienda_id",
        "tienda_nombre",
        "area",
        "categoria",
        "subcategoria",
        "problema",
        "agente",
        "grupo",
        "sla_limite",
        "sla_cumplido",
        "fecha_apertura",
        "fecha_cierre",
        "horas_resolucion",
        "csat_score",
        "descripcion",
    ]
    if body.incluir_bitacora:
        headers.append("eventos_count")
    writer.writerow(headers)

    for t in tickets:
        sla_ok = ""
        if t.sla_limite and t.fecha_cierre:
            sla_ok = "SI" if t.fecha_cierre <= t.sla_limite else "NO"

        horas_res = ""
        if t.fecha_apertura and t.fecha_cierre:
            horas_res = round(
                (t.fecha_cierre - t.fecha_apertura).total_seconds() / 3600, 1
            )

        row = [
            t.folio,
            t.estatus.value,
            t.prioridad.value if t.prioridad else "",
            t.tipo.value if t.tipo else "",
            t.origen.value if t.origen else "PORTAL",
            t.tienda_id,
            t.tienda.nombre if t.tienda else "",
            t.tipificacion.area_tecnica.value if t.tipificacion else "",
            t.cat_nivel1 or "",
            t.cat_nivel2 or "",
            t.cat_nivel3 or "",
            t.agente.nombre if t.agente else "",
            t.grupo.nombre if t.grupo else "",
            t.sla_limite.strftime("%Y-%m-%d %H:%M") if t.sla_limite else "",
            sla_ok,
            t.fecha_apertura.strftime("%Y-%m-%d %H:%M") if t.fecha_apertura else "",
            t.fecha_cierre.strftime("%Y-%m-%d %H:%M") if t.fecha_cierre else "",
            horas_res,
            t.csat_score or "",
            (t.descripcion or "")[:200],
        ]
        if body.incluir_bitacora:
            row.append(len(t.eventos) if hasattr(t, "eventos") else 0)
        writer.writerow(row)

    output.seek(0)
    filename = (
        f"tickets_{dt_desde.strftime('%Y%m%d')}_{dt_hasta.strftime('%Y%m%d')}.csv"
    )
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


# ─── POST /internal/csat-recordatorio ─────────────────────────────────────────


@router.post(
    "/internal/csat-recordatorio",
    include_in_schema=False,
    response_model=CsatReminderResult,
)
def csat_recordatorio(
    db: Session = Depends(get_db),
):
    """
    Marca tickets CERRADO sin CSAT que llevan >24h cerrados para
    que el frontend muestre el banner de calificación pendiente.
    Llamar desde un cron externo (n8n o scheduler).
    No requiere auth — solo accesible internamente.
    """
    hace_24h = datetime.utcnow() - timedelta(hours=24)

    pendientes = (
        db.query(Ticket)
        .filter(
            Ticket.estatus.in_([EstatusTicket.CERRADO, EstatusTicket.RESUELTO]),
            Ticket.csat_score.is_(None),
            Ticket.csat_recordatorio_enviado == False,
            Ticket.fecha_cierre <= hace_24h,
            Ticket.fecha_cierre.isnot(None),
        )
        .all()
    )

    folios = []
    for t in pendientes:
        t.csat_recordatorio_enviado = True
        folios.append(t.folio)

    db.commit()
    return CsatReminderResult(
        procesados=len(pendientes),
        enviados=len(folios),
        folios=folios,
    )


# ═══════════════════════════════════════════════════════════════════════════════
# SPRINT 2 — TORRE DE CONTROL
# ═══════════════════════════════════════════════════════════════════════════════


@router.get("/admin/torre", response_model=list[TorreAlertaItem])
def torre_control(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_rol(RolUsuario.ADMIN)),
):
    """
    Vista de alertas para la Torre de Control (solo ADMIN).
    Retorna tickets que requieren atención inmediata:
    - SLA_VENCIDO: el SLA ya expiró
    - SLA_PROXIMO: vence en las próximas 2 horas
    - SIN_AGENTE: más de 1 hora sin agente asignado
    - ESTANCADO: más de 24h en el mismo estado activo sin bitácora reciente
    """
    ahora = datetime.utcnow()
    en_dos_horas = ahora + timedelta(hours=2)
    hace_una_hora = ahora - timedelta(hours=1)
    hace_24h = ahora - timedelta(hours=24)

    estados_activos = [
        EstatusTicket.NUEVO,
        EstatusTicket.ASIGNADO,
        EstatusTicket.EN_PROCESO,
        EstatusTicket.ESPERANDO_TIENDA,
        EstatusTicket.ESPERANDO_AGENTE,
        EstatusTicket.RECHAZADO,
    ]

    tickets = (
        db.query(Ticket)
        .options(
            joinedload(Ticket.tienda),
            joinedload(Ticket.agente),
            joinedload(Ticket.tipificacion),
            joinedload(Ticket.eventos),
        )
        .filter(Ticket.estatus.in_(estados_activos))
        .all()
    )

    alertas = []
    for t in tickets:
        horas_abierto = round((ahora - t.fecha_apertura).total_seconds() / 3600, 1)
        alerta = None

        if t.sla_vencido or (t.sla_limite and t.sla_limite < ahora):
            alerta = "SLA_VENCIDO"
        elif t.sla_limite and t.sla_limite <= en_dos_horas:
            alerta = "SLA_PROXIMO"
        elif t.estatus == EstatusTicket.NUEVO and t.fecha_apertura < hace_una_hora:
            alerta = "SIN_AGENTE"
        else:
            # Estancado: sin eventos en las últimas 24h
            ultimo_evento = t.eventos[-1].timestamp if t.eventos else t.fecha_apertura
            if ultimo_evento < hace_24h:
                alerta = "ESTANCADO"

        if alerta:
            alertas.append(
                TorreAlertaItem(
                    ticket_id=t.id,
                    folio=t.folio,
                    tienda=t.tienda.nombre if t.tienda else str(t.tienda_id),
                    agente=t.agente.nombre if t.agente else None,
                    tipificacion=t.tipificacion.problema if t.tipificacion else None,
                    estatus=t.estatus.value,
                    prioridad=t.prioridad.value,
                    sla_limite=t.sla_limite,
                    sla_vencido=bool(
                        t.sla_vencido or (t.sla_limite and t.sla_limite < ahora)
                    ),
                    horas_abierto=horas_abierto,
                    alerta=alerta,
                )
            )

    # Orden: SLA_VENCIDO primero, luego prioridad y horas
    orden_alerta = {"SLA_VENCIDO": 0, "SLA_PROXIMO": 1, "SIN_AGENTE": 2, "ESTANCADO": 3}
    orden_prioridad = {"CRITICA": 0, "ALTA": 1, "MEDIA": 2, "BAJA": 3}
    alertas.sort(
        key=lambda a: (
            orden_alerta.get(a.alerta, 9),
            orden_prioridad.get(a.prioridad, 9),
            -a.horas_abierto,
        )
    )
    return alertas


@router.patch(
    "/admin/usuarios/{usuario_id}/disponibilidad", response_model=UsuarioAdminOut
)
def set_disponibilidad(
    usuario_id: int,
    body: AgentDisponibilidadUpdate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_rol(RolUsuario.ADMIN, RolUsuario.AGENTE)),
):
    """
    El agente puede marcar su propia disponibilidad (pausar/reanudar).
    El admin puede cambiarlo para cualquier usuario.
    """
    usuario = db.query(Usuario).filter(Usuario.id == usuario_id).first()
    if not usuario:
        raise HTTPException(404, "Usuario no encontrado")
    if current_user.rol == RolUsuario.AGENTE and current_user.id != usuario_id:
        raise HTTPException(403, "Solo puedes modificar tu propia disponibilidad")

    usuario.disponible = body.disponible
    db.commit()
    db.refresh(usuario)
    return usuario


# ═══════════════════════════════════════════════════════════════════════════════
# SPRINT 2 — INCIDENTES MASIVOS
# ═══════════════════════════════════════════════════════════════════════════════


@router.get("/admin/incidentes", response_model=list[IncidenteMasivoOut])
def list_incidentes(
    estado: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_rol(RolUsuario.ADMIN, RolUsuario.AGENTE)),
):
    """Lista incidentes masivos. ADMIN y AGENTE pueden consultar."""
    q = db.query(IncidenteMasivo)
    if estado:
        q = q.filter(IncidenteMasivo.estado == estado.upper())
    return q.order_by(IncidenteMasivo.fecha_inicio.desc()).all()


@router.post("/admin/incidentes", response_model=IncidenteMasivoOut, status_code=201)
def create_incidente(
    body: IncidenteMasivoCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_rol(RolUsuario.ADMIN)),
):
    """Crea un incidente masivo y opcionalmente vincula tickets existentes."""
    incidente = IncidenteMasivo(
        titulo=body.titulo,
        descripcion=body.descripcion,
        tipificacion_id=body.tipificacion_id,
        estado="ACTIVO",
        creado_por=current_user.id,
        impacto_tiendas=0,
    )
    db.add(incidente)
    db.flush()  # get id before linking tickets

    tiendas_afectadas = set()
    if body.ticket_ids:
        tickets = db.query(Ticket).filter(Ticket.id.in_(body.ticket_ids)).all()
        for t in tickets:
            t.incidente_id = incidente.id
            tiendas_afectadas.add(t.tienda_id)

    incidente.impacto_tiendas = len(tiendas_afectadas)
    db.commit()
    db.refresh(incidente)
    return incidente


@router.patch("/admin/incidentes/{incidente_id}", response_model=IncidenteMasivoOut)
def update_incidente(
    incidente_id: int,
    body: IncidenteMasivoUpdate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_rol(RolUsuario.ADMIN)),
):
    """Actualiza o cierra un incidente masivo."""
    incidente = (
        db.query(IncidenteMasivo).filter(IncidenteMasivo.id == incidente_id).first()
    )
    if not incidente:
        raise HTTPException(404, "Incidente no encontrado")

    if body.titulo is not None:
        incidente.titulo = body.titulo
    if body.descripcion is not None:
        incidente.descripcion = body.descripcion
    if body.estado is not None:
        incidente.estado = body.estado.upper()
        if incidente.estado == "CERRADO" and not incidente.fecha_cierre:
            incidente.fecha_cierre = datetime.utcnow()

    db.commit()
    db.refresh(incidente)
    return incidente


# ─── POST /dany/sesion/iniciar ────────────────────────────────────────────────
@router.post("/dany/sesion/iniciar", response_model=DanySesionInicioOut)
def dany_sesion_iniciar(
    body: DanySesionInicioRequest,
    db: Session = Depends(get_db),
    _: None = Depends(verify_dany_token),
):
    """Registra inicio de sesión Dany. Autenticación: X-Dany-Token."""
    existing = db.execute(
        sql_text("SELECT id FROM dany_sesiones WHERE sesion_id = :sid"),
        {"sid": body.sesion_id},
    ).first()

    if not existing:
        db.execute(
            sql_text(
                """
                INSERT INTO dany_sesiones (sesion_id, tienda_id, canal, fecha_inicio)
                VALUES (:sid, :tid, :canal, NOW())
            """
            ),
            {"sid": body.sesion_id, "tid": body.tienda_id, "canal": body.canal},
        )
        db.commit()

    return DanySesionInicioOut(
        sesion_id=body.sesion_id,
        tienda_id=body.tienda_id,
    )


# ─── POST /dany/sesion/cerrar ─────────────────────────────────────────────────


@router.post("/dany/sesion/cerrar", response_model=DanySesionCierreOut)
def dany_sesion_cerrar(
    body: DanySesionCierreRequest,
    db: Session = Depends(get_db),
    _: None = Depends(verify_dany_token),
):
    """Registra cierre de sesión Dany. Autenticación: X-Dany-Token."""
    db.execute(
        sql_text(
            """
            UPDATE dany_sesiones SET
                resuelto_sin_ticket    = :resuelto,
                mensajes_count         = :msgs,
                tipificacion_detectada = :tip,
                motivo_escalacion      = :motivo,
                fecha_fin              = NOW()
            WHERE sesion_id = :sid
        """
        ),
        {
            "sid": body.sesion_id,
            "resuelto": body.resuelto_sin_ticket,
            "msgs": body.mensajes_count,
            "tip": body.tipificacion_detectada,
            "motivo": body.motivo_escalacion,
        },
    )
    db.commit()

    return DanySesionCierreOut(
        sesion_id=body.sesion_id,
        deflexion=body.resuelto_sin_ticket,
        mensaje=(
            "Deflexión registrada — Dany resolvió sin ticket"
            if body.resuelto_sin_ticket
            else "Escalación registrada — ticket creado"
        ),
    )


# ─── GET /admin/kpis/dany ─────────────────────────────────────────────────────


@router.get("/admin/kpis/dany", response_model=KpiDany)
def kpi_dany(
    desde: Optional[str] = None,
    hasta: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_rol(RolUsuario.ADMIN)),
):
    """
    Métricas de rendimiento de Dany como primera línea.
    Solo ADMIN.
    """
    dt_desde = (
        datetime.fromisoformat(desde)
        if desde
        else datetime.utcnow() - timedelta(days=30)
    )
    dt_hasta = datetime.fromisoformat(hasta) if hasta else datetime.utcnow()

    # Sesiones en el período
    sesiones = db.execute(
        sql_text(
            """
        SELECT sesion_id, tienda_id, canal, mensajes_count,
               resuelto_sin_ticket, ticket_id,
               tipificacion_detectada, motivo_escalacion,
               fecha_inicio, fecha_fin
        FROM dany_sesiones
        WHERE fecha_inicio >= :desde AND fecha_inicio <= :hasta
    """
        ),
        {"desde": dt_desde, "hasta": dt_hasta},
    ).fetchall()

    total = len(sesiones)
    resueltas = [s for s in sesiones if s.resuelto_sin_ticket]
    escaladas = [s for s in sesiones if not s.resuelto_sin_ticket]
    tasa = round(len(resueltas) / total * 100, 1) if total else 0.0

    # Tickets creados por Dany en el período
    tickets_dany = db.execute(
        sql_text(
            """
        SELECT t.id, t.fecha_apertura, t.fecha_primera_respuesta
        FROM tickets t
        WHERE t.origen = 'DANY'
          AND t.fecha_apertura >= :desde
          AND t.fecha_apertura <= :hasta
    """
        ),
        {"desde": dt_desde, "hasta": dt_hasta},
    ).fetchall()

    # Tiempo primera respuesta agente a tickets de Dany
    tiempos_resp = [
        (t.fecha_primera_respuesta - t.fecha_apertura).total_seconds() / 3600
        for t in tickets_dany
        if t.fecha_primera_respuesta and t.fecha_apertura
    ]
    t_resp = round(sum(tiempos_resp) / len(tiempos_resp), 1) if tiempos_resp else None

    # Por canal
    por_canal: dict[str, int] = {}
    for s in sesiones:
        canal = s.canal or "portal"
        por_canal[canal] = por_canal.get(canal, 0) + 1

    # Top tipificaciones detectadas
    tip_count: dict[str, int] = {}
    for s in sesiones:
        if s.tipificacion_detectada:
            tip_count[s.tipificacion_detectada] = (
                tip_count.get(s.tipificacion_detectada, 0) + 1
            )
    top_tips = sorted(
        [{"nombre": k, "count": v} for k, v in tip_count.items()],
        key=lambda x: -x["count"],
    )[:10]

    return KpiDany(
        periodo_desde=dt_desde,
        periodo_hasta=dt_hasta,
        sesiones_totales=total,
        sesiones_resueltas=len(resueltas),
        sesiones_escaladas=len(escaladas),
        tasa_deflexion_pct=tasa,
        tickets_creados=len(tickets_dany),
        tiempo_primera_respuesta_agente_horas=t_resp,
        por_canal=por_canal,
        top_tipificaciones=top_tips,
    )


# ─── POST /internal/escalar-sla-dany ─────────────────────────────────────────


@router.post("/internal/escalar-sla-dany", include_in_schema=False)
def escalar_sla_dany(db: Session = Depends(get_db)):
    """
    Revisa tickets de DANY que han consumido >= 70% del SLA y
    eleva su prioridad a ALTA si aún es MEDIA o BAJA.
    Llamar desde un cron en n8n cada hora.
    """
    ahora = datetime.utcnow()

    ESTADOS_ACTIVOS = [
        EstatusTicket.NUEVO,
        EstatusTicket.ASIGNADO,
        EstatusTicket.EN_PROCESO,
        EstatusTicket.ESPERANDO_TIENDA,
        EstatusTicket.ESPERANDO_AGENTE,
        EstatusTicket.RECHAZADO,
    ]

    tickets = (
        db.query(Ticket)
        .filter(
            Ticket.origen == OrigenTicket.DANY,
            Ticket.estatus.in_(ESTADOS_ACTIVOS),
            Ticket.sla_limite.isnot(None),
            Ticket.prioridad.in_([PrioridadTicket.MEDIA, PrioridadTicket.BAJA]),
        )
        .all()
    )

    escalados = []
    for t in tickets:
        total_seg = (t.sla_limite - t.fecha_apertura).total_seconds()
        if total_seg <= 0:
            continue
        pct = (ahora - t.fecha_apertura).total_seconds() / total_seg * 100
        if pct >= 70:
            prioridad_anterior = t.prioridad.value
            t.prioridad = PrioridadTicket.ALTA
            log_event(
                db,
                t,
                usuario_id=1,  # usuario sistema
                accion="ESCALACION_SLA_DANY",
                comentario=(
                    f"Auto-escalación: ticket Dany al {pct:.0f}% del SLA. "
                    f"Prioridad {prioridad_anterior} → ALTA"
                ),
                tipo_comentario="INTERNO",
            )
            escalados.append(t.folio)

    db.commit()
    return {"escalados": len(escalados), "folios": escalados}


# ── Proxy Dany / n8n ──────────────────────────────────────────────────────────


@router.get("/dany/debug")
def dany_debug():
    s = get_settings()
    return {"DANY_WEBHOOK_URL": s.DANY_WEBHOOK_URL}


@router.post("/dany/chat")
async def dany_chat_proxy(
    payload: dict,
    current_user: Usuario = Depends(get_current_user),
):
    """Reenvía el mensaje al webhook de n8n evitando CORS en el navegador."""
    webhook_url = get_settings().DANY_WEBHOOK_URL
    if not webhook_url:
        raise HTTPException(status_code=503, detail="DANY_WEBHOOK_URL no configurada")
    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            resp = await client.post(webhook_url, json=payload)
            resp.raise_for_status()
            return resp.json()
    except httpx.HTTPStatusError as e:
        raise HTTPException(
            status_code=502, detail=f"n8n respondió {e.response.status_code}"
        )
    except httpx.RequestError:
        raise HTTPException(
            status_code=502, detail="No se pudo conectar con el agente Dany"
        )


# ─── GET /media/proxy ─────────────────────────────────────────────────────────
# Proxy para archivos multimedia de Dany evitando restricciones CORS.


@router.get("/media/proxy")
async def media_proxy(url: str):
    """Descarga un archivo multimedia desde el servidor de Dany y lo sirve con CORS abierto."""
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.get(
                url,
                headers={"X-API-Key": "dany-promo-2026-s3cur3-k3y"},
                follow_redirects=True,
            )
            resp.raise_for_status()
            content_type = resp.headers.get("content-type", "application/octet-stream")
            return StreamingResponse(
                iter([resp.content]),
                media_type=content_type,
                headers={
                    "Access-Control-Allow-Origin": "*",
                    "Cache-Control": "public, max-age=3600",
                },
            )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Error al obtener el archivo: {e}")
