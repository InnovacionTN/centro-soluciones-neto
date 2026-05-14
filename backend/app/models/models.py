import enum
from datetime import datetime
from sqlalchemy import (
    Column,
    Integer,
    String,
    Boolean,
    DateTime,
    Text,
    ForeignKey,
    Enum,
    JSON,
    func,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship
from app.db.session import Base


# ─── Enums ────────────────────────────────────────────────────────────────────


class RolUsuario(str, enum.Enum):
    ADMIN = "ADMIN"
    ADMIN_AREA = "ADMIN_AREA"
    AGENTE = "AGENTE"
    TIENDA = "TIENDA"
    COORDINADOR = "COORDINADOR"


class TipoComentario(str, enum.Enum):
    PUBLICO = "PUBLICO"
    INTERNO = "INTERNO"


class EstatusTicket(str, enum.Enum):
    NUEVO = "NUEVO"
    ASIGNADO = "ASIGNADO"
    EN_PROCESO = "EN_PROCESO"
    ESPERANDO_TIENDA = "ESPERANDO_TIENDA"
    ESPERANDO_AGENTE = "ESPERANDO_AGENTE"
    RESUELTO = "RESUELTO"
    CERRADO = "CERRADO"
    RECHAZADO = "RECHAZADO"
    CANCELADO = "CANCELADO"
    # ── Mantenimiento (Sprint 2) ──
    PROGRAMADO_VISITA = "PROGRAMADO_VISITA"
    EN_VISITA = "EN_VISITA"
    ESPERANDO_PIEZA = "ESPERANDO_PIEZA"


# Estados que cuentan como "activos" para SLA y Round Robin
ESTADOS_ACTIVOS_SET = {
    EstatusTicket.NUEVO,
    EstatusTicket.ASIGNADO,
    EstatusTicket.EN_PROCESO,
    EstatusTicket.ESPERANDO_TIENDA,
    EstatusTicket.ESPERANDO_AGENTE,
    EstatusTicket.RECHAZADO,
    EstatusTicket.PROGRAMADO_VISITA,
    EstatusTicket.EN_VISITA,
    EstatusTicket.ESPERANDO_PIEZA,
}

# Estados exclusivos de Mantenimiento
ESTADOS_MANTENIMIENTO = {
    EstatusTicket.PROGRAMADO_VISITA,
    EstatusTicket.EN_VISITA,
    EstatusTicket.ESPERANDO_PIEZA,
}


class PrioridadTicket(str, enum.Enum):
    CRITICA = "CRITICA"
    ALTA = "ALTA"
    MEDIA = "MEDIA"
    BAJA = "BAJA"


class TipoTicket(str, enum.Enum):
    INCIDENCIA = "INCIDENCIA"
    REQUERIMIENTO = "REQUERIMIENTO"


class UrgenciaTipificacion(str, enum.Enum):
    CRITICA = "CRITICA"
    ALTA = "ALTA"
    MEDIA = "MEDIA"
    BAJA = "BAJA"


class AreaTecnica(str, enum.Enum):
    ABASTO = "ABASTO"
    SISTEMAS = "SISTEMAS"
    MANTENIMIENTO = "MANTENIMIENTO"
    FINANZAS = "FINANZAS"
    COMERCIAL = "COMERCIAL"
    RRHH = "RRHH"
    OPERACIONES = "OPERACIONES"


class OrigenTicket(str, enum.Enum):
    PORTAL = "PORTAL"
    DANY = "DANY"
    API = "API"


# ─── Catálogos Geográficos ────────────────────────────────────────────────────


class Compania(Base):
    __tablename__ = "cat_companias"

    id = Column(Integer, primary_key=True)
    nombre = Column(String(100), nullable=False, unique=True)
    activo = Column(Boolean, default=True)
    created_at = Column(DateTime, server_default=func.now())

    regiones = relationship("Region", back_populates="compania")


class Region(Base):
    __tablename__ = "cat_regiones"

    id = Column(Integer, primary_key=True)
    nombre = Column(String(100), nullable=False, unique=True)
    compania_id = Column(Integer, ForeignKey("cat_companias.id"), nullable=True)
    activo = Column(Boolean, default=True)
    created_at = Column(DateTime, server_default=func.now())

    compania = relationship("Compania", back_populates="regiones")
    zonas = relationship("Zona", back_populates="region")


class Zona(Base):
    __tablename__ = "cat_zonas"
    id = Column(Integer, primary_key=True)
    region_id = Column(Integer, ForeignKey("cat_regiones.id"), nullable=False)
    nombre = Column(String(100), nullable=False)
    activo = Column(Boolean, default=True)
    region = relationship("Region", back_populates="zonas")
    tiendas = relationship("Tienda", back_populates="zona")
    reglas_ruteo = relationship("ReglaRuteo", back_populates="zona")


# ─── Tiendas ──────────────────────────────────────────────────────────────────


class Tienda(Base):
    __tablename__ = "tiendas"
    id = Column(Integer, primary_key=True)
    nombre = Column(String(200), nullable=False)
    zona_id = Column(Integer, ForeignKey("cat_zonas.id"), nullable=False)
    correo_corporativo = Column(String(200), nullable=False, unique=True)
    centro_costos = Column(String(50))
    estrategia = Column(String(50), default="normal")
    empresa = Column(String(50))
    activo = Column(Boolean, default=True)
    created_at = Column(DateTime, server_default=func.now())
    zona = relationship("Zona", back_populates="tiendas")
    usuarios = relationship("Usuario", back_populates="tienda")
    tickets = relationship("Ticket", back_populates="tienda")


# ─── SLA Policies ─────────────────────────────────────────────────────────────


class SlaPolicy(Base):
    __tablename__ = "sla_policies"
    id = Column(Integer, primary_key=True)
    nombre = Column(String(100), nullable=False, unique=True)
    horas_limite = Column(Integer, nullable=False)
    tipo_calendario = Column(String(20), default="habil")
    activo = Column(Boolean, default=True)
    tipificaciones = relationship("Tipificacion", back_populates="sla_policy")


# ─── Grupos y Usuarios ────────────────────────────────────────────────────────


class Grupo(Base):
    __tablename__ = "cat_grupos"
    id = Column(Integer, primary_key=True)
    nombre = Column(String(150), nullable=False)
    area_tecnica = Column(Enum(AreaTecnica), nullable=False)
    region_id = Column(Integer, ForeignKey("cat_regiones.id"), nullable=True)
    slack_canal = Column(String(100))
    activo = Column(Boolean, default=True)
    compania_id = Column(Integer, ForeignKey("cat_companias.id"), nullable=True)

    compania = relationship("Compania", foreign_keys=[compania_id])
    usuarios = relationship("Usuario", back_populates="grupo")
    reglas_ruteo = relationship("ReglaRuteo", back_populates="grupo")
    tickets = relationship("Ticket", back_populates="grupo")
    region = relationship("Region", backref="grupos", foreign_keys=[region_id])


class Usuario(Base):
    __tablename__ = "usuarios"
    id = Column(Integer, primary_key=True)
    email = Column(String(200), nullable=False, unique=True)
    nombre = Column(String(200), nullable=False)
    hashed_password = Column(String(200), nullable=False)
    rol = Column(Enum(RolUsuario), nullable=False)
    grupo_id = Column(Integer, ForeignKey("cat_grupos.id"), nullable=True)
    tienda_id = Column(Integer, ForeignKey("tiendas.id"), nullable=True)
    zona_id = Column(Integer, ForeignKey("cat_zonas.id"), nullable=True)
    area_restriccion = Column(Enum(AreaTecnica), nullable=True)
    activo = Column(Boolean, default=True)
    disponible = Column(Boolean, default=True)
    last_login = Column(DateTime, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    grupo = relationship("Grupo", back_populates="usuarios")
    tienda = relationship("Tienda", back_populates="usuarios")
    zona_coordinada = relationship("Zona", foreign_keys=[zona_id])
    tickets_asignados = relationship(
        "Ticket", back_populates="agente", foreign_keys="Ticket.agente_id"
    )
    eventos = relationship("BitacoraEvento", back_populates="usuario")
    evidencias = relationship("Evidencia", back_populates="usuario")


# ─── Tipificaciones ───────────────────────────────────────────────────────────


class Tipificacion(Base):
    __tablename__ = "cat_tipificaciones"
    id = Column(Integer, primary_key=True)
    area_tecnica = Column(Enum(AreaTecnica), nullable=False)
    categoria = Column(String(100), nullable=False)
    subcategoria = Column(String(100), nullable=True)
    problema = Column(String(200), nullable=False)
    tipo = Column(Enum(TipoTicket), default=TipoTicket.INCIDENCIA)
    sla_policy_id = Column(Integer, ForeignKey("sla_policies.id"), nullable=True)
    sla_horas = Column(Integer, nullable=False, default=72)
    urgencia = Column(Enum(UrgenciaTipificacion), nullable=False)
    palabras_clave = Column(Text)
    requiere_foto = Column(Boolean, default=False)
    activo = Column(Boolean, default=True)
    sla_policy = relationship("SlaPolicy", back_populates="tipificaciones")
    reglas_ruteo = relationship("ReglaRuteo", back_populates="tipificacion")
    tickets = relationship(
        "Ticket", back_populates="tipificacion", foreign_keys="[Ticket.tipificacion_id]"
    )


# ─── Matriz de Ruteo ──────────────────────────────────────────────────────────


class ReglaRuteo(Base):
    __tablename__ = "matriz_ruteo"
    id = Column(Integer, primary_key=True)
    tipificacion_id = Column(Integer, ForeignKey("cat_tipificaciones.id"), nullable=False)
    zona_id = Column(Integer, ForeignKey("cat_zonas.id"), nullable=True)
    region_id = Column(Integer, ForeignKey("cat_regiones.id"), nullable=True)
    compania_id = Column(Integer, ForeignKey("cat_companias.id"), nullable=True)
    grupo_id = Column(Integer, ForeignKey("cat_grupos.id"), nullable=False)
    prioridad = Column(Integer, default=1)

    tipificacion = relationship("Tipificacion", back_populates="reglas_ruteo")
    zona = relationship("Zona", back_populates="reglas_ruteo")
    region = relationship("Region", foreign_keys=[region_id])
    compania = relationship("Compania", foreign_keys=[compania_id])
    grupo = relationship("Grupo", back_populates="reglas_ruteo")


# ─── Ticket ───────────────────────────────────────────────────────────────────


class Ticket(Base):
    __tablename__ = "tickets"

    id = Column(Integer, primary_key=True)
    folio = Column(String(20), nullable=False, unique=True)
    tienda_id = Column(Integer, ForeignKey("tiendas.id"), nullable=False)
    agente_id = Column(Integer, ForeignKey("usuarios.id"), nullable=True)
    tipificacion_id = Column(
        Integer, ForeignKey("cat_tipificaciones.id"), nullable=True
    )
    grupo_id = Column(Integer, ForeignKey("cat_grupos.id"), nullable=True)

    estatus = Column(Enum(EstatusTicket), default=EstatusTicket.NUEVO, nullable=False)
    prioridad = Column(Enum(PrioridadTicket), default=PrioridadTicket.MEDIA)
    tipo = Column(Enum(TipoTicket), default=TipoTicket.INCIDENCIA)
    descripcion = Column(Text, nullable=False)

    # Tipificación 3 niveles copiada al crear (inmutable)
    cat_nivel1 = Column(String(100))
    cat_nivel2 = Column(String(100))
    cat_nivel3 = Column(String(200))

    # Origen
    origen = Column(Enum(OrigenTicket), default=OrigenTicket.PORTAL)
    dany_sesion_id = Column(String(100), nullable=True)

    # IA
    ia_sugerencia_area = Column(String(50))
    ia_sugerencia_tipificacion_id = Column(
        Integer, ForeignKey("cat_tipificaciones.id"), nullable=True
    )
    ia_confianza = Column(Integer)
    ia_clasificacion_aceptada = Column(Boolean)

    # SLA
    sla_limite = Column(DateTime)
    sla_vencido = Column(Boolean, default=False)

    # Resolución
    solucion_propuesta = Column(Text)
    ia_sugerencia_solucion = Column(Text)

    # Timestamps
    fecha_apertura = Column(DateTime, server_default=func.now())
    fecha_primera_respuesta = Column(DateTime)
    fecha_resolucion = Column(DateTime)
    fecha_cierre = Column(DateTime)

    # ── Sprint 2: Mantenimiento ───────────────────────────────────────────────
    fecha_visita_programada = Column(DateTime, nullable=True)  # cuándo va el técnico
    pieza_requerida = Column(String(200), nullable=True)  # qué pieza se espera
    proveedor_pendiente = Column(String(200), nullable=True)  # proveedor de la pieza

    # CSAT
    csat_score = Column(Integer, nullable=True)
    csat_comentario = Column(Text, nullable=True)
    csat_fecha = Column(DateTime, nullable=True)
    csat_recordatorio_enviado = Column(Boolean, default=False)

    # Incidente masivo
    incidente_id = Column(Integer, ForeignKey("incidentes_masivos.id"), nullable=True)
    metadata_extra = Column(JSON, default=dict)

    __table_args__ = (UniqueConstraint("folio", name="uq_ticket_folio"),)

    tienda = relationship("Tienda", back_populates="tickets")
    agente = relationship(
        "Usuario", back_populates="tickets_asignados", foreign_keys=[agente_id]
    )
    tipificacion = relationship(
        "Tipificacion",
        back_populates="tickets",
        foreign_keys="[Ticket.tipificacion_id]",
    )
    grupo = relationship("Grupo", back_populates="tickets")
    incidente = relationship(
        "IncidenteMasivo", back_populates="tickets", foreign_keys=[incidente_id]
    )
    eventos = relationship(
        "BitacoraEvento", back_populates="ticket", order_by="BitacoraEvento.timestamp"
    )
    evidencias = relationship(
        "Evidencia", back_populates="ticket", order_by="Evidencia.timestamp"
    )


# ─── Bitácora ─────────────────────────────────────────────────────────────────


class BitacoraEvento(Base):
    __tablename__ = "bitacora_eventos"
    id = Column(Integer, primary_key=True)
    ticket_id = Column(Integer, ForeignKey("tickets.id"), nullable=False)
    usuario_id = Column(Integer, ForeignKey("usuarios.id"), nullable=False)
    accion = Column(String(60), nullable=False)
    estado_anterior = Column(String(30))
    estado_nuevo = Column(String(30))
    comentario = Column(Text)
    tipo_comentario = Column(String(10), default="PUBLICO")
    evidencia_id = Column(Integer, ForeignKey("ticket_evidencias.id"), nullable=True)
    timestamp = Column(DateTime, server_default=func.now())
    tiempo_en_estado_min = Column(Integer)
    ticket = relationship("Ticket", back_populates="eventos")
    usuario = relationship("Usuario", back_populates="eventos")
    evidencia = relationship("Evidencia", foreign_keys=[evidencia_id], lazy="joined")


# ─── Evidencias ───────────────────────────────────────────────────────────────


class Evidencia(Base):
    __tablename__ = "ticket_evidencias"
    id = Column(Integer, primary_key=True)
    ticket_id = Column(Integer, ForeignKey("tickets.id"), nullable=False)
    usuario_id = Column(Integer, ForeignKey("usuarios.id"), nullable=False)
    nombre_archivo = Column(String(255), nullable=False)
    nombre_guardado = Column(String(255), nullable=False)
    url = Column(String(500), nullable=False)
    tipo_mime = Column(String(100))
    tamanio_bytes = Column(Integer)
    timestamp = Column(DateTime, server_default=func.now())
    ticket = relationship("Ticket", back_populates="evidencias")
    usuario = relationship("Usuario", back_populates="evidencias")


# ─── Incidentes Masivos ───────────────────────────────────────────────────────


class IncidenteMasivo(Base):
    __tablename__ = "incidentes_masivos"
    id = Column(Integer, primary_key=True)
    titulo = Column(String(200), nullable=False)
    descripcion = Column(Text)
    tipificacion_id = Column(
        Integer, ForeignKey("cat_tipificaciones.id"), nullable=True
    )
    estado = Column(String(20), default="ACTIVO")
    creado_por = Column(Integer, ForeignKey("usuarios.id"), nullable=False)
    impacto_tiendas = Column(Integer, default=0)
    fecha_inicio = Column(DateTime, server_default=func.now())
    fecha_cierre = Column(DateTime, nullable=True)
    tipificacion = relationship("Tipificacion", foreign_keys=[tipificacion_id])
    creador = relationship("Usuario", foreign_keys=[creado_por])
    tickets = relationship("Ticket", back_populates="incidente")


# ─── Plantillas ───────────────────────────────────────────────────────────────


class PlantillaRespuesta(Base):
    __tablename__ = "plantillas_respuesta"
    id = Column(Integer, primary_key=True)
    titulo = Column(String(150), nullable=False)
    contenido = Column(Text, nullable=False)
    area_tecnica = Column(Enum(AreaTecnica), nullable=True)
    tipificacion_id = Column(
        Integer, ForeignKey("cat_tipificaciones.id"), nullable=True
    )
    creado_por = Column(Integer, ForeignKey("usuarios.id"), nullable=False)
    activo = Column(Boolean, default=True)
    created_at = Column(DateTime, server_default=func.now())
    tipificacion = relationship("Tipificacion", foreign_keys=[tipificacion_id])
    creador = relationship("Usuario", foreign_keys=[creado_por])
