from datetime import datetime
from typing import Optional
from pydantic import BaseModel, EmailStr
from app.models.models import (
    RolUsuario,
    EstatusTicket,
    PrioridadTicket,
    TipoTicket,
    AreaTecnica,
    UrgenciaTipificacion,
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
    grupo_nombre: Optional[str] = None  # nombre del grupo (se resuelve en el endpoint)

    class Config:
        from_attributes = True


# ─── Tipificación ──────────────────────────────────────────────────────────────


class TipificacionOut(BaseModel):
    id: int
    area_tecnica: AreaTecnica
    categoria: str
    problema: str
    tipo: TipoTicket
    sla_horas: int
    urgencia: UrgenciaTipificacion

    class Config:
        from_attributes = True


# ─── IA ────────────────────────────────────────────────────────────────────────


class ClasificacionRequest(BaseModel):
    descripcion: str
    tienda_id: int


class ClasificacionResponse(BaseModel):
    area_tecnica: AreaTecnica
    tipificacion_id: int
    tipificacion_nombre: str
    categoria: str
    confianza: int  # 0-100
    urgencia_sugerida: UrgenciaTipificacion
    razon: str  # explicación breve de por qué eligió esa tipificación
    palabras_detectadas: list[str]


# ─── Ticket ────────────────────────────────────────────────────────────────────


class TicketCreate(BaseModel):
    descripcion: str
    tipificacion_id: Optional[int] = None  # si la tienda la confirma
    ia_clasificacion_aceptada: Optional[bool] = None
    metadata_extra: Optional[dict] = None


class TicketUpdate(BaseModel):
    estatus: Optional[EstatusTicket] = None
    solucion_propuesta: Optional[str] = None
    agente_id: Optional[int] = None
    tipificacion_id: Optional[int] = None  # solo ADMIN puede cambiarlo
    comentario: Optional[str] = None
    tipo_comentario: Optional[str] = "PUBLICO"  # PUBLICO | INTERNO
    evidencia_id: Optional[int] = None  # adjunto vinculado al comentario


class EvidenciaMinOut(BaseModel):
    """Versión mínima de Evidencia para incrustar en el historial."""

    id: int
    nombre_archivo: str
    url: str
    tipo_mime: Optional[str]
    tamanio_bytes: Optional[int]

    class Config:
        from_attributes = True


class EventoOut(BaseModel):
    id: int
    accion: str
    estado_anterior: Optional[str]
    estado_nuevo: Optional[str]
    comentario: Optional[str]
    tipo_comentario: Optional[str] = "PUBLICO"
    evidencia: Optional[EvidenciaMinOut] = None  # adjunto vinculado al evento
    timestamp: datetime
    usuario: Optional[UsuarioOut]

    class Config:
        from_attributes = True


class TicketOut(BaseModel):
    id: int
    folio: str
    estatus: EstatusTicket
    prioridad: PrioridadTicket
    tipo: TipoTicket
    descripcion: str
    solucion_propuesta: Optional[str]
    ia_sugerencia_solucion: Optional[str]
    ia_confianza: Optional[int]
    ia_clasificacion_aceptada: Optional[bool]
    sla_limite: Optional[datetime]
    sla_vencido: bool
    fecha_apertura: datetime
    fecha_primera_respuesta: Optional[datetime]
    fecha_cierre: Optional[datetime]
    tienda_id: int
    agente_id: Optional[int]
    tipificacion: Optional[TipificacionOut]
    eventos: list[EventoOut] = []
    csat_score: Optional[int] = None
    csat_comentario: Optional[str] = None

    class Config:
        from_attributes = True


class CsatRequest(BaseModel):
    score: int          # 1-5
    comentario: Optional[str] = None


class TicketListItem(BaseModel):
    id: int
    folio: str
    estatus: EstatusTicket
    prioridad: PrioridadTicket
    descripcion: str
    tienda_id: int
    agente_id: Optional[int]
    sla_limite: Optional[datetime]
    sla_vencido: bool
    fecha_apertura: datetime
    tipificacion: Optional[TipificacionOut]

    class Config:
        from_attributes = True


# ─── Dashboard ─────────────────────────────────────────────────────────────────


class DashboardMetrics(BaseModel):
    total_abiertos: int
    total_en_proceso: int
    total_confirmar_solucion: int
    total_cerrados_hoy: int
    total_vencidos: int
    por_area: dict[str, int]
    por_prioridad: dict[str, int]
    tiempo_promedio_resolucion_horas: Optional[float]
    tasa_ia_aceptada: Optional[float]  # % de clasificaciones IA aceptadas sin cambio


class GrupoOut(BaseModel):
    id: int
    nombre: str
    area_tecnica: str

    class Config:
        from_attributes = True


class EscalacionRequest(BaseModel):
    grupo_destino_id: int
    motivo: str  # Obligatorio — mínimo 10 chars


class EvidenciaOut(BaseModel):
    id: int
    ticket_id: int
    nombre_archivo: str
    url: str
    tipo_mime: Optional[str]
    tamanio_bytes: Optional[int]
    timestamp: datetime
    usuario: Optional[UsuarioOut] = None

    class Config:
        from_attributes = True


# ─── Admin: Usuarios ──────────────────────────────────────────────────────────


class UsuarioCreate(BaseModel):
    email: str
    nombre: str
    password: str
    rol: str  # ADMIN | AGENTE | TIENDA
    grupo_id: Optional[int] = None  # solo para AGENTE
    tienda_id: Optional[int] = None  # solo para TIENDA


class UsuarioUpdate(BaseModel):
    nombre: Optional[str] = None
    email: Optional[str] = None
    password: Optional[str] = None
    rol: Optional[str] = None
    grupo_id: Optional[int] = None
    tienda_id: Optional[int] = None
    activo: Optional[bool] = None


class UsuarioAdminOut(BaseModel):
    id: int
    email: str
    nombre: str
    rol: str
    activo: bool
    grupo_id: Optional[int]
    tienda_id: Optional[int]
    created_at: Optional[datetime]
    last_login: Optional[datetime]
    grupo: Optional[GrupoOut] = None

    class Config:
        from_attributes = True


# ─── Admin: Tipificaciones ────────────────────────────────────────────────────


class TipificacionCreate(BaseModel):
    area_tecnica: str
    categoria: str
    problema: str
    sla_horas: int
    urgencia: str
    palabras_clave: Optional[str] = None
    requiere_foto: bool = False


class TipificacionUpdate(BaseModel):
    area_tecnica: Optional[str] = None
    categoria: Optional[str] = None
    problema: Optional[str] = None
    sla_horas: Optional[int] = None
    urgencia: Optional[str] = None
    palabras_clave: Optional[str] = None
    requiere_foto: Optional[bool] = None
    activo: Optional[bool] = None


class TipificacionAdminOut(BaseModel):
    id: int
    area_tecnica: str
    categoria: str
    problema: str
    sla_horas: int
    urgencia: str
    palabras_clave: Optional[str]
    requiere_foto: bool
    activo: bool

    class Config:
        from_attributes = True


# ─── Admin: Matriz de Ruteo ───────────────────────────────────────────────────


class ReglaRuteoCreate(BaseModel):
    tipificacion_id: int
    grupo_id: int
    zona_id: Optional[int] = None  # None = aplica a todas las zonas
    prioridad: int = 1


class ReglaRuteoOut(BaseModel):
    id: int
    tipificacion_id: int
    grupo_id: int
    zona_id: Optional[int]
    prioridad: int
    tipificacion: Optional[TipificacionAdminOut] = None
    grupo: Optional[GrupoOut] = None

    class Config:
        from_attributes = True


# ─── Admin: Grupos ────────────────────────────────────────────────────────────


class GrupoCreate(BaseModel):
    nombre: str
    area_tecnica: str
    slack_canal: Optional[str] = None


class GrupoUpdate(BaseModel):
    nombre: Optional[str] = None
    area_tecnica: Optional[str] = None
    slack_canal: Optional[str] = None
    activo: Optional[bool] = None


# ─── Admin: Tiendas ───────────────────────────────────────────────────────────


class TiendaCreate(BaseModel):
    id: int  # Número económico
    nombre: str
    zona_id: int
    correo_corporativo: str
    centro_costos: Optional[str] = None


class TiendaOut(BaseModel):
    id: int
    nombre: str
    zona_id: int
    correo_corporativo: str
    centro_costos: Optional[str]
    activo: bool

    class Config:
        from_attributes = True


# ─── Plantillas de respuesta ──────────────────────────────────────────────────


class PlantillaCreate(BaseModel):
    titulo: str
    contenido: str
    area_tecnica: Optional[str] = None  # None = aplica a todas las áreas


class PlantillaOut(BaseModel):
    id: int
    titulo: str
    contenido: str
    area_tecnica: Optional[str]
    activo: bool

    class Config:
        from_attributes = True


# ─── KPIs por agente ──────────────────────────────────────────────────────────


class KpiAgente(BaseModel):
    agente_id: int
    nombre: str
    email: str
    grupo: Optional[str]
    tickets_cerrados: int
    tickets_activos: int
    tiempo_promedio_horas: Optional[float]
    sla_cumplido_pct: Optional[float]  # % tickets resueltos dentro del SLA
    csat_promedio: Optional[float]  # promedio de calificaciones 1-5
    total_escalados: int  # tickets que escaló a otro grupo
