import { config } from "../config.js";

/**
 * Cliente del backend CSN (FastAPI). Autenticación por header X-Dany-Token.
 * Reusa los endpoints existentes — NO reimplementa lógica de tickets.
 */

export class CsnError extends Error {
  constructor(
    public status: number,
    public endpoint: string,
    public body: string,
  ) {
    super(`CSN ${endpoint} → ${status}: ${body.slice(0, 200)}`);
    this.name = "CsnError";
  }
}

async function post<T>(endpoint: string, payload: unknown): Promise<T> {
  if (!config.danySystemToken) {
    throw new CsnError(0, endpoint, "DANY_SYSTEM_TOKEN no configurado");
  }
  const url = `${config.csnApiUrl}/api/v1${endpoint}`;
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Dany-Token": config.danySystemToken,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(30_000),
  });
  const text = await resp.text();
  if (!resp.ok) throw new CsnError(resp.status, endpoint, text);
  return text ? (JSON.parse(text) as T) : ({} as T);
}

// ─── Tipos de respuesta (espejo de schemas.py) ──────────────────────────────

export interface SesionInicioOut {
  sesion_id: string;
  tienda_id: number;
  mensaje: string;
}

export interface ClasificacionOut {
  area_tecnica: string;
  tipificacion_id: number;
  tipificacion_nombre: string;
  categoria: string;
  subcategoria: string | null;
  confianza: number; // 0-100
  urgencia_sugerida: string;
  razon: string;
  palabras_detectadas: string[];
}

export interface TicketDanyOut {
  ticket_id: number;
  folio: string;
  estatus: string;
  sla_limite: string | null;
  sla_status: string;
  grupo_nombre: string | null;
  agente_nombre: string | null;
  mensaje: string;
}

export interface SesionCierreOut {
  sesion_id: string;
  deflexion: boolean;
  mensaje: string;
}

export interface ColaTicket {
  id: number;
  folio: string;
  estatus: string | null;
  prioridad: string | null;
  descripcion: string;
  cat_nivel1: string | null;
  sla_status: string;
  sla_vencido: boolean;
  tienda_id: number;
  tienda_nombre: string | null;
  fecha_apertura: string | null;
}

export interface AdminContexto {
  kpis: {
    total_activos: number;
    cerrados_hoy: number;
    vencidos: number;
    sin_agente: number;
    criticos: number;
  };
  torre: Array<{
    id: number;
    folio: string;
    tipo_alerta: string;
    prioridad: string | null;
    tienda: string | null;
    area: string | null;
    horas_abierto: number | null;
    agente: string | null;
  }>;
}

// ─── Llamadas tipadas ────────────────────────────────────────────────────────

export const csn = {
  iniciarSesion: (sesionId: string, tiendaId: number, canal = "portal") =>
    post<SesionInicioOut>("/dany/sesion/iniciar", {
      sesion_id: sesionId,
      tienda_id: tiendaId,
      canal,
    }),

  clasificar: (descripcion: string, tiendaId?: number) =>
    post<ClasificacionOut>("/ai/classify", {
      descripcion,
      tienda_id: tiendaId ?? null,
    }),

  crearTicket: (p: {
    tienda_id: number;
    sesion_id: string;
    descripcion: string;
    ia_area: string;
    pasos_intentados?: string;
    tipificacion_id?: number;
    ia_confianza?: number; // 0-100
  }) => post<TicketDanyOut>("/tickets/desde-dany", p),

  cerrarSesion: (p: {
    sesion_id: string;
    resuelto_sin_ticket: boolean;
    mensajes_count?: number;
    tipificacion_detectada?: string;
    motivo_escalacion?: string;
  }) => post<SesionCierreOut>("/dany/sesion/cerrar", p),

  colaAgente: (usuarioId: number, limit = 25) =>
    post<ColaTicket[]>("/dany/agente/cola", { usuario_id: usuarioId, limit }),

  adminContexto: (usuarioId: number) =>
    post<AdminContexto>("/dany/admin/contexto", { usuario_id: usuarioId }),

  agenteTicket: (usuarioId: number, ticket: string) =>
    post<Record<string, unknown>>("/dany/agente/ticket", {
      usuario_id: usuarioId,
      ticket,
    }),

  agenteSimilares: (usuarioId: number, ticket: string) =>
    post<Record<string, unknown>>("/dany/agente/similares", {
      usuario_id: usuarioId,
      ticket_id: ticket,
    }),

  adminKpis: (usuarioId: number) =>
    post<Record<string, unknown>>("/dany/admin/kpis", { usuario_id: usuarioId }),
};
