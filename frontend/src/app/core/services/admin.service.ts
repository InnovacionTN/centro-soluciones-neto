import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

const API = environment.apiUrl + '/admin';

export interface UsuarioAdmin {
  id: number; email: string; nombre: string; rol: string;
  activo: boolean; grupo_id: number | null; tienda_id: number | null;
  created_at: string | null; last_login: string | null;
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

@Injectable({ providedIn: 'root' })
export class AdminService {
  constructor(private http: HttpClient) {}

  // Usuarios
  getUsuarios(rol?: string, activo?: boolean) {
    let params: any = {};
    if (rol) params['rol'] = rol;
    if (activo !== undefined) params['activo'] = activo;
    return this.http.get<UsuarioAdmin[]>(`${API}/usuarios`, { params });
  }
  createUsuario(body: any)  { return this.http.post<UsuarioAdmin>(`${API}/usuarios`, body); }
  updateUsuario(id: number, body: any) { return this.http.patch<UsuarioAdmin>(`${API}/usuarios/${id}`, body); }

  // Tipificaciones
  getTipificaciones(activo?: boolean) {
    let params: any = {};
    if (activo !== undefined) params['activo'] = activo;
    return this.http.get<TipAdmin[]>(`${API}/tipificaciones`, { params });
  }
  createTipificacion(body: any)  { return this.http.post<TipAdmin>(`${API}/tipificaciones`, body); }
  updateTipificacion(id: number, body: any) { return this.http.patch<TipAdmin>(`${API}/tipificaciones/${id}`, body); }

  // Grupos
  getGrupos() { return this.http.get<any[]>('/api/v1/grupos'); }
  createGrupo(body: any)  { return this.http.post<any>(`${API}/grupos`, body); }
  updateGrupo(id: number, body: any) { return this.http.patch<any>(`${API}/grupos/${id}`, body); }

  // Ruteo
  getRuteo()  { return this.http.get<ReglaRuteo[]>(`${API}/ruteo`); }
  createRegla(body: any)  { return this.http.post<ReglaRuteo>(`${API}/ruteo`, body); }
  deleteRegla(id: number) { return this.http.delete(`${API}/ruteo/${id}`); }

  // Tiendas
  getTiendas() { return this.http.get<TiendaAdmin[]>(`${API}/tiendas`); }
  createTienda(body: any) { return this.http.post<TiendaAdmin>(`${API}/tiendas`, body); }
  updateTienda(id: number, body: any) { return this.http.patch<TiendaAdmin>(`${API}/tiendas/${id}`, body); }
}
