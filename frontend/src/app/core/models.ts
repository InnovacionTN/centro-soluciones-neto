// ─── Enums ────────────────────────────────────────────────────────────────────

export type Rol = 'ADMIN' | 'AGENTE' | 'TIENDA' | 'COORDINADOR';  // ← Sprint 1

export type EstatusTicket =
  | 'NUEVO'
  | 'ASIGNADO'
  | 'EN_PROCESO'
  | 'ESPERANDO_TIENDA'
  | 'ESPERANDO_AGENTE'
  | 'RESUELTO'
  | 'CERRADO'
  | 'RECHAZADO'
  | 'CANCELADO'
  | 'PROGRAMADO_VISITA'
  | 'EN_VISITA'
  | 'ESPERANDO_PIEZA';

export type Prioridad = 'CRITICA' | 'ALTA' | 'MEDIA' | 'BAJA';
export type AreaTecnica = 'ABASTO' | 'SISTEMAS' | 'MANTENIMIENTO' | 'FINANZAS' | 'COMERCIAL' | 'RRHH' | 'OPERACIONES';
export type Urgencia = 'CRITICA' | 'ALTA' | 'MEDIA' | 'BAJA';
export type OrigenTicket = 'PORTAL' | 'DANY' | 'API';        // ← Sprint 1

/** Semáforo SLA calculado dinámicamente en el backend */
export type SlaStatus = 'VERDE' | 'AMARILLO' | 'ROJO' | 'SIN_SLA'; // ← Sprint 1

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
  tienda_nombre: string | null;
}

export interface CurrentUser {
  id: number;
  email: string;
  nombre: string;
  rol: Rol;
  tienda_id: number | null;
  tienda_nombre: string | null;
  grupo_id: number | null;
  grupo_nombre: string | null;
  zona_id: number | null;           // ← Sprint 1: para coordinadores
  disponible: boolean;
}

// ─── SLA Policy ───────────────────────────────────────────────────────────────
// NUEVO Sprint 1

export interface SlaPolicy {
  id: number;
  nombre: string;            // "72 horas hábiles"
  horas_limite: number;
  tipo_calendario: 'habil' | 'calendario';
  activo: boolean;
}

// ─── Tipificación ──────────────────────────────────────────────────────────────

export interface Tipificacion {
  id: number;
  area_tecnica: AreaTecnica;
  categoria: string;          // Nivel 1
  subcategoria: string | null; // Nivel 2  ← Sprint 1
  problema: string;           // Nivel 3
  tipo: 'INCIDENCIA' | 'REQUERIMIENTO';
  sla_horas: number;
  sla_policy: SlaPolicy | null;  // ← Sprint 1
  urgencia: Urgencia;
  requiere_foto: boolean;
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
  subcategoria: string | null;   // ← Sprint 1
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
  origen?: OrigenTicket;           // ← Sprint 1
  dany_sesion_id?: string;         // ← Sprint 1
  metadata_extra?: Record<string, unknown>;
}

/** Payload para crear ticket desde Dany (Sprint 3 — declarado ya) */
export interface TicketDanyCreate {
  tienda_id: number;
  descripcion: string;
  sesion_id: string;
  tipificacion_id?: number;
  ia_area?: string;
  ia_tipificacion_id?: number;
  ia_confianza?: number;
  pasos_intentados?: string[];
}

export interface TicketUpdate {
  estatus?: EstatusTicket;
  solucion_propuesta?: string;
  comentario?: string;
  tipo_comentario?: 'PUBLICO' | 'INTERNO';
  evidencia_id?: number | null;
}

export interface EvidenciaMin {
  id: number;
  nombre_archivo: string;
  url: string;
  tipo_mime: string | null;
  tamanio_bytes: number | null;
}

export interface EventoTicket {
  id: number;
  accion: string;
  estado_anterior: string | null;
  estado_nuevo: string | null;
  comentario: string | null;
  tipo_comentario: 'PUBLICO' | 'INTERNO';
  evidencia: EvidenciaMin | null;
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
  // ── 3 niveles copiados al ticket ── (Sprint 1)
  cat_nivel1: string | null;
  cat_nivel2: string | null;
  cat_nivel3: string | null;
  // ── origen ── (Sprint 1)
  origen: OrigenTicket;
  dany_sesion_id: string | null;
  // ── resolución ──
  solucion_propuesta: string | null;
  ia_sugerencia_solucion: string | null;
  ia_confianza: number | null;
  ia_clasificacion_aceptada: boolean | null;
  // ── SLA ── (Sprint 1: sla_status es el semáforo)
  sla_limite: string | null;
  sla_vencido: boolean;
  sla_porcentaje: number | null;
  sla_status: SlaStatus;           // ← Sprint 1 — VERDE|AMARILLO|ROJO|SIN_SLA
  // ── fechas ──
  fecha_apertura: string;
  fecha_primera_respuesta: string | null;
  fecha_cierre: string | null;
  // ── relaciones ──
  tienda_id: number;
  agente_id: number | null;
  tipificacion: Tipificacion | null;
  eventos: EventoTicket[];
  // ── CSAT ──
  csat_score: number | null;
  csat_comentario: string | null;
}

export interface TicketListItem {
  id: number;
  folio: string;
  estatus: EstatusTicket;
  prioridad: Prioridad;
  descripcion: string;
  // ── tipificación 3 niveles en lista ── (Sprint 1)
  cat_nivel1: string | null;
  cat_nivel2: string | null;
  cat_nivel3: string | null;
  origen: OrigenTicket;            // ← Sprint 1
  tienda_id: number;
  tienda_nombre: string | null;
  agente_id: number | null;
  sla_limite: string | null;
  sla_vencido: boolean;
  sla_porcentaje: number | null;
  sla_status: SlaStatus;           // ← Sprint 1
  fecha_apertura: string;
  tipificacion: Tipificacion | null;
  fecha_cierre: string | null;
}

// ─── Dashboard ─────────────────────────────────────────────────────────────────

export interface DashboardMetrics {
  total_abiertos: number;
  total_en_proceso: number;
  total_confirmar_solucion: number;
  total_cerrados_hoy: number;
  total_vencidos: number;
  total_sin_sla: number;           // ← Sprint 1
  por_area: Record<string, number>;
  por_prioridad: Record<string, number>;
  por_sla_status: Record<SlaStatus, number>;  // ← Sprint 1
  tiempo_promedio_resolucion_horas: number | null;
  tasa_ia_aceptada: number | null;
  tasa_dany_deflexion: number | null;  // ← Sprint 3 (declarado ya)
}

// ─── Helpers UI ────────────────────────────────────────────────────────────────

/** Color CSS para el semáforo SLA en la cola de agente */
export function slaStatusColor(status: SlaStatus): string {
  const map: Record<SlaStatus, string> = {
    VERDE: '#00A878',
    AMARILLO: '#F59E0B',
    ROJO: '#EF4444',
    SIN_SLA: '#94A3B8',
  };
  return map[status] ?? '#94A3B8';
}

/** Etiqueta legible para el estado del ticket */
export const ESTATUS_LABELS: Record<EstatusTicket, string> = {
  NUEVO: 'Nuevo',
  ASIGNADO: 'Asignado',
  EN_PROCESO: 'En proceso',
  ESPERANDO_TIENDA: 'Esperando tienda',
  ESPERANDO_AGENTE: 'Esperando agente',
  RESUELTO: 'Resuelto',
  CERRADO: 'Cerrado',
  RECHAZADO: 'Rechazado',
  CANCELADO: 'Cancelado',
  PROGRAMADO_VISITA: 'Visita programada',
  EN_VISITA: 'En visita',
  ESPERANDO_PIEZA: 'Esperando pieza',
};

/** Icono emoji para origen del ticket */
export function origenIcon(origen: OrigenTicket): string {
  return origen === 'DANY' ? '🤖' : origen === 'API' ? '⚙️' : '🌐';
}