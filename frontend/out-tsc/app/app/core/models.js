// ─── Enums ────────────────────────────────────────────────────────────────────
// ─── Helpers UI ────────────────────────────────────────────────────────────────
/** Color CSS para el semáforo SLA en la cola de agente */
export function slaStatusColor(status) {
    const map = {
        VERDE: '#00A878',
        AMARILLO: '#F59E0B',
        ROJO: '#EF4444',
        SIN_SLA: '#94A3B8',
    };
    return map[status] ?? '#94A3B8';
}
/** Etiqueta legible para el estado del ticket */
export const ESTATUS_LABELS = {
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
export function origenIcon(origen) {
    return origen === 'DANY' ? '🤖' : origen === 'API' ? '⚙️' : '🌐';
}
//# sourceMappingURL=models.js.map