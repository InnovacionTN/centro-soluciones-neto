from datetime import datetime
from typing import Optional, Literal
from pydantic import BaseModel, field_validator, model_validator
from app.models.models import (
    RolUsuario,
    EstatusTicket,
    PrioridadTicket,
    TipoTicket,
    AreaTecnica,
    UrgenciaTipificacion,
    OrigenTicket,
)

# ─── Auth ──────────────────────────────────────────────────────────────────────


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    rol: RolUsuario
    nombre: str
    tienda_id: Optional[int] = None
    tienda_nombre: Optional[str] = None


class LoginRequest(BaseModel):
    email: str
    password: str


# ─── Usuario ───────────────────────────────────────────────────────────────────


class UsuarioBase(BaseModel):
    email: str
    nombre: str
    rol: RolUsuario
    grupo_id: Optional[int] = None
    tienda_id: Optional[int] = None


class UsuarioOut(UsuarioBase):
    id: int
    activo: bool
    grupo_nombre: Optional[str] = None

    model_config = {"from_attributes": True}


# ─── SLA Policy ───────────────────────────────────────────────────────────────


class SlaPolicyOut(BaseModel):
    id: int
    nombre: str
    horas_limite: int
    tipo_calendario: str

    model_config = {"from_attributes": True}


# ─── Tipificación ─────────────────────────────────────────────────────────────


class TipificacionOut(BaseModel):
    id: int
    area_tecnica: AreaTecnica
    categoria: str
    subcategoria: Optional[str] = None
    problema: str
    tipo: TipoTicket
    sla_horas: int
    sla_policy: Optional[SlaPolicyOut] = None
    urgencia: UrgenciaTipificacion
    requiere_foto: bool = False

    model_config = {"from_attributes": True}


# ─── IA ────────────────────────────────────────────────────────────────────────


class ClasificacionRequest(BaseModel):
    descripcion: str
    tienda_id: Optional[int] = None  # opcional — n8n lo manda, frontend no siempre


class ClasificacionResponse(BaseModel):
    area_tecnica: AreaTecnica
    tipificacion_id: int
    tipificacion_nombre: str
    categoria: str
    subcategoria: Optional[str] = None
    confianza: int
    urgencia_sugerida: UrgenciaTipificacion
    razon: str
    palabras_detectadas: list[str]


# ─── Ticket ────────────────────────────────────────────────────────────────────


class TicketCreate(BaseModel):
    descripcion: str
    tipificacion_id: Optional[int] = None
    ia_clasificacion_aceptada: Optional[bool] = None
    metadata_extra: Optional[dict] = None


class TicketDanyCreate(BaseModel):
    """
    Payload que manda n8n para crear ticket desde Dany.
    Todos los campos numéricos se coercionan desde string
    porque n8n los serializa así por defecto.
    """

    tienda_id: int
    sesion_id: str
    descripcion: str
    ia_area: str
    pasos_intentados: Optional[str] = None
    tipificacion_id: Optional[int] = None
    ia_tipificacion_id: Optional[int] = None
    ia_confianza: Optional[int] = None  # int — coincide con ticket_service y TicketOut

    @field_validator("tienda_id", mode="before")
    @classmethod
    def coerce_tienda_id(cls, v: object) -> int:
        if v is None or v == "":
            raise ValueError("tienda_id es requerido")
        return int(float(str(v)))

    @field_validator("tipificacion_id", "ia_tipificacion_id", mode="before")
    @classmethod
    def coerce_optional_int(cls, v: object) -> Optional[int]:
        if v is None or v == "":
            return None
        return int(float(str(v)))

    @field_validator("ia_confianza", mode="before")
    @classmethod
    def coerce_confianza(cls, v: object) -> Optional[int]:
        """Acepta '22', '0.95', 22, 0.95 → siempre devuelve int 0-100."""
        if v is None or v == "":
            return None
        raw = float(str(v))
        # Si viene como proporción (0.0–1.0) la convierte a porcentaje
        if 0.0 < raw <= 1.0:
            return int(raw * 100)
        return int(raw)


class TicketUpdate(BaseModel):
    estatus: Optional[EstatusTicket] = None
    solucion_propuesta: Optional[str] = None
    agente_id: Optional[int] = None
    tipificacion_id: Optional[int] = None
    comentario: Optional[str] = None
    tipo_comentario: Optional[str] = "PUBLICO"
    evidencia_id: Optional[int] = None


class EvidenciaMinOut(BaseModel):
    id: int
    nombre_archivo: str
    url: str
    tipo_mime: Optional[str]
    tamanio_bytes: Optional[int]

    model_config = {"from_attributes": True}


class EventoOut(BaseModel):
    id: int
    accion: str
    estado_anterior: Optional[str]
    estado_nuevo: Optional[str]
    comentario: Optional[str]
    tipo_comentario: Optional[str] = "PUBLICO"
    evidencia: Optional[EvidenciaMinOut] = None
    timestamp: datetime
    usuario: Optional[UsuarioOut]

    model_config = {"from_attributes": True}


SlaStatusType = Literal["VERDE", "AMARILLO", "ROJO", "SIN_SLA"]


class TicketOut(BaseModel):
    id: int
    folio: str
    estatus: EstatusTicket
    prioridad: PrioridadTicket
    tipo: TipoTicket
    descripcion: str
    cat_nivel1: Optional[str] = None
    cat_nivel2: Optional[str] = None
    cat_nivel3: Optional[str] = None
    origen: Optional[OrigenTicket] = OrigenTicket.PORTAL
    dany_sesion_id: Optional[str] = None
    solucion_propuesta: Optional[str]
    ia_sugerencia_solucion: Optional[str]
    ia_confianza: Optional[int]
    ia_clasificacion_aceptada: Optional[bool]
    sla_limite: Optional[datetime]
    sla_vencido: bool
    sla_porcentaje: Optional[float] = None
    sla_status: SlaStatusType = "SIN_SLA"
    fecha_apertura: datetime
    fecha_primera_respuesta: Optional[datetime]
    fecha_cierre: Optional[datetime]
    fecha_visita_programada: Optional[datetime] = None
    pieza_requerida: Optional[str] = None
    proveedor_pendiente: Optional[str] = None
    tienda_id: int
    agente_id: Optional[int]
    tipificacion: Optional[TipificacionOut]
    eventos: list[EventoOut] = []
    csat_score: Optional[int] = None
    csat_comentario: Optional[str] = None
    incidente_id: Optional[int] = None

    model_config = {"from_attributes": True}


class CsatRequest(BaseModel):
    score: int
    comentario: Optional[str] = None


class TicketListItem(BaseModel):
    id: int
    folio: str
    estatus: EstatusTicket
    prioridad: PrioridadTicket
    descripcion: str
    cat_nivel1: Optional[str] = None
    cat_nivel2: Optional[str] = None
    cat_nivel3: Optional[str] = None
    origen: Optional[OrigenTicket] = OrigenTicket.PORTAL
    tienda_id: int
    tienda_nombre: Optional[str] = None
    agente_id: Optional[int]
    sla_limite: Optional[datetime]
    sla_vencido: bool
    sla_porcentaje: Optional[float] = None
    sla_status: SlaStatusType = "SIN_SLA"
    fecha_apertura: datetime
    tipificacion: Optional[TipificacionOut]
    fecha_cierre: Optional[datetime]
    fecha_visita_programada: Optional[datetime] = None
    pieza_requerida: Optional[str] = None
    incidente_id: Optional[int] = None

    model_config = {"from_attributes": True}


# ─── Dashboard ─────────────────────────────────────────────────────────────────


class DashboardMetrics(BaseModel):
    total_abiertos: int
    total_en_proceso: int
    total_confirmar_solucion: int
    total_cerrados_hoy: int
    total_vencidos: int
    total_rechazados: int = 0
    total_sin_sla: int = 0
    por_area: dict[str, int]
    por_prioridad: dict[str, int]
    por_sla_status: dict[str, int] = {}
    tiempo_promedio_resolucion_horas: Optional[float]
    tasa_ia_aceptada: Optional[float]


class CompaniaOut(BaseModel):
    id: int
    nombre: str
    activo: bool

    class Config:
        from_attributes = True


class GrupoOut(BaseModel):
    id: int
    nombre: str
    area_tecnica: str
    region_id: Optional[int] = None
    slack_canal: Optional[str] = None
    activo: bool = True
    compania_id: Optional[int] = None
    compania: Optional[CompaniaOut] = None

    model_config = {"from_attributes": True}


class EscalacionRequest(BaseModel):
    grupo_destino_id: int
    motivo: str


class EvidenciaOut(BaseModel):
    id: int
    ticket_id: int
    nombre_archivo: str
    url: str
    tipo_mime: Optional[str]
    tamanio_bytes: Optional[int]
    timestamp: datetime
    usuario: Optional[UsuarioOut] = None

    model_config = {"from_attributes": True}


# ─── Admin: Usuarios ──────────────────────────────────────────────────────────


class UsuarioCreate(BaseModel):
    email: str
    nombre: str
    password: str
    rol: str
    grupo_id: Optional[int] = None
    tienda_id: Optional[int] = None
    zona_id: Optional[int] = None
    area_restriccion: Optional[str] = None


class UsuarioUpdate(BaseModel):
    nombre: Optional[str] = None
    email: Optional[str] = None
    password: Optional[str] = None
    rol: Optional[str] = None
    grupo_id: Optional[int] = None
    tienda_id: Optional[int] = None
    zona_id: Optional[int] = None
    activo: Optional[bool] = None
    area_restriccion: Optional[str] = None


class UsuarioAdminOut(BaseModel):
    id: int
    email: str
    nombre: str
    rol: str
    activo: bool
    disponible: bool = True
    grupo_id: Optional[int]
    tienda_id: Optional[int]
    zona_id: Optional[int] = None
    area_restriccion: Optional[str] = None
    created_at: Optional[datetime]
    last_login: Optional[datetime]
    grupo: Optional[GrupoOut] = None

    model_config = {"from_attributes": True}


# ─── Admin: Tipificaciones ────────────────────────────────────────────────────


class TipificacionCreate(BaseModel):
    area_tecnica: str
    categoria: str
    subcategoria: Optional[str] = None
    problema: str
    sla_horas: int
    sla_policy_id: Optional[int] = None
    urgencia: str
    palabras_clave: Optional[str] = None
    requiere_foto: bool = False


class TipificacionUpdate(BaseModel):
    area_tecnica: Optional[str] = None
    categoria: Optional[str] = None
    subcategoria: Optional[str] = None
    problema: Optional[str] = None
    sla_horas: Optional[int] = None
    sla_policy_id: Optional[int] = None
    urgencia: Optional[str] = None
    palabras_clave: Optional[str] = None
    requiere_foto: Optional[bool] = None
    activo: Optional[bool] = None


class TipificacionAdminOut(BaseModel):
    id: int
    area_tecnica: str
    categoria: str
    subcategoria: Optional[str] = None
    problema: str
    sla_horas: int
    sla_policy: Optional[SlaPolicyOut] = None
    urgencia: str
    palabras_clave: Optional[str]
    requiere_foto: bool
    activo: bool

    model_config = {"from_attributes": True}


# ─── Admin: Matriz de Ruteo ───────────────────────────────────────────────────


class ReglaRuteoCreate(BaseModel):
    tipificacion_id: int
    grupo_id: int
    zona_id: Optional[int] = None
    region_id: Optional[int] = None
    compania_id: Optional[int] = None
    prioridad: int = 1


class ReglaRuteoOut(BaseModel):
    id: int
    tipificacion_id: int
    grupo_id: int
    zona_id: Optional[int]
    region_id: Optional[int] = None
    compania_id: Optional[int] = None
    prioridad: int
    tipificacion: Optional[TipificacionAdminOut] = None
    grupo: Optional[GrupoOut] = None

    model_config = {"from_attributes": True}


# ─── Admin: Grupos ────────────────────────────────────────────────────────────


class GrupoCreate(BaseModel):
    nombre: str
    area_tecnica: str
    region_id: Optional[int] = None
    slack_canal: Optional[str] = None
    compania_id: Optional[int] = None


class GrupoUpdate(BaseModel):
    nombre: Optional[str] = None
    area_tecnica: Optional[str] = None
    region_id: Optional[int] = None
    slack_canal: Optional[str] = None
    activo: Optional[bool] = None
    compania_id: Optional[int] = None


# ─── Admin: Regiones ──────────────────────────────────────────────────────────


class RegionOut(BaseModel):
    id: int
    nombre: str
    activo: bool

    model_config = {"from_attributes": True}


class RegionCreate(BaseModel):
    nombre: str


class RegionUpdate(BaseModel):
    nombre: Optional[str] = None
    activo: Optional[bool] = None


# ─── Admin: Zonas ─────────────────────────────────────────────────────────────


class ZonaOut(BaseModel):
    id: int
    nombre: str
    region_id: int
    activo: bool

    model_config = {"from_attributes": True}


class ZonaCreate(BaseModel):
    nombre: str
    region_id: int


class ZonaUpdate(BaseModel):
    nombre: Optional[str] = None
    activo: Optional[bool] = None


# ─── Admin: Tiendas ───────────────────────────────────────────────────────────


class TiendaCreate(BaseModel):
    id: int
    nombre: str
    zona_id: int
    correo_corporativo: str
    centro_costos: Optional[str] = None
    estrategia: Optional[str] = "normal"
    empresa: Optional[str] = None


class TiendaOut(BaseModel):
    id: int
    nombre: str
    zona_id: int
    correo_corporativo: str
    centro_costos: Optional[str]
    estrategia: Optional[str] = "normal"
    empresa: Optional[str] = None
    activo: bool

    model_config = {"from_attributes": True}


# ─── Plantillas ───────────────────────────────────────────────────────────────


class PlantillaCreate(BaseModel):
    titulo: str
    contenido: str
    area_tecnica: Optional[str] = None
    tipificacion_id: Optional[int] = None


class PlantillaOut(BaseModel):
    id: int
    titulo: str
    contenido: str
    area_tecnica: Optional[str]
    tipificacion_id: Optional[int] = None
    activo: bool

    model_config = {"from_attributes": True}


# ─── KPIs / Helpers ───────────────────────────────────────────────────────────


class TicketSimilarOut(BaseModel):
    id: int
    folio: str
    descripcion: str
    solucion_propuesta: Optional[str]
    csat_score: Optional[int]
    fecha_cierre: Optional[datetime]
    tiempo_resolucion_horas: Optional[float]

    model_config = {"from_attributes": True}


class KpiAgente(BaseModel):
    agente_id: int
    nombre: str
    email: str
    grupo: Optional[str]
    tickets_cerrados: int
    tickets_activos: int
    tiempo_promedio_horas: Optional[float]
    sla_cumplido_pct: Optional[float]
    csat_promedio: Optional[float]
    total_escalados: int


class TorreAlertaItem(BaseModel):
    ticket_id: int
    folio: str
    tienda: str
    agente: Optional[str]
    tipificacion: Optional[str]
    estatus: str
    prioridad: str
    sla_limite: Optional[datetime]
    sla_vencido: bool
    horas_abierto: float
    alerta: str


class IncidenteMasivoCreate(BaseModel):
    titulo: str
    descripcion: Optional[str] = None
    tipificacion_id: Optional[int] = None
    ticket_ids: Optional[list[int]] = []


class IncidenteMasivoOut(BaseModel):
    id: int
    titulo: str
    descripcion: Optional[str]
    tipificacion_id: Optional[int]
    estado: str
    creado_por: int
    impacto_tiendas: int
    fecha_inicio: datetime
    fecha_cierre: Optional[datetime]

    model_config = {"from_attributes": True}


class IncidenteMasivoUpdate(BaseModel):
    titulo: Optional[str] = None
    descripcion: Optional[str] = None
    estado: Optional[str] = None


class AgentDisponibilidadUpdate(BaseModel):
    disponible: bool


class TicketIntakeRequest(BaseModel):
    store_name: str
    summary: str
    reason: Optional[str] = None
    priority: Optional[str] = "Media"
    status: Optional[str] = "abierto"
    rating: Optional[int] = None
    area: Optional[str] = None
    sentiment: Optional[str] = None
    javier_folio: Optional[str] = None
    customer_phone: Optional[str] = None


class TicketIntakeResponse(BaseModel):
    folio: str
    ticket_id: int
    estatus: str
    tienda_encontrada: str
    csat_registrado: bool


# ─── Sprint 1: Dany ───────────────────────────────────────────────────────────


class TicketDanyOut(BaseModel):
    ticket_id: int
    folio: str
    estatus: str
    sla_limite: Optional[datetime]
    sla_status: SlaStatusType
    grupo_nombre: Optional[str]
    agente_nombre: Optional[str]
    mensaje: str = "Ticket creado correctamente desde Dany"


class SlaPolicyList(BaseModel):
    policies: list[SlaPolicyOut]


# ─── Sprint 2: Mantenimiento + Coordinador ────────────────────────────────────


class VisitaProgRequest(BaseModel):
    fecha_visita: datetime
    comentario: Optional[str] = None
    pieza_requerida: Optional[str] = None


class EsperandoPiezaRequest(BaseModel):
    pieza_requerida: str
    proveedor: Optional[str] = None
    comentario: Optional[str] = None


class CierresMasivosRequest(BaseModel):
    horas_minimo: int = 72
    ticket_ids: Optional[list[int]] = None


class CierresMasivosOut(BaseModel):
    cerrados: int
    folios: list[str]


class TicketCoordinadorItem(BaseModel):
    id: int
    folio: str
    estatus: str
    prioridad: str
    descripcion: str
    cat_nivel1: Optional[str] = None
    cat_nivel2: Optional[str] = None
    tienda_id: int
    tienda_nombre: Optional[str] = None
    agente_nombre: Optional[str] = None
    fecha_apertura: datetime
    fecha_visita_programada: Optional[datetime] = None
    pieza_requerida: Optional[str] = None
    sla_status: str = "SIN_SLA"
    sla_porcentaje: Optional[float] = None

    model_config = {"from_attributes": True}


# ─── Sprint 3: Sesión Dany ────────────────────────────────────────────────────


class DanySesionInicioRequest(BaseModel):
    sesion_id: str
    tienda_id: int
    canal: str = "portal"  # portal | slack | whatsapp

    @field_validator("tienda_id", mode="before")
    @classmethod
    def coerce_tienda_id(cls, v: object) -> int:
        if v is None or v == "":
            raise ValueError("tienda_id es requerido")
        return int(float(str(v)))


class DanySesionInicioOut(BaseModel):
    sesion_id: str
    tienda_id: int
    mensaje: str = "Sesión registrada"


class DanySesionCierreRequest(BaseModel):
    sesion_id: str
    resuelto_sin_ticket: bool
    mensajes_count: int = 0
    tipificacion_detectada: Optional[str] = None
    motivo_escalacion: Optional[str] = None

    @field_validator("resuelto_sin_ticket", mode="before")
    @classmethod
    def coerce_bool(cls, v: object) -> bool:
        """n8n puede mandar 'true'/'false' como string."""
        if isinstance(v, str):
            return v.lower() in ("true", "1", "yes")
        return bool(v)

    @field_validator("mensajes_count", mode="before")
    @classmethod
    def coerce_mensajes(cls, v: object) -> int:
        if v is None or v == "":
            return 0
        return int(float(str(v)))


class DanySesionCierreOut(BaseModel):
    sesion_id: str
    deflexion: bool
    mensaje: str


# ─── Sprint 4: KPIs ───────────────────────────────────────────────────────────


class KpiEjecutivo(BaseModel):
    periodo_desde: datetime
    periodo_hasta: datetime
    total_tickets: int
    tickets_abiertos: int
    tickets_cerrados: int
    tickets_por_dia_promedio: float
    sla_cumplido_pct: float
    tickets_sin_sla: int
    tiempo_resolucion_p50_horas: Optional[float]
    tiempo_resolucion_p90_horas: Optional[float]
    csat_respuestas: int
    csat_tasa_respuesta_pct: float
    csat_satisfaccion_pct: float
    tickets_origen_dany: int
    tickets_origen_portal: int
    tasa_deflexion_dany_pct: float
    total_reaperturas: int
    tasa_reapertura_pct: float


class KpiTendencia(BaseModel):
    mes: str  # "2026-01"
    total_tickets: int
    sla_cumplido_pct: Optional[float]
    tiempo_p50_horas: Optional[float]
    csat_pct: Optional[float]
    tickets_dany: int


class KpiPorArea(BaseModel):
    area: str
    total_tickets: int
    pct_del_total: float
    sla_cumplido_pct: Optional[float]
    tiempo_p50_horas: Optional[float]
    tiempo_p90_horas: Optional[float]
    csat_pct: Optional[float]
    tickets_vencidos: int
    tickets_sin_sla: int
    reaperturas: int


class KpiPorGrupo(BaseModel):
    grupo_id: int
    grupo_nombre: str
    area: str
    total_tickets: int
    tickets_activos: int
    tickets_cerrados: int
    sla_cumplido_pct: Optional[float]
    tiempo_p50_horas: Optional[float]
    csat_pct: Optional[float]
    agentes_activos: int
    tickets_vencidos: int


class KpiAgenteExtendido(BaseModel):
    agente_id: int
    nombre: str
    email: str
    grupo: Optional[str]
    area: Optional[str]
    tickets_cerrados: int
    tickets_activos: int
    tiempo_promedio_horas: Optional[float]
    tiempo_primera_respuesta_horas: Optional[float]
    sla_cumplido_pct: Optional[float]
    csat_promedio: Optional[float]
    csat_respuestas: int
    total_escalados: int
    tasa_reapertura_pct: Optional[float]
    disponible: bool


class ExportRequest(BaseModel):
    desde: Optional[str] = None  # YYYY-MM-DD
    hasta: Optional[str] = None
    area: Optional[str] = None
    grupo_id: Optional[int] = None
    estatus: Optional[str] = None
    incluir_bitacora: bool = False


class CsatReminderResult(BaseModel):
    procesados: int
    enviados: int
    folios: list[str]


# ─── KPIs Dany ────────────────────────────────────────────────────────────────


class KpiDany(BaseModel):
    periodo_desde: datetime
    periodo_hasta: datetime
    sesiones_totales: int
    sesiones_resueltas: int
    sesiones_escaladas: int
    tasa_deflexion_pct: float
    tickets_creados: int
    tiempo_primera_respuesta_agente_horas: Optional[float]
    por_canal: dict[str, int]
    top_tipificaciones: list[dict]
