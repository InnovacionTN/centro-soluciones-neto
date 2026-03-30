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
    AGENTE = "AGENTE"
    TIENDA = "TIENDA"


class TipoComentario(str, enum.Enum):
    PUBLICO = "PUBLICO"  # Visible para tienda y agente
    INTERNO = "INTERNO"  # Solo visible para agentes y admin


class EstatusTicket(str, enum.Enum):
    NUEVO = "NUEVO"  # Ticket creado, sin agente
    ASIGNADO = "ASIGNADO"  # Agente asignado por Round Robin, pendiente de tomar
    EN_PROCESO = "EN_PROCESO"  # Agente tomó el ticket, trabajando
    ESPERANDO_TIENDA = (
        "ESPERANDO_TIENDA"  # Agente envió solución, tienda debe confirmar/responder
    )
    ESPERANDO_AGENTE = (
        "ESPERANDO_AGENTE"  # Tienda respondió sin confirmar, agente debe continuar
    )
    RESUELTO = "RESUELTO"  # Tienda confirmó solución final
    CERRADO = "CERRADO"  # Estado final — sin más acciones
    RECHAZADO = "RECHAZADO"  # Tienda rechazó la solución
    CANCELADO = "CANCELADO"  # Admin canceló el ticket


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


# ─── Catálogos Geográficos ─────────────────────────────────────────────────────


class Region(Base):
    __tablename__ = "cat_regiones"

    id = Column(Integer, primary_key=True)
    nombre = Column(String(100), nullable=False, unique=True)
    activo = Column(Boolean, default=True)
    created_at = Column(DateTime, server_default=func.now())

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


# ─── Tiendas ───────────────────────────────────────────────────────────────────


class Tienda(Base):
    __tablename__ = "tiendas"

    id = Column(Integer, primary_key=True)  # Número económico
    nombre = Column(String(200), nullable=False)
    zona_id = Column(Integer, ForeignKey("cat_zonas.id"), nullable=False)
    correo_corporativo = Column(String(200), nullable=False, unique=True)
    centro_costos = Column(String(50))
    activo = Column(Boolean, default=True)
    created_at = Column(DateTime, server_default=func.now())

    zona = relationship("Zona", back_populates="tiendas")
    usuarios = relationship("Usuario", back_populates="tienda")
    tickets = relationship("Ticket", back_populates="tienda")


# ─── Grupos y Usuarios ─────────────────────────────────────────────────────────


class Grupo(Base):
    __tablename__ = "cat_grupos"

    id = Column(Integer, primary_key=True)
    nombre = Column(String(150), nullable=False)
    area_tecnica = Column(Enum(AreaTecnica), nullable=False)
    slack_canal = Column(String(100))
    activo = Column(Boolean, default=True)

    usuarios = relationship("Usuario", back_populates="grupo")
    reglas_ruteo = relationship("ReglaRuteo", back_populates="grupo")
    tickets = relationship("Ticket", back_populates="grupo")


class Usuario(Base):
    __tablename__ = "usuarios"

    id = Column(Integer, primary_key=True)
    email = Column(String(200), nullable=False, unique=True)
    nombre = Column(String(200), nullable=False)
    hashed_password = Column(String(200), nullable=False)
    rol = Column(Enum(RolUsuario), nullable=False)
    grupo_id = Column(Integer, ForeignKey("cat_grupos.id"), nullable=True)
    tienda_id = Column(Integer, ForeignKey("tiendas.id"), nullable=True)
    activo = Column(Boolean, default=True)
    disponible = Column(Boolean, default=True)  # agente disponible para recibir tickets
    last_login = Column(DateTime, nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    grupo = relationship("Grupo", back_populates="usuarios")
    tienda = relationship("Tienda", back_populates="usuarios")
    tickets_asignados = relationship(
        "Ticket", back_populates="agente", foreign_keys="Ticket.agente_id"
    )
    eventos = relationship("BitacoraEvento", back_populates="usuario")
    evidencias = relationship("Evidencia", back_populates="usuario")


# ─── Tipificaciones ────────────────────────────────────────────────────────────


class Tipificacion(Base):
    __tablename__ = "cat_tipificaciones"

    id = Column(Integer, primary_key=True)
    area_tecnica = Column(Enum(AreaTecnica), nullable=False)
    categoria = Column(String(100), nullable=False)
    problema = Column(String(200), nullable=False)
    tipo = Column(Enum(TipoTicket), default=TipoTicket.INCIDENCIA)
    sla_horas = Column(Integer, nullable=False)
    urgencia = Column(Enum(UrgenciaTipificacion), nullable=False)
    palabras_clave = Column(Text)  # para fallback sin IA
    requiere_foto = Column(Boolean, default=False)
    activo = Column(Boolean, default=True)

    reglas_ruteo = relationship("ReglaRuteo", back_populates="tipificacion")
    tickets = relationship(
        "Ticket", back_populates="tipificacion", foreign_keys="[Ticket.tipificacion_id]"
    )


# ─── Matriz de Ruteo ──────────────────────────────────────────────────────────


class ReglaRuteo(Base):
    __tablename__ = "matriz_ruteo"

    id = Column(Integer, primary_key=True)
    tipificacion_id = Column(
        Integer, ForeignKey("cat_tipificaciones.id"), nullable=False
    )
    zona_id = Column(
        Integer, ForeignKey("cat_zonas.id"), nullable=True
    )  # NULL = todas las zonas
    grupo_id = Column(Integer, ForeignKey("cat_grupos.id"), nullable=False)
    prioridad = Column(Integer, default=1)  # desempate si hay varias reglas

    tipificacion = relationship("Tipificacion", back_populates="reglas_ruteo")
    zona = relationship("Zona", back_populates="reglas_ruteo")
    grupo = relationship("Grupo", back_populates="reglas_ruteo")


# ─── Ticket (entidad central) ─────────────────────────────────────────────────


class Ticket(Base):
    __tablename__ = "tickets"

    id = Column(Integer, primary_key=True)
    folio = Column(String(20), nullable=False, unique=True)  # TKT-2024-00001
    tienda_id = Column(Integer, ForeignKey("tiendas.id"), nullable=False)
    agente_id = Column(Integer, ForeignKey("usuarios.id"), nullable=True)
    tipificacion_id = Column(
        Integer, ForeignKey("cat_tipificaciones.id"), nullable=True
    )
    grupo_id = Column(Integer, ForeignKey("cat_grupos.id"), nullable=True)

    estatus = Column(
        Enum(EstatusTicket), default=EstatusTicket.NUEVO, nullable=False
    )  # Ver EstatusTicket
    prioridad = Column(Enum(PrioridadTicket), default=PrioridadTicket.MEDIA)
    tipo = Column(Enum(TipoTicket), default=TipoTicket.INCIDENCIA)

    # Descripción en texto libre (el usuario escribe esto)
    descripcion = Column(Text, nullable=False)

    # Clasificación IA
    ia_sugerencia_area = Column(String(50))  # área sugerida por IA
    ia_sugerencia_tipificacion_id = Column(
        Integer, ForeignKey("cat_tipificaciones.id"), nullable=True
    )
    ia_confianza = Column(Integer)  # 0-100
    ia_clasificacion_aceptada = Column(Boolean)  # la tienda aceptó o ajustó

    # SLA
    sla_limite = Column(DateTime)
    sla_vencido = Column(Boolean, default=False)

    # Resolución
    solucion_propuesta = Column(Text)  # el agente escribe aquí
    ia_sugerencia_solucion = Column(Text)  # sugerencia de la IA al agente

    # Timestamps
    fecha_apertura = Column(DateTime, server_default=func.now())
    fecha_primera_respuesta = Column(DateTime)
    fecha_resolucion = Column(DateTime)  # cuando pasó a RESUELTO (para auto-cierre 72h)
    fecha_cierre = Column(DateTime)

    # Metadata extra (respuestas a preguntas adicionales si aplica)
    metadata_extra = Column(JSON, default=dict)

    # CSAT — calificación del servicio por la tienda (1-5)
    csat_score = Column(Integer, nullable=True)
    csat_comentario = Column(Text, nullable=True)
    csat_fecha = Column(DateTime, nullable=True)

    # Incidente masivo vinculado (nullable)
    incidente_id = Column(Integer, ForeignKey("incidentes_masivos.id"), nullable=True)

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
    incidente = relationship("IncidenteMasivo", back_populates="tickets", foreign_keys=[incidente_id])
    eventos = relationship(
        "BitacoraEvento", back_populates="ticket", order_by="BitacoraEvento.timestamp"
    )
    evidencias = relationship(
        "Evidencia", back_populates="ticket", order_by="Evidencia.timestamp"
    )


# ─── Bitácora de Eventos ──────────────────────────────────────────────────────


class BitacoraEvento(Base):
    __tablename__ = "bitacora_eventos"

    id = Column(Integer, primary_key=True)
    ticket_id = Column(Integer, ForeignKey("tickets.id"), nullable=False)
    usuario_id = Column(Integer, ForeignKey("usuarios.id"), nullable=False)
    accion = Column(
        String(60), nullable=False
    )  # CREACION, ASIGNACION, CAMBIO_ESTADO...
    estado_anterior = Column(String(30))
    estado_nuevo = Column(String(30))
    comentario = Column(Text)
    tipo_comentario = Column(String(10), default="PUBLICO")  # PUBLICO | INTERNO
    evidencia_id = Column(
        Integer, ForeignKey("ticket_evidencias.id"), nullable=True
    )  # adjunto vinculado
    timestamp = Column(DateTime, server_default=func.now())
    tiempo_en_estado_min = Column(Integer)  # cuánto estuvo en el estado anterior

    ticket = relationship("Ticket", back_populates="eventos")
    usuario = relationship("Usuario", back_populates="eventos")
    evidencia = relationship("Evidencia", foreign_keys=[evidencia_id], lazy="joined")


# ─── Evidencias multimedia ────────────────────────────────────────────────────


class Evidencia(Base):
    __tablename__ = "ticket_evidencias"

    id = Column(Integer, primary_key=True)
    ticket_id = Column(Integer, ForeignKey("tickets.id"), nullable=False)
    usuario_id = Column(Integer, ForeignKey("usuarios.id"), nullable=False)
    nombre_archivo = Column(String(255), nullable=False)  # nombre original
    nombre_guardado = Column(String(255), nullable=False)  # UUID + extensión en disco
    url = Column(String(500), nullable=False)  # URL pública o ruta local
    tipo_mime = Column(String(100))  # image/jpeg, image/png, etc.
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
    tipificacion_id = Column(Integer, ForeignKey("cat_tipificaciones.id"), nullable=True)
    estado = Column(String(20), default="ACTIVO")  # ACTIVO | CERRADO
    creado_por = Column(Integer, ForeignKey("usuarios.id"), nullable=False)
    impacto_tiendas = Column(Integer, default=0)   # conteo de tiendas afectadas
    fecha_inicio = Column(DateTime, server_default=func.now())
    fecha_cierre = Column(DateTime, nullable=True)

    tipificacion = relationship("Tipificacion", foreign_keys=[tipificacion_id])
    creador = relationship("Usuario", foreign_keys=[creado_por])
    tickets = relationship("Ticket", back_populates="incidente")


# ─── Plantillas de respuesta rápida (macros del agente) ──────────────────────


class PlantillaRespuesta(Base):
    __tablename__ = "plantillas_respuesta"

    id = Column(Integer, primary_key=True)
    titulo = Column(String(150), nullable=False)  # Ej: "Reinicio de equipo"
    contenido = Column(Text, nullable=False)  # Texto que se inserta
    area_tecnica = Column(Enum(AreaTecnica), nullable=True)  # None = aplica a todas
    creado_por = Column(Integer, ForeignKey("usuarios.id"), nullable=False)
    activo = Column(Boolean, default=True)
    created_at = Column(DateTime, server_default=func.now())

    creador = relationship("Usuario", foreign_keys=[creado_por])
