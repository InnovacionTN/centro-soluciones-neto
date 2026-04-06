import { __decorate } from "tslib";
import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';
const API = environment.apiUrl + '/admin';
let AdminService = class AdminService {
    constructor(http) {
        this.http = http;
    }
    // Usuarios
    getUsuarios(rol, activo) {
        let params = {};
        if (rol)
            params['rol'] = rol;
        if (activo !== undefined)
            params['activo'] = activo;
        return this.http.get(`${API}/usuarios`, { params });
    }
    createUsuario(body) { return this.http.post(`${API}/usuarios`, body); }
    updateUsuario(id, body) { return this.http.patch(`${API}/usuarios/${id}`, body); }
    // Tipificaciones
    getTipificaciones(activo) {
        let params = {};
        if (activo !== undefined)
            params['activo'] = activo;
        return this.http.get(`${API}/tipificaciones`, { params });
    }
    createTipificacion(body) { return this.http.post(`${API}/tipificaciones`, body); }
    updateTipificacion(id, body) { return this.http.patch(`${API}/tipificaciones/${id}`, body); }
    // Grupos
    getGrupos() { return this.http.get('/api/v1/grupos'); }
    createGrupo(body) { return this.http.post(`${API}/grupos`, body); }
    updateGrupo(id, body) { return this.http.patch(`${API}/grupos/${id}`, body); }
    // Ruteo
    getRuteo() { return this.http.get(`${API}/ruteo`); }
    createRegla(body) { return this.http.post(`${API}/ruteo`, body); }
    deleteRegla(id) { return this.http.delete(`${API}/ruteo/${id}`); }
    // Tiendas
    getTiendas() { return this.http.get(`${API}/tiendas`); }
    createTienda(body) { return this.http.post(`${API}/tiendas`, body); }
    updateTienda(id, body) { return this.http.patch(`${API}/tiendas/${id}`, body); }
    // ─── KPIs por agente ─────────────────────────────────────────────────────
    getKpisAgentes(params) {
        return this.http.get(`${API}/kpis-agentes`, { params: params });
    }
    // ─── Torre de Control ────────────────────────────────────────────────────
    getTorre() {
        return this.http.get(`${API}/torre`);
    }
    setDisponibilidad(usuarioId, disponible) {
        return this.http.patch(`${API}/usuarios/${usuarioId}/disponibilidad`, { disponible });
    }
    // ─── Incidentes Masivos ──────────────────────────────────────────────────
    getIncidentes(estado) {
        const params = {};
        if (estado)
            params['estado'] = estado;
        return this.http.get(`${API}/incidentes`, { params });
    }
    createIncidente(body) {
        return this.http.post(`${API}/incidentes`, body);
    }
    updateIncidente(id, body) {
        return this.http.patch(`${API}/incidentes/${id}`, body);
    }
};
AdminService = __decorate([
    Injectable({ providedIn: 'root' })
], AdminService);
export { AdminService };
//# sourceMappingURL=admin.service.js.map