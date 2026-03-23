import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { TicketService } from '../../core/services/ticket.service';
import { NavbarComponent } from '../../shared/components/navbar.component';
import { StatusBadgeComponent } from '../../shared/components/status-badge.component';
import { EvidenciasComponent } from '../../shared/components/evidencias.component';
import { Ticket } from '../../core/models';

const ACCION_ICON: Record<string, string> = {
  CREACION: '📋',
  ASIGNACION_AUTO: '🤖',
  ASIGNACION: '👤',
  CAMBIO_ESTADO: '🔄',
  ACTUALIZACION: '✏️',
};

@Component({
  selector: 'app-ticket-detalle',
  standalone: true,
  imports: [CommonModule, FormsModule, NavbarComponent, StatusBadgeComponent, EvidenciasComponent],
  template: `
    <div class="page">
      <app-navbar section="Detalle de reporte" />
      <div class="content content--narrow">

        @if (loading()) {
          <div style="padding:60px 0;text-align:center;color:var(--c-muted)">
            Cargando...
          </div>
        }

        @if (ticket()) {
          <!-- Header -->
          <div class="detail-header">
            <button class="btn btn--ghost btn--sm" (click)="back()">
              ← Mis reportes
            </button>
            <div class="header-right">
              <span class="folio">{{ ticket()!.folio }}</span>
              <app-status-badge [status]="ticket()!.estatus" />
              @if (ticket()!.sla_vencido) {
                <span class="badge badge--red">⚠ SLA Vencido</span>
              }
            </div>
          </div>

          <!-- Descripción -->
          <div class="card mt-4">
            <div class="card-section">
              <h3 class="section-h">Tu reporte</h3>
              <p class="desc-text">{{ ticket()!.descripcion }}</p>
            </div>

            @if (ticket()!.tipificacion) {
              <div class="divider"></div>
              <div class="meta-grid">
                <div class="meta-item">
                  <span class="meta-label">Área</span>
                  <span class="badge badge--blue">{{ ticket()!.tipificacion!.area_tecnica }}</span>
                </div>
                <div class="meta-item">
                  <span class="meta-label">Categoría</span>
                  <span>{{ ticket()!.tipificacion!.categoria }}</span>
                </div>
                <div class="meta-item">
                  <span class="meta-label">Problema</span>
                  <span>{{ ticket()!.tipificacion!.problema }}</span>
                </div>
                <div class="meta-item">
                  <span class="meta-label">Prioridad</span>
                  <span>{{ ticket()!.prioridad }}</span>
                </div>
                @if (ticket()!.sla_limite) {
                  <div class="meta-item">
                    <span class="meta-label">Tiempo límite</span>
                    <span [class.text-red]="ticket()!.sla_vencido">
                      {{ ticket()!.sla_limite | date:'dd/MM/yyyy HH:mm' }}
                    </span>
                  </div>
                }
                @if (ticket()!.ia_confianza !== null) {
                  <div class="meta-item">
                    <span class="meta-label">Clasificación IA</span>
                    <span class="ia-chip">
                      <span class="ia-icon">✦</span>
                      {{ ticket()!.ia_confianza }}% confianza
                    </span>
                  </div>
                }
              </div>
            }
          </div>

          <!-- Solución propuesta por el agente -->
          @if (ticket()!.solucion_propuesta) {
            <div class="card mt-4 solution-card">
              <h3 class="section-h">Solución propuesta</h3>
              <p class="solution-text">{{ ticket()!.solucion_propuesta }}</p>

              @if (ticket()!.estatus === 'ESPERANDO_TIENDA') {
                <div class="confirm-actions">
                  <p class="text-sm text-muted" style="margin-bottom:12px">
                    ¿El problema quedó resuelto?
                  </p>
                  <div class="flex gap-3">
                    <button
                      class="btn btn--success"
                      [class.btn--loading]="updatingStatus()"
                      (click)="confirmar()"
                      [disabled]="updatingStatus()"
                    >
                      ✓ Sí, quedó resuelto
                    </button>
                    <button
                      class="btn btn--ghost btn--danger-ghost"
                      [disabled]="updatingStatus()"
                      (click)="showRejection.set(true)"
                    >
                      ↩ No, reabrir
                    </button>
                  </div>

                  @if (showRejection()) {
                    <div class="rejection-form slide-down">
                      <div class="field mt-4">
                        <label class="field__label field__label--required">
                          ¿Por qué no quedó resuelto?
                        </label>
                        <textarea
                          class="input"
                          [(ngModel)]="rechazarMotivo"
                          placeholder="Describe qué sigue fallando..."
                          rows="3"
                        ></textarea>
                      </div>
                      <button
                        class="btn btn--danger mt-4"
                        [class.btn--loading]="updatingStatus()"
                        (click)="rechazar()"
                        [disabled]="updatingStatus() || !rechazarMotivo"
                      >
                        Confirmar reapertura
                      </button>
                    </div>
                  }
                </div>
              }
            </div>
          }

          <!-- Evidencias -->
          <div class="card mt-4">
            <app-evidencias
              [ticketId]="ticket()!.id"
              [canUpload]="ticket()!.estatus !== 'CERRADO' && ticket()!.estatus !== 'CANCELADO'"
            />
          </div>

          <!-- Timeline / Bitácora -->
          <div class="card mt-4">
            <h3 class="section-h" style="margin-bottom:16px">Historial de actividad</h3>
            <div class="timeline">
              @for (ev of eventosPublicos(); track ev.id) {
                <div class="timeline__item">
                  <div
                    class="timeline__dot"
                    [class]="timelineDotClass(ev.accion)"
                  >
                    {{ accionIcon(ev.accion) }}
                  </div>
                  <div class="timeline__body">
                    <p class="timeline__action">
                      {{ accionLabel(ev.accion) }}
                      @if (ev.estado_nuevo) {
                        → <strong>{{ ev.estado_nuevo }}</strong>
                      }
                    </p>
                    <p class="timeline__meta">
                      {{ ev.usuario?.nombre ?? 'Sistema' }}
                      · {{ ev.timestamp | date:'dd/MM HH:mm' }}
                    </p>
                    @if (ev.comentario) {
                      <div class="timeline__comment">{{ ev.comentario }}</div>
                    }
                  </div>
                </div>
              }
            </div>
          </div>
        }
      </div>
    </div>
  `,
  styles: [`
    .page { display: flex; flex-direction: column; min-height: 100vh; }
    .detail-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
    }
    .header-right { display: flex; align-items: center; gap: 8px; }
    .folio {
      font-family: monospace;
      font-size: 14px;
      font-weight: 700;
      color: var(--c-blue);
    }
    .card-section { margin-bottom: 12px; }
    .section-h { font-size: 15px; font-weight: 600; margin-bottom: 10px; }
    .desc-text { font-size: 15px; line-height: 1.6; }
    .meta-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 12px;
    }
    .meta-item { display: flex; flex-direction: column; gap: 3px; }
    .meta-label { font-size: 11px; color: var(--c-muted); text-transform: uppercase; letter-spacing: .04em; }
    .text-red { color: var(--c-red); font-weight: 500; }

    .solution-card { border-left: 3px solid var(--c-green); }
    .solution-text { font-size: 14px; line-height: 1.6; margin-bottom: 16px; }
    .confirm-actions { padding-top: 14px; border-top: 1px solid var(--c-border); }
    .btn--danger-ghost {
      border: 1px solid var(--c-red-md);
      color: var(--c-red);
    }
    .btn--danger-ghost:hover { background: var(--c-red-lt); }
    .rejection-form { margin-top: 4px; }
  `],
})
export class TicketDetalleComponent implements OnInit {
  ticket = signal<Ticket | null>(null);
  loading = signal(true);
  updatingStatus = signal(false);
  showRejection = signal(false);
  rechazarMotivo = '';

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private ticketSvc: TicketService,
  ) { }

  ngOnInit() {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    this.ticketSvc.get(id).subscribe({
      next: t => { this.ticket.set(t); this.loading.set(false); },
      error: () => { this.loading.set(false); this.router.navigate(['/tienda']); },
    });
  }

  confirmar() {
    if (this.updatingStatus()) return;
    this.updatingStatus.set(true);
    this.ticketSvc.update(this.ticket()!.id, {
      estatus: 'RESUELTO',
      comentario: 'Tienda confirmó que el problema quedó resuelto.',
    }).subscribe({
      next: t => { this.ticket.set(t); this.updatingStatus.set(false); },
      error: () => this.updatingStatus.set(false),
    });
  }

  rechazar() {
    if (this.updatingStatus() || !this.rechazarMotivo) return;
    this.updatingStatus.set(true);
    this.ticketSvc.update(this.ticket()!.id, {
      estatus: 'RECHAZADO',
      comentario: this.rechazarMotivo,
    }).subscribe({
      next: t => {
        this.ticket.set(t);
        this.updatingStatus.set(false);
        this.showRejection.set(false);
      },
      error: () => this.updatingStatus.set(false),
    });
  }

  accionIcon(a: string) { return ACCION_ICON[a] ?? '•'; }

  accionLabel(a: string) {
    const map: Record<string, string> = {
      CREACION: 'Reporte creado',
      ASIGNACION_AUTO: 'Asignado automáticamente',
      ASIGNACION: 'Reasignado',
      CAMBIO_ESTADO: 'Cambio de estado',
      ACTUALIZACION: 'Actualización',
    };
    return map[a] ?? a;
  }

  timelineDotClass(a: string) {
    if (a === 'ASIGNACION_AUTO') return 'timeline__dot--teal';
    if (a === 'CREACION') return 'timeline__dot--blue';
    if (a === 'CAMBIO_ESTADO') return 'timeline__dot--amber';
    return '';
  }

  // La tienda solo ve comentarios PUBLICOS
  eventosPublicos() {
    return (this.ticket()?.eventos ?? []).filter(
      ev => !ev.tipo_comentario || ev.tipo_comentario === 'PUBLICO'
    );
  }

  back() { this.router.navigate(['/tienda']); }
}
