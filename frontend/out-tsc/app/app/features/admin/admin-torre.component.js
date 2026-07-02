import { __decorate } from "tslib";
import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
let AdminTorreComponent = class AdminTorreComponent {
    constructor(adminService, router) {
        this.adminService = adminService;
        this.router = router;
        this.alertas = signal([]);
        this.loading = signal(true);
    }
    ngOnInit() { this.load(); }
    load() {
        this.loading.set(true);
        this.adminService.getTorre().subscribe({
            next: data => { this.alertas.set(data); this.loading.set(false); },
            error: () => this.loading.set(false),
        });
    }
    tieneVencidos() {
        return this.alertas().some(a => a.alerta === 'SLA_VENCIDO');
    }
    labelAlerta(a) {
        const labels = {
            SLA_VENCIDO: 'SLA vencido',
            SLA_PROXIMO: 'SLA próximo',
            SIN_AGENTE: 'Sin agente',
            ESTANCADO: 'Estancado',
        };
        return labels[a] ?? a;
    }
    verTicket(id) {
        this.router.navigate(['/agente/ticket', id]);
    }
};
AdminTorreComponent = __decorate([
    Component({
        selector: 'app-admin-torre',
        standalone: true,
        imports: [CommonModule],
        template: `
    <div class="torre">
      <div class="torre-header">
        <div class="torre-title">
          <span class="torre-dot" [class]="tieneVencidos() ? 'dot--red' : 'dot--green'"></span>
          Torre de Control
          @if (alertas().length > 0) {
            <span class="badge badge--red">{{ alertas().length }}</span>
          }
        </div>
        <button class="btn btn--sm btn--outline" (click)="load()" [disabled]="loading()">
          ↺ Actualizar
        </button>
      </div>

      @if (loading()) {
        <div class="empty-state">Cargando alertas…</div>
      } @else if (alertas().length === 0) {
        <div class="ok-state">
          <span class="ok-icon">✅</span>
          <p>Sin alertas activas. Todos los tickets están dentro de SLA.</p>
        </div>
      } @else {
        <!-- Leyenda -->
        <div class="leyenda">
          <span class="badge-alerta badge-alerta--SLA_VENCIDO">SLA vencido</span>
          <span class="badge-alerta badge-alerta--SLA_PROXIMO">SLA próximo (&lt;2h)</span>
          <span class="badge-alerta badge-alerta--SIN_AGENTE">Sin agente</span>
          <span class="badge-alerta badge-alerta--ESTANCADO">Estancado (&gt;24h)</span>
        </div>

        <div class="alerta-list">
          @for (a of alertas(); track a.ticket_id) {
            <div class="alerta-card" [class]="'alerta-card--' + a.alerta" (click)="verTicket(a.ticket_id)">
              <div class="alerta-left">
                <span class="badge-alerta" [class]="'badge-alerta--' + a.alerta">{{ labelAlerta(a.alerta) }}</span>
                <span class="alerta-folio">{{ a.folio }}</span>
              </div>
              <div class="alerta-center">
                <div class="alerta-tienda">{{ a.tienda }}</div>
                <div class="alerta-tip">{{ a.tipificacion || '—' }}</div>
              </div>
              <div class="alerta-right">
                <div class="alerta-agente">{{ a.agente || 'Sin agente' }}</div>
                <div class="alerta-meta">
                  <span class="chip chip--{{ a.prioridad.toLowerCase() }}">{{ a.prioridad }}</span>
                  <span class="alerta-horas">{{ a.horas_abierto }}h abierto</span>
                </div>
              </div>
              @if (a.sla_limite) {
                <div class="alerta-sla" [class.sla--vencido]="a.sla_vencido">
                  SLA: {{ a.sla_limite | date:'dd/MM HH:mm' }}
                </div>
              }
              <span class="alerta-cta">Ver →</span>
            </div>
          }
        </div>
      }
    </div>
  `,
        styles: [`
    .torre { }
    .torre-header {
      display: flex; align-items: center; justify-content: space-between;
      margin-bottom: 20px;
    }
    .torre-title {
      display: flex; align-items: center; gap: 10px;
      font-size: 18px; font-weight: 600;
    }
    .torre-dot {
      width: 10px; height: 10px; border-radius: 50%; display: inline-block;
    }
    .dot--red { background: var(--c-red); box-shadow: 0 0 0 3px rgba(229,57,53,.2); animation: pulse 1.5s infinite; }
    .dot--green { background: var(--c-green); }
    @keyframes pulse {
      0%, 100% { box-shadow: 0 0 0 3px rgba(229,57,53,.2); }
      50% { box-shadow: 0 0 0 6px rgba(229,57,53,.1); }
    }
    .badge { padding: 2px 8px; border-radius: 99px; font-size: 12px; font-weight: 700; }
    .badge--red { background: var(--c-red); color: white; }

    .leyenda { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 16px; }

    .badge-alerta {
      padding: 2px 8px; border-radius: 99px; font-size: 11px; font-weight: 600;
    }
    .badge-alerta--SLA_VENCIDO { background: #FFEBEE; color: var(--c-red); }
    .badge-alerta--SLA_PROXIMO { background: #FFF3E0; color: #E65100; }
    .badge-alerta--SIN_AGENTE  { background: #FFFDE7; color: #F57F17; }
    .badge-alerta--ESTANCADO   { background: #E3F2FD; color: #1565C0; }

    .ok-state {
      display: flex; flex-direction: column; align-items: center;
      gap: 12px; padding: 60px 20px; color: var(--c-muted);
    }
    .ok-icon { font-size: 40px; }

    .empty-state { text-align: center; padding: 40px; color: var(--c-muted); }

    .alerta-list { display: flex; flex-direction: column; gap: 8px; }

    .alerta-card {
      display: flex; align-items: center; gap: 16px; padding: 14px 16px;
      background: white; border: 1px solid var(--c-border); border-radius: var(--radius-md);
      border-left: 4px solid; cursor: pointer; transition: box-shadow var(--transition);
    }
    .alerta-card:hover { box-shadow: var(--shadow-md); }
    .alerta-card--SLA_VENCIDO { border-left-color: var(--c-red); }
    .alerta-card--SLA_PROXIMO { border-left-color: #E65100; }
    .alerta-card--SIN_AGENTE  { border-left-color: #F57F17; }
    .alerta-card--ESTANCADO   { border-left-color: #1565C0; }

    .alerta-left { display: flex; flex-direction: column; gap: 4px; min-width: 140px; }
    .alerta-folio { font-family: monospace; font-size: 13px; font-weight: 600; }
    .alerta-center { flex: 1; }
    .alerta-tienda { font-weight: 600; font-size: 14px; }
    .alerta-tip { font-size: 12px; color: var(--c-muted); margin-top: 2px; }
    .alerta-right { min-width: 140px; text-align: right; }
    .alerta-agente { font-size: 13px; }
    .alerta-meta { display: flex; gap: 6px; justify-content: flex-end; margin-top: 4px; align-items: center; }
    .alerta-horas { font-size: 11px; color: var(--c-muted); }
    .alerta-sla { font-size: 11px; color: var(--c-muted); white-space: nowrap; }
    .sla--vencido { color: var(--c-red); font-weight: 600; }
    .alerta-cta { font-size: 12px; color: var(--c-blue); font-weight: 600; white-space: nowrap; }

    .chip {
      padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: 700;
      text-transform: uppercase;
    }
    .chip--critica { background: #FFEBEE; color: var(--c-red); }
    .chip--alta    { background: #FFF3E0; color: #E65100; }
    .chip--media   { background: #E3F2FD; color: #1565C0; }
    .chip--baja    { background: var(--c-bg); color: var(--c-muted); }

    .btn { padding: 8px 16px; border-radius: var(--radius-md); font-size: 13px; cursor: pointer; border: none; }
    .btn--sm { padding: 6px 12px; font-size: 12px; }
    .btn--outline { background: transparent; border: 1px solid var(--c-border); color: var(--c-text); }
    .btn--outline:hover { background: var(--c-bg); }
    .btn:disabled { opacity: .5; cursor: not-allowed; }
  `],
    })
], AdminTorreComponent);
export { AdminTorreComponent };
//# sourceMappingURL=admin-torre.component.js.map