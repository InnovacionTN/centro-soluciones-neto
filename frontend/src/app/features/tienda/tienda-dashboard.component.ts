import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { TicketService } from '../../core/services/ticket.service';
import { AuthService } from '../../core/services/auth.service';
import { NavbarComponent } from '../../shared/components/navbar.component';
import { StatusBadgeComponent } from '../../shared/components/status-badge.component';
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
  imports: [CommonModule, RouterModule, NavbarComponent, StatusBadgeComponent],
  template: `
    <div class="page">
      <app-navbar section="Mi tienda" />

      <div class="content">

        <!-- Top bar -->
        <div class="top-bar">
          <div>
            <h1 class="page-title">Mis reportes</h1>
            <p class="page-sub">Tienda #{{ auth.currentUser()?.tienda_id }}</p>
          </div>
          <a routerLink="/tienda/nuevo" class="btn btn--primary">
            + Nuevo reporte
          </a>
        </div>

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

        <!-- Layout 2 columnas: tabla | Daby -->
        <div class="main-grid">

          <!-- Columna izquierda: tabla de tickets -->
          <div class="tickets-col">

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

          <!-- Columna derecha: Daby -->
          <aside class="daby-col">
            <div class="daby-card">

              <!-- Header -->
              <div class="daby-header">
                <div class="daby-avatar-wrap">
                  <div class="daby-avatar">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                      <path d="M12 2L14.5 9.5H22L16 14L18.5 21.5L12 17L5.5 21.5L8 14L2 9.5H9.5L12 2Z"
                        fill="white" opacity=".9"/>
                    </svg>
                  </div>
                  <span class="daby-dot"></span>
                </div>
                <div class="daby-title-wrap">
                  <div class="daby-name-row">
                    <span class="daby-name">Dany</span>
                    <span class="daby-badge">IA</span>
                  </div>
                  <span class="daby-subtitle">Asistente de tienda · Slack</span>
                </div>
                <span class="daby-online">● En línea</span>
              </div>

              <div class="daby-divider"></div>

              <!-- Descripción -->
              <p class="daby-desc">
                Hola, soy Dany. Estoy aquí para ayudarte de forma inmediata sin necesidad de abrir un reporte.
              </p>

              <!-- Capacidades -->
              <p class="daby-section-label">Puedo ayudarte con:</p>
              <ul class="daby-list">
                <li>
                  <span class="daby-list-icon">🔄</span>
                  <div>
                    <strong>Sincronizar precios</strong>
                    <span>Actualiza precios y catálogo en tu sistema</span>
                  </div>
                </li>
                <li>
                  <span class="daby-list-icon">🏷</span>
                  <div>
                    <strong>Aplicar promociones</strong>
                    <span>Activa descuentos y ofertas vigentes</span>
                  </div>
                </li>
                <li>
                  <span class="daby-list-icon">📋</span>
                  <div>
                    <strong>Info de soporte</strong>
                    <span>Consulta procedimientos y guías</span>
                  </div>
                </li>
                <li>
                  <span class="daby-list-icon">❓</span>
                  <div>
                    <strong>Dudas operativas</strong>
                    <span>Preguntas del día a día en tienda</span>
                  </div>
                </li>
              </ul>

              <div class="daby-divider"></div>

              <!-- CTA -->
              <div class="daby-cta-wrap">
                <a href="https://tiendasnetooperacion.slack.com/archives/D0ANSCLTY14" class="daby-slack-btn">
                  <svg width="18" height="18" viewBox="0 0 54 54" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M19.7 33.6a3.5 3.5 0 01-3.5 3.5 3.5 3.5 0 01-3.5-3.5 3.5 3.5 0 013.5-3.5H19.7v3.5z" fill="#E01E5A"/>
                    <path d="M21.4 33.6a3.5 3.5 0 013.5-3.5 3.5 3.5 0 013.5 3.5v8.7a3.5 3.5 0 01-3.5 3.5 3.5 3.5 0 01-3.5-3.5v-8.7z" fill="#E01E5A"/>
                    <path d="M24.9 19.7a3.5 3.5 0 01-3.5-3.5 3.5 3.5 0 013.5-3.5 3.5 3.5 0 013.5 3.5V19.7H24.9z" fill="#36C5F0"/>
                    <path d="M24.9 21.4a3.5 3.5 0 013.5 3.5 3.5 3.5 0 01-3.5 3.5h-8.7a3.5 3.5 0 01-3.5-3.5 3.5 3.5 0 013.5-3.5h8.7z" fill="#36C5F0"/>
                    <path d="M38.8 24.9a3.5 3.5 0 013.5 3.5 3.5 3.5 0 01-3.5 3.5 3.5 3.5 0 01-3.5-3.5V24.9h3.5z" fill="#2EB67D"/>
                    <path d="M37.1 24.9a3.5 3.5 0 01-3.5 3.5 3.5 3.5 0 01-3.5-3.5v-8.7a3.5 3.5 0 013.5-3.5 3.5 3.5 0 013.5 3.5v8.7z" fill="#2EB67D"/>
                    <path d="M33.6 38.8a3.5 3.5 0 013.5-3.5 3.5 3.5 0 013.5 3.5 3.5 3.5 0 01-3.5 3.5H33.6v-3.5z" fill="#ECB22E"/>
                    <path d="M33.6 37.1a3.5 3.5 0 01-3.5-3.5 3.5 3.5 0 013.5-3.5h8.7a3.5 3.5 0 013.5 3.5 3.5 3.5 0 01-3.5 3.5H33.6z" fill="#ECB22E"/>
                  </svg>
                  <span>Necesito ayuda · Háblame</span>
                </a>
              </div>

              <p class="daby-footer">
                Ganando nuevas funciones continuamente. Si tu problema es más complejo, usa el botón <strong>+ Nuevo reporte</strong>.
              </p>
            </div>
          </aside>

        </div>
      </div>
    </div>
  `,
  styles: [`
    .page { display: flex; flex-direction: column; min-height: 100vh; background: var(--c-bg); }
    .content { max-width: 1300px; margin: 0 auto; padding: 28px 24px; width: 100%; }

    /* Top bar */
    .top-bar { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; }
    .page-title { font-size: 22px; font-weight: 600; }
    .page-sub   { font-size: 13px; color: var(--c-muted); margin-top: 2px; }

    /* KPIs */
    .kpi-row {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 12px;
      margin-bottom: 24px;
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

    /* ── Main 2-col grid ── */
    .main-grid {
      display: grid;
      grid-template-columns: 1fr 300px;
      gap: 20px;
      align-items: start;
    }
    @media (max-width: 900px) {
      .main-grid { grid-template-columns: 1fr; }
      .daby-col  { order: -1; }  /* Daby arriba en mobile */
    }

    /* Columna tickets */
    .tickets-col { min-width: 0; }

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

    /* ══════════ DABY CARD ══════════ */
    .daby-col { position: sticky; top: 72px; }
    .daby-card {
      background: #FAFAFE;
      border: 1px solid #C7D2FE;
      border-radius: 16px;
      overflow: hidden;
      box-shadow: 0 2px 12px rgba(79,70,229,.08);
    }

    .daby-header {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 16px 18px 14px;
      background: linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%);
    }
    .daby-avatar-wrap { position: relative; flex-shrink: 0; }
    .daby-avatar {
      width: 44px; height: 44px;
      border-radius: 50%;
      background: rgba(255,255,255,.2);
      border: 2px solid rgba(255,255,255,.4);
      display: flex; align-items: center; justify-content: center;
    }
    .daby-dot {
      position: absolute; bottom: 0; right: 0;
      width: 11px; height: 11px;
      background: #4ADE80;
      border-radius: 50%;
      border: 2px solid white;
    }
    .daby-title-wrap { flex: 1; min-width: 0; }
    .daby-name-row { display: flex; align-items: center; gap: 7px; }
    .daby-name { font-size: 16px; font-weight: 700; color: white; }
    .daby-badge {
      font-size: 10px; font-weight: 700;
      background: rgba(255,255,255,.25);
      color: white;
      padding: 1px 7px; border-radius: 8px;
      letter-spacing: .06em;
    }
    .daby-subtitle { font-size: 11px; color: rgba(255,255,255,.75); }
    .daby-online { font-size: 11px; color: #4ADE80; font-weight: 600; white-space: nowrap; }

    .daby-divider { height: 1px; background: #E0E7FF; margin: 0; }

    .daby-desc {
      font-size: 13px; color: #3730A3; line-height: 1.5;
      padding: 14px 18px 10px;
    }
    .daby-section-label {
      font-size: 10px; font-weight: 700; text-transform: uppercase;
      letter-spacing: .07em; color: #6366F1;
      padding: 0 18px 8px;
    }

    .daby-list {
      list-style: none; padding: 0 18px; margin: 0 0 4px;
      display: flex; flex-direction: column; gap: 10px;
    }
    .daby-list li {
      display: flex; align-items: flex-start; gap: 10px;
    }
    .daby-list-icon { font-size: 16px; flex-shrink: 0; margin-top: 1px; }
    .daby-list strong { display: block; font-size: 12px; color: #312E81; font-weight: 600; }
    .daby-list span   { display: block; font-size: 11px; color: #6366F1; line-height: 1.3; }

    .daby-cta-wrap {
      margin: 14px 18px 0;
    }
    .daby-slack-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      width: 100%;
      padding: 11px 16px;
      background: #4A154B;
      color: white;
      font-size: 13px;
      font-weight: 600;
      border-radius: 10px;
      border: none;
      cursor: pointer;
      text-decoration: none;
      transition: background .15s, transform .1s;
    }
    .daby-slack-btn:hover { background: #3a1039; transform: translateY(-1px); }
    .daby-slack-btn:active { transform: translateY(0); }

    .daby-footer {
      font-size: 11px; color: #818CF8; line-height: 1.4;
      padding: 10px 18px 16px;
      text-align: center;
    }
    .daby-footer strong { color: #4F46E5; }
  `],
})
export class TiendaDashboardComponent implements OnInit {
  tickets = signal<TicketListItem[]>([]);
  loading = signal(true);
  filtroActivo = signal('');
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