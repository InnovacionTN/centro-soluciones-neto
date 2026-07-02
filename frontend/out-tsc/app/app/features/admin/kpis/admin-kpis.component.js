import { __decorate } from "tslib";
import { Component, signal, computed } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpHeaders, HttpParams } from '@angular/common/http';
import { RouterModule } from '@angular/router';
import { NavbarComponent } from '../../../shared/components/navbar.component';
// ─── Componente ───────────────────────────────────────────────────────────────
let AdminKpisComponent = class AdminKpisComponent {
    constructor(http, auth) {
        this.http = http;
        this.auth = auth;
        // ── Estado ─────────────────────────────────────────────────────────────────
        this.nivel = signal('ejecutivo');
        this.desde = this._haceNDias(30);
        this.hasta = this._hoy();
        this.filtroArea = '';
        this.busquedaAgente = '';
        this.exportando = signal(false);
        // Datos
        this.ejec = signal(null);
        this.tendencia = signal([]);
        this.areas = signal([]);
        this.grupos = signal([]);
        this.agentes = signal([]);
        // Loading
        this.loadingEjec = signal(false);
        this.loadingArea = signal(false);
        this.loadingGrupo = signal(false);
        this.loadingAgente = signal(false);
        this.niveles = [
            { key: 'ejecutivo', icon: '🏢', label: 'Ejecutivo' },
            { key: 'area', icon: '📂', label: 'Por área' },
            { key: 'grupo', icon: '👥', label: 'Por grupo' },
            { key: 'agente', icon: '👤', label: 'Por agente' },
        ];
        this.agentesFiltrados = computed(() => {
            const q = this.busquedaAgente.toLowerCase();
            if (!q)
                return this.agentes();
            return this.agentes().filter(a => a.nombre.toLowerCase().includes(q) ||
                (a.grupo ?? '').toLowerCase().includes(q) ||
                (a.area ?? '').toLowerCase().includes(q));
        });
    }
    ngOnInit() { this.cargarNivel(); }
    // ── Navegación ─────────────────────────────────────────────────────────────
    setNivel(n) {
        this.nivel.set(n);
        this.cargarNivel();
    }
    cargarNivel() {
        switch (this.nivel()) {
            case 'ejecutivo':
                this.cargarEjecutivo();
                break;
            case 'area':
                this.cargarAreas();
                break;
            case 'grupo':
                this.cargarGrupos();
                break;
            case 'agente':
                this.cargarAgentes();
                break;
        }
    }
    recargar() { this.cargarNivel(); }
    // Drill-down: área → grupo
    drillArea(area) {
        this.filtroArea = area;
        this.setNivel('grupo');
    }
    drillGrupo(_grupoId) {
        this.setNivel('agente');
    }
    // ── Carga de datos ─────────────────────────────────────────────────────────
    headers() {
        return new HttpHeaders({ Authorization: `Bearer ${this.auth.getToken()}` });
    }
    params() {
        return new HttpParams()
            .set('desde', this.desde)
            .set('hasta', this.hasta);
    }
    cargarEjecutivo() {
        this.loadingEjec.set(true);
        this.http.get('/api/v1/admin/kpis/ejecutivo', { headers: this.headers(), params: this.params() }).subscribe({
            next: d => { this.ejec.set(d); this.loadingEjec.set(false); },
            error: () => this.loadingEjec.set(false),
        });
        // Tendencia siempre junto al ejecutivo
        this.http.get('/api/v1/admin/kpis/tendencia', { headers: this.headers(), params: new HttpParams().set('meses', '6') }).subscribe({ next: d => this.tendencia.set(d), error: () => { } });
    }
    cargarAreas() {
        this.loadingArea.set(true);
        this.http.get('/api/v1/admin/kpis/por-area', { headers: this.headers(), params: this.params() }).subscribe({
            next: d => { this.areas.set(d); this.loadingArea.set(false); },
            error: () => this.loadingArea.set(false),
        });
    }
    cargarGrupos() {
        this.loadingGrupo.set(true);
        let p = this.params();
        if (this.filtroArea)
            p = p.set('area', this.filtroArea);
        this.http.get('/api/v1/admin/kpis/por-grupo', { headers: this.headers(), params: p }).subscribe({
            next: d => { this.grupos.set(d); this.loadingGrupo.set(false); },
            error: () => this.loadingGrupo.set(false),
        });
    }
    cargarAgentes() {
        this.loadingAgente.set(true);
        this.http.get('/api/v1/admin/kpis/por-agente', { headers: this.headers(), params: this.params() }).subscribe({
            next: d => { this.agentes.set(d); this.loadingAgente.set(false); },
            error: () => this.loadingAgente.set(false),
        });
    }
    // ── Exportación CSV ────────────────────────────────────────────────────────
    exportar() {
        this.exportando.set(true);
        this.http.post('/api/v1/admin/tickets/exportar', { desde: this.desde, hasta: this.hasta }, { headers: this.headers(), responseType: 'blob' }).subscribe({
            next: blob => {
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `tickets_${this.desde}_${this.hasta}.csv`;
                a.click();
                URL.revokeObjectURL(url);
                this.exportando.set(false);
            },
            error: () => this.exportando.set(false),
        });
    }
    // ── Helpers de período ─────────────────────────────────────────────────────
    setPeriodo(dias) {
        this.hasta = this._hoy();
        this.desde = this._haceNDias(dias);
        this.cargarNivel();
    }
    _hoy() {
        return new Date().toISOString().split('T')[0];
    }
    _haceNDias(n) {
        const d = new Date();
        d.setDate(d.getDate() - n);
        return d.toISOString().split('T')[0];
    }
};
AdminKpisComponent = __decorate([
    Component({
        selector: 'app-admin-kpis',
        standalone: true,
        imports: [CommonModule, FormsModule, RouterModule, NavbarComponent, DecimalPipe],
        template: `
    <div class="page">
      <app-navbar section="KPIs" />

      <div class="content content--wide">

        <!-- Header + filtros de período -->
        <div class="kpi-header">
          <div>
            <h1 class="page-title">📊 Centro de KPIs</h1>
            <p class="page-sub">De ejecutivo a agente — solo Administrador</p>
          </div>
          <div class="period-controls">
            <input type="date" class="input input--sm" [(ngModel)]="desde" (change)="recargar()" />
            <span class="text-muted">→</span>
            <input type="date" class="input input--sm" [(ngModel)]="hasta" (change)="recargar()" />
            <button class="btn btn--ghost btn--sm" (click)="setPeriodo(30)">30d</button>
            <button class="btn btn--ghost btn--sm" (click)="setPeriodo(90)">90d</button>
            <button class="btn btn--ghost btn--sm" (click)="setPeriodo(180)">6m</button>
          </div>
        </div>

        <!-- Tabs de nivel -->
        <div class="nivel-tabs">
          @for (n of niveles; track n.key) {
            <button class="nivel-tab"
              [class.nivel-tab--active]="nivel() === n.key"
              (click)="setNivel(n.key)">
              {{ n.icon }} {{ n.label }}
            </button>
          }
        </div>

        <!-- ════════ NIVEL 1: EJECUTIVO ════════ -->
        @if (nivel() === 'ejecutivo') {
          @if (loadingEjec()) {
            <div class="loading">Cargando KPIs ejecutivos…</div>
          } @else if (ejec()) {
            <!-- Big numbers row -->
            <div class="bignum-grid">
              <div class="bignum-card">
                <div class="bignum-val">{{ ejec()!.total_tickets | number }}</div>
                <div class="bignum-lbl">Tickets totales</div>
                <div class="bignum-sub">{{ ejec()!.tickets_por_dia_promedio | number:'1.1-1' }}/día</div>
              </div>
              <div class="bignum-card" [class.bignum-card--green]="ejec()!.sla_cumplido_pct >= 85"
                   [class.bignum-card--amber]="ejec()!.sla_cumplido_pct >= 60 && ejec()!.sla_cumplido_pct < 85"
                   [class.bignum-card--red]="ejec()!.sla_cumplido_pct < 60">
                <div class="bignum-val">{{ ejec()!.sla_cumplido_pct | number:'1.1-1' }}%</div>
                <div class="bignum-lbl">SLA cumplido</div>
                <div class="bignum-sub">{{ ejec()!.tickets_sin_sla }} sin política SLA</div>
              </div>
              <div class="bignum-card">
                <div class="bignum-val">
                  {{ ejec()!.tiempo_resolucion_p50_horas !== null
                     ? (ejec()!.tiempo_resolucion_p50_horas! | number:'1.1-1') + 'h'
                     : '—' }}
                </div>
                <div class="bignum-lbl">Tiempo mediana (p50)</div>
                <div class="bignum-sub">p90: {{ ejec()!.tiempo_resolucion_p90_horas !== null
                  ? (ejec()!.tiempo_resolucion_p90_horas! | number:'1.1-1') + 'h' : '—' }}</div>
              </div>
              <div class="bignum-card" [class.bignum-card--green]="ejec()!.csat_satisfaccion_pct >= 95">
                <div class="bignum-val">{{ ejec()!.csat_satisfaccion_pct | number:'1.1-1' }}%</div>
                <div class="bignum-lbl">CSAT satisfacción</div>
                <div class="bignum-sub">{{ ejec()!.csat_tasa_respuesta_pct | number:'1.1-1' }}% tasa respuesta · {{ ejec()!.csat_respuestas }} reseñas</div>
              </div>
              <div class="bignum-card">
                <div class="bignum-val">{{ ejec()!.tickets_origen_dany | number }}</div>
                <div class="bignum-lbl">Desde Dany</div>
                <div class="bignum-sub">{{ ejec()!.tasa_deflexion_dany_pct | number:'1.1-1' }}% deflexión (activo Sprint 3)</div>
              </div>
              <div class="bignum-card" [class.bignum-card--amber]="ejec()!.tasa_reapertura_pct > 5">
                <div class="bignum-val">{{ ejec()!.tasa_reapertura_pct | number:'1.1-1' }}%</div>
                <div class="bignum-lbl">Tasa reapertura</div>
                <div class="bignum-sub">{{ ejec()!.total_reaperturas }} rechazos en período</div>
              </div>
            </div>

            <!-- Tendencia -->
            @if (tendencia().length > 0) {
              <div class="section-title">Tendencia {{ tendencia().length }} meses</div>
              <div class="trend-table">
                <div class="trend-head">
                  <span>Mes</span>
                  <span>Tickets</span>
                  <span>SLA %</span>
                  <span>p50 (h)</span>
                  <span>CSAT %</span>
                  <span>Dany</span>
                </div>
                @for (t of tendencia(); track t.mes) {
                  <div class="trend-row">
                    <span class="trend-mes">{{ t.mes }}</span>
                    <span>{{ t.total_tickets }}</span>
                    <span [class.text-green]="t.sla_cumplido_pct && t.sla_cumplido_pct >= 85"
                          [class.text-red]="t.sla_cumplido_pct && t.sla_cumplido_pct < 60">
                      {{ t.sla_cumplido_pct !== null ? (t.sla_cumplido_pct | number:'1.1-1') + '%' : '—' }}
                    </span>
                    <span>{{ t.tiempo_p50_horas !== null ? (t.tiempo_p50_horas | number:'1.1-1') : '—' }}</span>
                    <span>{{ t.csat_pct !== null ? (t.csat_pct | number:'1.1-1') + '%' : '—' }}</span>
                    <span>{{ t.tickets_dany }}</span>
                  </div>
                }
              </div>
            }
          }
        }

        <!-- ════════ NIVEL 2: POR ÁREA ════════ -->
        @if (nivel() === 'area') {
          @if (loadingArea()) {
            <div class="loading">Cargando por área…</div>
          } @else {
            <div class="kpi-table">
              <div class="kpi-thead">
                <span>Área</span>
                <span class="text-right">Tickets</span>
                <span class="text-right">% Total</span>
                <span class="text-right">SLA %</span>
                <span class="text-right">p50 (h)</span>
                <span class="text-right">p90 (h)</span>
                <span class="text-right">CSAT %</span>
                <span class="text-right">Vencidos</span>
                <span class="text-right">Sin SLA</span>
              </div>
              @for (a of areas(); track a.area) {
                <div class="kpi-row" (click)="drillArea(a.area)">
                  <span class="area-badge area--{{ a.area.toLowerCase() }}">{{ a.area }}</span>
                  <span class="text-right fw600">{{ a.total_tickets }}</span>
                  <span class="text-right">{{ a.pct_del_total | number:'1.1-1' }}%</span>
                  <span class="text-right" [class.text-green]="a.sla_cumplido_pct && a.sla_cumplido_pct >= 85"
                        [class.text-red]="a.sla_cumplido_pct && a.sla_cumplido_pct < 60">
                    {{ a.sla_cumplido_pct !== null ? (a.sla_cumplido_pct | number:'1.1-1') + '%' : '—' }}
                  </span>
                  <span class="text-right">{{ a.tiempo_p50_horas !== null ? (a.tiempo_p50_horas! | number:'1.1-1') : '—' }}</span>
                  <span class="text-right">{{ a.tiempo_p90_horas !== null ? (a.tiempo_p90_horas! | number:'1.1-1') : '—' }}</span>
                  <span class="text-right">{{ a.csat_pct !== null ? (a.csat_pct | number:'1.1-1') + '%' : '—' }}</span>
                  <span class="text-right" [class.text-red]="a.tickets_vencidos > 0">{{ a.tickets_vencidos }}</span>
                  <span class="text-right text-muted">{{ a.tickets_sin_sla }}</span>
                </div>
              }
            </div>
            <p class="text-muted text-sm" style="margin-top:8px">Clic en un área para ver sus grupos →</p>
          }
        }

        <!-- ════════ NIVEL 3: POR GRUPO ════════ -->
        @if (nivel() === 'grupo') {
          <div class="filter-row" style="margin-bottom:12px">
            <select class="input filter-select" [(ngModel)]="filtroArea" (change)="cargarGrupos()">
              <option value="">Todas las áreas</option>
              <option value="SISTEMAS">SISTEMAS</option>
              <option value="MANTENIMIENTO">MANTENIMIENTO</option>
              <option value="OPERACIONES">OPERACIONES</option>
              <option value="ABASTO">ABASTO</option>
              <option value="FINANZAS">FINANZAS</option>
              <option value="COMERCIAL">COMERCIAL</option>
            </select>
          </div>
          @if (loadingGrupo()) {
            <div class="loading">Cargando grupos…</div>
          } @else {
            <div class="kpi-table">
              <div class="kpi-thead">
                <span>Grupo</span>
                <span>Área</span>
                <span class="text-right">Total</span>
                <span class="text-right">Activos</span>
                <span class="text-right">SLA %</span>
                <span class="text-right">p50 (h)</span>
                <span class="text-right">CSAT %</span>
                <span class="text-right">Agentes</span>
                <span class="text-right">Vencidos</span>
              </div>
              @for (g of grupos(); track g.grupo_id) {
                <div class="kpi-row" (click)="drillGrupo(g.grupo_id)">
                  <span class="fw600">{{ g.grupo_nombre }}</span>
                  <span class="text-muted text-sm">{{ g.area }}</span>
                  <span class="text-right">{{ g.total_tickets }}</span>
                  <span class="text-right" [class.text-amber]="g.tickets_activos > 20">{{ g.tickets_activos }}</span>
                  <span class="text-right" [class.text-green]="g.sla_cumplido_pct && g.sla_cumplido_pct >= 85"
                        [class.text-red]="g.sla_cumplido_pct && g.sla_cumplido_pct < 60">
                    {{ g.sla_cumplido_pct !== null ? (g.sla_cumplido_pct | number:'1.1-1') + '%' : '—' }}
                  </span>
                  <span class="text-right">{{ g.tiempo_p50_horas !== null ? (g.tiempo_p50_horas! | number:'1.1-1') : '—' }}</span>
                  <span class="text-right">{{ g.csat_pct !== null ? (g.csat_pct | number:'1.1-1') + '%' : '—' }}</span>
                  <span class="text-right">{{ g.agentes_activos }}</span>
                  <span class="text-right" [class.text-red]="g.tickets_vencidos > 0">{{ g.tickets_vencidos }}</span>
                </div>
              }
            </div>
            <p class="text-muted text-sm" style="margin-top:8px">Clic en un grupo para ver sus agentes →</p>
          }
        }

        <!-- ════════ NIVEL 4: POR AGENTE ════════ -->
        @if (nivel() === 'agente') {
          <div class="filter-row" style="margin-bottom:12px">
            <input class="input input--sm" placeholder="Buscar agente…"
                   [(ngModel)]="busquedaAgente" style="width:220px" />
          </div>
          @if (loadingAgente()) {
            <div class="loading">Cargando agentes…</div>
          } @else {
            <div class="kpi-table">
              <div class="kpi-thead">
                <span>Agente</span>
                <span>Grupo</span>
                <span class="text-right">Cerrados</span>
                <span class="text-right">Activos</span>
                <span class="text-right">t̄ res. (h)</span>
                <span class="text-right">t̄ 1ª resp.</span>
                <span class="text-right">SLA %</span>
                <span class="text-right">CSAT</span>
                <span class="text-right">Escalados</span>
                <span class="text-right">Reap. %</span>
                <span class="text-right">Estado</span>
              </div>
              @for (a of agentesFiltrados(); track a.agente_id) {
                <div class="kpi-row">
                  <div class="agente-cell">
                    <span class="fw600">{{ a.nombre }}</span>
                    <span class="text-muted text-xs">{{ a.email }}</span>
                  </div>
                  <span class="text-sm text-muted">{{ a.grupo || '—' }}</span>
                  <span class="text-right fw600">{{ a.tickets_cerrados }}</span>
                  <span class="text-right">{{ a.tickets_activos }}</span>
                  <span class="text-right">{{ a.tiempo_promedio_horas !== null ? (a.tiempo_promedio_horas | number:'1.1-1') : '—' }}</span>
                  <span class="text-right">{{ a.tiempo_primera_respuesta_horas !== null ? (a.tiempo_primera_respuesta_horas | number:'1.1-1') : '—' }}</span>
                  <span class="text-right" [class.text-green]="a.sla_cumplido_pct && a.sla_cumplido_pct >= 85"
                        [class.text-red]="a.sla_cumplido_pct && a.sla_cumplido_pct < 60">
                    {{ a.sla_cumplido_pct !== null ? (a.sla_cumplido_pct | number:'1.1-1') + '%' : '—' }}
                  </span>
                  <span class="text-right">
                    {{ a.csat_promedio !== null ? (a.csat_promedio | number:'1.1-1') : '—' }}
                    <span class="text-muted text-xs">({{ a.csat_respuestas }})</span>
                  </span>
                  <span class="text-right">{{ a.total_escalados }}</span>
                  <span class="text-right" [class.text-amber]="a.tasa_reapertura_pct && a.tasa_reapertura_pct > 5">
                    {{ a.tasa_reapertura_pct !== null ? (a.tasa_reapertura_pct | number:'1.1-1') + '%' : '—' }}
                  </span>
                  <span class="text-right">
                    <span class="dot" [class.dot--green]="a.disponible" [class.dot--gray]="!a.disponible"></span>
                  </span>
                </div>
              }
            </div>
          }

          <!-- Export button -->
          <div class="export-bar">
            <button class="btn btn--primary btn--sm" (click)="exportar()" [disabled]="exportando()">
              {{ exportando() ? '⏳ Generando…' : '⬇️ Exportar CSV' }}
            </button>
            <span class="text-muted text-sm">Descarga todos los tickets del período con métricas SLA</span>
          </div>
        }

      </div>
    </div>
  `,
        styles: [`
    .kpi-header {
      display: flex; justify-content: space-between; align-items: flex-start;
      margin-bottom: 20px; flex-wrap: wrap; gap: 12px;
    }
    .page-title { font-size: 22px; font-weight: 600; }
    .page-sub   { font-size: 13px; color: var(--c-muted); }
    .period-controls { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .input--sm { padding: 5px 10px; font-size: 13px; border-radius: 6px; border: 1px solid var(--c-border); }

    /* Tabs de nivel */
    .nivel-tabs { display: flex; gap: 6px; margin-bottom: 20px; flex-wrap: wrap; }
    .nivel-tab {
      padding: 7px 18px; border-radius: 20px; font-size: 13px; font-weight: 500;
      border: 1.5px solid var(--c-border); background: var(--c-surface); color: var(--c-muted);
      cursor: pointer; transition: all .15s;
    }
    .nivel-tab:hover { border-color: var(--c-blue); color: var(--c-blue); }
    .nivel-tab--active { background: var(--c-blue); border-color: var(--c-blue); color: white; }

    /* Big numbers */
    .bignum-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
      gap: 12px; margin-bottom: 28px;
    }
    .bignum-card {
      background: var(--c-surface);
      border: 1px solid var(--c-border);
      border-radius: var(--radius-lg);
      padding: 16px 18px;
      border-top: 4px solid var(--c-blue);
    }
    .bignum-card--green { border-top-color: #00A878; }
    .bignum-card--amber { border-top-color: #F59E0B; }
    .bignum-card--red   { border-top-color: #EF4444; }
    .bignum-val { font-size: 32px; font-weight: 800; line-height: 1; margin-bottom: 4px; }
    .bignum-lbl { font-size: 12px; font-weight: 600; color: var(--c-text); margin-bottom: 2px; }
    .bignum-sub { font-size: 11px; color: var(--c-muted); }

    /* Tendencia */
    .section-title { font-size: 14px; font-weight: 600; margin-bottom: 10px; color: var(--c-muted); text-transform: uppercase; letter-spacing: .05em; }
    .trend-table { background: var(--c-surface); border: 1px solid var(--c-border); border-radius: var(--radius-lg); overflow: hidden; margin-bottom: 20px; }
    .trend-head {
      display: grid; grid-template-columns: 90px repeat(5, 1fr);
      padding: 8px 14px; background: var(--c-bg);
      font-size: 11px; font-weight: 600; color: var(--c-muted); text-transform: uppercase;
      border-bottom: 1px solid var(--c-border);
    }
    .trend-row {
      display: grid; grid-template-columns: 90px repeat(5, 1fr);
      padding: 9px 14px; font-size: 13px;
      border-bottom: 1px solid var(--c-border); transition: background .1s;
    }
    .trend-row:last-child { border-bottom: none; }
    .trend-row:hover { background: var(--c-bg); }
    .trend-mes { font-weight: 600; }

    /* KPI Table (áreas, grupos, agentes) */
    .kpi-table { background: var(--c-surface); border: 1px solid var(--c-border); border-radius: var(--radius-lg); overflow: hidden; }
    .kpi-thead {
      display: grid; grid-template-columns: 2fr 1.2fr repeat(7, 1fr);
      padding: 9px 14px; background: var(--c-bg);
      font-size: 11px; font-weight: 600; color: var(--c-muted);
      text-transform: uppercase; letter-spacing: .04em;
      border-bottom: 1px solid var(--c-border);
    }
    .kpi-row {
      display: grid; grid-template-columns: 2fr 1.2fr repeat(7, 1fr);
      padding: 11px 14px; font-size: 13px;
      border-bottom: 1px solid var(--c-border);
      align-items: center; transition: background .1s; cursor: pointer;
    }
    .kpi-row:last-child { border-bottom: none; }
    .kpi-row:hover { background: var(--c-bg); }

    /* Agentes: grid diferente (más columnas) */
    .nivel-tab--active ~ * .kpi-thead,
    app-admin-kpis .kpi-table:has(.agente-cell) .kpi-thead,
    app-admin-kpis .kpi-table:has(.agente-cell) .kpi-row {
      grid-template-columns: 2fr 1fr repeat(9, 1fr);
    }
    .agente-cell { display: flex; flex-direction: column; gap: 1px; }

    /* Badges */
    .area-badge {
      display: inline-block; padding: 2px 8px; border-radius: 12px;
      font-size: 11px; font-weight: 700;
      background: var(--c-bg); border: 1px solid var(--c-border);
    }
    .area--sistemas      { background:#e0f0ff; color:#1B3462; border-color:#1B3462; }
    .area--mantenimiento { background:#fff3e0; color:#E65100; border-color:#E65100; }
    .area--operaciones   { background:#f3e0ff; color:#5B0090; border-color:#5B0090; }
    .area--abasto        { background:#e0fff4; color:#00695C; border-color:#00695C; }
    .area--finanzas      { background:#fff8e0; color:#795548; border-color:#795548; }
    .area--comercial     { background:#e8f5e9; color:#2E7D32; border-color:#2E7D32; }

    /* Utilidades */
    .text-right { text-align: right; }
    .text-green { color: #00A878; font-weight: 600; }
    .text-amber { color: #F59E0B; font-weight: 600; }
    .text-red   { color: #EF4444; font-weight: 600; }
    .text-muted { color: var(--c-muted); }
    .text-sm    { font-size: 12px; }
    .text-xs    { font-size: 10px; }
    .fw600      { font-weight: 600; }
    .dot { display:inline-block; width:8px; height:8px; border-radius:50%; }
    .dot--green { background:#00A878; }
    .dot--gray  { background:#CBD5E1; }

    .filter-row { display:flex; gap:10px; align-items:center; flex-wrap:wrap; }
    .filter-select { padding:5px 10px; border-radius:20px; font-size:13px; border:1px solid var(--c-border); }

    .export-bar { display:flex; align-items:center; gap:12px; margin-top:16px; }
    .loading { text-align:center; padding:48px; color:var(--c-muted); font-size:14px; }

    @media (max-width: 1100px) {
      .kpi-thead, .kpi-row { grid-template-columns: 2fr 1fr repeat(4, 1fr); }
      .kpi-thead span:nth-child(n+7), .kpi-row > span:nth-child(n+7) { display: none; }
      .bignum-grid { grid-template-columns: repeat(3, 1fr); }
    }
  `],
    })
], AdminKpisComponent);
export { AdminKpisComponent };
//# sourceMappingURL=admin-kpis.component.js.map