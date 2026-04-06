import { __decorate } from "tslib";
import { Injectable } from '@angular/core';
import { HttpParams } from '@angular/common/http';
import { environment } from '../../../environments/environment';
let TicketService = class TicketService {
    constructor(http) {
        this.http = http;
        this.api = environment.apiUrl;
    }
    // ─── IA ──────────────────────────────────────────────────────────────────────
    classify(req) {
        return this.http.post(`${this.api}/ai/classify`, req);
    }
    getTipificaciones(area) {
        const params = area ? new HttpParams().set('area', area) : undefined;
        return this.http.get(`${this.api}/tipificaciones`, { params });
    }
    // ─── Tickets ─────────────────────────────────────────────────────────────────
    create(body) {
        return this.http.post(`${this.api}/tickets`, body);
    }
    list(filters = {}) {
        let params = new HttpParams();
        Object.entries(filters).forEach(([k, v]) => {
            if (v !== undefined && v !== null && v !== '') {
                params = params.set(k, String(v));
            }
        });
        return this.http.get(`${this.api}/tickets`, { params });
    }
    get(id) {
        return this.http.get(`${this.api}/tickets/${id}`);
    }
    getSimilares(ticketId) {
        return this.http.get(`${this.api}/tickets/${ticketId}/similares`);
    }
    update(id, body) {
        return this.http.patch(`${this.api}/tickets/${id}`, body);
    }
    // ─── Dashboard ───────────────────────────────────────────────────────────────
    dashboard() {
        return this.http.get(`${this.api}/dashboard`);
    }
    // ─── Escalación ──────────────────────────────────────────────────────────────
    getGrupos(area) {
        const params = area ? new HttpParams().set('area', area) : undefined;
        return this.http.get(`${this.api}/grupos`, { params });
    }
    // Sprint 5A: Mantenimiento
    programarVisita(ticketId, body) {
        return this.http.post(`${this.api}/tickets/${ticketId}/programar-visita`, body);
    }
    iniciarVisita(ticketId) {
        return this.http.post(`${this.api}/tickets/${ticketId}/iniciar-visita`, {});
    }
    esperarPieza(ticketId, body) {
        return this.http.post(`${this.api}/tickets/${ticketId}/esperar-pieza`, body);
    }
    escalar(ticketId, grupoDesinoId, motivo) {
        return this.http.post(`${this.api}/tickets/${ticketId}/escalar`, {
            grupo_destino_id: grupoDesinoId,
            motivo,
        });
    }
    // ─── Plantillas ──────────────────────────────────────────────────────────
    getPlantillas(area) {
        const url = area
            ? `${this.api}/plantillas?area=${encodeURIComponent(area)}`
            : `${this.api}/plantillas`;
        return this.http.get(url);
    }
    createPlantilla(titulo, contenido, area_tecnica) {
        return this.http.post(`${this.api}/plantillas`, { titulo, contenido, area_tecnica });
    }
    deletePlantilla(id) {
        return this.http.delete(`${this.api}/plantillas/${id}`);
    }
    // ─── CSAT ────────────────────────────────────────────────────────────────
    uploadEvidencia(ticketId, formData) {
        return this.http.post(`${this.api}/tickets/${ticketId}/evidencias`, formData);
    }
    enviarCsat(ticketId, score, comentario) {
        return this.http.post(`${this.api}/tickets/${ticketId}/csat`, {
            score,
            comentario,
        });
    }
};
TicketService = __decorate([
    Injectable({ providedIn: 'root' })
], TicketService);
export { TicketService };
//# sourceMappingURL=ticket.service.js.map