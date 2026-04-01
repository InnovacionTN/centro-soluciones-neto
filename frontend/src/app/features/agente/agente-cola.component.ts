import { Component, OnInit, OnDestroy, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { interval, Subscription } from 'rxjs';
import { TicketService } from '../../core/services/ticket.service';
import { AuthService } from '../../core/services/auth.service';
import { NavbarComponent } from '../../shared/components/navbar.component';
import { StatusBadgeComponent } from '../../shared/components/status-badge.component';
import { TicketListItem, SlaStatus, slaStatusColor, origenIcon } from '../../core/models';

const PRIORIDAD_ORDER: Record<string, number> = {
  CRITICA: 0, ALTA: 1, MEDIA: 2, BAJA: 3,
};

@Component({
  selector: 'app-agente-cola',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, NavbarComponent, StatusBadgeComponent],
  template: `
    <div class="page">
      <app-navbar section="Call Center" />

      <div class="content content--wide">

        <!-- Top bar -->
        <div class="top-bar">
          <div>
            <h1 class="page-title">Cola de tickets</h1>
            <p class="page-sub">
              {{ auth.currentUser()?.nombre }} ·
              Grupo: {{ grupoNombre() }}
            </p>
          </div>
          <div class="flex items-center gap-3">
            <span class="text-sm text-muted">Actualiza en {{ countdown() }}s</span>
            <button class="btn btn--ghost btn--sm" (click)="load()">↻ Refrescar</button>
          </div>
        </div>

        <!-- KPIs — Sprint 1: agregamos SIN_SLA -->
        <div class="kpi-row">
          <div class="kpi-card">
            <span class="kpi-val kpi-val--red">{{ counts().sin_asignar }}</span>
            <span class="kpi-label">Sin asignar</span>
          </div>
          <div class="kpi-card">
            <span class="kpi-val">{{ counts().mis_tickets }}</span>
            <span class="kpi-label">Mis tickets activos</span>
          </div>
          <div class="kpi-card kpi-card--amber">
            <span class="kpi-val kpi-val--amber">{{ counts().confirmar }}</span>
            <span class="kpi-label">Por confirmar</span>
          </div>
          <div class="kpi-card kpi-card--red">
            <span class="kpi-val kpi-val--red">{{ counts().vencidos }}</span>
            <span class="kpi-label">SLA vencido 🔴</span>
          </div>
          <!-- NUEVO Sprint 1: alertas por semáforo -->
          <div class="kpi-card kpi-card--amber">
            <span class="kpi-val kpi-val--amber">{{ counts().amarillo }}</span>
            <span class="kpi-label">SLA en riesgo 🟡</span>
          </div>
          <div class="kpi-card kpi-card--gray">
            <span class="kpi-val kpi-val--gray">{{ counts().sin_sla }}</span>
            <span class="kpi-label">Sin SLA</span>
          </div>
          <div class="kpi-card kpi-card--green">
            <span class="kpi-val kpi-val--green">{{ counts().cerrados_hoy }}</span>
            <span class="kpi-label">Cerrados hoy</span>
          </div>
        </div>

        <!-- Buscador -->
        <div class="search-bar">
          <span class="search-icon">🔍</span>
          <input
            class="search-input"
            type="text"
            placeholder="Buscar por folio, descripción, tienda, categoría..."
            [(ngModel)]="busqueda"
          />
          @if (busqueda) {
            <button class="search-clear" (click)="busqueda = ''">✕</button>
          }
        </div>

        <div class="filter-row">
          <div class="filter-group">
            @for (f of statusFilters; track f.value) {
              <button
                class="filter-btn"
                [class.filter-btn--active]="filtroEstatus() === f.value"
                (click)="filtroEstatus.set(f.value)"
              >
                {{ f.label }}
                @if (f.count(counts()) > 0) {
                  <span class="filter-count">{{ f.count(counts()) }}</span>
                }
              </button>
            }
          </div>

          <div class="filter-group">
            <button
              class="filter-btn"
              [class.filter-btn--active]="soloMios()"
              (click)="soloMios.set(!soloMios())"
            >
              Solo los míos
            </button>
            <!-- NUEVO Sprint 1: filtro por semáforo SLA -->
            <select class="input filter-select" [(ngModel)]="filtroSla" (change)="applyFilters()">
              <option value="">Todos los SLA</option>
              <option value="ROJO">🔴 Vencido</option>
              <option value="AMARILLO">🟡 En riesgo</option>
              <option value="VERDE">🟢 En tiempo</option>
              <option value="SIN_SLA">⚪ Sin SLA</option>
            </select>
            <select class="input filter-select" [(ngModel)]="filtroPrioridad" (change)="applyFilters()">
              <option value="">Todas las prioridades</option>
              <option value="CRITICA">Crítica</option>
              <option value="ALTA">Alta</option>
              <option value="MEDIA">Media</option>
              <option value="BAJA">Baja</option>
            </select>
          </div>
        </div>

        <!-- Ticket table -->
        @if (loading()) {
          <div class="ticket-table">
            @for (i of [1,2,3,4,5]; track i) {
              <div class="ticket-row skeleton-row">
                <div class="skeleton" style="height:13px;width:100px;border-radius:4px"></div>
                <div class="skeleton" style="height:13px;width:55%;border-radius:4px"></div>
                <div class="skeleton" style="height:13px;width:80px;border-radius:4px"></div>
              </div>
            }
          </div>
        } @else if (ticketsMostrados().length === 0) {
          <div class="empty">
            <div class="empty__icon">🎉</div>
            <p class="empty__title">Cola vacía</p>
            <p class="empty__desc">No hay tickets con los filtros actuales.</p>
          </div>
        } @else {
          <div class="ticket-table">
            <!-- NUEVO Sprint 1: columna SLA semáforo + tipificación 3 niveles -->
            <div class="ticket-thead">
              <span></span><!-- semáforo -->
              <span>Folio</span>
              <span>Tipificación</span>
              <span>Tienda</span>
              <span>Prioridad</span>
              <span>Estado</span>
              <span>SLA límite</span>
              <span>Origen</span>
              <span>Fecha</span>
            </div>

            @for (t of ticketsMostrados(); track t.id) {
              <a
                class="ticket-row"
                [class.ticket-row--critica]="t.prioridad === 'CRITICA'"
                [class.ticket-row--rojo]="t.sla_status === 'ROJO'"
                [class.ticket-row--amarillo]="t.sla_status === 'AMARILLO'"
                [routerLink]="['/agente/ticket', t.id]"
              >
                <!-- NUEVO Sprint 1: barra de semáforo SLA -->
                <span class="sla-dot" [style.background]="slaColor(t.sla_status)" [title]="t.sla_status"></span>

                <span class="folio">{{ t.folio }}</span>

                <!-- NUEVO Sprint 1: 3 niveles de tipificación -->
                <span class="tip-cell">
                  @if (t.cat_nivel1) {
                    <span class="tip-l1">{{ t.cat_nivel1 }}</span>
                    @if (t.cat_nivel2) {
                      <span class="tip-l2">{{ t.cat_nivel2 }}</span>
                    }
                    @if (t.cat_nivel3) {
                      <span class="tip-l3">{{ t.cat_nivel3 }}</span>
                    }
                  } @else {
                    <span class="tip-l3 text-muted">{{ t.descripcion | slice:0:60 }}…</span>
                  }
                </span>

                <span class="text-sm">#{{ t.tienda_id }}</span>

                <span class="prio" [class]="'prio--' + t.prioridad">{{ t.prioridad }}</span>

                <app-status-badge [status]="t.estatus" />

                <!-- NUEVO Sprint 1: SLA con semáforo visual -->
                <span class="sla-cell">
                  @if (t.sla_limite) {
                    <span [class]="'sla-badge sla-badge--' + t.sla_status.toLowerCase()">
                      {{ t.sla_limite | date:'dd/MM HH:mm' }}
                    </span>
                  } @else {
                    <span class="sla-badge sla-badge--sin_sla">Sin SLA</span>
                  }
                </span>

                <!-- NUEVO Sprint 1: origen del ticket -->
                <span class="text-sm" [title]="t.origen">
                  {{ origenEmoji(t.origen) }}
                </span>

                <span class="text-sm text-muted">
                  {{ t.fecha_apertura | date:'dd/MM HH:mm' }}
                </span>
              </a>
            }
          </div>
        }
      </div>
    </div>
  `,
  styles: [`
    .top-bar {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 20px;
    }
    .page-title { font-size: 22px; font-weight: 600; }
    .page-sub   { font-size: 13px; color: var(--c-muted); margin-top: 2px; }

    /* SPRINT 1: 7 KPIs en lugar de 5 */
    .kpi-row {
      display: grid;
      grid-template-columns: repeat(7, 1fr);
      gap: 10px;
      margin-bottom: 20px;
    }
    @media (max-width: 1100px) { .kpi-row { grid-template-columns: repeat(4, 1fr); } }
    @media (max-width: 700px)  { .kpi-row { grid-template-columns: repeat(2, 1fr); } }

    .kpi-card {
      background: var(--c-surface);
      border: 1px solid var(--c-border);
      border-radius: var(--radius-md);
      padding: 12px 14px;
    }
    .kpi-card--amber { border-top: 3px solid var(--c-amber); }
    .kpi-card--red   { border-top: 3px solid var(--c-red);   }
    .kpi-card--green { border-top: 3px solid var(--c-green); }
    .kpi-card--gray  { border-top: 3px solid var(--c-muted); }
    .kpi-val   { display: block; font-size: 24px; font-weight: 700; line-height: 1.2; }
    .kpi-val--red   { color: var(--c-red);   }
    .kpi-val--amber { color: var(--c-amber); }
    .kpi-val--green { color: var(--c-green); }
    .kpi-val--gray  { color: var(--c-muted); }
    .kpi-label { font-size: 11px; color: var(--c-muted); }

    .search-bar {
      display: flex;
      align-items: center;
      gap: 8px;
      background: var(--c-surface);
      border: 1.5px solid var(--c-border);
      border-radius: 8px;
      padding: 0 12px;
      margin-bottom: 12px;
    }
    .search-bar:focus-within { border-color: var(--c-blue); }
    .search-icon { font-size: 14px; opacity: .5; }
    .search-input {
      flex: 1; border: none; outline: none; background: transparent;
      font-size: 13px; padding: 10px 0; color: var(--c-text);
    }
    .search-clear { background: none; border: none; cursor: pointer; color: var(--c-muted); font-size: 13px; }

    .filter-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      margin-bottom: 16px;
      flex-wrap: wrap;
    }
    .filter-group { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
    .filter-btn {
      display: inline-flex; align-items: center; gap: 5px;
      padding: 5px 13px; border-radius: 20px; font-size: 13px;
      border: 1px solid var(--c-border); background: var(--c-surface); color: var(--c-muted);
    }
    .filter-btn:hover { border-color: var(--c-blue); color: var(--c-blue); }
    .filter-btn--active {
      background: var(--c-blue-lt); border-color: var(--c-blue-md);
      color: var(--c-blue); font-weight: 500;
    }
    .filter-count {
      background: var(--c-red); color: white; font-size: 10px; font-weight: 700;
      min-width: 16px; height: 16px; border-radius: 8px;
      display: inline-flex; align-items: center; justify-content: center; padding: 0 4px;
    }
    .filter-select { padding: 5px 10px; border-radius: 20px; font-size: 13px; width: auto; }

    /* SPRINT 1: 9 columnas (agrega semáforo + origen, divide tipificación) */
    .ticket-table {
      background: var(--c-surface);
      border: 1px solid var(--c-border);
      border-radius: var(--radius-lg);
      overflow: hidden;
    }
    .ticket-thead {
      display: grid;
      grid-template-columns: 28px 110px 1fr 70px 80px 130px 120px 36px 90px;
      gap: 10px;
      padding: 10px 16px;
      background: var(--c-bg);
      border-bottom: 1px solid var(--c-border);
      font-size: 11px; font-weight: 600; color: var(--c-muted);
      text-transform: uppercase; letter-spacing: .04em;
    }
    .ticket-row {
      display: grid;
      grid-template-columns: 28px 110px 1fr 70px 80px 130px 120px 36px 90px;
      gap: 10px;
      align-items: center;
      padding: 11px 16px;
      border-bottom: 1px solid var(--c-border);
      color: inherit; text-decoration: none; font-size: 13px;
      transition: background var(--transition);
    }
    .ticket-row:last-child { border-bottom: none; }
    .ticket-row:hover      { background: var(--c-bg); }
    .ticket-row--critica   { border-left: 3px solid var(--c-red); }
    .ticket-row--rojo      { background: #fff5f5; }
    .ticket-row--rojo:hover{ background: #fde8e8; }
    .ticket-row--amarillo  { background: #fffbea; }

    .skeleton-row { display: flex; align-items: center; gap: 20px; padding: 16px; border-bottom: 1px solid var(--c-border); }

    /* SPRINT 1: semáforo SLA */
    .sla-dot {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      width: 22px;
      height: 22px;
      border-radius: 50%;
      font-size: 8px;
      color: white;
      font-weight: 700;
      flex-shrink: 0;
    }

    /* SPRINT 1: tipificación 3 niveles */
    .tip-cell { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
    .tip-l1 { font-size: 12px; font-weight: 600; color: var(--c-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .tip-l2 { font-size: 11px; color: var(--c-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .tip-l3 { font-size: 10px; color: var(--c-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-style: italic; }

    /* SPRINT 1: badges de SLA */
    .sla-cell { display: flex; align-items: center; }
    .sla-badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 500;
      white-space: nowrap;
    }
    .sla-badge--verde    { background: #e6faf3; color: #00A878; border: 1px solid #00A878; }
    .sla-badge--amarillo { background: #fff8e0; color: #D97706; border: 1px solid #F59E0B; }
    .sla-badge--rojo     { background: #fef2f2; color: #DC2626; border: 1px solid #EF4444; font-weight: 700; }
    .sla-badge--sin_sla  { background: var(--c-bg); color: var(--c-muted); border: 1px solid var(--c-border); }

    .folio { font-family: monospace; font-weight: 700; color: var(--c-blue); }

    @media (max-width: 1200px) {
      .ticket-thead, .ticket-row { grid-template-columns: 28px 100px 1fr 100px 120px 100px; }
      .ticket-thead span:nth-child(4),
      .ticket-thead span:nth-child(8),
      .ticket-thead span:nth-child(9),
      .ticket-row > span:nth-child(4),
      .ticket-row > span:nth-child(8),
      .ticket-row > span:nth-child(9) { display: none; }
    }
  `],
})
export class AgenteColaComponent implements OnInit, OnDestroy {
  tickets = signal<TicketListItem[]>([]);
  loading = signal(true);
  filtroEstatus = signal('');
  soloMios = signal(false);
  filtroPrioridad = '';
  filtroSla = '';            // ← NUEVO Sprint 1
  busqueda = '';
  countdown = signal(30);

  private refreshSub?: Subscription;

  counts = computed(() => {
    const ts = this.tickets();
    const userId = this.auth.currentUser()?.id;
    const hoy = new Date().toDateString();
    const activos = ts.filter(t => !['CERRADO', 'RESUELTO', 'CANCELADO'].includes(t.estatus));
    return {
      sin_asignar: ts.filter(t => ['NUEVO', 'ASIGNADO'].includes(t.estatus) && !t.agente_id).length,
      mis_tickets: ts.filter(t => t.agente_id === userId && !['CERRADO', 'RESUELTO', 'CANCELADO'].includes(t.estatus)).length,
      en_proceso: ts.filter(t => ['EN_PROCESO', 'ESPERANDO_AGENTE'].includes(t.estatus)).length,
      confirmar: ts.filter(t => t.estatus === 'ESPERANDO_TIENDA').length,
      // NUEVO Sprint 1: semáforos
      vencidos: activos.filter(t => t.sla_status === 'ROJO').length,
      amarillo: activos.filter(t => t.sla_status === 'AMARILLO').length,
      sin_sla: activos.filter(t => t.sla_status === 'SIN_SLA').length,
      cerrados_hoy: ts.filter(t =>
        ['CERRADO', 'RESUELTO'].includes(t.estatus) &&
        t.fecha_cierre && new Date(t.fecha_cierre).toDateString() === hoy
      ).length,
    };
  });

  ticketsMostrados = computed(() => {
    let ts = [...this.tickets()];
    const f = this.filtroEstatus();
    const userId = this.auth.currentUser()?.id;

    if (f === '__sin_asignar__') {
      ts = ts.filter(t => ['NUEVO', 'ASIGNADO'].includes(t.estatus) && !t.agente_id);
    } else if (f === '__vencidos__') {
      ts = ts.filter(t => t.sla_status === 'ROJO' && !['CERRADO', 'RESUELTO', 'CANCELADO'].includes(t.estatus));
    } else if (f === 'EN_PROCESO') {
      ts = ts.filter(t => ['EN_PROCESO', 'ESPERANDO_AGENTE'].includes(t.estatus));
    } else if (f) {
      ts = ts.filter(t => t.estatus === f);
    }

    if (this.soloMios()) ts = ts.filter(t => t.agente_id === userId);
    if (this.filtroPrioridad) ts = ts.filter(t => t.prioridad === this.filtroPrioridad);
    // NUEVO Sprint 1: filtro semáforo SLA
    if (this.filtroSla) ts = ts.filter(t => t.sla_status === this.filtroSla);

    if (this.busqueda.trim()) {
      const q = this.busqueda.trim().toLowerCase();
      ts = ts.filter(t =>
        t.folio.toLowerCase().includes(q) ||
        t.descripcion.toLowerCase().includes(q) ||
        String(t.tienda_id).includes(q) ||
        (t.cat_nivel1 ?? '').toLowerCase().includes(q) ||
        (t.cat_nivel2 ?? '').toLowerCase().includes(q) ||
        (t.cat_nivel3 ?? '').toLowerCase().includes(q) ||
        (t.tipificacion?.area_tecnica ?? '').toLowerCase().includes(q)
      );
    }

    // NUEVO Sprint 1: ordenar por semáforo primero (ROJO > AMARILLO > VERDE/SIN_SLA),
    // luego por prioridad
    const slaOrder: Record<SlaStatus, number> = { ROJO: 0, AMARILLO: 1, VERDE: 2, SIN_SLA: 3 };
    return ts.sort((a, b) => {
      const slaA = slaOrder[a.sla_status] ?? 3;
      const slaB = slaOrder[b.sla_status] ?? 3;
      if (slaA !== slaB) return slaA - slaB;
      return (PRIORIDAD_ORDER[a.prioridad] ?? 9) - (PRIORIDAD_ORDER[b.prioridad] ?? 9);
    });
  });

  grupoNombre = computed(() => {
    const user = this.auth.currentUser();
    return (user as any)?.grupo_nombre ?? (user?.grupo_id ? `Grupo #${user.grupo_id}` : 'Sin grupo');
  });

  statusFilters = [
    { label: 'Todos', value: '', count: (c: any) => 0 },
    { label: 'Sin tomar', value: '__sin_asignar__', count: (c: any) => c.sin_asignar },
    { label: 'En proceso', value: 'EN_PROCESO', count: (c: any) => c.en_proceso },
    { label: 'Esp. tienda', value: 'ESPERANDO_TIENDA', count: (c: any) => c.confirmar },
    { label: '🔴 Vencidos', value: '__vencidos__', count: (c: any) => c.vencidos },
  ];

  constructor(private ticketSvc: TicketService, public auth: AuthService) { }

  ngOnInit() {
    this.load();
    this.refreshSub = interval(1000).subscribe(() => {
      const c = this.countdown() - 1;
      if (c <= 0) { this.load(); this.countdown.set(30); }
      else this.countdown.set(c);
    });
  }

  ngOnDestroy() { this.refreshSub?.unsubscribe(); }

  load() {
    this.loading.set(true);
    this.ticketSvc.list({ limit: 200 }).subscribe({
      next: ts => { this.tickets.set(ts); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  applyFilters() { /* reactive via computed signals */ }

  // NUEVO Sprint 1: color del semáforo
  slaColor(status: SlaStatus): string {
    return slaStatusColor(status);
  }

  // NUEVO Sprint 1: emoji de origen
  origenEmoji(origen: string): string {
    return origenIcon(origen as any);
  }
}