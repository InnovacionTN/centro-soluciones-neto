import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import {
  Ticket, TicketListItem, TicketCreate, TicketUpdate,
  ClasificacionRequest, ClasificacionResponse,
  Tipificacion, DashboardMetrics,
} from '../models';

export interface Plantilla {
  id: number;
  titulo: string;
  contenido: string;
  area_tecnica: string | null;
  activo: boolean;
}


export interface Grupo {
  id: number;
  nombre: string;
  area_tecnica: string;
}

export interface TicketSimilar {
  id: number;
  folio: string;
  descripcion: string;
  solucion_propuesta: string;
  csat_score: number | null;
  fecha_cierre: string | null;
  tiempo_resolucion_horas: number | null;
}

@Injectable({ providedIn: 'root' })
export class TicketService {
  private readonly api = environment.apiUrl;

  constructor(private http: HttpClient) { }

  // ─── IA ──────────────────────────────────────────────────────────────────────

  classify(req: ClasificacionRequest) {
    return this.http.post<ClasificacionResponse>(`${this.api}/ai/classify`, req);
  }

  getTipificaciones(area?: string) {
    const params = area ? new HttpParams().set('area', area) : undefined;
    return this.http.get<Tipificacion[]>(`${this.api}/tipificaciones`, { params });
  }

  // ─── Tickets ─────────────────────────────────────────────────────────────────

  create(body: TicketCreate) {
    return this.http.post<Ticket>(`${this.api}/tickets`, body);
  }

  list(filters: {
    estatus?: string;
    area?: string;
    prioridad?: string;
    solo_mios?: boolean;
    limit?: number;
    offset?: number;
  } = {}) {
    let params = new HttpParams();
    Object.entries(filters).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') {
        params = params.set(k, String(v));
      }
    });
    return this.http.get<TicketListItem[]>(`${this.api}/tickets`, { params });
  }

  get(id: number) {
    return this.http.get<Ticket>(`${this.api}/tickets/${id}`);
  }

  getSimilares(ticketId: number) {
    return this.http.get<TicketSimilar[]>(`${this.api}/tickets/${ticketId}/similares`);
  }

  update(id: number, body: TicketUpdate) {
    return this.http.patch<Ticket>(`${this.api}/tickets/${id}`, body);
  }

  // ─── Dashboard ───────────────────────────────────────────────────────────────

  dashboard() {
    return this.http.get<DashboardMetrics>(`${this.api}/dashboard`);
  }

  // ─── Escalación ──────────────────────────────────────────────────────────────

  getGrupos(area?: string) {
    const params = area ? new HttpParams().set('area', area) : undefined;
    return this.http.get<Grupo[]>(`${this.api}/grupos`, { params });
  }

  // Sprint 5A: Mantenimiento
  programarVisita(ticketId: number, body: { fecha_visita: string; comentario?: string; pieza_requerida?: string }) {
    return this.http.post<Ticket>(`${this.api}/tickets/${ticketId}/programar-visita`, body);
  }

  iniciarVisita(ticketId: number) {
    return this.http.post<Ticket>(`${this.api}/tickets/${ticketId}/iniciar-visita`, {});
  }

  esperarPieza(ticketId: number, body: { pieza_requerida: string; proveedor?: string; comentario?: string }) {
    return this.http.post<Ticket>(`${this.api}/tickets/${ticketId}/esperar-pieza`, body);
  }

  escalar(ticketId: number, grupoDesinoId: number, motivo: string) {
    return this.http.post<Ticket>(`${this.api}/tickets/${ticketId}/escalar`, {
      grupo_destino_id: grupoDesinoId,
      motivo,
    });
  }
  // ─── Plantillas ──────────────────────────────────────────────────────────
  getPlantillas(area?: string) {
    const url = area
      ? `${this.api}/plantillas?area=${encodeURIComponent(area)}`
      : `${this.api}/plantillas`;
    return this.http.get<Plantilla[]>(url);
  }

  createPlantilla(titulo: string, contenido: string, area_tecnica?: string) {
    return this.http.post<Plantilla>(`${this.api}/plantillas`, { titulo, contenido, area_tecnica });
  }

  deletePlantilla(id: number) {
    return this.http.delete(`${this.api}/plantillas/${id}`);
  }

  // ─── CSAT ────────────────────────────────────────────────────────────────
  uploadEvidencia(ticketId: number, formData: FormData) {
    return this.http.post<{ id: number; url: string; nombre_archivo: string }>(
      `${this.api}/tickets/${ticketId}/evidencias`, formData
    );
  }

  enviarCsat(ticketId: number, score: number, comentario?: string) {
    return this.http.post<Ticket>(`${this.api}/tickets/${ticketId}/csat`, {
      score,
      comentario,
    });
  }
}