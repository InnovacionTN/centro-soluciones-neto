import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export interface KpiAgente {
  agente_id: number;
  nombre: string;
  email: string;
  grupo: string | null;
  tickets_cerrados: number;
  tickets_activos: number;
  tiempo_promedio_horas: number | null;
  sla_cumplido_pct: number | null;
  csat_promedio: number | null;
  total_escalados: number;
}


const API = environment.apiUrl + '/admin';

export interface UsuarioAdmin {
  id: number; email: string; nombre: string; rol: string;
  activo: boolean; disponible: boolean; grupo_id: number | null; tienda_id: number | null;
  zona_id: number | null; area_restriccion: string | null;
  created_at: string | null; last_login: string | null;
}

export interface TorreAlerta {
  ticket_id: number; folio: string; tienda: string; agente: string | null;
  tipificacion: string | null; estatus: string; prioridad: string;
  sla_limite: string | null; sla_vencido: boolean; horas_abierto: number;
  alerta: 'SLA_VENCIDO' | 'SLA_PROXIMO' | 'SIN_AGENTE' | 'ESTANCADO';
}

export interface IncidenteMasivo {
  id: number; titulo: string; descripcion: string | null;
  tipificacion_id: number | null; estado: string; creado_por: number;
  impacto_tiendas: number; fecha_inicio: string; fecha_cierre: string | null;
}
export interface TipAdmin {
  id: number; area_tecnica: string; categoria: string; problema: string;
  sla_horas: number; urgencia: string; palabras_clave: string | null;
  requiere_foto: boolean; activo: boolean;
}
export interface ReglaRuteo {
  id: number; tipificacion_id: number; grupo_id: number;
  zona_id: number | null; prioridad: number;
  tipificacion?: TipAdmin; grupo?: { id: number; nombre: string; area_tecnica: string };
}
export interface TiendaAdmin {
  id: number; nombre: string; zona_id: number;
  correo_corporativo: string; centro_costos: string | null; activo: boolean;
}

export interface RegionAdmin {
  id: number; nombre: string; activo: boolean;
}

export interface ZonaAdmin {
  id: number; nombre: string; region_id: number; activo: boolean;
}

export interface GrupoAdmin {
  id: number; nombre: string; area_tecnica: string;
  region_id: number | null; slack_canal: string | null; activo: boolean;
}

@Injectable({ providedIn: 'root' })
export class AdminService {
  constructor(private http: HttpClient) { }

  // Usuarios
  getUsuarios(rol?: string, activo?: boolean) {
    let params: any = {};
    if (rol) params['rol'] = rol;
    if (activo !== undefined) params['activo'] = activo;
    return this.http.get<UsuarioAdmin[]>(`${API}/usuarios`, { params });
  }
  createUsuario(body: any) { return this.http.post<UsuarioAdmin>(`${API}/usuarios`, body); }
  updateUsuario(id: number, body: any) { return this.http.patch<UsuarioAdmin>(`${API}/usuarios/${id}`, body); }

  // Tipificaciones
  getTipificaciones(activo?: boolean) {
    let params: any = {};
    if (activo !== undefined) params['activo'] = activo;
    return this.http.get<TipAdmin[]>(`${API}/tipificaciones`, { params });
  }
  createTipificacion(body: any) { return this.http.post<TipAdmin>(`${API}/tipificaciones`, body); }
  updateTipificacion(id: number, body: any) { return this.http.patch<TipAdmin>(`${API}/tipificaciones/${id}`, body); }

  // Grupos
  getGrupos(area?: string) {
    const params: any = {};
    if (area) params['area'] = area;
    return this.http.get<GrupoAdmin[]>('/api/v1/grupos', { params });
  }
  createGrupo(body: any) { return this.http.post<GrupoAdmin>(`${API}/grupos`, body); }
  updateGrupo(id: number, body: any) { return this.http.patch<GrupoAdmin>(`${API}/grupos/${id}`, body); }

  // Regiones
  getRegiones() { return this.http.get<RegionAdmin[]>(`${API}/regiones`); }
  createRegion(body: any) { return this.http.post<RegionAdmin>(`${API}/regiones`, body); }
  updateRegion(id: number, body: any) { return this.http.patch<RegionAdmin>(`${API}/regiones/${id}`, body); }

  // Zonas
  getZonas(region_id?: number) {
    const params: any = {};
    if (region_id) params['region_id'] = region_id;
    return this.http.get<ZonaAdmin[]>(`${API}/zonas`, { params });
  }
  createZona(body: any) { return this.http.post<ZonaAdmin>(`${API}/zonas`, body); }
  updateZona(id: number, body: any) { return this.http.patch<ZonaAdmin>(`${API}/zonas/${id}`, body); }

  // Ruteo
  getRuteo() { return this.http.get<ReglaRuteo[]>(`${API}/ruteo`); }
  createRegla(body: any) { return this.http.post<ReglaRuteo>(`${API}/ruteo`, body); }
  deleteRegla(id: number) { return this.http.delete(`${API}/ruteo/${id}`); }

  // Tiendas
  getTiendas() { return this.http.get<TiendaAdmin[]>(`${API}/tiendas`); }
  createTienda(body: any) { return this.http.post<TiendaAdmin>(`${API}/tiendas`, body); }
  updateTienda(id: number, body: any) { return this.http.patch<TiendaAdmin>(`${API}/tiendas/${id}`, body); }
  // ─── KPIs por agente ─────────────────────────────────────────────────────
  getKpisAgentes(params?: { desde?: string; hasta?: string; grupo_id?: number }) {
    return this.http.get<KpiAgente[]>(`${API}/kpis-agentes`, { params: params as any });
  }

  // ─── Torre de Control ────────────────────────────────────────────────────
  getTorre() {
    return this.http.get<TorreAlerta[]>(`${API}/torre`);
  }

  setDisponibilidad(usuarioId: number, disponible: boolean) {
    return this.http.patch<UsuarioAdmin>(`${API}/usuarios/${usuarioId}/disponibilidad`, { disponible });
  }

  // ─── Incidentes Masivos ──────────────────────────────────────────────────
  getIncidentes(estado?: string) {
    const params: any = {};
    if (estado) params['estado'] = estado;
    return this.http.get<IncidenteMasivo[]>(`${API}/incidentes`, { params });
  }

  createIncidente(body: { titulo: string; descripcion?: string; tipificacion_id?: number; ticket_ids?: number[] }) {
    return this.http.post<IncidenteMasivo>(`${API}/incidentes`, body);
  }

  updateIncidente(id: number, body: { titulo?: string; descripcion?: string; estado?: string }) {
    return this.http.patch<IncidenteMasivo>(`${API}/incidentes/${id}`, body);
  }

}