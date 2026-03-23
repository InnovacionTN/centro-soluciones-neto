import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { TicketService } from '../../core/services/ticket.service';
import { AuthService } from '../../core/services/auth.service';
import { NavbarComponent } from '../../shared/components/navbar.component';
import { StatusBadgeComponent } from '../../shared/components/status-badge.component';
import { TicketListItem, EstatusTicket } from '../../core/models';

const STATUS_FILTERS: { label: string; value: string }[] = [
  { label: 'Todos', value: '' },
  { label: 'Abiertos', value: 'ASIGNADO' },
  { label: 'En proceso', value: 'EN_PROCESO' },
  { label: 'Confirmar', value: 'ESPERANDO_TIENDA' },
  { label: 'Resueltos', value: 'RESUELTO' },
  { label: 'Cerrados', value: 'CERRADO' },
];

@Component({
  selector: 'app-tienda-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule, NavbarComponent, StatusBadgeComponent],
  template: `
    <div class="page">
      <app-navbar section="Mi tienda" />

      <div class="content">

        <!-- Bienvenida + CTA -->
        <div class="top-bar">
          <div>
            <h1 class="page-title">Mis reportes</h1>
            <p class="page-sub">Tienda #{{ auth.currentUser()?.tienda_id }}</p>
          </div>
          <a routerLink="/tienda/nuevo" class="btn btn--primary btn--lg">
            + Nuevo reporte
          </a>
        </div>

        <!-- KPI mini-cards -->
        <div class="kpi-row">
          <div class="kpi-card">
            <span class="kpi-val">{{ counts().abiertos }}</span>
            <span class="kpi-label">Abiertos</span>
          </div>
          <div class="kpi-card kpi-card--purple">
            <span class="kpi-val">{{ counts().proceso }}</span>
            <span class="kpi-label">En proceso</span>
          </div>
          <div class="kpi-card kpi-card--amber">
            <span class="kpi-val">{{ counts().confirmar }}</span>
            <span class="kpi-label">Por confirmar</span>
          </div>
          <div class="kpi-card kpi-card--green">
            <span class="kpi-val">{{ counts().resueltos }}</span>
            <span class="kpi-label">Resueltos</span>
          </div>
        </div>

        <!-- Filtro de estado -->
        <div class="filter-bar">
          @for (f of statusFilters; track f.value) {
            <button
              class="filter-btn"
              [class.filter-btn--active]="filtroActivo() === f.value"
              (click)="setFiltro(f.value)"
            >
              {{ f.label }}
            </button>
          }
        </div>

        <!-- Lista de tickets -->
        @if (loading()) {
          <div class="ticket-list">
            @for (i of [1,2,3]; track i) {
              <div class="ticket-row">
                <div class="skeleton" style="height:14px;width:90px;border-radius:4px"></div>
                <div class="skeleton" style="height:14px;width:60%;border-radius:4px"></div>
                <div class="skeleton" style="height:22px;width:80px;border-radius:10px"></div>
              </div>
            }
          </div>
        } @else if (ticketsFiltrados().length === 0) {
          <div class="empty">
            <div class="empty__icon">📭</div>
            <p class="empty__title">Sin reportes {{ filtroActivo() ? 'con este estado' : '' }}</p>
            <p class="empty__desc">
              @if (!filtroActivo()) {
                ¿Tienes un problema? Crea tu primer reporte.
              } @else {
                Prueba con otro filtro.
              }
            </p>
          </div>
        } @else {
          <div class="ticket-list">
            @for (t of ticketsFiltrados(); track t.id) {
              <a class="ticket-row" [routerLink]="['/tienda/ticket', t.id]">
                <div class="ticket-folio">{{ t.folio }}</div>

                <div class="ticket-main">
                  <p class="ticket-desc">{{ t.descripcion }}</p>
                  @if (t.tipificacion) {
                    <span class="badge badge--gray text-sm">
                      {{ t.tipificacion.area_tecnica }} · {{ t.tipificacion.categoria }}
                    </span>
                  }
                </div>

                <div class="ticket-meta">
                  <app-status-badge [status]="t.estatus" />
                  @if (t.sla_vencido) {
                    <span class="badge badge--red">⚠ Vencido</span>
                  }
                  <span class="ticket-fecha">
                    {{ t.fecha_apertura | date:'dd/MM HH:mm' }}
                  </span>
                </div>
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

    /* KPI row */
    .kpi-row {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 12px;
      margin-bottom: 24px;
    }
    @media (max-width: 600px) { .kpi-row { grid-template-columns: repeat(2, 1fr); } }
    .kpi-card {
      background: var(--c-surface);
      border: 1px solid var(--c-border);
      border-radius: var(--radius-md);
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .kpi-card--purple { border-left: 3px solid var(--c-purple); }
    .kpi-card--amber  { border-left: 3px solid var(--c-amber);  }
    .kpi-card--green  { border-left: 3px solid var(--c-green);  }
    .kpi-val   { font-size: 28px; font-weight: 700; line-height: 1; }
    .kpi-label { font-size: 12px; color: var(--c-muted); }

    /* Filter */
    .filter-bar {
      display: flex;
      gap: 6px;
      margin-bottom: 16px;
      flex-wrap: wrap;
    }
    .filter-btn {
      padding: 5px 14px;
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

    /* Ticket list */
    .ticket-list {
      display: flex;
      flex-direction: column;
      gap: 2px;
      background: var(--c-surface);
      border: 1px solid var(--c-border);
      border-radius: var(--radius-lg);
      overflow: hidden;
    }
    .ticket-row {
      display: grid;
      grid-template-columns: 120px 1fr auto;
      align-items: center;
      gap: 16px;
      padding: 14px 20px;
      border-bottom: 1px solid var(--c-border);
      transition: background var(--transition);
      color: inherit;
      text-decoration: none;
    }
    .ticket-row:last-child { border-bottom: none; }
    .ticket-row:hover { background: var(--c-bg); }
    .ticket-folio {
      font-family: monospace;
      font-size: 13px;
      font-weight: 600;
      color: var(--c-blue);
    }
    .ticket-main { min-width: 0; }
    .ticket-desc {
      font-size: 14px;
      color: var(--c-text);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      margin-bottom: 4px;
    }
    .ticket-meta {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 5px;
    }
    .ticket-fecha { font-size: 12px; color: var(--c-muted); }
    @media (max-width: 640px) {
      .ticket-row { grid-template-columns: 1fr; gap: 8px; }
      .ticket-meta { align-items: flex-start; flex-direction: row; }
    }
  `],
})
export class TiendaDashboardComponent implements OnInit {
  tickets = signal<TicketListItem[]>([]);
  loading = signal(true);
  filtroActivo = signal('');
  statusFilters = STATUS_FILTERS;

  ticketsFiltrados = () => {
    const f = this.filtroActivo();
    return f ? this.tickets().filter(t => t.estatus === f) : this.tickets();
  };

  counts = () => ({
    abiertos: this.tickets().filter(t => ['NUEVO', 'ASIGNADO'].includes(t.estatus)).length,
    proceso: this.tickets().filter(t => t.estatus === 'EN_PROCESO').length,
    confirmar: this.tickets().filter(t => t.estatus === 'ESPERANDO_TIENDA').length,
    resueltos: this.tickets().filter(t => ['RESUELTO', 'CERRADO'].includes(t.estatus)).length,
  });

  constructor(
    private ticketSvc: TicketService,
    public auth: AuthService
  ) { }

  ngOnInit() {
    this.load();
  }

  load() {
    this.loading.set(true);
    this.ticketSvc.list({ limit: 100 }).subscribe({
      next: ts => { this.tickets.set(ts); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  setFiltro(v: string) { this.filtroActivo.set(v); }
}