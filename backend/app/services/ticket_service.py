"""
Servicio central de tickets:
- Generación de folios
- Motor de ruteo automático (zona + área técnica → grupo)
- Round Robin entre agentes
- Cálculo de SLA
- Bitácora de eventos
"""
from datetime import datetime, timedelta
from typing import Optional
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.models.models import (
    Ticket, BitacoraEvento, ReglaRuteo, Tipificacion,
    Usuario, Grupo, EstatusTicket, PrioridadTicket,
    RolUsuario, UrgenciaTipificacion
)


# ─── Folio ─────────────────────────────────────────────────────────────────────

def generate_folio(db: Session) -> str:
    year = datetime.now().year
    prefix = f"TKT-{year}-"
    count = db.query(func.count(Ticket.id)).filter(
        Ticket.folio.like(f"{prefix}%")
    ).scalar() or 0
    return f"{prefix}{str(count + 1).zfill(5)}"


# ─── Ruteo ─────────────────────────────────────────────────────────────────────

def find_group(tipificacion_id: int, zona_id: int, db: Session) -> Optional[Grupo]:
    """
    Busca el grupo resolutor según:
    1. Tipificación + Zona específica (regla exacta)
    2. Tipificación + todas las zonas (regla general)
    """
    regla = (
        db.query(ReglaRuteo)
        .filter(
            ReglaRuteo.tipificacion_id == tipificacion_id,
            ReglaRuteo.zona_id == zona_id,
        )
        .order_by(ReglaRuteo.prioridad)
        .first()
    )
    if not regla:
        # Fallback: regla general sin zona específica
        regla = (
            db.query(ReglaRuteo)
            .filter(
                ReglaRuteo.tipificacion_id == tipificacion_id,
                ReglaRuteo.zona_id.is_(None),
            )
            .order_by(ReglaRuteo.prioridad)
            .first()
        )
    return regla.grupo if regla else None


def assign_agent_round_robin(grupo: Grupo, db: Session) -> Optional[Usuario]:
    """
    Round Robin puro: cicla entre agentes usando el total histórico de tickets
    del grupo como índice. Garantiza distribución secuencial siempre.
    """
    agentes = (
        db.query(Usuario)
        .filter(
            Usuario.grupo_id == grupo.id,
            Usuario.rol == RolUsuario.AGENTE,
            Usuario.activo == True,
        )
        .order_by(Usuario.id)
        .all()
    )
    if not agentes:
        return None
    if len(agentes) == 1:
        return agentes[0]

    # Total histórico de tickets en este grupo → índice del ciclo
    total = (
        db.query(func.count(Ticket.id))
        .filter(Ticket.grupo_id == grupo.id)
        .scalar()
    ) or 0

    return agentes[total % len(agentes)]


# ─── SLA ───────────────────────────────────────────────────────────────────────

URGENCY_PRIORITY_MAP = {
    UrgenciaTipificacion.CRITICA: PrioridadTicket.CRITICA,
    UrgenciaTipificacion.ALTA: PrioridadTicket.ALTA,
    UrgenciaTipificacion.MEDIA: PrioridadTicket.MEDIA,
    UrgenciaTipificacion.BAJA: PrioridadTicket.BAJA,
}


def calculate_sla(tipificacion: Tipificacion) -> datetime:
    return datetime.utcnow() + timedelta(hours=tipificacion.sla_horas)


# ─── Bitácora ──────────────────────────────────────────────────────────────────

def log_event(
    db: Session,
    ticket: Ticket,
    usuario_id: int,
    accion: str,
    estado_anterior: Optional[str] = None,
    estado_nuevo: Optional[str] = None,
    comentario: Optional[str] = None,
    tipo_comentario: str = "PUBLICO",
):
    evento = BitacoraEvento(
        ticket_id=ticket.id,
        usuario_id=usuario_id,
        accion=accion,
        estado_anterior=estado_anterior,
        estado_nuevo=estado_nuevo,
        comentario=comentario,
        tipo_comentario=tipo_comentario.upper(),
    )
    db.add(evento)


# ─── Creación de Ticket ───────────────────────────────────────────────────────

def create_ticket_in_db(
    db: Session,
    tienda_id: int,
    descripcion: str,
    usuario_id: int,
    tipificacion_id: Optional[int],
    ia_clasificacion_aceptada: Optional[bool],
    ia_area: Optional[str],
    ia_tipificacion_id: Optional[int],
    ia_confianza: Optional[int],
    ia_sugerencia_solucion: Optional[str],
    metadata_extra: Optional[dict],
) -> Ticket:
    from app.models.models import Tienda
    tienda = db.query(Tienda).filter(Tienda.id == tienda_id).first()

    # Usar tipificación confirmada o la sugerida por IA
    tip_id = tipificacion_id or ia_tipificacion_id
    tipificacion = db.query(Tipificacion).filter(Tipificacion.id == tip_id).first() if tip_id else None

    # Ruteo
    grupo = None
    agente = None
    if tipificacion and tienda:
        grupo = find_group(tipificacion.id, tienda.zona_id, db)
        if grupo:
            agente = assign_agent_round_robin(grupo, db)

    # SLA y prioridad
    sla = calculate_sla(tipificacion) if tipificacion else None
    prioridad = URGENCY_PRIORITY_MAP.get(tipificacion.urgencia, PrioridadTicket.MEDIA) if tipificacion else PrioridadTicket.MEDIA

    ticket = Ticket(
        folio=generate_folio(db),
        tienda_id=tienda_id,
        agente_id=agente.id if agente else None,
        tipificacion_id=tipificacion.id if tipificacion else None,
        grupo_id=grupo.id if grupo else None,
        estatus=EstatusTicket.ASIGNADO if agente else EstatusTicket.NUEVO,
        prioridad=prioridad,
        descripcion=descripcion,
        ia_sugerencia_area=ia_area,
        ia_sugerencia_tipificacion_id=ia_tipificacion_id,
        ia_confianza=ia_confianza,
        ia_clasificacion_aceptada=ia_clasificacion_aceptada,
        ia_sugerencia_solucion=ia_sugerencia_solucion,
        sla_limite=sla,
        metadata_extra=metadata_extra or {},
    )
    db.add(ticket)
    db.flush()  # obtener el ID antes del commit

    log_event(
        db, ticket, usuario_id,
        accion="CREACION",
        estado_nuevo=ticket.estatus.value,
        comentario=f"Ticket creado. Área: {ia_area or 'sin clasificar'}. Confianza IA: {ia_confianza or 0}%",
    )

    if agente:
        log_event(
            db, ticket, usuario_id,
            accion="ASIGNACION_AUTO",
            comentario=f"Asignado automáticamente a {agente.nombre} del grupo {grupo.nombre}",
        )

    db.commit()
    db.refresh(ticket)
    return ticket
