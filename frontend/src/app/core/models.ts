// ─── Enums ────────────────────────────────────────────────────────────────────

export type Rol = 'ADMIN' | 'AGENTE' | 'TIENDA';

export type EstatusTicket =
  | 'NUEVO'
  | 'ASIGNADO'
  | 'EN_PROCESO'
  | 'ESPERANDO_TIENDA'
  | 'RESUELTO'
  | 'CERRADO'
  | 'RECHAZADO'
  | 'CANCELADO';

export type Prioridad = 'CRITICA' | 'ALTA' | 'MEDIA' | 'BAJA';
export type AreaTecnica = 'ABASTO' | 'SISTEMAS' | 'MANTENIMIENTO' | 'FINANZAS' | 'COMERCIAL' | 'RRHH';
export type Urgencia = 'CRITICA' | 'ALTA' | 'MEDIA' | 'BAJA';

// ─── Auth ──────────────────────────────────────────────────────────────────────

export interface LoginRequest {
  email: string;
  password: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  rol: Rol;
  nombre: string;
  tienda_id: number | null;
}

export interface CurrentUser {
  id: number;
  email: string;
  nombre: string;
  rol: Rol;
  tienda_id: number | null;
  grupo_id: number | null;
}

// ─── Tipificación ──────────────────────────────────────────────────────────────

export interface Tipificacion {
  id: number;
  area_tecnica: AreaTecnica;
  categoria: string;
  problema: string;
  sla_horas: number;
  urgencia: Urgencia;
}

// ─── IA ────────────────────────────────────────────────────────────────────────

export interface ClasificacionRequest {
  descripcion: string;
  tienda_id: number;
}

export interface ClasificacionResponse {
  area_tecnica: AreaTecnica;
  tipificacion_id: number;
  tipificacion_nombre: string;
  categoria: string;
  confianza: number;
  urgencia_sugerida: Urgencia;
  razon: string;
  palabras_detectadas: string[];
}

// ─── Ticket ────────────────────────────────────────────────────────────────────

export interface TicketCreate {
  descripcion: string;
  tipificacion_id?: number;
  ia_clasificacion_aceptada?: boolean;
  metadata_extra?: Record<string, unknown>;
}

export interface TicketUpdate {
  estatus?: EstatusTicket;
  solucion_propuesta?: string;
  comentario?: string;
  tipo_comentario?: 'PUBLICO' | 'INTERNO';
}

export interface EventoTicket {
  id: number;
  accion: string;
  estado_anterior: string | null;
  estado_nuevo: string | null;
  comentario: string | null;
  tipo_comentario: 'PUBLICO' | 'INTERNO';
  timestamp: string;
  usuario: { id: number; nombre: string; rol: Rol } | null;
}

export interface Ticket {
  id: number;
  folio: string;
  estatus: EstatusTicket;
  prioridad: Prioridad;
  tipo: string;
  descripcion: string;
  solucion_propuesta: string | null;
  ia_sugerencia_solucion: string | null;
  ia_confianza: number | null;
  ia_clasificacion_aceptada: boolean | null;
  sla_limite: string | null;
  sla_vencido: boolean;
  fecha_apertura: string;
  fecha_primera_respuesta: string | null;
  fecha_cierre: string | null;
  tienda_id: number;
  agente_id: number | null;
  tipificacion: Tipificacion | null;
  eventos: EventoTicket[];
}

export interface TicketListItem {
  id: number;
  folio: string;
  estatus: EstatusTicket;
  prioridad: Prioridad;
  descripcion: string;
  tienda_id: number;
  agente_id: number | null;
  sla_limite: string | null;
  sla_vencido: boolean;
  fecha_apertura: string;
  tipificacion: Tipificacion | null;
}

// ─── Dashboard ─────────────────────────────────────────────────────────────────

export interface DashboardMetrics {
  total_abiertos: number;
  total_en_proceso: number;
  total_confirmar_solucion: number;
  total_cerrados_hoy: number;
  total_vencidos: number;
  por_area: Record<string, number>;
  por_prioridad: Record<string, number>;
  tiempo_promedio_resolucion_horas: number | null;
  tasa_ia_aceptada: number | null;
}
