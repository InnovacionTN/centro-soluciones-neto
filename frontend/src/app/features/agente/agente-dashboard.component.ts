import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { TicketService } from '../../core/services/ticket.service';
import { AuthService } from '../../core/services/auth.service';
import { NavbarComponent } from '../../shared/components/navbar.component';
import { DashboardMetrics } from '../../core/models';

@Component({
  selector: 'app-agente-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule, NavbarComponent],
  template: `
    <div class="page">
      <app-navbar section="Dashboard" />

      <div class="content">
        <div class="top-bar">
          <div>
            <h1 class="page-title">Dashboard</h1>
            <p class="page-sub">Métricas en tiempo real · {{ now | date:'dd/MM/yyyy HH:mm' }}</p>
          </div>
          <a routerLink="/agente/cola" class="btn btn--primary">
            Ver cola de tickets →
          </a>
        </div>

        @if (loading()) {
          <div class="metrics-grid">
            @for (i of [1,2,3,4,5,6]; track i) {
              <div class="metric-card">
                <div class="skeleton" style="height:32px;width:60px;border-radius:4px;margin-bottom:8px"></div>
                <div class="skeleton" style="height:13px;width:80%;border-radius:4px"></div>
              </div>
            }
          </div>
        } @else if (metrics()) {
          <!-- Primary KPIs -->
          <div class="metrics-grid">
            <div class="metric-card metric-card--blue">
              <span class="metric-val">{{ metrics()!.total_abiertos }}</span>
              <span class="metric-label">Pendientes de tomar</span>
              <div class="metric-trend">NUEVO + ASIGNADO sin agente</div>
            </div>
            <div class="metric-card metric-card--purple">
              <span class="metric-val">{{ metrics()!.total_en_proceso }}</span>
              <span class="metric-label">En proceso</span>
              <div class="metric-trend">trabajando + resp. tienda pendiente</div>
            </div>
            <div class="metric-card metric-card--amber">
              <span class="metric-val">{{ metrics()!.total_confirmar_solucion }}</span>
              <span class="metric-label">Esperando tienda</span>
              <div class="metric-trend">solución enviada, tienda debe responder</div>
            </div>
            <div class="metric-card metric-card--green">
              <span class="metric-val">{{ metrics()!.total_cerrados_hoy }}</span>
              <span class="metric-label">Cerrados hoy</span>
              <div class="metric-trend">resoluciones del día</div>
            </div>
            <div class="metric-card" [class.metric-card--red]="metrics()!.total_vencidos > 0">
              <span class="metric-val" [class.val-red]="metrics()!.total_vencidos > 0">
                {{ metrics()!.total_vencidos }}
              </span>
              <span class="metric-label">SLA Vencidos</span>
              <div class="metric-trend">requieren atención urgente</div>
            </div>
            <div class="metric-card metric-card--teal">
              <span class="metric-val">
                {{ metrics()!.tasa_ia_aceptada !== null
                    ? (metrics()!.tasa_ia_aceptada! | number:'1.0-0') + '%'
                    : '—' }}
              </span>
              <span class="metric-label">IA aceptada</span>
              <div class="metric-trend">clasificaciones sin ajuste</div>
            </div>
          </div>

          <!-- Secondary row -->
          <div class="secondary-row">

            <!-- Tickets por área -->
            <div class="card chart-card">
              <h3 class="chart-title">Tickets abiertos por área</h3>
              @if (areaEntries().length > 0) {
                <div class="bar-list">
                  @for (item of areaEntries(); track item.key) {
                    <div class="bar-item">
                      <span class="bar-label">{{ item.key }}</span>
                      <div class="bar-track">
                        <div
                          class="bar-fill"
                          [style.width.%]="barPct(item.val)"
                          [class]="'bar-fill--' + areaColor(item.key)"
                        ></div>
                      </div>
                      <span class="bar-val">{{ item.val }}</span>
                    </div>
                  }
                </div>
              } @else {
                <div class="empty"><p class="empty__desc">Sin datos de área</p></div>
              }
            </div>

            <!-- Tickets por prioridad -->
            <div class="card chart-card">
              <h3 class="chart-title">Distribución por prioridad</h3>
              <div class="donut-wrap">
                @for (item of prioEntries(); track item.key) {
                  <div class="prio-row">
                    <span class="prio" [class]="'prio--' + item.key">{{ item.key }}</span>
                    <div class="bar-track flex-1">
                      <div
                        class="bar-fill"
                        [class]="'bar-fill--' + item.key.toLowerCase()"
                        [style.width.%]="prioPct(item.val)"
                      ></div>
                    </div>
                    <span class="bar-val">{{ item.val }}</span>
                  </div>
                }
              </div>
            </div>

            <!-- Tiempo promedio -->
            <div class="card metric-highlight">
              <div class="highlight-icon">⏱</div>
              <div class="highlight-val">
                @if (metrics()!.tiempo_promedio_resolucion_horas !== null) {
                  {{ metrics()!.tiempo_promedio_resolucion_horas | number:'1.1-1' }}
                  <span class="highlight-unit">horas</span>
                } @else {
                  <span style="font-size:18px;color:var(--c-muted)">Sin datos</span>
                }
              </div>
              <div class="highlight-label">Tiempo promedio de resolución</div>
              <div class="highlight-sub">basado en tickets cerrados</div>
            </div>
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
      margin-bottom: 24px;
    }
    .page-title { font-size: 22px; font-weight: 600; }
    .page-sub   { font-size: 13px; color: var(--c-muted); margin-top: 2px; }

    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(6, 1fr);
      gap: 12px;
      margin-bottom: 20px;
    }
    @media (max-width: 1100px) { .metrics-grid { grid-template-columns: repeat(3,1fr); } }
    @media (max-width: 640px)  { .metrics-grid { grid-template-columns: repeat(2,1fr); } }

    .metric-card {
      background: var(--c-surface);
      border: 1px solid var(--c-border);
      border-radius: var(--radius-md);
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .metric-card--blue   { border-top: 3px solid var(--c-blue);   }
    .metric-card--purple { border-top: 3px solid var(--c-purple); }
    .metric-card--amber  { border-top: 3px solid var(--c-amber);  }
    .metric-card--green  { border-top: 3px solid var(--c-green);  }
    .metric-card--red    { border-top: 3px solid var(--c-red);    }
    .metric-card--teal   { border-top: 3px solid var(--c-teal);   }

    .metric-val   { font-size: 30px; font-weight: 700; line-height: 1.1; }
    .metric-label { font-size: 13px; font-weight: 500; }
    .metric-trend { font-size: 11px; color: var(--c-muted); }
    .val-red      { color: var(--c-red); }

    .secondary-row {
      display: grid;
      grid-template-columns: 1fr 1fr 260px;
      gap: 16px;
      align-items: start;
    }
    @media (max-width: 1000px) { .secondary-row { grid-template-columns: 1fr 1fr; } }
    @media (max-width: 700px)  { .secondary-row { grid-template-columns: 1fr; } }

    .chart-card { padding: 20px; }
    .chart-title { font-size: 14px; font-weight: 600; margin-bottom: 16px; }

    .bar-list { display: flex; flex-direction: column; gap: 10px; }
    .bar-item, .prio-row {
      display: grid;
      grid-template-columns: 120px 1fr 32px;
      gap: 10px;
      align-items: center;
    }
    .bar-label { font-size: 12px; color: var(--c-muted); }
    .bar-track {
      height: 8px;
      background: var(--c-bg);
      border-radius: 4px;
      overflow: hidden;
    }
    .flex-1 { flex: 1; }
    .bar-fill {
      height: 100%;
      border-radius: 4px;
      transition: width .6s ease;
    }
    .bar-fill--abasto       { background: var(--c-blue);   }
    .bar-fill--sistemas     { background: var(--c-purple); }
    .bar-fill--mantenimiento{ background: var(--c-green);  }
    .bar-fill--finanzas     { background: var(--c-amber);  }
    .bar-fill--comercial    { background: var(--c-teal);   }
    .bar-fill--sin_area     { background: var(--c-muted);  }
    .bar-fill--critica      { background: var(--c-red);    }
    .bar-fill--alta         { background: var(--c-amber);  }
    .bar-fill--media        { background: var(--c-blue);   }
    .bar-fill--baja         { background: var(--c-muted);  }
    .bar-val { font-size: 13px; font-weight: 600; text-align: right; }

    .metric-highlight {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: 28px 20px;
      gap: 6px;
    }
    .highlight-icon  { font-size: 28px; }
    .highlight-val   { font-size: 36px; font-weight: 700; line-height: 1.1; }
    .highlight-unit  { font-size: 18px; font-weight: 400; color: var(--c-muted); }
    .highlight-label { font-size: 14px; font-weight: 500; }
    .highlight-sub   { font-size: 12px; color: var(--c-muted); }
  `],
})
export class AgenteDashboardComponent implements OnInit {
  metrics = signal<DashboardMetrics | null>(null);
  loading = signal(true);
  now = new Date();

  areaEntries = () =>
    Object.entries(this.metrics()?.por_area ?? {})
      .map(([key, val]) => ({ key, val }))
      .sort((a, b) => b.val - a.val);

  prioEntries = () =>
    ['CRITICA', 'ALTA', 'MEDIA', 'BAJA']
      .map(key => ({ key, val: this.metrics()?.por_prioridad?.[key] ?? 0 }))
      .filter(e => e.val > 0);

  maxArea = () => Math.max(1, ...this.areaEntries().map(e => e.val));
  maxPrio = () => Math.max(1, ...this.prioEntries().map(e => e.val));

  barPct(val: number) { return Math.round((val / this.maxArea()) * 100); }
  prioPct(val: number) { return Math.round((val / this.maxPrio()) * 100); }

  areaColor(area: string) {
    const map: Record<string, string> = {
      ABASTO: 'abasto', SISTEMAS: 'sistemas', MANTENIMIENTO: 'mantenimiento',
      FINANZAS: 'finanzas', COMERCIAL: 'comercial',
    };
    return map[area] ?? 'sin_area';
  }

  constructor(
    private ticketSvc: TicketService,
    public auth: AuthService,
  ) { }

  ngOnInit() {
    this.ticketSvc.dashboard().subscribe({
      next: m => { this.metrics.set(m); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }
}