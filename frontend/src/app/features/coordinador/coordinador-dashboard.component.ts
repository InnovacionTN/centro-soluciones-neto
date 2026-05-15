import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { RouterModule } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { NavbarComponent } from '../../shared/components/navbar.component';
import { SlaStatus, slaStatusColor, ESTATUS_LABELS } from '../../core/models';

interface TicketCoord {
  id: number; folio: string; estatus: string; prioridad: string;
  descripcion: string; cat_nivel1: string | null; cat_nivel2: string | null;
  area_tecnica: string | null;
  tienda_id: number; tienda_nombre: string | null;
  zona_nombre: string | null; region_nombre: string | null;
  agente_nombre: string | null;
  fecha_apertura: string;
  sla_status: SlaStatus; sla_porcentaje: number | null;
}

const SLA_ORDER: Record<SlaStatus, number> = { ROJO: 0, AMARILLO: 1, VERDE: 2, SIN_SLA: 3 };

const AREA_LABELS: Record<string, string> = {
  SISTEMAS: 'Sistemas', MANTENIMIENTO: 'Mantenimiento', ABASTO: 'Abasto',
  FINANZAS: 'Finanzas', COMERCIAL: 'Comercial', RRHH: 'RR.HH.', OPERACIONES: 'Operaciones',
};
const AREA_COLORS: Record<string, string> = {
  SISTEMAS: '#1B3462', MANTENIMIENTO: '#E65100', ABASTO: '#00796B',
  FINANZAS: '#6A1B9A', COMERCIAL: '#C62828', RRHH: '#558B2F', OPERACIONES: '#0277BD',
};

@Component({
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
            <h1 class="page-title">{{ auth.currentUser()?.nombre }}</h1>
            <p class="page-sub">Vista de coordinador · Cola de tickets</p>
          </div>
          <button class="btn btn--ghost btn--sm" (click)="load()">↻ Refrescar</button>
        </div>

        <!-- KPI chips -->
        <div class="kpi-chips">
          @for (chip of chips(); track chip.key) {
            <button class="kpi-chip"
                    [class.kpi-chip--active]="filtroSla() === chip.key"
                    [style.--chip-color]="chip.color"
                    (click)="filtroSla.set(filtroSla() === chip.key ? '' : chip.key)">
              <span class="kpi-chip-val">{{ chip.count }}</span>
              <span class="kpi-chip-lbl">{{ chip.label }}</span>
            </button>
          }
        </div>

        <!-- Filtro por área -->
        <div class="area-tabs">
          <button class="area-tab" [class.area-tab--active]="filtroArea() === ''"
                  (click)="filtroArea.set('')">Todos</button>
          @for (a of areasDisponibles(); track a) {
            <button class="area-tab" [class.area-tab--active]="filtroArea() === a"
                    [style.--at-color]="areaColor(a)"
                    (click)="filtroArea.set(filtroArea() === a ? '' : a)">
              {{ areaLabel(a) }}
              <span class="area-tab-count">{{ areaCount(a) }}</span>
            </button>
          }
        </div>

        <!-- Tabla -->
        @if (loading()) {
          <div class="loading-row">Cargando tickets de tu compañía...</div>
        } @else if (lista().length === 0) {
          <div class="empty">
            <div class="empty__icon">✅</div>
            <p class="empty__title">Sin tickets activos</p>
          </div>
        } @else {
          <div class="ticket-table">
            <div class="ticket-thead">
              <span></span>
              <span>Folio</span>
              <span>Área · Categoría</span>
              <span>Zona · Tienda</span>
              <span>Agente</span>
              <span>Estado</span>
              <span>SLA</span>
            </div>
            @for (t of lista(); track t.id) {
              <div class="ticket-row"
                   [class.ticket-row--rojo]="t.sla_status === 'ROJO'"
                   [class.ticket-row--amarillo]="t.sla_status === 'AMARILLO'">
                <span class="sla-dot"
                      [style.background]="slaColor(t.sla_status)"
                      [title]="t.sla_status"></span>
                <span class="folio">{{ t.folio }}</span>
                <span class="tip-cell">
                  @if (t.area_tecnica) {
                    <span class="area-chip"
                          [style.background]="areaColor(t.area_tecnica) + '18'"
                          [style.color]="areaColor(t.area_tecnica)">
                      {{ areaLabel(t.area_tecnica) }}
                    </span>
                  }
                  <span class="tip-l1">{{ t.cat_nivel1 || '—' }}</span>
                  @if (t.cat_nivel2) { <span class="tip-l2">{{ t.cat_nivel2 }}</span> }
                </span>
                <span class="location-cell">
                  @if (t.zona_nombre) { <span class="zona-lbl">{{ t.zona_nombre }}</span> }
                  <span class="tienda-lbl">{{ t.tienda_nombre || '#' + t.tienda_id }}</span>
                </span>
                <span class="text-sm text-muted">{{ t.agente_nombre || 'Sin asignar' }}</span>
                <span class="estatus-badge estatus-badge--{{ t.estatus.toLowerCase() }}">
                  {{ estatusLabel(t.estatus) }}
                </span>
                <span class="text-sm">
                  @if (t.sla_porcentaje !== null) {
                    <span class="sla-badge sla-badge--{{ t.sla_status.toLowerCase() }}">
                      {{ t.sla_porcentaje | number:'1.0-0' }}%
                    </span>
                  } @else { — }
                </span>
              </div>
            }
          </div>
          <p class="list-footer">{{ lista().length }} ticket{{ lista().length !== 1 ? 's' : '' }}</p>
        }
      </div>
    </div>
  `,
  styles: [`
    .top-bar { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:18px; }
    .page-title { font-size:22px; font-weight:700; color:var(--c-text); }
    .page-sub { font-size:13px; color:var(--c-muted); margin-top:2px; }

    /* KPI chips */
    .kpi-chips { display:flex; gap:8px; flex-wrap:wrap; margin-bottom:14px; }
    .kpi-chip {
      display:flex; flex-direction:column; align-items:center;
      padding:10px 18px; border-radius:var(--radius-md); cursor:pointer;
      border:2px solid transparent; background:var(--c-surface);
      box-shadow:0 1px 3px rgba(0,0,0,.06); transition:all .15s; min-width:90px;
    }
    .kpi-chip:hover { border-color:var(--chip-color); }
    .kpi-chip--active {
      border-color:var(--chip-color);
      background:color-mix(in srgb, var(--chip-color) 10%, transparent);
    }
    .kpi-chip-val { font-size:26px; font-weight:800; line-height:1; color:var(--chip-color, var(--c-text)); }
    .kpi-chip-lbl { font-size:11px; color:var(--c-muted); margin-top:3px; white-space:nowrap; }

    /* Area tabs */
    .area-tabs { display:flex; gap:6px; flex-wrap:wrap; margin-bottom:14px; }
    .area-tab {
      padding:4px 12px; border-radius:20px; font-size:12px; font-weight:500;
      border:1px solid var(--c-border); background:var(--c-surface); cursor:pointer;
      color:var(--c-muted); transition:all .15s; display:flex; align-items:center; gap:5px;
    }
    .area-tab:hover { border-color:var(--at-color, var(--c-blue)); color:var(--at-color, var(--c-blue)); }
    .area-tab--active {
      background:var(--at-color, var(--c-blue)); color:#fff; border-color:var(--at-color, var(--c-blue));
    }
    .area-tab-count {
      background:rgba(255,255,255,.25); border-radius:10px;
      padding:0 5px; font-size:10px; line-height:16px;
    }
    .area-tab--active .area-tab-count { background:rgba(255,255,255,.3); }

    /* Tabla */
    .ticket-table { background:var(--c-surface); border:1px solid var(--c-border); border-radius:var(--radius-lg); overflow:hidden; }
    .ticket-thead {
      display:grid; grid-template-columns:18px 110px 1fr 160px 130px 130px 70px;
      gap:10px; padding:10px 16px; background:var(--c-bg);
      border-bottom:1px solid var(--c-border);
      font-size:11px; font-weight:600; color:var(--c-muted); text-transform:uppercase; letter-spacing:.04em;
    }
    .ticket-row {
      display:grid; grid-template-columns:18px 110px 1fr 160px 130px 130px 70px;
      gap:10px; align-items:center; padding:10px 16px;
      border-bottom:1px solid var(--c-border); font-size:13px; transition:background .1s;
    }
    .ticket-row:last-child { border-bottom:none; }
    .ticket-row:hover { background:var(--c-bg); }
    .ticket-row--rojo { border-left:3px solid #EF4444; }
    .ticket-row--amarillo { border-left:3px solid #F59E0B; }

    .sla-dot { width:12px; height:12px; border-radius:50%; flex-shrink:0; display:inline-block; }
    .folio { font-family:monospace; font-weight:700; color:var(--c-blue); font-size:12px; }

    .tip-cell { display:flex; flex-direction:column; gap:2px; min-width:0; }
    .area-chip { display:inline-block; padding:1px 6px; border-radius:8px; font-size:10px; font-weight:600; width:fit-content; }
    .tip-l1 { font-size:12px; font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .tip-l2 { font-size:11px; color:var(--c-muted); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }

    .location-cell { display:flex; flex-direction:column; gap:1px; min-width:0; }
    .zona-lbl { font-size:10px; color:var(--c-muted); text-transform:uppercase; letter-spacing:.03em; }
    .tienda-lbl { font-size:12px; font-weight:500; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }

    .text-sm { font-size:12px; }
    .text-muted { color:var(--c-muted); }

    .estatus-badge {
      display:inline-block; padding:3px 8px; border-radius:20px; font-size:11px;
      font-weight:600; background:var(--c-blue-lt); color:var(--c-blue); white-space:nowrap;
    }
    .estatus-badge--nuevo        { background:#e8f4fd; color:#1565C0; }
    .estatus-badge--asignado     { background:#e3f2fd; color:#0277BD; }
    .estatus-badge--en_proceso   { background:#e8f5e9; color:#2E7D32; }
    .estatus-badge--resuelto     { background:#f3e5f5; color:#7B1FA2; }

    .sla-badge { padding:3px 7px; border-radius:10px; font-size:11px; font-weight:700; }
    .sla-badge--verde    { background:#e6faf3; color:#00A878; }
    .sla-badge--amarillo { background:#fff8e0; color:#D97706; }
    .sla-badge--rojo     { background:#fef2f2; color:#DC2626; }
    .sla-badge--sin_sla  { background:var(--c-bg); color:var(--c-muted); }

    .loading-row { text-align:center; padding:48px; color:var(--c-muted); }
    .list-footer  { text-align:right; font-size:12px; color:var(--c-muted); margin-top:8px; }

    @media (max-width:1100px) {
      .ticket-thead, .ticket-row { grid-template-columns:18px 100px 1fr 130px 100px 70px; }
      .ticket-thead span:nth-child(5),
      .ticket-row > span:nth-child(5) { display:none; }
    }

    :host-context(.dark-theme) {
      .ticket-row--rojo    { background:rgba(239,68,68,.05); }
      .ticket-row--amarillo { background:rgba(245,158,11,.05); }
      .estatus-badge--nuevo    { background:#1e3a5f; color:#90caf9; }
      .estatus-badge--asignado { background:#1a3a5c; color:#64b5f6; }
      .estatus-badge--en_proceso { background:#1b3a1e; color:#a5d6a7; }
    }
  `],
})
export class CoordinadorDashboardComponent implements OnInit {
  tickets = signal<TicketCoord[]>([]);
  loading = signal(true);
  filtroSla  = signal('');
  filtroArea = signal('');

  chips = computed(() => {
    const ts = this.tickets();
    const activos = ts.filter(t => !['RESUELTO', 'CERRADO', 'CANCELADO'].includes(t.estatus));
    return [
      { key: '__nuevo__',   label: 'Nuevos',      color: '#1565C0', count: ts.filter(t => t.estatus === 'NUEVO').length },
      { key: '__proceso__', label: 'En proceso',  color: '#2E7D32', count: ts.filter(t => t.estatus === 'EN_PROCESO').length },
      { key: '__rojo__',    label: 'SLA Vencido', color: '#EF4444', count: activos.filter(t => t.sla_status === 'ROJO').length },
      { key: '__amarillo__',label: 'En riesgo',   color: '#F59E0B', count: activos.filter(t => t.sla_status === 'AMARILLO').length },
      { key: '__sinagente__', label: 'Sin agente', color: '#6B7280', count: ts.filter(t => !t.agente_nombre).length },
    ];
  });

  areasDisponibles = computed(() => {
    const areas = new Set(this.tickets().map(t => t.area_tecnica).filter(Boolean) as string[]);
    return [...areas].sort();
  });

  lista = computed(() => {
    let ts = [...this.tickets()];
    const fs = this.filtroSla();
    const fa = this.filtroArea();

    if (fa)              ts = ts.filter(t => t.area_tecnica === fa);
    if (fs === '__rojo__')     ts = ts.filter(t => t.sla_status === 'ROJO');
    else if (fs === '__amarillo__') ts = ts.filter(t => t.sla_status === 'AMARILLO');
    else if (fs === '__nuevo__')    ts = ts.filter(t => t.estatus === 'NUEVO');
    else if (fs === '__proceso__')  ts = ts.filter(t => t.estatus === 'EN_PROCESO');
    else if (fs === '__sinagente__') ts = ts.filter(t => !t.agente_nombre);

    return ts.sort((a, b) => (SLA_ORDER[a.sla_status] ?? 3) - (SLA_ORDER[b.sla_status] ?? 3));
  });

  constructor(private http: HttpClient, public auth: AuthService) {}
  ngOnInit() { this.load(); }

  load() {
    this.loading.set(true);
    this.http.get<TicketCoord[]>('/api/v1/coordinador/tickets').subscribe({
      next: ts => { this.tickets.set(ts); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  slaColor(s: SlaStatus) { return slaStatusColor(s); }
  areaLabel(a: string)   { return AREA_LABELS[a] ?? a; }
  areaColor(a: string)   { return AREA_COLORS[a] ?? '#6B7280'; }
  areaCount(a: string)   { return this.tickets().filter(t => t.area_tecnica === a).length; }

  estatusLabel(e: string): string {
    const map: Record<string, string> = {
      NUEVO: 'Nuevo', ASIGNADO: 'Asignado', EN_PROCESO: 'En proceso',
      ESPERANDO_TIENDA: 'Esp. tienda', ESPERANDO_AGENTE: 'Esp. agente',
      PROGRAMADO_VISITA: 'Prog. visita', EN_VISITA: 'En visita',
      ESPERANDO_PIEZA: 'Esp. pieza', RESUELTO: 'Resuelto', RECHAZADO: 'Re-abierto',
    };
    return map[e] ?? e;
  }
}
