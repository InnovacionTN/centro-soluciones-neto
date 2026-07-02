"""
Servicio central de tickets v2 — Sprint 1
Cambios vs v1:
  - calculate_sla() ahora usa SlaPolicy con horas hábiles (L-V 8-18 CDMX)
  - get_sla_status() devuelve VERDE/AMARILLO/ROJO/SIN_SLA para el semáforo
  - create_ticket_in_db() copia los 3 niveles de tipificación al ticket
  - create_ticket_desde_dany() nuevo punto de entrada para tickets de Dany
"""

from datetime import datetime, timedelta
from typing import Optional
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.models.models import (
    Ticket,
    BitacoraEvento,
    ReglaRuteo,
    Tipificacion,
    SlaPolicy,
    Usuario,
    Grupo,
    EstatusTicket,
    OrigenTicket,
    PrioridadTicket,
    RolUsuario,
    UrgenciaTipificacion,
)

# ─── Constantes ────────────────────────────────────────────────────────────────

ESTADOS_ACTIVOS = [
    EstatusTicket.NUEVO,
    EstatusTicket.ASIGNADO,
    EstatusTicket.EN_PROCESO,
    EstatusTicket.ESPERANDO_TIENDA,
    EstatusTicket.ESPERANDO_AGENTE,
    EstatusTicket.RECHAZADO,
    # Mantenimiento
    EstatusTicket.PROGRAMADO_VISITA,
    EstatusTicket.EN_VISITA,
    EstatusTicket.ESPERANDO_PIEZA,
]

# Horario hábil en hora local CDMX (UTC-6)
HORA_INICIO_HABIL = 8  # 08:00
HORA_FIN_HABIL = 18  # 18:00
DIAS_HABILES = {0, 1, 2, 3, 4}  # lunes=0 … viernes=4

URGENCY_PRIORITY_MAP = {
    UrgenciaTipificacion.CRITICA: PrioridadTicket.CRITICA,
    UrgenciaTipificacion.ALTA: PrioridadTicket.ALTA,
    UrgenciaTipificacion.MEDIA: PrioridadTicket.MEDIA,
    UrgenciaTipificacion.BAJA: PrioridadTicket.BAJA,
}


# ─── Folio ─────────────────────────────────────────────────────────────────────


def generate_folio(db: Session) -> str:
    year = datetime.now().year
    prefix = f"TKT-{year}-"
    count = (
        db.query(func.count(Ticket.id)).filter(Ticket.folio.like(f"{prefix}%")).scalar()
        or 0
    )
    return f"{prefix}{str(count + 1).zfill(5)}"


# ─── Ruteo ─────────────────────────────────────────────────────────────────────


def find_group(tipificacion_id: int, zona_id: int, db: Session) -> Optional[Grupo]:
    """
    Busca el grupo resolutor usando jerarquia geografica:
    1. Zona exacta
    2. Region de la zona
    3. Compania de la region
    4. General (sin restriccion geografica)
    """
    from app.models.models import Zona, Region

    region_id = None
    compania_id = None
    if zona_id:
        zona = db.query(Zona).filter(Zona.id == zona_id).first()
        if zona:
            region_id = zona.region_id
            if region_id:
                region = db.query(Region).filter(Region.id == region_id).first()
                if region:
                    compania_id = region.compania_id

    candidatos = []
    if zona_id:
        candidatos.append((
            ReglaRuteo.zona_id == zona_id,
            ReglaRuteo.region_id.is_(None),
            ReglaRuteo.compania_id.is_(None),
        ))
    if region_id:
        candidatos.append((
            ReglaRuteo.zona_id.is_(None),
            ReglaRuteo.region_id == region_id,
            ReglaRuteo.compania_id.is_(None),
        ))
    if compania_id:
        candidatos.append((
            ReglaRuteo.zona_id.is_(None),
            ReglaRuteo.region_id.is_(None),
            ReglaRuteo.compania_id == compania_id,
        ))
    candidatos.append((
        ReglaRuteo.zona_id.is_(None),
        ReglaRuteo.region_id.is_(None),
        ReglaRuteo.compania_id.is_(None),
    ))

    for filtros in candidatos:
        regla = (
            db.query(ReglaRuteo)
            .filter(ReglaRuteo.tipificacion_id == tipificacion_id, *filtros)
            .order_by(ReglaRuteo.prioridad)
            .first()
        )
        if regla:
            return regla.grupo

    return None


def assign_agent_round_robin(grupo: Grupo, db: Session) -> Optional[Usuario]:
    """Smart Load Balancing: agente con menor carga ponderada."""
    agentes = (
        db.query(Usuario)
        .filter(
            Usuario.grupo_id == grupo.id,
            Usuario.rol == RolUsuario.AGENTE,
            Usuario.activo == True,
            Usuario.disponible == True,
        )
        .order_by(Usuario.id)
        .all()
    )
    if not agentes:
        return None
    if len(agentes) == 1:
        return agentes[0]

    ahora = datetime.utcnow()

    def carga_ponderada(agente: Usuario) -> float:
        tickets_activos = (
            db.query(Ticket)
            .filter(Ticket.agente_id == agente.id, Ticket.estatus.in_(ESTADOS_ACTIVOS))
            .all()
        )
        total = 0.0
        for t in tickets_activos:
            horas = (ahora - t.fecha_apertura).total_seconds() / 3600
            peso = 1.0 + (horas / 24) * 0.5
            total += min(peso, 3.0)
        return total

    cargas = [(a, carga_ponderada(a)) for a in agentes]
    min_carga = min(c for _, c in cargas)
    candidatos = [a for a, c in cargas if c == min_carga]
    if len(candidatos) == 1:
        return candidatos[0]

    ultimo = {
        a.id: (
            db.query(func.max(Ticket.fecha_apertura))
            .filter(Ticket.agente_id == a.id)
            .scalar()
            or datetime.min
        )
        for a in candidatos
    }
    return min(candidatos, key=lambda a: ultimo[a.id])


# ─── SLA con horas hábiles ─────────────────────────────────────────────────────


def _es_hora_habil(dt: datetime) -> bool:
    """Verdadero si el momento cae dentro del horario hábil CDMX."""
    # dt viene en UTC; convertimos a CDMX (UTC-6, sin ajuste DST por simplicidad)
    cdmx = dt - timedelta(hours=6)
    return (
        cdmx.weekday() in DIAS_HABILES
        and HORA_INICIO_HABIL <= cdmx.hour < HORA_FIN_HABIL
    )


def _add_horas_habiles(inicio: datetime, horas: int) -> datetime:
    """
    Suma 'horas' hábiles a 'inicio'.
    Avanza minuto a minuto dentro del horario L-V 8-18 CDMX.
    Para SLAs largos (>= 16h) usa saltos de día para evitar loops lentos.
    """
    if horas <= 0:
        return inicio

    MINUTOS_HABILES_DIA = (HORA_FIN_HABIL - HORA_INICIO_HABIL) * 60  # 600 min = 10h

    actual = inicio
    minutos_restantes = horas * 60

    # Si caemos fuera de horario hábil, avanzar al próximo inicio
    actual = _avanzar_a_proximo_inicio_habil(actual)

    while minutos_restantes > 0:
        cdmx = actual - timedelta(hours=6)

        if cdmx.weekday() not in DIAS_HABILES:
            # Fin de semana: saltar al lunes 8:00
            dias_hasta_lunes = (7 - cdmx.weekday()) % 7 or 7
            actual += timedelta(days=dias_hasta_lunes)
            cdmx = actual - timedelta(hours=6)
            actual = actual.replace(
                hour=HORA_INICIO_HABIL + 6, minute=0, second=0, microsecond=0
            )
            continue

        minutos_hasta_cierre = (HORA_FIN_HABIL - cdmx.hour) * 60 - cdmx.minute

        if minutos_restantes <= minutos_hasta_cierre:
            actual += timedelta(minutes=minutos_restantes)
            minutos_restantes = 0
        else:
            minutos_restantes -= minutos_hasta_cierre
            # Avanzar al siguiente día hábil 8:00
            actual += timedelta(days=1)
            cdmx = actual - timedelta(hours=6)
            # Ajustar a las 8:00 CDMX
            actual = actual - timedelta(
                hours=cdmx.hour - HORA_INICIO_HABIL,
                minutes=cdmx.minute,
                seconds=cdmx.second,
                microseconds=cdmx.microsecond,
            )
            actual = _avanzar_a_proximo_inicio_habil(actual)

    return actual


def _avanzar_a_proximo_inicio_habil(dt: datetime) -> datetime:
    """Si dt está fuera de horario, lo mueve al próximo inicio hábil."""
    cdmx = dt - timedelta(hours=6)
    hora = cdmx.hour + cdmx.minute / 60

    # Fin de semana
    if cdmx.weekday() not in DIAS_HABILES:
        dias = (7 - cdmx.weekday()) % 7 or 7
        cdmx_nuevo = (cdmx + timedelta(days=dias)).replace(
            hour=HORA_INICIO_HABIL, minute=0, second=0, microsecond=0
        )
        return cdmx_nuevo + timedelta(hours=6)

    # Antes de hora hábil
    if cdmx.hour < HORA_INICIO_HABIL:
        cdmx_nuevo = cdmx.replace(
            hour=HORA_INICIO_HABIL, minute=0, second=0, microsecond=0
        )
        return cdmx_nuevo + timedelta(hours=6)

    # Después de hora hábil: siguiente día
    if cdmx.hour >= HORA_FIN_HABIL:
        cdmx_nuevo = (cdmx + timedelta(days=1)).replace(
            hour=HORA_INICIO_HABIL, minute=0, second=0, microsecond=0
        )
        # Saltar fin de semana
        while cdmx_nuevo.weekday() not in DIAS_HABILES:
            cdmx_nuevo += timedelta(days=1)
        return cdmx_nuevo + timedelta(hours=6)

    return dt


def calculate_sla(tipificacion: Tipificacion) -> datetime:
    """
    Calcula la fecha límite SLA usando horas hábiles si hay policy,
    o fallback simple si no hay policy asignada.
    """
    horas = tipificacion.sla_horas or 72
    usar_habiles = True

    if tipificacion.sla_policy:
        horas = tipificacion.sla_policy.horas_limite
        usar_habiles = tipificacion.sla_policy.tipo_calendario == "habil"

    if usar_habiles:
        return _add_horas_habiles(datetime.utcnow(), horas)
    else:
        return datetime.utcnow() + timedelta(hours=horas)


def get_sla_status(ticket: Ticket) -> str:
    """
    Calcula el estado del semáforo SLA de forma dinámica.
    Nunca leer ticket.sla_vencido para esto — siempre recalcular.

    Retorna: "VERDE" | "AMARILLO" | "ROJO" | "SIN_SLA"
    """
    if not ticket.sla_limite:
        return "SIN_SLA"

    if ticket.estatus in (
        EstatusTicket.RESUELTO,
        EstatusTicket.CERRADO,
        EstatusTicket.CANCELADO,
    ):
        return "VERDE"

    ahora = datetime.utcnow()
    limite = ticket.sla_limite
    total_seg = (limite - ticket.fecha_apertura).total_seconds()
    transcurrido_seg = (ahora - ticket.fecha_apertura).total_seconds()

    if total_seg <= 0:
        return "ROJO"

    pct = transcurrido_seg / total_seg * 100

    if pct >= 100:
        return "ROJO"
    elif pct >= 70:
        return "AMARILLO"
    else:
        return "VERDE"


def get_sla_pct(ticket: Ticket) -> Optional[float]:
    """Porcentaje del SLA transcurrido (puede pasar de 100)."""
    if not ticket.sla_limite:
        return None
    total = (ticket.sla_limite - ticket.fecha_apertura).total_seconds()
    if total <= 0:
        return 100.0
    transcurrido = (datetime.utcnow() - ticket.fecha_apertura).total_seconds()
    return round(min(transcurrido / total * 100, 999.9), 1)


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
    evidencia_id: Optional[int] = None,
):
    evento = BitacoraEvento(
        ticket_id=ticket.id,
        usuario_id=usuario_id,
        accion=accion,
        estado_anterior=estado_anterior,
        estado_nuevo=estado_nuevo,
        comentario=comentario,
        tipo_comentario=tipo_comentario.upper(),
        evidencia_id=evidencia_id,
    )
    db.add(evento)


# ─── Creación de Ticket (portal) ──────────────────────────────────────────────


def _build_ticket(
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
    origen: OrigenTicket = OrigenTicket.PORTAL,
    dany_sesion_id: Optional[str] = None,
) -> Ticket:
    from app.models.models import Tienda

    tienda = db.query(Tienda).filter(Tienda.id == tienda_id).first()

    tip_id = tipificacion_id or ia_tipificacion_id
    tipificacion = (
        db.query(Tipificacion).filter(Tipificacion.id == tip_id).first()
        if tip_id
        else None
    )

    grupo = None
    agente = None
    if tipificacion and tienda:
        grupo = find_group(tipificacion.id, tienda.zona_id, db)
        if grupo:
            agente = assign_agent_round_robin(grupo, db)

    sla = calculate_sla(tipificacion) if tipificacion else None
    prioridad = (
        URGENCY_PRIORITY_MAP.get(tipificacion.urgencia, PrioridadTicket.MEDIA)
        if tipificacion
        else PrioridadTicket.MEDIA
    )

    ticket = Ticket(
        folio=generate_folio(db),
        tienda_id=tienda_id,
        agente_id=agente.id if agente else None,
        tipificacion_id=tipificacion.id if tipificacion else None,
        grupo_id=grupo.id if grupo else None,
        estatus=EstatusTicket.ASIGNADO if agente else EstatusTicket.NUEVO,
        prioridad=prioridad,
        tipo=tipificacion.tipo if tipificacion else None,
        descripcion=descripcion,
        # ── 3 niveles copiados de la tipificación ──
        cat_nivel1=tipificacion.categoria if tipificacion else None,
        cat_nivel2=tipificacion.subcategoria if tipificacion else None,
        cat_nivel3=tipificacion.problema if tipificacion else None,
        # ── origen ──
        origen=origen,
        dany_sesion_id=dany_sesion_id,
        # ── IA ──
        ia_sugerencia_area=ia_area,
        ia_sugerencia_tipificacion_id=ia_tipificacion_id,
        ia_confianza=ia_confianza,
        ia_clasificacion_aceptada=ia_clasificacion_aceptada,
        ia_sugerencia_solucion=ia_sugerencia_solucion,
        sla_limite=sla,
        metadata_extra=metadata_extra or {},
    )
    db.add(ticket)
    db.flush()

    log_event(
        db,
        ticket,
        usuario_id,
        accion="CREACION",
        estado_nuevo=ticket.estatus.value,
        comentario=(
            f"Ticket creado desde {origen.value}. "
            f"Área: {ia_area or 'sin clasificar'}. "
            f"Confianza IA: {ia_confianza or 0}%"
            + (f" | Sesión Dany: {dany_sesion_id}" if dany_sesion_id else "")
        ),
    )

    if agente:
        log_event(
            db,
            ticket,
            usuario_id,
            accion="ASIGNACION_AUTO",
            comentario=f"Asignado a {agente.nombre} ({grupo.nombre})",
        )

    return ticket


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
    """Punto de entrada desde el portal web."""
    ticket = _build_ticket(
        db=db,
        tienda_id=tienda_id,
        descripcion=descripcion,
        usuario_id=usuario_id,
        tipificacion_id=tipificacion_id,
        ia_clasificacion_aceptada=ia_clasificacion_aceptada,
        ia_area=ia_area,
        ia_tipificacion_id=ia_tipificacion_id,
        ia_confianza=ia_confianza,
        ia_sugerencia_solucion=ia_sugerencia_solucion,
        metadata_extra=metadata_extra,
        origen=OrigenTicket.PORTAL,
    )
    db.commit()
    db.refresh(ticket)
    return ticket


def create_ticket_desde_dany(
    db: Session,
    tienda_id: int,
    descripcion: str,
    sesion_id: str,
    tipificacion_id: Optional[int],
    ia_area: Optional[str],
    ia_tipificacion_id: Optional[int],
    ia_confianza: Optional[int],
    pasos_intentados: Optional[list] = None,
    metadata_extra: Optional[dict] = None,
) -> Ticket:
    """
    Punto de entrada para tickets creados por Dany.
    El agente que crea el ticket es el usuario del sistema (admin).
    El historial de Dany se guarda en metadata_extra.
    """
    # Buscar usuario sistema para loguear — usar admin si existe
    from app.models.models import RolUsuario

    admin = (
        db.query(Usuario)
        .filter(Usuario.rol == RolUsuario.ADMIN, Usuario.activo == True)
        .first()
    )
    sistema_usuario_id = admin.id if admin else 1

    meta = metadata_extra or {}
    if pasos_intentados:
        meta["dany_pasos_intentados"] = pasos_intentados

    ticket = _build_ticket(
        db=db,
        tienda_id=tienda_id,
        descripcion=descripcion,
        usuario_id=sistema_usuario_id,
        tipificacion_id=tipificacion_id,
        ia_clasificacion_aceptada=True,  # Dany ya clasificó
        ia_area=ia_area,
        ia_tipificacion_id=ia_tipificacion_id,
        ia_confianza=ia_confianza,
        ia_sugerencia_solucion=None,
        metadata_extra=meta,
        origen=OrigenTicket.DANY,
        dany_sesion_id=sesion_id,
    )
    db.commit()
    db.refresh(ticket)
    return ticket
