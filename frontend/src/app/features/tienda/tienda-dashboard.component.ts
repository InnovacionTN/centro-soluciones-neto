import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { TicketService } from '../../core/services/ticket.service';
import { AuthService } from '../../core/services/auth.service';
import { NavbarComponent } from '../../shared/components/navbar.component';
import { StatusBadgeComponent } from '../../shared/components/status-badge.component';
import { DanyChatComponent } from './dany-chat.component';
import { TicketListItem } from '../../core/models';

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
  imports: [CommonModule, RouterModule, NavbarComponent, StatusBadgeComponent, DanyChatComponent],
  template: `
    <div class="page">
      <app-navbar section="Mi tienda" />

      <div class="t-layout">

        <!-- ── Topbar ── -->
        <header class="t-topbar">
          <div class="t-topbar-left">
            <span class="t-topbar-title">Mis reportes</span>
            <span class="t-topbar-sub">Tienda #{{ auth.currentUser()?.tienda_id }}</span>
          </div>
          <div class="t-topbar-actions">
            <a routerLink="/tienda/nuevo" class="btn btn--primary btn--sm">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Nuevo reporte
            </a>
          </div>
        </header>

        <!-- ── Body: contenido + handle + Dany ── -->
        <div class="t-body">

          <!-- Left: scrollable -->
          <div class="t-main">
            <!-- KPIs -->
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

            <!-- Filtros -->
            <div class="filter-bar">
              @for (f of statusFilters; track f.value) {
                <button
                  class="filter-btn"
                  [class.filter-btn--active]="filtroActivo() === f.value"
                  (click)="setFiltro(f.value)"
                >{{ f.label }}</button>
              }
            </div>

            <!-- Lista -->
            @if (loading()) {
              <div class="ticket-list">
                @for (i of [1,2,3]; track i) {
                  <div class="ticket-row skeleton-row">
                    <div class="skeleton" style="height:13px;width:90px;border-radius:4px"></div>
                    <div class="skeleton" style="height:13px;width:55%;border-radius:4px"></div>
                    <div class="skeleton" style="height:22px;width:80px;border-radius:10px"></div>
                  </div>
                }
              </div>
            } @else if (ticketsFiltrados().length === 0) {
              <div class="empty">
                <div class="empty__icon">📭</div>
                <p class="empty__title">Sin reportes{{ filtroActivo() ? ' con este estado' : '' }}</p>
                <p class="empty__desc">
                  @if (!filtroActivo()) { ¿Tienes un problema? Crea tu primer reporte. }
                  @else { Prueba con otro filtro. }
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
                      <span class="ticket-fecha">{{ t.fecha_apertura | date:'dd/MM HH:mm' }}</span>
                    </div>
                  </a>
                }
              </div>
            }
          </div>

          <!-- Handle Dany -->
          <button class="t-dany-handle" (click)="danyVisible.set(!danyVisible())"
            [title]="danyVisible() ? 'Ocultar Dany' : 'Mostrar Dany'">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              @if (danyVisible()) {
                <polyline points="15 18 9 12 15 6"/>
              } @else {
                <polyline points="9 18 15 12 9 6"/>
              }
            </svg>
          </button>

          <!-- Right: Dany full-height -->
          <div class="t-dany" [class.t-dany--hidden]="!danyVisible()">
            <app-dany-chat />
          </div>

        </div>
      </div>
    </div>
  `,
  styles: [`
    /* ── Layout principal ── */
    .t-layout {
      flex: 1;
      display: flex;
      flex-direction: column;
      height: 100vh;
      overflow: hidden;
      min-width: 0;
    }

    /* ── Topbar ── */
    .t-topbar {
      height: 56px;
      flex-shrink: 0;
      background: var(--c-surface);
      border-bottom: 1px solid var(--c-border);
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 28px;
      gap: 16px;
    }
    .t-topbar-left { display: flex; align-items: baseline; gap: 12px; min-width: 0; }
    .t-topbar-title { font-size: 16px; font-weight: 700; color: var(--c-text); white-space: nowrap; }
    .t-topbar-sub { font-size: 12px; color: var(--c-muted); white-space: nowrap; }
    .t-topbar-actions { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
    .btn--sm { padding: 7px 14px; font-size: 13px; }

    /* ── Body row ── */
    .t-body {
      flex: 1;
      display: flex;
      overflow: hidden;
    }
    .t-main {
      flex: 1;
      overflow-y: auto;
      padding: 24px 28px;
      min-width: 0;
    }

    /* ── Handle toggle Dany ── */
    .t-dany-handle {
      width: 24px;
      flex-shrink: 0;
      background: var(--c-blue);
      border: none;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: filter .15s;
      color: white;
      padding: 0;
    }
    .t-dany-handle:hover { filter: brightness(0.85); }

    /* ── Panel Dany ── */
    .t-dany {
      width: 380px;
      flex-shrink: 0;
      display: flex;
      flex-direction: column;
      border-left: 1px solid var(--c-border);
      transition: width .25s ease, opacity .2s ease;
      overflow: hidden;
    }
    .t-dany--hidden { width: 0; opacity: 0; border-left: none; pointer-events: none; }
    @media (max-width: 1200px) { .t-dany { width: 340px; } }
    @media (max-width: 900px) {
      .t-layout { height: 100vh; }
      .t-body { flex-direction: column; overflow: auto; }
      .t-dany-handle { display: none; }
      .t-dany { width: 100%; height: 480px; border-left: none; border-top: 1px solid var(--c-border); }
      .t-dany--hidden { width: 100%; height: 0; }
    }

    /* KPIs */
    .kpi-row {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 12px;
      margin-bottom: 20px;
    }
    .kpi-card {
      background: var(--c-surface);
      border: 1px solid var(--c-border);
      border-radius: var(--radius-md);
      padding: 14px 16px;
      display: flex; flex-direction: column; gap: 4px;
    }
    .kpi-card--purple { border-top: 3px solid var(--c-purple); }
    .kpi-card--amber  { border-top: 3px solid var(--c-amber); }
    .kpi-card--green  { border-top: 3px solid var(--c-green); }
    .kpi-val   { font-size: 28px; font-weight: 600; line-height: 1; }
    .kpi-label { font-size: 12px; color: var(--c-muted); }
    @media (max-width: 600px) { .kpi-row { grid-template-columns: repeat(2, 1fr); } }

    /* Filtros */
    .filter-bar { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 12px; }
    .filter-btn {
      padding: 5px 14px; border-radius: 20px; border: 1px solid var(--c-border);
      font-size: 12px; font-weight: 500; background: var(--c-surface);
      color: var(--c-muted); cursor: pointer; transition: all .15s;
    }
    .filter-btn:hover { border-color: var(--c-blue); color: var(--c-blue); }
    .filter-btn--active { background: var(--c-blue-lt); border-color: var(--c-blue); color: var(--c-blue); }

    /* Ticket list */
    .ticket-list {
      background: var(--c-surface);
      border: 1px solid var(--c-border);
      border-radius: var(--radius-md);
      overflow: hidden;
    }
    .ticket-row {
      display: grid;
      grid-template-columns: 130px 1fr auto;
      gap: 12px;
      align-items: center;
      padding: 13px 16px;
      border-bottom: 1px solid var(--c-border);
      text-decoration: none;
      color: inherit;
      transition: background .12s;
    }
    .skeleton-row { pointer-events: none; }
    .ticket-row:last-child { border-bottom: none; }
    .ticket-row:hover { background: var(--c-blue-lt); }
    .ticket-folio { font-size: 12px; font-weight: 600; color: var(--c-blue); font-family: monospace; }
    .ticket-main { min-width: 0; }
    .ticket-desc { font-size: 13px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-bottom: 3px; }
    .ticket-meta { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; }
    .ticket-fecha { font-size: 11px; color: var(--c-muted); }
    @media (max-width: 640px) {
      .ticket-row { grid-template-columns: 1fr; gap: 6px; }
      .ticket-meta { align-items: flex-start; flex-direction: row; flex-wrap: wrap; }
    }

    /* Empty */
    .empty { padding: 48px 24px; text-align: center; }
    .empty__icon  { font-size: 36px; margin-bottom: 12px; }
    .empty__title { font-size: 15px; font-weight: 500; margin-bottom: 4px; }
    .empty__desc  { font-size: 13px; color: var(--c-muted); }

    /* Skeleton */
    .skeleton { background: var(--c-border); animation: pulse 1.5s infinite; }
    @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }

  `],
})
export class TiendaDashboardComponent implements OnInit {
  tickets = signal<TicketListItem[]>([]);
  loading = signal(true);
  filtroActivo = signal('');
  danyVisible = signal(true);
  statusFilters = STATUS_FILTERS;

  counts = computed(() => {
    const ts = this.tickets();
    return {
      abiertos: ts.filter(t => ['NUEVO', 'ASIGNADO'].includes(t.estatus)).length,
      proceso: ts.filter(t => ['EN_PROCESO', 'ESPERANDO_AGENTE'].includes(t.estatus)).length,
      confirmar: ts.filter(t => t.estatus === 'ESPERANDO_TIENDA').length,
      resueltos: ts.filter(t => ['RESUELTO', 'CERRADO'].includes(t.estatus)).length,
    };
  });

  ticketsFiltrados = computed(() => {
    const f = this.filtroActivo();
    return f ? this.tickets().filter(t => t.estatus === f) : this.tickets();
  });

  constructor(
    private ticketSvc: TicketService,
    public auth: AuthService,
  ) { }

  ngOnInit() {
    this.ticketSvc.list().subscribe({
      next: ts => { this.tickets.set(ts); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  setFiltro(v: string) { this.filtroActivo.set(v); }
}