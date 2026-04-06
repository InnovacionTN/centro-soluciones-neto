import { __decorate } from "tslib";
import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpParams } from '@angular/common/http';
import { NavbarComponent } from '../../../shared/components/navbar.component';
let DanyKpisComponent = class DanyKpisComponent {
    constructor(http) {
        this.http = http;
        this.kpi = signal(null);
        this.loading = signal(true);
        this.desde = this.haceNDias(30);
        this.hasta = this.hoy();
        this.canalItems = () => {
            const d = this.kpi()?.por_canal || {};
            const total = Object.values(d).reduce((a, b) => a + b, 0) || 1;
            return Object.entries(d).map(([canal, count]) => ({
                canal, count, pct: Math.round(count / total * 100),
            })).sort((a, b) => b.count - a.count);
        };
    }
    ngOnInit() { this.load(); }
    load() {
        this.loading.set(true);
        const p = new HttpParams().set('desde', this.desde).set('hasta', this.hasta);
        this.http.get('/api/v1/admin/kpis/dany', { params: p }).subscribe({
            next: d => { this.kpi.set(d); this.loading.set(false); },
            error: () => this.loading.set(false),
        });
    }
    setPeriodo(dias) {
        this.hasta = this.hoy();
        this.desde = this.haceNDias(dias);
        this.load();
    }
    min100(v) { return Math.min(v, 100); }
    canalEmoji(canal) {
        return { portal: '🌐', slack: '💬', whatsapp: '📱' }[canal] ?? '📡';
    }
    hoy() { return new Date().toISOString().split('T')[0]; }
    haceNDias(n) {
        const d = new Date();
        d.setDate(d.getDate() - n);
        return d.toISOString().split('T')[0];
    }
};
DanyKpisComponent = __decorate([
    Component({
        selector: 'app-dany-kpis',
        standalone: true,
        imports: [CommonModule, FormsModule, NavbarComponent],
        template: `
    <div class="page">
      <app-navbar section="Dany KPIs" />
      <div class="content content--wide">

        <!-- Header -->
        <div class="top-bar">
          <div>
            <h1 class="page-title">🤖 Métricas Dany — Primera línea</h1>
            <p class="page-sub">Tasa de deflexión y rendimiento del asistente virtual</p>
          </div>
          <div class="period-controls">
            <input type="date" class="input input--sm" [(ngModel)]="desde" (change)="load()" />
            <span class="text-muted">→</span>
            <input type="date" class="input input--sm" [(ngModel)]="hasta" (change)="load()" />
            <button class="btn btn--ghost btn--sm" (click)="setPeriodo(30)">30d</button>
            <button class="btn btn--ghost btn--sm" (click)="setPeriodo(7)">7d</button>
          </div>
        </div>

        @if (loading()) {
          <div class="loading">Cargando métricas Dany…</div>
        } @else if (kpi()) {

          <!-- Big numbers -->
          <div class="bignum-grid">
            <!-- Deflexión — la métrica estrella -->
            <div class="bignum-card bignum-card--hero"
                 [class.hero--green]="kpi()!.tasa_deflexion_pct >= 25"
                 [class.hero--amber]="kpi()!.tasa_deflexion_pct >= 10 && kpi()!.tasa_deflexion_pct < 25"
                 [class.hero--red]="kpi()!.tasa_deflexion_pct < 10">
              <div class="bignum-val">{{ kpi()!.tasa_deflexion_pct | number:'1.1-1' }}%</div>
              <div class="bignum-lbl">Tasa de deflexión</div>
              <div class="bignum-sub">Meta: ≥ 25% · {{ kpi()!.sesiones_resueltas }} resueltas sin ticket</div>
              <!-- Barra de progreso hacia la meta -->
              <div class="meta-bar">
                <div class="meta-fill"
                     [style.width.%]="min100(kpi()!.tasa_deflexion_pct / 25 * 100)">
                </div>
              </div>
              <div class="meta-label">{{ min100(kpi()!.tasa_deflexion_pct / 25 * 100) | number:'1.0-0' }}% de la meta</div>
            </div>

            <div class="bignum-card">
              <div class="bignum-val">{{ kpi()!.sesiones_totales | number }}</div>
              <div class="bignum-lbl">Sesiones totales</div>
              <div class="bignum-sub">{{ kpi()!.sesiones_escaladas }} escaladas a agente</div>
            </div>

            <div class="bignum-card">
              <div class="bignum-val">{{ kpi()!.tickets_creados | number }}</div>
              <div class="bignum-lbl">Tickets creados por Dany</div>
              <div class="bignum-sub">origen = 🤖 DANY</div>
            </div>

            <div class="bignum-card"
                 [class.bignum-card--green]="kpi()!.tiempo_primera_respuesta_agente_horas !== null && kpi()!.tiempo_primera_respuesta_agente_horas! <= 2">
              <div class="bignum-val">
                {{ kpi()!.tiempo_primera_respuesta_agente_horas !== null
                   ? (kpi()!.tiempo_primera_respuesta_agente_horas! | number:'1.1-1') + 'h'
                   : '—' }}
              </div>
              <div class="bignum-lbl">Primera resp. agente a tickets Dany</div>
              <div class="bignum-sub">Desde que Dany escala hasta que el agente responde</div>
            </div>
          </div>

          <!-- Por canal + top tipificaciones -->
          <div class="two-col">

            <!-- Por canal -->
            <div class="panel">
              <h3 class="panel-title">📡 Sesiones por canal</h3>
              @for (item of canalItems(); track item.canal) {
                <div class="canal-row">
                  <span class="canal-nombre">{{ canalEmoji(item.canal) }} {{ item.canal }}</span>
                  <div class="canal-bar-wrap">
                    <div class="canal-bar"
                         [style.width.%]="item.pct"
                         [class.canal-bar--portal]="item.canal === 'portal'"
                         [class.canal-bar--slack]="item.canal === 'slack'">
                    </div>
                  </div>
                  <span class="canal-count">{{ item.count }}</span>
                </div>
              }
              @if (canalItems().length === 0) {
                <p class="text-muted text-sm">Sin datos de sesiones aún</p>
              }
            </div>

            <!-- Top tipificaciones detectadas por Dany -->
            <div class="panel">
              <h3 class="panel-title">🔍 Top problemas detectados por Dany</h3>
              @for (t of kpi()!.top_tipificaciones; track t.nombre; let i = $index) {
                <div class="tip-row">
                  <span class="tip-rank">#{{ i + 1 }}</span>
                  <span class="tip-nombre">{{ t.nombre }}</span>
                  <span class="tip-count">{{ t.count }}</span>
                </div>
              }
              @if (kpi()!.top_tipificaciones.length === 0) {
                <p class="text-muted text-sm">Sin tipificaciones detectadas aún</p>
              }
            </div>

          </div>

          <!-- Interpretación -->
          <div class="insight-box">
            <strong>📊 Interpretación:</strong>
            @if (kpi()!.sesiones_totales === 0) {
              Dany aún no ha tenido sesiones en este período. Verifica que el workflow de n8n esté activo y registrando sesiones.
            } @else if (kpi()!.tasa_deflexion_pct >= 25) {
              ✅ Dany está cumpliendo la meta de deflexión. Por cada ticket creado, resuelve {{ (kpi()!.sesiones_resueltas / (kpi()!.sesiones_escaladas || 1)) | number:'1.1-1' }} casos sin escalación.
            } @else if (kpi()!.tasa_deflexion_pct >= 10) {
              🟡 Dany está en camino pero por debajo de la meta del 25%. Revisa las tipificaciones más frecuentes para mejorar las respuestas automáticas.
            } @else {
              🔴 La tasa de deflexión es muy baja. Revisa el system prompt de Dany y asegúrate de que las tools estén funcionando correctamente.
            }
          </div>

        }
      </div>
    </div>
  `,
        styles: [`
    .top-bar { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:20px; flex-wrap:wrap; gap:12px; }
    .page-title { font-size:22px; font-weight:600; }
    .page-sub   { font-size:13px; color:var(--c-muted); }
    .period-controls { display:flex; align-items:center; gap:8px; }
    .input--sm { padding:5px 10px; font-size:13px; border-radius:6px; border:1px solid var(--c-border); }

    .bignum-grid {
      display:grid; grid-template-columns:2fr 1fr 1fr 1fr;
      gap:12px; margin-bottom:24px;
    }
    @media(max-width:900px) { .bignum-grid { grid-template-columns:1fr 1fr; } }

    .bignum-card {
      background:var(--c-surface); border:1px solid var(--c-border);
      border-radius:var(--radius-lg); padding:16px 18px;
      border-top:4px solid var(--c-blue);
    }
    .bignum-card--green { border-top-color:#00A878; }

    /* Card hero — deflexión */
    .bignum-card--hero { padding:18px 20px; }
    .hero--green { border-top-color:#00A878; }
    .hero--amber { border-top-color:#F59E0B; }
    .hero--red   { border-top-color:#EF4444; }

    .bignum-val { font-size:36px; font-weight:800; line-height:1; margin-bottom:4px; }
    .bignum-lbl { font-size:13px; font-weight:600; margin-bottom:2px; }
    .bignum-sub { font-size:11px; color:var(--c-muted); margin-bottom:10px; }

    .meta-bar { height:6px; background:var(--c-border); border-radius:3px; overflow:hidden; }
    .meta-fill { height:100%; background:#00A878; border-radius:3px; transition:width .5s; }
    .meta-label { font-size:10px; color:var(--c-muted); margin-top:4px; }

    .two-col { display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:20px; }
    @media(max-width:700px) { .two-col { grid-template-columns:1fr; } }

    .panel {
      background:var(--c-surface); border:1px solid var(--c-border);
      border-radius:var(--radius-lg); padding:16px 18px;
    }
    .panel-title { font-size:14px; font-weight:600; margin-bottom:14px; }

    .canal-row { display:flex; align-items:center; gap:10px; margin-bottom:10px; }
    .canal-nombre { font-size:13px; width:90px; flex-shrink:0; }
    .canal-bar-wrap { flex:1; height:8px; background:var(--c-border); border-radius:4px; overflow:hidden; }
    .canal-bar { height:100%; border-radius:4px; background:var(--c-blue); }
    .canal-bar--portal { background:#1B3462; }
    .canal-bar--slack  { background:#4A154B; }
    .canal-count { font-size:13px; font-weight:600; width:30px; text-align:right; }

    .tip-row { display:flex; align-items:center; gap:10px; padding:6px 0; border-bottom:1px solid var(--c-border); }
    .tip-row:last-child { border-bottom:none; }
    .tip-rank  { font-size:11px; color:var(--c-muted); width:24px; flex-shrink:0; }
    .tip-nombre { flex:1; font-size:12px; }
    .tip-count  { font-size:13px; font-weight:700; }

    .insight-box {
      background:var(--c-blue-lt); border:1px solid var(--c-blue-md);
      border-radius:var(--radius-md); padding:14px 16px; font-size:13px;
    }

    .loading { text-align:center; padding:48px; color:var(--c-muted); }
    .text-muted { color:var(--c-muted); }
    .text-sm { font-size:12px; }
  `],
    })
], DanyKpisComponent);
export { DanyKpisComponent };
//# sourceMappingURL=dany-kpis.component.js.map