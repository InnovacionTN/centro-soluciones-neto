import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { AuthService } from '../../core/services/auth.service';
import { NavbarComponent } from '../../shared/components/navbar.component';
import { SlaStatus, slaStatusColor } from '../../core/models';

interface TicketMantto {
  id: number;
  folio: string;
  estatus: string;
  prioridad: string;
  descripcion: string;
  cat_nivel1: string | null;
  cat_nivel2: string | null;
  tienda_id: number;
  tienda_nombre: string | null;
  agente_nombre: string | null;
  fecha_apertura: string;
  fecha_visita_programada: string | null;
  pieza_requerida: string | null;
  sla_status: SlaStatus;
  sla_porcentaje: number | null;
}

const ESTATUS_LABEL: Record<string, string> = {
  NUEVO:             'Nuevo',
  ASIGNADO:          'Asignado',
  EN_PROCESO:        'En proceso',
  PROGRAMADO_VISITA: '📅 Visita programada',
  EN_VISITA:         '🔧 En visita',
  ESPERANDO_PIEZA:   '⏳ Esperando pieza',
  ESPERANDO_TIENDA:  'Esperando tienda',
  RESUELTO:          '✅ Resuelto',
  CERRADO:           'Cerrado',
};

const SLA_COLORS: Record<SlaStatus, string> = {
  VERDE:   '#00A878',
  AMARILLO:'#F59E0B',
  ROJO:    '#EF4444',
  SIN_SLA: '#94A3B8',
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
            <h1 class="page-title">Vista Coordinador — Mantenimiento</h1>
            <p class="page-sub">Solo lectura · {{ auth.currentUser()?.nombre }}</p>
          </div>
          <button class="btn btn--ghost btn--sm" (click)="load()">↻ Refrescar</button>
        </div>

        <!-- Contadores de estado -->
        <div class="estado-grid">
          @for (e of estadoConteos(); track e.key) {
            <button
              class="estado-card"
              [class.estado-card--active]="filtroEstatus() === e.key"
              (click)="filtroEstatus.set(filtroEstatus() === e.key ? '' : e.key)"
            >
              <span class="estado-label">{{ e.label }}</span>
              <span class="estado-count" [style.color]="e.color">{{ e.count }}</span>
            </button>
          }
        </div>

        <!-- Semáforo SLA summary -->
        <div class="sla-summary">
          @for (s of slaSummary(); track s.status) {
            <div class="sla-pill" [style.border-color]="s.color">
              <span class="sla-dot" [style.background]="s.color"></span>
              <span>{{ s.label }}: <strong>{{ s.count }}</strong></span>
            </div>
          }
        </div>

        <!-- Lista de tickets -->
        @if (loading()) {
          <div class="loading-msg">Cargando tickets de Mantenimiento...</div>
        } @else if (ticketsFiltrados().length === 0) {
          <div class="empty">
            <div class="empty__icon">🎉</div>
            <p class="empty__title">Sin tickets en esta vista</p>
          </div>
        } @else {
          <div class="ticket-list">
            @for (t of ticketsFiltrados(); track t.id) {
              <div class="ticket-card" [class.card--rojo]="t.sla_status === 'ROJO'" [class.card--amarillo]="t.sla_status === 'AMARILLO'">
                <!-- Header de la card -->
                <div class="card-header">
                  <div class="card-folio-row">
                    <span class="folio">{{ t.folio }}</span>
                    <span class="estatus-badge estatus--{{ t.estatus.toLowerCase() }}">
                      {{ estatusLabel(t.estatus) }}
                    </span>
                    <span class="prio prio--{{ t.prioridad }}">{{ t.prioridad }}</span>
                    <!-- Semáforo SLA -->
                    <span class="sla-circle" [style.background]="slaColor(t.sla_status)"
                          [title]="'SLA: ' + t.sla_status + (t.sla_porcentaje !== null ? ' (' + t.sla_porcentaje + '%)' : '')">
                      {{ t.sla_porcentaje !== null ? (t.sla_porcentaje | number:'1.0-0') + '%' : '—' }}
                    </span>
                  </div>
                  <p class="card-desc">{{ t.descripcion | slice:0:120 }}@if(t.descripcion.length > 120){…}</p>
                </div>

                <!-- Info grid -->
                <div class="card-info">
                  <div class="info-item">
                    <span class="info-label">Tienda</span>
                    <span class="info-val">{{ t.tienda_nombre || '#' + t.tienda_id }}</span>
                  </div>
                  <div class="info-item">
                    <span class="info-label">Área</span>
                    <span class="info-val">{{ t.cat_nivel1 || '—' }}</span>
                  </div>
                  <div class="info-item">
                    <span class="info-label">Problema</span>
                    <span class="info-val">{{ t.cat_nivel2 || '—' }}</span>
                  </div>
                  <div class="info-item">
                    <span class="info-label">Agente</span>
                    <span class="info-val">{{ t.agente_nombre || 'Sin asignar' }}</span>
                  </div>
                  <div class="info-item">
                    <span class="info-label">Apertura</span>
                    <span class="info-val">{{ t.fecha_apertura | date:'dd/MM/yy HH:mm' }}</span>
                  </div>

                  @if (t.fecha_visita_programada) {
                    <div class="info-item info-item--highlight">
                      <span class="info-label">📅 Visita</span>
                      <span class="info-val">{{ t.fecha_visita_programada | date:'dd/MM/yy HH:mm' }}</span>
                    </div>
                  }
                  @if (t.pieza_requerida) {
                    <div class="info-item info-item--warn">
                      <span class="info-label">⏳ Pieza</span>
                      <span class="info-val">{{ t.pieza_requerida }}</span>
                    </div>
                  }
                </div>
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
    .page-sub   { font-size:13px; color:var(--c-muted); }

    /* Estado grid */
    .estado-grid {
      display:grid;
      grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
      gap:10px;
      margin-bottom:14px;
    }
    .estado-card {
      background:var(--c-surface);
      border:1.5px solid var(--c-border);
      border-radius:var(--radius-md);
      padding:10px 12px;
      text-align:center;
      cursor:pointer;
      transition:all .15s;
    }
    .estado-card:hover { border-color:var(--c-blue); }
    .estado-card--active { border-color:var(--c-blue); background:var(--c-blue-lt); }
    .estado-label { display:block; font-size:11px; color:var(--c-muted); margin-bottom:4px; }
    .estado-count { display:block; font-size:22px; font-weight:700; }

    /* SLA summary */
    .sla-summary {
      display:flex; gap:10px; flex-wrap:wrap;
      margin-bottom:18px;
    }
    .sla-pill {
      display:flex; align-items:center; gap:6px;
      padding:5px 12px; border-radius:20px;
      border:1.5px solid; background:var(--c-surface);
      font-size:13px;
    }
    .sla-dot { width:10px; height:10px; border-radius:50%; flex-shrink:0; }

    /* Cards */
    .ticket-list { display:flex; flex-direction:column; gap:12px; }
    .ticket-card {
      background:var(--c-surface);
      border:1px solid var(--c-border);
      border-radius:var(--radius-lg);
      padding:14px 16px;
      border-left:4px solid var(--c-border);
    }
    .card--rojo    { border-left-color:#EF4444; background:#fff5f5; }
    .card--amarillo{ border-left-color:#F59E0B; background:#fffbea; }

    .card-header { margin-bottom:10px; }
    .card-folio-row { display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:6px; }
    .folio { font-family:monospace; font-weight:700; color:var(--c-blue); font-size:14px; }
    .card-desc { font-size:13px; color:var(--c-muted); margin:0; }

    .estatus-badge {
      padding:2px 8px; border-radius:12px;
      font-size:11px; font-weight:600;
      background:var(--c-bg); border:1px solid var(--c-border);
    }
    .estatus--programado_visita { background:#e0f0ff; color:#1B3462; border-color:#1B3462; }
    .estatus--en_visita         { background:#fff3e0; color:#E65100; border-color:#E65100; }
    .estatus--esperando_pieza   { background:#fff8e1; color:#F57F17; border-color:#F57F17; }
    .estatus--resuelto          { background:#e8f5e9; color:#00A878; border-color:#00A878; }

    .prio { font-size:11px; font-weight:700; }
    .prio--CRITICA { color:#EF4444; }
    .prio--ALTA    { color:#F59E0B; }
    .prio--MEDIA   { color:#64748B; }
    .prio--BAJA    { color:#94A3B8; }

    .sla-circle {
      display:inline-flex; align-items:center; justify-content:center;
      width:36px; height:36px; border-radius:50%;
      font-size:9px; font-weight:700; color:white;
      flex-shrink:0;
    }

    .card-info {
      display:grid; grid-template-columns:repeat(auto-fill, minmax(160px, 1fr));
      gap:8px;
    }
    .info-item { display:flex; flex-direction:column; gap:1px; }
    .info-item--highlight { background:#e8f4ff; padding:4px 8px; border-radius:6px; }
    .info-item--warn      { background:#fff3e0; padding:4px 8px; border-radius:6px; }
    .info-label { font-size:10px; color:var(--c-muted); text-transform:uppercase; letter-spacing:.04em; }
    .info-val   { font-size:12px; font-weight:500; }

    .loading-msg { text-align:center; padding:40px; color:var(--c-muted); }
  `],
})
export class CoordinadorDashboardComponent implements OnInit {

  tickets  = signal<TicketMantto[]>([]);
  loading  = signal(true);
  filtroEstatus = signal('');

  // Conteos por estado para los chips
  estadoConteos = computed(() => {
    const ts = this.tickets();
    const estados = [
      { key: 'PROGRAMADO_VISITA', label: '📅 Programada',    color: '#1B3462' },
      { key: 'EN_VISITA',         label: '🔧 En visita',     color: '#E65100' },
      { key: 'ESPERANDO_PIEZA',   label: '⏳ Pieza',          color: '#F57F17' },
      { key: 'EN_PROCESO',        label: 'En proceso',       color: '#64748B' },
      { key: 'RESUELTO',          label: '✅ Resuelto',       color: '#00A878' },
    ];
    return estados.map(e => ({ ...e, count: ts.filter(t => t.estatus === e.key).length }));
  });

  slaSummary = computed(() => {
    const ts = this.tickets().filter(t =>
      !['RESUELTO','CERRADO','CANCELADO'].includes(t.estatus)
    );
    return [
      { status: 'ROJO'    as SlaStatus, label: '🔴 Vencido',  color: '#EF4444', count: ts.filter(t => t.sla_status === 'ROJO').length },
      { status: 'AMARILLO'as SlaStatus, label: '🟡 En riesgo', color: '#F59E0B', count: ts.filter(t => t.sla_status === 'AMARILLO').length },
      { status: 'VERDE'   as SlaStatus, label: '🟢 En tiempo', color: '#00A878', count: ts.filter(t => t.sla_status === 'VERDE').length },
      { status: 'SIN_SLA' as SlaStatus, label: '⚪ Sin SLA',   color: '#94A3B8', count: ts.filter(t => t.sla_status === 'SIN_SLA').length },
    ];
  });

  ticketsFiltrados = computed(() => {
    let ts = this.tickets();
    const f = this.filtroEstatus();
    if (f) ts = ts.filter(t => t.estatus === f);
    // Ordenar: ROJO primero, luego AMARILLO, luego por fecha
    const slaOrd: Record<string, number> = { ROJO:0, AMARILLO:1, VERDE:2, SIN_SLA:3 };
    return ts.sort((a, b) =>
      (slaOrd[a.sla_status] ?? 3) - (slaOrd[b.sla_status] ?? 3)
    );
  });

  constructor(
    private http: HttpClient,
    public auth: AuthService,
  ) {}

  ngOnInit() { this.load(); }

  load() {
    this.loading.set(true);
    const token = this.auth.token();
    const headers = new HttpHeaders({ Authorization: `Bearer ${token}` });
    this.http.get<TicketMantto[]>('/api/v1/coordinador/tickets', { headers }).subscribe({
      next: ts => { this.tickets.set(ts); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  estatusLabel(estatus: string): string {
    return ESTATUS_LABEL[estatus] ?? estatus;
  }

  slaColor(status: SlaStatus): string {
    return SLA_COLORS[status] ?? '#94A3B8';
  }
}
