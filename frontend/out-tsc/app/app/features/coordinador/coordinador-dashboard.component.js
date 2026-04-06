import { __decorate } from "tslib";
import { Component, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { NavbarComponent } from '../../shared/components/navbar.component';
import { slaStatusColor } from '../../core/models';
const SLA_ORDER = { ROJO: 0, AMARILLO: 1, VERDE: 2, SIN_SLA: 3 };
let CoordinadorDashboardComponent = class CoordinadorDashboardComponent {
    constructor(http, auth) {
        this.http = http;
        this.auth = auth;
        this.tickets = signal([]);
        this.loading = signal(true);
        this.filtro = signal('');
        this.chips = computed(() => {
            const ts = this.tickets();
            const activos = ts.filter(t => !['RESUELTO', 'CERRADO', 'CANCELADO'].includes(t.estatus));
            return [
                { key: 'PROGRAMADO_VISITA', label: '📅 Programada', color: '#1B3462', count: ts.filter(t => t.estatus === 'PROGRAMADO_VISITA').length },
                { key: 'EN_VISITA', label: '🔧 En visita', color: '#E65100', count: ts.filter(t => t.estatus === 'EN_VISITA').length },
                { key: 'ESPERANDO_PIEZA', label: '⏳ Pieza', color: '#F57F17', count: ts.filter(t => t.estatus === 'ESPERANDO_PIEZA').length },
                { key: '__rojo__', label: '🔴 SLA Vencido', color: '#EF4444', count: activos.filter(t => t.sla_status === 'ROJO').length },
                { key: '__amarillo__', label: '🟡 En riesgo', color: '#F59E0B', count: activos.filter(t => t.sla_status === 'AMARILLO').length },
            ];
        });
        this.lista = computed(() => {
            let ts = [...this.tickets()];
            const f = this.filtro();
            if (f === '__rojo__')
                ts = ts.filter(t => t.sla_status === 'ROJO');
            else if (f === '__amarillo__')
                ts = ts.filter(t => t.sla_status === 'AMARILLO');
            else if (f)
                ts = ts.filter(t => t.estatus === f);
            return ts.sort((a, b) => (SLA_ORDER[a.sla_status] ?? 3) - (SLA_ORDER[b.sla_status] ?? 3));
        });
    }
    ngOnInit() { this.load(); }
    load() {
        this.loading.set(true);
        this.http.get('/api/v1/coordinador/tickets').subscribe({
            next: ts => { this.tickets.set(ts); this.loading.set(false); },
            error: () => this.loading.set(false),
        });
    }
    slaColor(s) { return slaStatusColor(s); }
    estatusLabel(e) {
        const map = {
            NUEVO: 'Nuevo', ASIGNADO: 'Asignado', EN_PROCESO: 'En proceso',
            ESPERANDO_TIENDA: 'Esp. tienda', ESPERANDO_AGENTE: 'Esp. agente',
            PROGRAMADO_VISITA: '📅 Programado', EN_VISITA: '🔧 En visita',
            ESPERANDO_PIEZA: '⏳ Pieza', RECHAZADO: 'Re-abierto',
        };
        return map[e] ?? e;
    }
};
CoordinadorDashboardComponent = __decorate([
    Component({
        selector: 'app-coordinador-dashboard',
        standalone: true,
        imports: [CommonModule, FormsModule, RouterModule, NavbarComponent],
        template: `
    <div class="page">
      <app-navbar section="Coordinador" />
      <div class="content content--wide">

        <!-- Header -->
        <div class="top-bar">
          <div>
            <h1 class="page-title">🔧 Mantenimiento — Vista Coordinador</h1>
            <p class="page-sub">Solo lectura · {{ auth.currentUser()?.nombre }}</p>
          </div>
          <button class="btn btn--ghost btn--sm" (click)="load()">↻ Refrescar</button>
        </div>

        <!-- KPI chips como filtros -->
        <div class="kpi-chips">
          @for (chip of chips(); track chip.key) {
            <button class="kpi-chip"
                    [class.kpi-chip--active]="filtro() === chip.key"
                    [style.--chip-color]="chip.color"
                    (click)="filtro.set(filtro() === chip.key ? '' : chip.key)">
              <span class="kpi-chip-val">{{ chip.count }}</span>
              <span class="kpi-chip-lbl">{{ chip.label }}</span>
            </button>
          }
        </div>

        <!-- Tabla -->
        @if (loading()) {
          <div class="loading-row">Cargando tickets de Mantenimiento...</div>
        } @else if (lista().length === 0) {
          <div class="empty"><div class="empty__icon">✅</div><p class="empty__title">Sin tickets</p></div>
        } @else {
          <div class="ticket-table">
            <div class="ticket-thead">
              <span></span>
              <span>Folio</span>
              <span>Categoría / Problema</span>
              <span>Tienda</span>
              <span>Agente</span>
              <span>Estado</span>
              <span>SLA límite</span>
              <span>Visita</span>
            </div>
            @for (t of lista(); track t.id) {
              <div class="ticket-row"
                   [class.ticket-row--rojo]="t.sla_status === 'ROJO'"
                   [class.ticket-row--amarillo]="t.sla_status === 'AMARILLO'">
                <!-- Semáforo -->
                <span class="sla-dot"
                      [style.background]="slaColor(t.sla_status)"
                      [title]="t.sla_status"></span>
                <span class="folio">{{ t.folio }}</span>
                <span class="tip-cell">
                  <span class="tip-l1">{{ t.cat_nivel1 || '—' }}</span>
                  @if (t.cat_nivel2) { <span class="tip-l2">{{ t.cat_nivel2 }}</span> }
                </span>
                <span class="text-sm">{{ t.tienda_nombre || '#' + t.tienda_id }}</span>
                <span class="text-sm text-muted">{{ t.agente_nombre || 'Sin asignar' }}</span>
                <span class="estatus-badge">{{ estatusLabel(t.estatus) }}</span>
                <span class="text-sm">
                  @if (t.sla_porcentaje !== null) {
                    <span class="sla-badge" [class]="'sla-badge--' + t.sla_status.toLowerCase()">
                      {{ t.sla_porcentaje | number:'1.0-0' }}%
                    </span>
                  } @else { — }
                </span>
                <span class="text-sm">
                  @if (t.fecha_visita_programada) {
                    <span class="visita-chip">📅 {{ t.fecha_visita_programada | date:'dd/MM HH:mm' }}</span>
                  }
                  @if (t.pieza_requerida) {
                    <span class="pieza-chip">⏳ {{ t.pieza_requerida | slice:0:20 }}</span>
                  }
                </span>
              </div>
            }
          </div>
        }
      </div>
    </div>
  `,
        styles: [`
    .top-bar { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:18px; }
    .page-title { font-size:22px; font-weight:600; }
    .page-sub { font-size:13px; color:var(--c-muted); }

    .kpi-chips { display:flex; gap:8px; flex-wrap:wrap; margin-bottom:16px; }
    .kpi-chip {
      display:flex; flex-direction:column; align-items:center;
      padding:10px 16px; border-radius:var(--radius-md); cursor:pointer;
      border:2px solid transparent; background:var(--c-surface);
      box-shadow:0 1px 3px rgba(0,0,0,.06); transition:all .15s; min-width:90px;
    }
    .kpi-chip:hover { border-color:var(--chip-color, var(--c-blue)); }
    .kpi-chip--active {
      border-color:var(--chip-color, var(--c-blue));
      background:color-mix(in srgb, var(--chip-color, var(--c-blue)) 10%, white);
    }
    .kpi-chip-val { font-size:26px; font-weight:800; line-height:1; color:var(--chip-color, var(--c-text)); }
    .kpi-chip-lbl { font-size:11px; color:var(--c-muted); margin-top:3px; white-space:nowrap; }

    .ticket-table { background:var(--c-surface); border:1px solid var(--c-border); border-radius:var(--radius-lg); overflow:hidden; }
    .ticket-thead {
      display:grid; grid-template-columns:22px 110px 1fr 120px 120px 130px 80px 140px;
      gap:10px; padding:10px 16px; background:var(--c-bg);
      border-bottom:1px solid var(--c-border);
      font-size:11px; font-weight:600; color:var(--c-muted); text-transform:uppercase; letter-spacing:.04em;
    }
    .ticket-row {
      display:grid; grid-template-columns:22px 110px 1fr 120px 120px 130px 80px 140px;
      gap:10px; align-items:center; padding:11px 16px;
      border-bottom:1px solid var(--c-border); font-size:13px; transition:background .1s;
    }
    .ticket-row:last-child { border-bottom:none; }
    .ticket-row:hover { background:var(--c-bg); }
    .ticket-row--rojo { background:#fff5f5; }
    .ticket-row--amarillo { background:#fffbea; }

    .sla-dot { width:14px; height:14px; border-radius:50%; flex-shrink:0; display:inline-block; }
    .folio { font-family:monospace; font-weight:700; color:var(--c-blue); font-size:12px; }
    .tip-cell { display:flex; flex-direction:column; gap:1px; min-width:0; }
    .tip-l1 { font-size:12px; font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .tip-l2 { font-size:11px; color:var(--c-muted); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .text-sm { font-size:12px; }
    .text-muted { color:var(--c-muted); }

    .sla-badge { padding:2px 6px; border-radius:10px; font-size:11px; font-weight:600; }
    .sla-badge--verde    { background:#e6faf3; color:#00A878; }
    .sla-badge--amarillo { background:#fff8e0; color:#D97706; }
    .sla-badge--rojo     { background:#fef2f2; color:#DC2626; }

    .estatus-badge {
      display:inline-block; padding:2px 8px; border-radius:10px; font-size:11px;
      font-weight:600; background:var(--c-blue-lt); color:var(--c-blue);
    }
    .visita-chip { background:#e0f0ff; color:#1B3462; padding:2px 7px; border-radius:10px; font-size:11px; display:inline-block; }
    .pieza-chip  { background:#fff3e0; color:#E65100; padding:2px 7px; border-radius:10px; font-size:11px; display:inline-block; margin-top:2px; }
    .loading-row { text-align:center; padding:40px; color:var(--c-muted); }

    @media (max-width:1100px) {
      .ticket-thead, .ticket-row { grid-template-columns:22px 100px 1fr 120px 120px 80px; }
      .ticket-thead span:nth-child(5),
      .ticket-thead span:nth-child(8),
      .ticket-row > span:nth-child(5),
      .ticket-row > span:nth-child(8) { display:none; }
    }
  `],
    })
], CoordinadorDashboardComponent);
export { CoordinadorDashboardComponent };
//# sourceMappingURL=coordinador-dashboard.component.js.map