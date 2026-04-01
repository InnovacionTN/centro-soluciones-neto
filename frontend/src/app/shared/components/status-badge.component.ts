import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { EstatusTicket, Prioridad } from '../../core/models';

const STATUS_CONFIG: Record<EstatusTicket, { label: string; cls: string; icon: string }> = {
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

const PRIORIDAD_CONFIG: Record<Prioridad, { label: string; cls: string }> = {
  CRITICA: { label: 'Crítica', cls: 'prio--CRITICA' },
  ALTA: { label: 'Alta', cls: 'prio--ALTA' },
  MEDIA: { label: 'Media', cls: 'prio--MEDIA' },
  BAJA: { label: 'Baja', cls: 'prio--BAJA' },
};

@Component({
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
export class StatusBadgeComponent {
  @Input() set status(v: EstatusTicket) { this.cfg = STATUS_CONFIG[v]; }
  cfg: { label: string; cls: string; icon: string } | null = null;
}

@Component({
  selector: 'app-prioridad',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (cfg) {
      <span class="prio" [class]="cfg.cls">{{ cfg.label }}</span>
    }
  `,
})
export class PrioridadComponent {
  @Input() set prioridad(v: Prioridad) { this.cfg = PRIORIDAD_CONFIG[v]; }
  cfg: { label: string; cls: string } | null = null;
}

export function statusConfig(s: EstatusTicket) { return STATUS_CONFIG[s]; }
export function prioridadConfig(p: Prioridad) { return PRIORIDAD_CONFIG[p]; }