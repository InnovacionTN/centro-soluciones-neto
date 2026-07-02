import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminService, KpiAgente } from '../../core/services/admin.service';

@Component({
  selector: 'app-admin-kpis',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="admin-section">
      <div class="section-bar">
        <h2 class="section-title">KPIs por agente</h2>
        <button class="btn btn--ghost btn--sm" (click)="load()">↻ Actualizar</button>
      </div>

      <!-- Filtros de fecha -->
      <div class="filter-row">
        <div class="field" style="flex:0 0 auto">
          <label class="field__label">Desde</label>
          <input class="input" type="date" [(ngModel)]="desde" style="width:140px" />
        </div>
        <div class="field" style="flex:0 0 auto">
          <label class="field__label">Hasta</label>
          <input class="input" type="date" [(ngModel)]="hasta" style="width:140px" />
        </div>
        <button class="btn btn--primary btn--sm" style="margin-top:20px" (click)="load()">
          Filtrar
        </button>
      </div>

      <!-- Tarjetas resumen -->
      @if (!loading() && kpis().length > 0) {
        <div class="kpi-grid">
          <div class="kpi-card">
            <div class="kpi-val">{{ totalCerrados() }}</div>
            <div class="kpi-lbl">Tickets cerrados</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-val">{{ totalActivos() }}</div>
            <div class="kpi-lbl">En proceso ahora</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-val" [class.kpi-val--green]="csatGlobal() && csatGlobal()! >= 4">
              {{ csatGlobal() ? csatGlobal()!.toFixed(1) + ' ★' : '—' }}
            </div>
            <div class="kpi-lbl">CSAT promedio</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-val">{{ slaGlobal() ? slaGlobal()!.toFixed(0) + '%' : '—' }}</div>
            <div class="kpi-lbl">SLA cumplido</div>
          </div>
        </div>
      }

      @if (loading()) {
        <div class="loading-msg">Calculando KPIs...</div>
      } @else if (kpis().length === 0) {
        <div class="loading-msg">No hay datos en el período seleccionado.</div>
      } @else {
        <div class="admin-table">
          <div class="table-head-kpi">
            <span>Agente</span>
            <span>Grupo</span>
            <span style="text-align:center">Cerrados</span>
            <span style="text-align:center">Activos</span>
            <span style="text-align:center">Tiempo prom.</span>
            <span style="text-align:center">SLA %</span>
            <span style="text-align:center">CSAT</span>
            <span style="text-align:center">Escalados</span>
          </div>

          @for (k of kpis(); track k.agente_id) {
            <div class="table-row-kpi">
              <span>
                <div class="font-medium">{{ k.nombre }}</div>
                <div class="text-xs text-muted">{{ k.email }}</div>
              </span>
              <span class="text-sm text-muted">{{ k.grupo ?? '—' }}</span>
              <span class="kpi-num">{{ k.tickets_cerrados }}</span>
              <span class="kpi-num">{{ k.tickets_activos }}</span>
              <span class="kpi-num text-muted">
                {{ k.tiempo_promedio_horas != null ? k.tiempo_promedio_horas + 'h' : '—' }}
              </span>
              <span class="kpi-num">
                @if (k.sla_cumplido_pct != null) {
                  <span [class.kpi-green]="k.sla_cumplido_pct >= 90" [class.kpi-red]="k.sla_cumplido_pct < 70">
                    {{ k.sla_cumplido_pct }}%
                  </span>
                } @else { — }
              </span>
              <span class="kpi-num">
                @if (k.csat_promedio != null) {
                  <span [class.kpi-green]="k.csat_promedio >= 4" [class.kpi-amber]="k.csat_promedio < 4">
                    {{ k.csat_promedio.toFixed(1) }} ★
                  </span>
                } @else { — }
              </span>
              <span class="kpi-num text-muted">{{ k.total_escalados }}</span>
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .admin-section { display: flex; flex-direction: column; gap: 16px; }
    .section-bar { display: flex; justify-content: space-between; align-items: center; }
    .section-title { font-size: 17px; font-weight: 600; }
    .filter-row { display: flex; gap: 12px; align-items: flex-end; flex-wrap: wrap; }
    .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
    @media(max-width:640px){ .kpi-grid { grid-template-columns: repeat(2,1fr); } }
    .kpi-card {
      background: var(--color-background-secondary);
      border-radius: var(--border-radius-md);
      padding: 16px;
      text-align: center;
    }
    .kpi-val { font-size: 26px; font-weight: 500; margin-bottom: 4px; }
    .kpi-val--green { color: #22C55E; }
    .kpi-lbl { font-size: 12px; color: var(--color-text-secondary); }
    .loading-msg { padding: 40px; text-align: center; color: var(--color-text-secondary); }
    .admin-table { background: var(--color-background-secondary); border: 1px solid var(--color-border-tertiary); border-radius: var(--border-radius-lg); overflow: hidden; }
    .table-head-kpi { display: grid; grid-template-columns: 1fr 120px 80px 70px 90px 70px 70px 80px; gap: 8px; padding: 10px 16px; background: var(--color-background-primary); border-bottom: 1px solid var(--color-border-tertiary); font-size: 11px; font-weight: 600; color: var(--color-text-secondary); text-transform: uppercase; }
    .table-row-kpi { display: grid; grid-template-columns: 1fr 120px 80px 70px 90px 70px 70px 80px; gap: 8px; align-items: center; padding: 12px 16px; border-bottom: 1px solid var(--color-border-tertiary); font-size: 13px; }
    .table-row-kpi:last-child { border-bottom: none; }
    .table-row-kpi:hover { background: var(--color-background-primary); }
    .kpi-num { text-align: center; font-weight: 500; }
    .kpi-green { color: #22C55E; }
    .kpi-amber { color: #F59E0B; }
    .kpi-red   { color: #EF4444; }
    .text-xs { font-size: 11px; }
    .font-medium { font-weight: 500; }
  `],
})
export class AdminKpisComponent implements OnInit {
  kpis = signal<KpiAgente[]>([]);
  loading = signal(true);
  desde = '';
  hasta = '';

  totalCerrados = () => this.kpis().reduce((a, k) => a + k.tickets_cerrados, 0);
  totalActivos = () => this.kpis().reduce((a, k) => a + k.tickets_activos, 0);
  csatGlobal = () => {
    const con = this.kpis().filter(k => k.csat_promedio != null);
    if (!con.length) return null;
    return con.reduce((a, k) => a + k.csat_promedio!, 0) / con.length;
  };
  slaGlobal = () => {
    const con = this.kpis().filter(k => k.sla_cumplido_pct != null);
    if (!con.length) return null;
    return con.reduce((a, k) => a + k.sla_cumplido_pct!, 0) / con.length;
  };

  constructor(private admin: AdminService) { }

  ngOnInit() { this.load(); }

  load() {
    this.loading.set(true);
    const params: any = {};
    if (this.desde) params.desde = this.desde;
    if (this.hasta) params.hasta = this.hasta;
    this.admin.getKpisAgentes(params).subscribe({
      next: ks => { this.kpis.set(ks); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }
}
