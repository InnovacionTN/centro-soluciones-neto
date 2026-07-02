import { __decorate } from "tslib";
import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
const STATUS_CONFIG = {
    NUEVO: { label: 'Nuevo', cls: 'badge--blue', icon: '🔵' },
    ASIGNADO: { label: 'Asignado', cls: 'badge--blue', icon: '📋' },
    EN_PROCESO: { label: 'En proceso', cls: 'badge--purple', icon: '⚙️' },
    ESPERANDO_TIENDA: { label: 'Esperando tienda', cls: 'badge--amber', icon: '⏳' },
    ESPERANDO_AGENTE: { label: 'Esperando agente', cls: 'badge--teal', icon: '↩' },
    RESUELTO: { label: 'Resuelto', cls: 'badge--green', icon: '✅' },
    CERRADO: { label: 'Cerrado', cls: 'badge--gray', icon: '🔒' },
    RECHAZADO: { label: 'Rechazado', cls: 'badge--red', icon: '↩️' },
    CANCELADO: { label: 'Cancelado', cls: 'badge--gray', icon: '🚫' },
    PROGRAMADO_VISITA: { label: 'Visita programada', cls: 'badge--blue', icon: '📅' },
    EN_VISITA: { label: 'En visita', cls: 'badge--purple', icon: '🚶‍♂️' },
    ESPERANDO_PIEZA: { label: 'Esperando pieza', cls: 'badge--amber', icon: '📦' },
};
const PRIORIDAD_CONFIG = {
    CRITICA: { label: 'Crítica', cls: 'prio--CRITICA' },
    ALTA: { label: 'Alta', cls: 'prio--ALTA' },
    MEDIA: { label: 'Media', cls: 'prio--MEDIA' },
    BAJA: { label: 'Baja', cls: 'prio--BAJA' },
};
let StatusBadgeComponent = class StatusBadgeComponent {
    constructor() {
        this.cfg = null;
    }
    set status(v) { this.cfg = STATUS_CONFIG[v]; }
};
__decorate([
    Input()
], StatusBadgeComponent.prototype, "status", null);
StatusBadgeComponent = __decorate([
    Component({
        selector: 'app-status-badge',
        standalone: true,
        imports: [CommonModule],
        template: `
    @if (cfg) {
      <span class="badge" [class]="cfg.cls">
        {{ cfg.label }}
      </span>
    }
  `,
    })
], StatusBadgeComponent);
export { StatusBadgeComponent };
let PrioridadComponent = class PrioridadComponent {
    constructor() {
        this.cfg = null;
    }
    set prioridad(v) { this.cfg = PRIORIDAD_CONFIG[v]; }
};
__decorate([
    Input()
], PrioridadComponent.prototype, "prioridad", null);
PrioridadComponent = __decorate([
    Component({
        selector: 'app-prioridad',
        standalone: true,
        imports: [CommonModule],
        template: `
    @if (cfg) {
      <span class="prio" [class]="cfg.cls">{{ cfg.label }}</span>
    }
  `,
    })
], PrioridadComponent);
export { PrioridadComponent };
export function statusConfig(s) { return STATUS_CONFIG[s]; }
export function prioridadConfig(p) { return PRIORIDAD_CONFIG[p]; }
//# sourceMappingURL=status-badge.component.js.map