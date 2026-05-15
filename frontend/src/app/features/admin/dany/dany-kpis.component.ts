import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { RouterModule } from '@angular/router';
import { NavbarComponent } from '../../../shared/components/navbar.component';
import { AuthService } from '../../../core/services/auth.service';
import { environment } from '../../../../environments/environment';

interface KpiDany {
  periodo_desde: string; periodo_hasta: string;
  sesiones_totales: number; sesiones_resueltas: number; sesiones_escaladas: number;
  tasa_deflexion_pct: number; tickets_creados: number;
  tiempo_primera_respuesta_agente_horas: number | null;
  por_canal: Record<string, number>;
  top_tipificaciones: { nombre: string; count: number }[];
}

@Component({
  selector: 'app-dany-kpis',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, NavbarComponent],
  template: `
    <div class="page">
      <app-navbar section="Dany" />
      <div class="content content--wide">

        <!-- Header -->
        <div class="page-header">
          <div>
            <h1 class="page-title">
              <span class="dany-orb-sm"></span>
              Rendimiento Daniel
            </h1>
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
            @for (i of [1,2,3,4]; track i) { <div class="skeleton-card"></div> }
          </div>
        } @else if (kpi()) {

          <!-- Hero: deflexión -->
          <div class="deflexion-hero">
            <div class="deflexion-ring">
              <svg viewBox="0 0 120 120" class="ring-svg">
                <circle cx="60" cy="60" r="50" class="ring-bg"/>
                <circle cx="60" cy="60" r="50" class="ring-fill"
                  [style.stroke-dasharray]="ringDash()"
                  [style.stroke]="ringColor()"/>
              </svg>
              <div class="ring-label">
                <span class="ring-val">{{ kpi()!.tasa_deflexion_pct | number:'1.0-0' }}%</span>
                <span class="ring-sub">Deflexión</span>
              </div>
            </div>
            <div class="deflexion-cards">
              <div class="def-card def-card--green">
                <span class="def-val">{{ kpi()!.sesiones_resueltas }}</span>
                <span class="def-lbl">Resueltas sin ticket</span>
              </div>
              <div class="def-card def-card--amber">
                <span class="def-val">{{ kpi()!.sesiones_escaladas }}</span>
                <span class="def-lbl">Escaladas a agente</span>
              </div>
              <div class="def-card def-card--blue">
                <span class="def-val">{{ kpi()!.sesiones_totales }}</span>
                <span class="def-lbl">Total sesiones</span>
              </div>
              <div class="def-card">
                <span class="def-val">{{ kpi()!.tickets_creados }}</span>
                <span class="def-lbl">Tickets creados</span>
              </div>
              <div class="def-card">
                <span class="def-val">
                  {{ kpi()!.tiempo_primera_respuesta_agente_horas != null
                      ? (kpi()!.tiempo_primera_respuesta_agente_horas! | number:'1.0-1') + 'h'
                      : '—' }}
                </span>
                <span class="def-lbl">T. primera respuesta agente</span>
              </div>
            </div>
          </div>

          <div class="two-col">

            <!-- Por canal -->
            @if (canales().length > 0) {
              <div class="panel">
                <div class="panel-title">Sesiones por canal</div>
                @for (c of canales(); track c.canal) {
                  <div class="canal-row">
                    <span class="canal-name">{{ c.canal }}</span>
                    <div class="canal-bar-bg">
                      <div class="canal-bar" [style.width.%]="canalPct(c.count)"></div>
                    </div>
                    <span class="canal-count">{{ c.count }}</span>
                  </div>
                }
              </div>
            }

            <!-- Top tipificaciones -->
            @if (kpi()!.top_tipificaciones.length > 0) {
              <div class="panel">
                <div class="panel-title">Problemas más frecuentes (Dany)</div>
                @for (tip of kpi()!.top_tipificaciones.slice(0, 8); track tip.nombre; let i = $index) {
                  <div class="tip-row">
                    <span class="tip-rank">{{ i + 1 }}</span>
                    <div class="tip-info">
                      <span class="tip-nombre">{{ tip.nombre }}</span>
                      <div class="tip-bar-bg">
                        <div class="tip-bar" [style.width.%]="tipPct(tip.count)"></div>
                      </div>
                    </div>
                    <span class="tip-count">{{ tip.count }}</span>
                  </div>
                }
              </div>
            }
          </div>

        } @else {
          <div class="empty">No hay datos de Daniel para el período seleccionado.</div>
        }
      </div>
    </div>
  `,
  styles: [`
    .page { display:flex; flex-direction:column; min-height:100vh; }
    .content--wide { max-width:1200px; margin:0 auto; width:100%; padding:24px 24px 48px; }
    .page-header { display:flex; align-items:flex-start; justify-content:space-between; margin-bottom:28px; flex-wrap:wrap; gap:12px; }
    .page-title { font-size:22px; font-weight:700; color:var(--c-text); display:flex; align-items:center; gap:10px; }
    .page-sub { font-size:13px; color:var(--c-muted); margin-top:2px; }
    .period-sel { padding:7px 12px; border-radius:8px; border:1px solid var(--c-border); background:var(--c-surface); color:var(--c-text); font-size:13px; cursor:pointer; }

    /* Dany orb */
    .dany-orb-sm {
      width:22px; height:22px; border-radius:50%; flex-shrink:0;
      background: radial-gradient(circle at 35% 35%, #818cf8, #6366f1 55%, #4f46e5);
      box-shadow: 0 0 10px rgba(99,102,241,.5);
    }

    .skeleton-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(200px,1fr)); gap:14px; }
    .skeleton-card { height:96px; border-radius:12px; background:var(--c-border); animation:pulse 1.4s ease infinite; }
    @keyframes pulse { 0%,100%{opacity:.6} 50%{opacity:1} }

    /* Deflexión hero */
    .deflexion-hero {
      display:flex; align-items:center; gap:32px; flex-wrap:wrap;
      background:var(--c-surface); border:1px solid var(--c-border);
      border-radius:16px; padding:28px 32px; margin-bottom:28px;
    }
    .deflexion-ring { position:relative; width:120px; height:120px; flex-shrink:0; }
    .ring-svg { width:120px; height:120px; transform:rotate(-90deg); }
    .ring-bg { fill:none; stroke:var(--c-border); stroke-width:10; }
    .ring-fill { fill:none; stroke-width:10; stroke-linecap:round; transition:stroke-dasharray .6s ease; stroke-dashoffset:0; }
    .ring-label { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; }
    .ring-val { font-size:22px; font-weight:800; color:var(--c-text); line-height:1; }
    .ring-sub { font-size:10px; color:var(--c-muted); text-transform:uppercase; letter-spacing:.06em; }

    .deflexion-cards { display:flex; flex-wrap:wrap; gap:12px; flex:1; }
    .def-card {
      background:var(--c-bg); border:1px solid var(--c-border);
      border-radius:10px; padding:14px 18px; min-width:110px;
      display:flex; flex-direction:column; gap:4px;
    }
    .def-val { font-size:22px; font-weight:700; color:var(--c-text); }
    .def-lbl { font-size:11px; color:var(--c-muted); }
    .def-card--green .def-val { color:#16a34a; }
    .def-card--amber .def-val { color:var(--c-amber); }
    .def-card--blue  .def-val { color:var(--c-blue); }

    /* Two columns */
    .two-col { display:grid; grid-template-columns:1fr 1fr; gap:20px; }
    @media (max-width:800px) { .two-col { grid-template-columns:1fr; } }

    .panel { background:var(--c-surface); border:1px solid var(--c-border); border-radius:12px; padding:20px; }
    .panel-title { font-size:13px; font-weight:700; color:var(--c-text); margin-bottom:16px; }

    /* Canal bars */
    .canal-row { display:flex; align-items:center; gap:10px; margin-bottom:10px; }
    .canal-name { font-size:12px; color:var(--c-text); width:80px; flex-shrink:0; text-transform:capitalize; }
    .canal-bar-bg { flex:1; height:8px; background:var(--c-border); border-radius:4px; overflow:hidden; }
    .canal-bar { height:8px; background:var(--c-blue); border-radius:4px; transition:width .4s; }
    .canal-count { font-size:12px; font-weight:600; color:var(--c-muted); width:32px; text-align:right; }

    /* Tipificaciones */
    .tip-row { display:flex; align-items:center; gap:10px; margin-bottom:10px; }
    .tip-rank { font-size:12px; font-weight:700; color:var(--c-muted); width:18px; text-align:center; flex-shrink:0; }
    .tip-info { flex:1; min-width:0; }
    .tip-nombre { font-size:12px; color:var(--c-text); display:block; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; margin-bottom:4px; }
    .tip-bar-bg { height:5px; background:var(--c-border); border-radius:3px; overflow:hidden; }
    .tip-bar { height:5px; background:var(--c-purple); border-radius:3px; transition:width .4s; }
    .tip-count { font-size:12px; font-weight:600; color:var(--c-muted); width:28px; text-align:right; flex-shrink:0; }

    .empty { text-align:center; color:var(--c-muted); padding:60px 20px; font-size:14px; }
  `],
})
export class DanyKpisComponent implements OnInit {
  private http = inject(HttpClient);
  auth = inject(AuthService);
  private api = environment.apiUrl;

  loading    = signal(true);
  periodoSel = '30';
  kpi        = signal<KpiDany | null>(null);

  scopeLabel = computed(() => {
    const rol  = this.auth.rol();
    const user = this.auth.currentUser();
    if (rol === 'ADMIN')       return 'Vista global — todos los canales y compañías';
    if (rol === 'ADMIN_AREA')  return `Mi Área: ${user?.area_restriccion ?? ''}`;
    if (rol === 'COORDINADOR') return 'Mi Compañía';
    return '';
  });

  canales = computed(() => {
    const k = this.kpi();
    if (!k) return [];
    return Object.entries(k.por_canal)
      .map(([canal, count]) => ({ canal, count }))
      .sort((a, b) => b.count - a.count);
  });

  ngOnInit() { this.load(); }

  load() {
    this.loading.set(true);
    const desde = this.daysAgo(+this.periodoSel);
    const hasta  = new Date().toISOString().slice(0, 10);
    this.http.get<KpiDany>(`${this.api}/admin/kpis/dany?desde=${desde}&hasta=${hasta}`).subscribe({
      next: d => { this.kpi.set(d); this.loading.set(false); },
      error: () => { this.kpi.set(null); this.loading.set(false); },
    });
  }

  private daysAgo(d: number): string {
    const dt = new Date(); dt.setDate(dt.getDate() - d); return dt.toISOString().slice(0, 10);
  }

  ringDash(): string {
    const pct = this.kpi()?.tasa_deflexion_pct ?? 0;
    const circ = 2 * Math.PI * 50;
    return `${(pct / 100) * circ} ${circ}`;
  }

  ringColor(): string {
    const pct = this.kpi()?.tasa_deflexion_pct ?? 0;
    if (pct >= 60) return '#16a34a';
    if (pct >= 40) return 'var(--c-amber)';
    return 'var(--c-red)';
  }

  canalPct(v: number): number {
    const max = Math.max(...this.canales().map(c => c.count), 1);
    return Math.round(v / max * 100);
  }

  tipPct(v: number): number {
    const tips = this.kpi()?.top_tipificaciones ?? [];
    const max  = Math.max(...tips.map(t => t.count), 1);
    return Math.round(v / max * 100);
  }
}
