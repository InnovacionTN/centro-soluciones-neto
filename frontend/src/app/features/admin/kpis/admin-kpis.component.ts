import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { RouterModule } from '@angular/router';
import { NavbarComponent } from '../../../shared/components/navbar.component';
import { AuthService } from '../../../core/services/auth.service';
import { environment } from '../../../../environments/environment';

interface KpiEjecutivo {
  periodo_desde: string; periodo_hasta: string;
  total_tickets: number; tickets_abiertos: number; tickets_cerrados: number;
  tickets_por_dia_promedio: number; sla_cumplido_pct: number; tickets_sin_sla: number;
  tiempo_resolucion_p50_horas: number | null; tiempo_resolucion_p90_horas: number | null;
  csat_tasa_respuesta_pct: number; csat_satisfaccion_pct: number;
  tickets_origen_dany: number; tasa_deflexion_dany_pct: number; tasa_reapertura_pct: number;
}
interface KpiPorArea {
  area: string; total_tickets: number; pct_del_total: number;
  sla_cumplido_pct: number | null; tiempo_p50_horas: number | null;
  tickets_vencidos: number; tickets_sin_sla: number;
}
interface KpiAgente {
  agente_id: number; nombre: string; email: string;
  area: string | null; tickets_cerrados: number; tickets_activos: number;
  tiempo_promedio_horas: number | null; sla_cumplido_pct: number | null;
  csat_promedio: number | null; disponible: boolean;
}
interface KpiTendencia {
  mes: string; total_tickets: number; sla_cumplido_pct: number | null;
  tiempo_p50_horas: number | null; csat_pct: number | null; tickets_dany: number;
}

const AREA_LABEL: Record<string, string> = {
  SISTEMAS: 'Sistemas', MANTENIMIENTO: 'Mantenimiento', ABASTO: 'Abasto',
  FINANZAS: 'Finanzas', COMERCIAL: 'Comercial', RRHH: 'RR.HH.', OPERACIONES: 'Operaciones',
};
const AREA_COLOR: Record<string, string> = {
  SISTEMAS: '#1B3462', MANTENIMIENTO: '#E65100', ABASTO: '#00796B',
  FINANZAS: '#6A1B9A', COMERCIAL: '#C62828', RRHH: '#558B2F', OPERACIONES: '#0277BD',
};

@Component({
  selector: 'app-admin-kpis',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, NavbarComponent],
  template: `
    <div class="page">
      <app-navbar section="KPIs" />
      <div class="content content--wide">

        <!-- Header -->
        <div class="page-header">
          <div>
            <h1 class="page-title">KPIs Ejecutivos</h1>
            <p class="page-sub">{{ scopeLabel() }}</p>
          </div>
          <select class="period-sel" [(ngModel)]="periodoSel" (ngModelChange)="load()">
            <option value="7">Últimos 7 días</option>
            <option value="30">Últimos 30 días</option>
            <option value="90">Últimos 90 días</option>
            <option value="180">Últimos 6 meses</option>
          </select>
        </div>

        @if (loading()) {
          <div class="skeleton-grid">
            @for (i of [1,2,3,4,5,6]; track i) { <div class="skeleton-card"></div> }
          </div>
        } @else if (kpi()) {

          <div class="section-label">Métricas del período</div>
          <div class="metrics-grid">
            <div class="metric-card metric-card--blue">
              <span class="metric-val">{{ kpi()!.total_tickets }}</span>
              <span class="metric-label">Total tickets</span>
              <span class="metric-sub">{{ kpi()!.tickets_por_dia_promedio | number:'1.1-1' }}/día promedio</span>
            </div>
            <div class="metric-card"
                 [class.metric-card--green]="kpi()!.sla_cumplido_pct >= 90"
                 [class.metric-card--amber]="kpi()!.sla_cumplido_pct >= 70 && kpi()!.sla_cumplido_pct < 90"
                 [class.metric-card--red]="kpi()!.sla_cumplido_pct < 70">
              <span class="metric-val">{{ kpi()!.sla_cumplido_pct | number:'1.0-1' }}%</span>
              <span class="metric-label">SLA cumplido</span>
              <span class="metric-sub">{{ kpi()!.tickets_sin_sla }} sin SLA asignado</span>
            </div>
            <div class="metric-card metric-card--purple">
              <span class="metric-val">
                {{ kpi()!.tiempo_resolucion_p50_horas != null ? (kpi()!.tiempo_resolucion_p50_horas! | number:'1.0-1') + 'h' : '—' }}
              </span>
              <span class="metric-label">Resolución P50</span>
              <span class="metric-sub">P90: {{ kpi()!.tiempo_resolucion_p90_horas != null ? (kpi()!.tiempo_resolucion_p90_horas! | number:'1.0-1') + 'h' : '—' }}</span>
            </div>
            <div class="metric-card metric-card--teal">
              <span class="metric-val">{{ kpi()!.csat_satisfaccion_pct | number:'1.0-1' }}%</span>
              <span class="metric-label">CSAT satisfacción</span>
              <span class="metric-sub">{{ kpi()!.csat_tasa_respuesta_pct | number:'1.0-1' }}% tasa respuesta</span>
            </div>
            <div class="metric-card metric-card--green">
              <span class="metric-val">{{ kpi()!.tasa_deflexion_dany_pct | number:'1.0-1' }}%</span>
              <span class="metric-label">Deflexión Dany</span>
              <span class="metric-sub">{{ kpi()!.tickets_origen_dany }} tickets vía Dany</span>
            </div>
            <div class="metric-card" [class.metric-card--red]="kpi()!.tasa_reapertura_pct > 5">
              <span class="metric-val">{{ kpi()!.tasa_reapertura_pct | number:'1.0-1' }}%</span>
              <span class="metric-label">Reapertura</span>
              <span class="metric-sub">{{ kpi()!.tickets_abiertos }} activos / {{ kpi()!.tickets_cerrados }} cerrados</span>
            </div>
          </div>

          <!-- Tendencia -->
          @if (tendencia().length > 0) {
            <div class="section-label" style="margin-top:32px">Tendencia mensual</div>
            <div class="table-wrap">
              <table class="data-table">
                <thead><tr>
                  <th>Mes</th><th>Tickets</th><th>SLA%</th><th>T.Res P50</th><th>CSAT%</th><th>Dany</th><th>Volumen</th>
                </tr></thead>
                <tbody>
                  @for (t of tendencia(); track t.mes) {
                    <tr>
                      <td>{{ t.mes }}</td>
                      <td><strong>{{ t.total_tickets }}</strong></td>
                      <td [class.td-green]="(t.sla_cumplido_pct ?? 0) >= 90"
                          [class.td-amber]="(t.sla_cumplido_pct ?? 0) >= 70 && (t.sla_cumplido_pct ?? 0) < 90"
                          [class.td-red]="(t.sla_cumplido_pct ?? 100) < 70">
                        {{ t.sla_cumplido_pct != null ? (t.sla_cumplido_pct | number:'1.0-1') + '%' : '—' }}
                      </td>
                      <td>{{ t.tiempo_p50_horas != null ? (t.tiempo_p50_horas | number:'1.0-1') + 'h' : '—' }}</td>
                      <td>{{ t.csat_pct != null ? (t.csat_pct | number:'1.0-1') + '%' : '—' }}</td>
                      <td>{{ t.tickets_dany }}</td>
                      <td class="td-bar-cell">
                        <div class="td-bar" [style.width.%]="barPct(t.total_tickets)"></div>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }

          <!-- Por área -->
          @if (porArea().length > 0) {
            <div class="section-label" style="margin-top:32px">Por área técnica</div>
            <div class="area-cards">
              @for (a of porArea(); track a.area) {
                <div class="area-card">
                  <div class="area-top" [style.border-left-color]="areaColor(a.area)">
                    <span class="area-name">{{ areaLabel(a.area) }}</span>
                    <span class="area-pct">{{ a.pct_del_total | number:'1.0-1' }}%</span>
                  </div>
                  <div class="area-stats">
                    <div class="area-stat"><span class="asv">{{ a.total_tickets }}</span><span class="asl">Tickets</span></div>
                    <div class="area-stat">
                      <span class="asv" [class.stat-green]="(a.sla_cumplido_pct ?? 0) >= 90" [class.stat-red]="(a.sla_cumplido_pct ?? 0) < 70">
                        {{ a.sla_cumplido_pct != null ? (a.sla_cumplido_pct | number:'1.0-0') + '%' : '—' }}
                      </span><span class="asl">SLA</span>
                    </div>
                    <div class="area-stat"><span class="asv" [class.stat-red]="a.tickets_vencidos > 0">{{ a.tickets_vencidos }}</span><span class="asl">Vencidos</span></div>
                    <div class="area-stat"><span class="asv">{{ a.tiempo_p50_horas != null ? (a.tiempo_p50_horas | number:'1.0-1') + 'h' : '—' }}</span><span class="asl">P50</span></div>
                  </div>
                  <div class="area-bar-bg"><div class="area-bar-fill" [style.width.%]="a.pct_del_total" [style.background]="areaColor(a.area)"></div></div>
                </div>
              }
            </div>
          }

          <!-- Por agente -->
          @if (porAgente().length > 0) {
            <div class="section-label" style="margin-top:32px">Por agente</div>
            <div class="table-wrap">
              <table class="data-table">
                <thead><tr>
                  <th>Agente</th><th>Área</th><th>Activos</th><th>Cerrados</th><th>SLA%</th><th>T.Res</th><th>CSAT</th><th>Estado</th>
                </tr></thead>
                <tbody>
                  @for (a of porAgente(); track a.agente_id) {
                    <tr>
                      <td><div class="agent-name">{{ a.nombre }}</div><div class="agent-email">{{ a.email }}</div></td>
                      <td>{{ a.area ? areaLabel(a.area) : '—' }}</td>
                      <td>{{ a.tickets_activos }}</td>
                      <td><strong>{{ a.tickets_cerrados }}</strong></td>
                      <td [class.td-green]="(a.sla_cumplido_pct ?? 0) >= 90" [class.td-red]="(a.sla_cumplido_pct ?? 100) < 70">
                        {{ a.sla_cumplido_pct != null ? (a.sla_cumplido_pct | number:'1.0-0') + '%' : '—' }}
                      </td>
                      <td>{{ a.tiempo_promedio_horas != null ? (a.tiempo_promedio_horas | number:'1.0-1') + 'h' : '—' }}</td>
                      <td>{{ a.csat_promedio != null ? (a.csat_promedio | number:'1.1-1') : '—' }}</td>
                      <td><span class="badge" [class.badge--green]="a.disponible" [class.badge--gray]="!a.disponible">{{ a.disponible ? 'Disponible' : 'No disp.' }}</span></td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }

        } @else {
          <div class="empty">No hay datos para el período seleccionado.</div>
        }
      </div>
    </div>
  `,
  styles: [`
    .page { display:flex; flex-direction:column; min-height:100vh; }
    .content--wide { max-width:1400px; margin:0 auto; width:100%; padding:24px 24px 48px; }
    .page-header { display:flex; align-items:flex-start; justify-content:space-between; margin-bottom:24px; flex-wrap:wrap; gap:12px; }
    .page-title { font-size:22px; font-weight:700; color:var(--c-text); }
    .page-sub { font-size:13px; color:var(--c-muted); margin-top:2px; }
    .period-sel { padding:7px 12px; border-radius:8px; border:1px solid var(--c-border); background:var(--c-surface); color:var(--c-text); font-size:13px; cursor:pointer; }
    .section-label { font-size:11px; font-weight:700; color:var(--c-muted); text-transform:uppercase; letter-spacing:.08em; margin-bottom:12px; }
    .metrics-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(190px,1fr)); gap:14px; }
    .skeleton-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(190px,1fr)); gap:14px; }
    .skeleton-card { height:96px; border-radius:12px; background:var(--c-border); animation:pulse 1.4s ease infinite; }
    @keyframes pulse { 0%,100%{opacity:.6} 50%{opacity:1} }
    .metric-card { background:var(--c-surface); border:1px solid var(--c-border); border-radius:12px; padding:16px 18px; display:flex; flex-direction:column; gap:3px; }
    .metric-val { font-size:26px; font-weight:700; line-height:1.1; }
    .metric-label { font-size:12px; color:var(--c-muted); font-weight:500; }
    .metric-sub { font-size:11px; color:var(--c-muted); }
    .metric-card--blue   { border-left:3px solid var(--c-blue);   } .metric-card--blue   .metric-val { color:var(--c-blue); }
    .metric-card--green  { border-left:3px solid #16a34a;          } .metric-card--green  .metric-val { color:#16a34a; }
    .metric-card--red    { border-left:3px solid var(--c-red);    } .metric-card--red    .metric-val { color:var(--c-red); }
    .metric-card--amber  { border-left:3px solid var(--c-amber);  } .metric-card--amber  .metric-val { color:var(--c-amber); }
    .metric-card--purple { border-left:3px solid var(--c-purple); } .metric-card--purple .metric-val { color:var(--c-purple); }
    .metric-card--teal   { border-left:3px solid var(--c-teal);   } .metric-card--teal   .metric-val { color:var(--c-teal); }
    .table-wrap { overflow-x:auto; }
    .data-table { width:100%; border-collapse:collapse; font-size:13px; }
    .data-table th { text-align:left; padding:8px 12px; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.06em; color:var(--c-muted); border-bottom:2px solid var(--c-border); white-space:nowrap; }
    .data-table td { padding:10px 12px; border-bottom:1px solid var(--c-border); vertical-align:middle; }
    .data-table tr:hover td { background:var(--c-bg); }
    .td-green { color:#16a34a; font-weight:600; } .td-amber { color:var(--c-amber); font-weight:600; } .td-red { color:var(--c-red); font-weight:600; }
    .td-bar-cell { width:100px; } .td-bar { height:6px; background:var(--c-blue); border-radius:3px; }
    .area-cards { display:grid; grid-template-columns:repeat(auto-fill,minmax(200px,1fr)); gap:12px; }
    .area-card { background:var(--c-surface); border:1px solid var(--c-border); border-radius:10px; padding:14px 16px; }
    .area-top { display:flex; justify-content:space-between; align-items:center; border-left:3px solid; padding-left:8px; margin-bottom:12px; }
    .area-name { font-size:13px; font-weight:600; color:var(--c-text); } .area-pct { font-size:12px; color:var(--c-muted); }
    .area-stats { display:grid; grid-template-columns:repeat(4,1fr); gap:6px; margin-bottom:10px; }
    .area-stat { display:flex; flex-direction:column; align-items:center; gap:2px; }
    .asv { font-size:15px; font-weight:700; color:var(--c-text); } .asl { font-size:10px; color:var(--c-muted); text-transform:uppercase; }
    .stat-green { color:#16a34a; } .stat-red { color:var(--c-red); }
    .area-bar-bg { height:4px; background:var(--c-border); border-radius:2px; } .area-bar-fill { height:4px; border-radius:2px; }
    .agent-name { font-weight:500; color:var(--c-text); } .agent-email { font-size:11px; color:var(--c-muted); }
    .badge { padding:2px 8px; border-radius:99px; font-size:11px; font-weight:600; }
    .badge--green { background:#dcfce7; color:#16a34a; } .badge--gray { background:var(--c-bg); color:var(--c-muted); }
    .empty { text-align:center; color:var(--c-muted); padding:60px 20px; font-size:14px; }
  `],
})
export class AdminKpisComponent implements OnInit {
  private http = inject(HttpClient);
  auth = inject(AuthService);
  private api = environment.apiUrl;

  loading    = signal(true);
  periodoSel = '30';
  kpi        = signal<KpiEjecutivo | null>(null);
  tendencia  = signal<KpiTendencia[]>([]);
  porArea    = signal<KpiPorArea[]>([]);
  porAgente  = signal<KpiAgente[]>([]);

  scopeLabel = computed(() => {
    const rol  = this.auth.rol();
    const user = this.auth.currentUser();
    if (rol === 'ADMIN')       return 'Vista global — todos los datos';
    if (rol === 'ADMIN_AREA')  return `Mi Área: ${user?.area_restriccion ?? ''}`;
    if (rol === 'COORDINADOR') return 'Mi Compañía';
    return '';
  });

  ngOnInit() { this.load(); }

  load() {
    this.loading.set(true);
    const desde = this.daysAgo(+this.periodoSel);
    const hasta  = new Date().toISOString().slice(0, 10);
    const p      = `desde=${desde}&hasta=${hasta}`;
    const meses  = Math.min(Math.ceil(+this.periodoSel / 30) + 1, 6);
    let pending  = 4;
    const done   = () => { if (--pending === 0) this.loading.set(false); };

    this.http.get<KpiEjecutivo>(`${this.api}/admin/kpis/ejecutivo?${p}`).subscribe({ next: d => { this.kpi.set(d); done(); }, error: () => done() });
    this.http.get<KpiTendencia[]>(`${this.api}/admin/kpis/tendencia?meses=${meses}`).subscribe({ next: d => { this.tendencia.set(d); done(); }, error: () => done() });
    this.http.get<KpiPorArea[]>(`${this.api}/admin/kpis/por-area?${p}`).subscribe({ next: d => { this.porArea.set(d); done(); }, error: () => done() });
    this.http.get<KpiAgente[]>(`${this.api}/admin/kpis/por-agente?${p}`).subscribe({ next: d => { this.porAgente.set(d); done(); }, error: () => done() });
  }

  private daysAgo(d: number): string { const dt = new Date(); dt.setDate(dt.getDate() - d); return dt.toISOString().slice(0, 10); }
  barPct(v: number) { const m = Math.max(...this.tendencia().map(t => t.total_tickets), 1); return Math.round(v / m * 100); }
  areaLabel(a: string) { return AREA_LABEL[a] ?? a; }
  areaColor(a: string) { return AREA_COLOR[a] ?? '#6B7280'; }
}
