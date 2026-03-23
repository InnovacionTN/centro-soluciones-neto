import { Component, OnInit, OnDestroy, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { interval, Subscription } from 'rxjs';
import { TicketService } from '../../core/services/ticket.service';
import { AuthService } from '../../core/services/auth.service';
import { NavbarComponent } from '../../shared/components/navbar.component';
import { StatusBadgeComponent } from '../../shared/components/status-badge.component';
import { TicketListItem } from '../../core/models';

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
            <span class="text-sm text-muted">
              Actualiza en {{ countdown() }}s
            </span>
            <button class="btn btn--ghost btn--sm" (click)="load()">
              ↻ Refrescar
            </button>
          </div>
        </div>

        <!-- KPIs -->
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
            <span class="kpi-label">SLA vencido</span>
          </div>
          <div class="kpi-card kpi-card--green">
            <span class="kpi-val kpi-val--green">{{ counts().cerrados_hoy }}</span>
            <span class="kpi-label">Cerrados hoy</span>
          </div>
        </div>

        <!-- Filters -->
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
            <select
              class="input filter-select"
              [(ngModel)]="filtroPrioridad"
              (change)="applyFilters()"
            >
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
            <div class="ticket-thead">
              <span>Folio</span>
              <span>Descripción</span>
              <span>Tienda</span>
              <span>Área</span>
              <span>Prioridad</span>
              <span>Estado</span>
              <span>SLA</span>
              <span>Fecha</span>
            </div>

            @for (t of ticketsMostrados(); track t.id) {
              <a
                class="ticket-row"
                [class.ticket-row--critica]="t.prioridad === 'CRITICA'"
                [class.ticket-row--vencido]="t.sla_vencido"
                [routerLink]="['/agente/ticket', t.id]"
              >
                <span class="folio">{{ t.folio }}</span>

                <span class="desc truncate">{{ t.descripcion }}</span>

                <span class="text-sm">#{{ t.tienda_id }}</span>

                <span>
                  @if (t.tipificacion) {
                    <span class="badge badge--gray text-sm">
                      {{ t.tipificacion.area_tecnica }}
                    </span>
                  }
                </span>

                <span class="prio" [class]="'prio--' + t.prioridad">
                  {{ t.prioridad }}
                </span>

                <app-status-badge [status]="t.estatus" />

                <span [class.sla-vencido]="t.sla_vencido" class="text-sm">
                  @if (t.sla_limite) {
                    {{ t.sla_limite | date:'dd/MM HH:mm' }}
                  } @else {
                    —
                  }
                  @if (t.sla_vencido) { ⚠ }
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
    .page { display: flex; flex-direction: column; min-height: 100vh; }
    .top-bar {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 20px;
    }
    .page-title { font-size: 22px; font-weight: 600; }
    .page-sub   { font-size: 13px; color: var(--c-muted); margin-top: 2px; }

    .kpi-row {
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      gap: 12px;
      margin-bottom: 20px;
    }
    @media (max-width: 900px) { .kpi-row { grid-template-columns: repeat(3, 1fr); } }
    @media (max-width: 600px) { .kpi-row { grid-template-columns: repeat(2, 1fr); } }

    .kpi-card {
      background: var(--c-surface);
      border: 1px solid var(--c-border);
      border-radius: var(--radius-md);
      padding: 14px 16px;
    }
    .kpi-card--amber { border-top: 3px solid var(--c-amber); }
    .kpi-card--red   { border-top: 3px solid var(--c-red);   }
    .kpi-card--green { border-top: 3px solid var(--c-green); }
    .kpi-val   { display: block; font-size: 26px; font-weight: 700; line-height: 1.2; }
    .kpi-val--red   { color: var(--c-red);   }
    .kpi-val--amber { color: var(--c-amber); }
    .kpi-val--green { color: var(--c-green); }
    .kpi-label { font-size: 12px; color: var(--c-muted); }

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
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 5px 13px;
      border-radius: 20px;
      font-size: 13px;
      border: 1px solid var(--c-border);
      background: var(--c-surface);
      color: var(--c-muted);
      transition: all var(--transition);
    }
    .filter-btn:hover { border-color: var(--c-blue); color: var(--c-blue); }
    .filter-btn--active {
      background: var(--c-blue-lt);
      border-color: var(--c-blue-md);
      color: var(--c-blue);
      font-weight: 500;
    }
    .filter-count {
      background: var(--c-red);
      color: white;
      font-size: 10px;
      font-weight: 700;
      min-width: 16px;
      height: 16px;
      border-radius: 8px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 0 4px;
    }
    .filter-select {
      padding: 5px 10px;
      border-radius: 20px;
      font-size: 13px;
      width: auto;
    }

    /* Table */
    .ticket-table {
      background: var(--c-surface);
      border: 1px solid var(--c-border);
      border-radius: var(--radius-lg);
      overflow: hidden;
    }
    .ticket-thead {
      display: grid;
      grid-template-columns: 120px 1fr 70px 90px 90px 130px 110px 100px;
      gap: 12px;
      padding: 10px 16px;
      background: var(--c-bg);
      border-bottom: 1px solid var(--c-border);
      font-size: 11px;
      font-weight: 600;
      color: var(--c-muted);
      text-transform: uppercase;
      letter-spacing: .04em;
    }
    .ticket-row {
      display: grid;
      grid-template-columns: 120px 1fr 70px 90px 90px 130px 110px 100px;
      gap: 12px;
      align-items: center;
      padding: 13px 16px;
      border-bottom: 1px solid var(--c-border);
      color: inherit;
      text-decoration: none;
      font-size: 13px;
      transition: background var(--transition);
    }
    .ticket-row:last-child { border-bottom: none; }
    .ticket-row:hover { background: var(--c-bg); }
    .ticket-row--critica { border-left: 3px solid var(--c-red); }
    .ticket-row--vencido { background: var(--c-red-lt); }
    .ticket-row--vencido:hover { background: #fde8e8; }

    .skeleton-row {
      display: flex;
      align-items: center;
      gap: 20px;
      padding: 16px;
      border-bottom: 1px solid var(--c-border);
    }

    .folio { font-family: monospace; font-weight: 700; color: var(--c-blue); }
    .desc  { color: var(--c-text); }
    .sla-vencido { color: var(--c-red); font-weight: 500; }

    @media (max-width: 1100px) {
      .ticket-thead,
      .ticket-row {
        grid-template-columns: 110px 1fr 90px 110px 90px;
      }
      .ticket-thead span:nth-child(3),
      .ticket-thead span:nth-child(4),
      .ticket-row > span:nth-child(3),
      .ticket-row > span:nth-child(4) { display: none; }
    }
  `],
})
export class AgenteColaComponent implements OnInit, OnDestroy {
  tickets = signal<TicketListItem[]>([]);
  loading = signal(true);
  filtroEstatus = signal('');
  soloMios = signal(false);
  filtroPrioridad = '';
  countdown = signal(30);

  private refreshSub?: Subscription;

  counts = computed(() => {
    const ts = this.tickets();
    const userId = this.auth.currentUser()?.id;
    return {
      sin_asignar: ts.filter(t => !t.agente_id && ['NUEVO', 'ASIGNADO'].includes(t.estatus)).length,
      mis_tickets: ts.filter(t => t.agente_id === userId && !['CERRADO', 'RESUELTO'].includes(t.estatus)).length,
      confirmar: ts.filter(t => t.estatus === 'ESPERANDO_TIENDA').length,
      vencidos: ts.filter(t => t.sla_vencido).length,
      cerrados_hoy: 0, // requeriría filtro por fecha
    };
  });

  ticketsMostrados = computed(() => {
    let ts = [...this.tickets()];
    const f = this.filtroEstatus();
    const userId = this.auth.currentUser()?.id;
    if (f) ts = ts.filter(t => t.estatus === f);
    if (this.soloMios()) ts = ts.filter(t => t.agente_id === userId);
    if (this.filtroPrioridad) ts = ts.filter(t => t.prioridad === this.filtroPrioridad);
    return ts.sort((a, b) =>
      (PRIORIDAD_ORDER[a.prioridad] ?? 9) - (PRIORIDAD_ORDER[b.prioridad] ?? 9)
    );
  });

  grupoNombre = computed(() => {
    const user = this.auth.currentUser();
    return user?.grupo_id ? `Grupo #${user.grupo_id}` : 'Sin grupo';
  });

  statusFilters = [
    { label: 'Todos', value: '', count: (c: any) => 0 },
    { label: 'Sin asignar', value: 'NUEVO', count: (c: any) => c.sin_asignar },
    { label: 'Abiertos', value: 'ASIGNADO', count: (c: any) => 0 },
    { label: 'En proceso', value: 'EN_PROCESO', count: (c: any) => 0 },
    { label: 'Confirmar', value: 'ESPERANDO_TIENDA', count: (c: any) => c.confirmar },
    { label: 'Vencidos', value: '__vencidos__', count: (c: any) => c.vencidos },
  ];

  constructor(
    private ticketSvc: TicketService,
    public auth: AuthService,
  ) { }

  ngOnInit() {
    this.load();
    // Auto-refresh cada 30s
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

  applyFilters() { /* reactive via computed */ }
}
