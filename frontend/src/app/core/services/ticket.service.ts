import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import {
  Ticket, TicketListItem, TicketCreate, TicketUpdate,
  ClasificacionRequest, ClasificacionResponse,
  Tipificacion, DashboardMetrics,
} from '../models';

export interface Grupo {
  id: number;
  nombre: string;
  area_tecnica: string;
}

@Injectable({ providedIn: 'root' })
export class TicketService {
  private readonly api = environment.apiUrl;

  constructor(private http: HttpClient) {}

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

  escalar(ticketId: number, grupoDesinoId: number, motivo: string) {
    return this.http.post<Ticket>(`${this.api}/tickets/${ticketId}/escalar`, {
      grupo_destino_id: grupoDesinoId,
      motivo,
    });
  }
}
