import { Component, OnInit, signal, computed } from '@angular/core';
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
            @if (ticket()!.estatus === 'RECHAZADO') {
              <span class="badge badge--amber" style="font-size:11px">↩ Re-abierto</span>
            }
              @if (ticket()!.sla_vencido) {
                <span class="badge badge--red">⚠ SLA Vencido</span>
              }
            </div>
          </div>

          <!-- Descripción -->
          <div class="card mt-4">
            <div class="card-section">
              <h3 class="section-h" style="margin-bottom:6px">Tu reporte</h3>
              <p class="desc-text desc-text--bold">{{ ticket()!.descripcion }}</p>
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
                  <span><!-- prioridad interna --></span>
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

          <!-- Resolver anticipado: la tienda puede cerrar en cualquier momento -->
          @if (['NUEVO','ASIGNADO','EN_PROCESO','RECHAZADO','ESPERANDO_AGENTE'].includes(ticket()!.estatus) && ticket()!.estatus !== 'CERRADO') {
            <div class="card mt-4 early-resolve-card">
              <div class="early-resolve-inner">
                <div>
                  <p class="font-medium" style="font-size:13px">¿El problema ya se resolvió por cuenta propia?</p>
                  <p class="text-sm text-muted">Puedes marcarlo como resuelto en cualquier momento.</p>
                </div>
                <button
                  class="btn btn--success btn--sm"
                  [class.btn--loading]="updatingStatus()"
                  [disabled]="updatingStatus()"
                  (click)="confirmar()"
                >
                  ✓ Ya se resolvió
                </button>
              </div>
            </div>
          }

          <!-- Solución propuesta por el agente -->
          @if (ticket()!.solucion_propuesta) {
            <div class="card mt-4 solution-card">
              <h3 class="section-h">Solución propuesta</h3>
              <p class="solution-text">{{ ticket()!.solucion_propuesta }}</p>

              @if (ticket()!.estatus === 'ESPERANDO_TIENDA') {
                <div class="confirm-actions">

                  <!-- Respuesta libre -->
                  <div class="field" style="margin-bottom:10px">
                    <label class="field__label">Tu respuesta al agente</label>
                    <textarea
                      class="input"
                      [(ngModel)]="respuestaTexto"
                      placeholder="Escribe aquí lo que sigue pasando o cualquier información adicional..."
                      rows="3"
                    ></textarea>

                    <!-- Adjuntar archivo -->
                    <div class="adj-row">
                      <label class="adj-label">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>
                        Adjuntar archivo
                        <input type="file" style="display:none"
                          accept=".jpg,.jpeg,.png,.webp,.pdf,.mp4"
                          (change)="adjuntarArchivo($event)" />
                      </label>
                      @if (adjuntoSeleccionado()) {
                        <span class="adj-chip">
                          {{ adjuntoSeleccionado()!.nombre }}
                          <button (click)="quitarAdjunto()">✕</button>
                        </span>
                      }
                    </div>
                  </div>

                  <button
                    class="btn btn--primary"
                    style="margin-bottom:12px"
                    [class.btn--loading]="updatingStatus()"
                    (click)="responder()"
                    [disabled]="updatingStatus() || !respuestaTexto.trim()"
                  >
                    ↩ Enviar respuesta al agente
                  </button>

                  <div class="divider" style="margin-bottom:12px"></div>

                  <p class="text-sm text-muted" style="margin-bottom:10px">¿El problema quedó resuelto?</p>
                  <button
                    class="btn btn--success"
                    style="margin-top:4px"
                    [class.btn--loading]="updatingStatus()"
                    (click)="confirmar()"
                    [disabled]="updatingStatus()"
                  >
                    ✓ Sí, quedó resuelto
                  </button>
                </div>
              }

              @if (ticket()!.estatus === 'ESPERANDO_AGENTE') {
                <div class="esperando-agente-info">
                  <span class="ea-icon">⏳</span>
                  <div>
                    <p style="font-size:13px;font-weight:600;margin-bottom:2px">Tu respuesta fue enviada</p>
                    <p style="font-size:12px;color:var(--c-muted)">El agente revisará tu mensaje y te contactará pronto.</p>
                  </div>
                </div>
              }
            </div>
          }

          <!-- Opción de reabrir para tickets RESUELTOS -->
          @if (ticket()!.estatus === 'RESUELTO') {
            <div class="card mt-4" style="border-left: 4px solid var(--c-amber)">
              <div class="flex justify-between items-center flex-wrap gap-4">
                <div>
                  <h3 class="section-h" style="margin-bottom:2px; font-size:15px; font-weight:600;">¿El problema persiste?</h3>
                  <p class="text-sm text-muted">Aún puedes reabrir este reporte si la solución no fue efectiva.</p>
                </div>
                <button
                  class="btn btn--ghost"
                  (click)="showRejection.set(!showRejection())"
                >
                  ✕ Reabrir reporte
                </button>
              </div>

              @if (showRejection()) {
                <div class="mt-4 slide-down">
                  <div class="field">
                    <label class="field__label field__label--required">Motivo de reapertura</label>
                    <textarea
                      class="input"
                      placeholder="Explica qué ocurrió..."
                      [(ngModel)]="rechazarMotivo"
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

          <!-- CSAT — botón que abre modal -->
          @if ((ticket()!.estatus === 'RESUELTO' || ticket()!.estatus === 'CERRADO') && !ticket()!.csat_score) {
            <div class="card mt-4 csat-card">
              <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px">
                <div>
                  <h3 class="section-h" style="margin-bottom:2px">¿Cómo fue el servicio?</h3>
                  <p class="text-sm text-muted">Tu opinión nos ayuda a mejorar. Solo toma un minuto.</p>
                </div>
                <button class="btn btn--primary" (click)="abrirCsat()">
                  ★ Calificar servicio
                </button>
              </div>
            </div>
          }

          @if (ticket()!.csat_score) {
            <div class="card mt-4 csat-done-card">
              <span class="csat-done-stars">
                @for (s of [1,2,3,4,5]; track s) {
                  <span [class.star-active]="ticket()!.csat_score! >= s">★</span>
                }
              </span>
              <span class="text-sm text-muted">Calificaste este servicio con {{ ticket()!.csat_score }}/5</span>
            </div>
          }

          <!-- Modal CSAT -->
          @if (showCsatModal()) {
            <div class="csat-overlay" (click)="cerrarCsatModal()">
              <div class="csat-modal" (click)="$event.stopPropagation()">
                <div class="csat-modal__header">
                  <h2 class="csat-modal__title">Calificar el servicio</h2>
                  <button class="csat-close" (click)="cerrarCsatModal()">✕</button>
                </div>
                <p class="csat-modal__sub">Folio {{ ticket()!.folio }} · Califica del 1 (malo) al 5 (excelente)</p>

                @for (q of csatPreguntas; track q.key) {
                  <div class="csat-pregunta">
                    <p class="csat-pregunta__label">{{ q.label }}</p>
                    <div class="csat-opciones">
                      @for (n of [1,2,3,4,5]; track n) {
                        <button
                          class="csat-opcion"
                          [class.csat-opcion--active]="csatRespuestas()[q.key] >= n"
                          (click)="setCsatRespuesta(q.key, n)"
                        >{{ n }}</button>
                      }
                    </div>
                    <div class="csat-scale-labels">
                      <span>Muy malo</span><span>Excelente</span>
                    </div>
                  </div>
                }

                <div class="field" style="margin-top:16px">
                  <label class="field__label">Comentarios adicionales (opcional)</label>
                  <textarea
                    class="input"
                    [(ngModel)]="csatComentario"
                    rows="3"
                    placeholder="¿Qué podemos mejorar? ¿Algo que te haya gustado especialmente?"
                  ></textarea>
                </div>

                <div class="csat-modal__actions">
                  <button class="btn btn--ghost" (click)="cerrarCsatModal()">Cancelar</button>
                  <button
                    class="btn btn--primary"
                    [class.btn--loading]="sendingCsat()"
                    [disabled]="sendingCsat() || !csatCompleto()"
                    (click)="enviarCsat()"
                  >
                    {{ sendingCsat() ? '' : 'Enviar calificación' }}
                  </button>
                </div>
              </div>
            </div>
          }

          <!-- Evidencias: visible si hay adjuntos O si puede subir -->
          @if (ticket()!.estatus !== 'CERRADO' && ticket()!.estatus !== 'CANCELADO') {
            <div class="card mt-4">
              <app-evidencias [ticketId]="ticket()!.id" [canUpload]="true" />
            </div>
          }

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
    .desc-text--bold { font-weight: 700; font-size: 15px; }
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
    .adj-row {
      display: flex; align-items: center; gap: 8px;
      margin-top: 6px; flex-wrap: wrap;
    }
    .adj-label {
      display: inline-flex; align-items: center; gap: 5px;
      font-size: 12px; color: var(--c-blue); cursor: pointer;
      padding: 4px 10px; border: 1px solid var(--c-blue-md);
      border-radius: 6px; background: var(--c-blue-lt);
      transition: background .12s;
    }
    .adj-label:hover { background: #dbeafe; }
    .adj-chip {
      display: inline-flex; align-items: center; gap: 4px;
      font-size: 11px; background: var(--c-blue-lt); color: var(--c-blue);
      padding: 2px 8px; border-radius: 8px;
    }
    .adj-chip button { background:none; border:none; cursor:pointer; color:inherit; font-size:12px; padding:0; }
    .esperando-agente-info {
      display: flex; align-items: flex-start; gap: 10px;
      margin-top: 14px; padding: 12px 14px;
      background: var(--c-teal-lt); border: 1px solid var(--c-teal-md);
      border-radius: var(--radius-md);
    }
    .ea-icon { font-size: 18px; flex-shrink: 0; }
    .early-resolve-card { border-left: 3px solid var(--c-green); background: var(--c-bg); }
    .early-resolve-inner {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      flex-wrap: wrap;
    }
    .csat-card { background: var(--c-teal-lt); border: 1px solid var(--c-teal-md); }
    .csat-stars { display: flex; gap: 8px; }
    .star-btn {
      font-size: 32px; background: none; border: none; cursor: pointer;
      color: var(--c-border); transition: color .15s, transform .1s;
    }
    .star-btn:hover, .star-btn--active { color: #F59E0B; transform: scale(1.15); }
    .csat-labels {
      display: flex; font-size: 11px; color: var(--c-muted);
      margin-top: 4px; width: 200px;
    }
    .csat-done-card {
      display: flex; align-items: center; gap: 12px;
      background: var(--c-bg); border: 1px solid var(--c-border);
      padding: 12px 16px;
    }
    .csat-done-stars span { font-size: 20px; color: var(--c-border); }
    .csat-done-stars .star-active { color: #F59E0B; }

    /* Modal CSAT */
    .csat-overlay {
      position: fixed; inset: 0; background: rgba(0,0,0,.45);
      display: flex; align-items: center; justify-content: center;
      z-index: 300; padding: 16px;
    }
    .csat-modal {
      background: var(--c-bg); border-radius: var(--radius-lg);
      padding: 28px; width: 100%; max-width: 480px;
      box-shadow: var(--shadow-lg);
    }
    .csat-modal__header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
    .csat-modal__title { font-size: 17px; font-weight: 600; }
    .csat-close { background: none; border: none; font-size: 18px; cursor: pointer; color: var(--c-muted); }
    .csat-modal__sub { font-size: 13px; color: var(--c-muted); margin-bottom: 20px; }
    .csat-pregunta { margin-bottom: 18px; }
    .csat-pregunta__label { font-size: 14px; font-weight: 500; margin-bottom: 8px; }
    .csat-opciones { display: flex; gap: 8px; }
    .csat-opcion {
      width: 40px; height: 40px; border-radius: 8px;
      border: 1px solid var(--c-border); background: var(--c-bg-alt);
      font-size: 15px; font-weight: 600; cursor: pointer;
      transition: all .12s;
    }
    .csat-opcion:hover { border-color: var(--c-blue); color: var(--c-blue); }
    .csat-opcion--active { background: var(--c-blue); color: #fff; border-color: var(--c-blue); }
    .csat-scale-labels { display: flex; justify-content: space-between; font-size: 10px; color: var(--c-muted); margin-top: 4px; }
    .csat-modal__actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 16px; }
  `],
})
export class TicketDetalleComponent implements OnInit {
  ticket = signal<Ticket | null>(null);
  loading = signal(true);
  updatingStatus = signal(false);
  showRejection = signal(false);
  rechazarMotivo = '';
  csatScore = signal(0);
  comentarioLibre = '';
  enviandoComentario = signal(false);
  csatComentario = '';
  sendingCsat = signal(false);
  showRespuesta = signal(false);
  respuestaTexto = '';
  adjuntoSeleccionado = signal<{ id: number; nombre: string } | null>(null);

  // CSAT multi-pregunta
  showCsatModal = signal(false);
  csatRespuestas = signal<Record<string, number>>({});
  csatPreguntas = [
    { key: 'solucion', label: '¿La solución resolvió tu problema?' },
    { key: 'rapidez', label: '¿Cómo calificarías la rapidez del servicio?' },
    { key: 'atencion', label: '¿Cómo fue la atención del agente?' },
  ];
  csatCompleto = computed(() => this.csatPreguntas.every(q => (this.csatRespuestas()[q.key] ?? 0) > 0));

  abrirCsat() { this.showCsatModal.set(true); }
  cerrarCsatModal() { this.showCsatModal.set(false); }
  setCsatRespuesta(key: string, val: number) {
    this.csatRespuestas.update(r => ({ ...r, [key]: val }));
  }

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

  enviarComentario() {
    if (this.enviandoComentario() || !this.comentarioLibre.trim()) return;
    this.enviandoComentario.set(true);
    this.ticketSvc.update(this.ticket()!.id, {
      comentario: this.comentarioLibre,
      tipo_comentario: 'PUBLICO',
    }).subscribe({
      next: (t: Ticket) => {
        this.ticket.set(t);
        this.enviandoComentario.set(false);
        this.comentarioLibre = '';
      },
      error: () => this.enviandoComentario.set(false),
    });
  }

  responder() {
    if (this.updatingStatus() || !this.respuestaTexto.trim()) return;
    this.updatingStatus.set(true);
    this.ticketSvc.update(this.ticket()!.id, {
      estatus: 'ESPERANDO_AGENTE',
      comentario: this.respuestaTexto,
      tipo_comentario: 'PUBLICO',
      evidencia_id: this.adjuntoSeleccionado()?.id ?? undefined,
    }).subscribe({
      next: (t: Ticket) => {
        this.ticket.set(t);
        this.updatingStatus.set(false);
        this.showRespuesta.set(false);
        this.respuestaTexto = '';
        this.adjuntoSeleccionado.set(null);
      },
      error: () => this.updatingStatus.set(false),
    });
  }

  adjuntarArchivo(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    this.ticketSvc.uploadEvidencia(this.ticket()!.id, fd).subscribe({
      next: ev => this.adjuntoSeleccionado.set({ id: ev.id, nombre: file.name }),
      error: () => { },
    });
    input.value = '';
  }

  quitarAdjunto() { this.adjuntoSeleccionado.set(null); }

  setCsat(score: number) { this.csatScore.set(score); }

  enviarCsat() {
    if (this.sendingCsat() || !this.csatCompleto()) return;
    // Calcular el promedio de las respuestas multi-pregunta
    const resp = this.csatRespuestas();
    const vals = this.csatPreguntas.map(q => resp[q.key] ?? 0);
    const promedio = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
    this.sendingCsat.set(true);
    this.ticketSvc.enviarCsat(
      this.ticket()!.id,
      promedio,
      this.csatComentario || undefined,
    ).subscribe({
      next: (t: Ticket) => {
        this.ticket.set(t);
        this.sendingCsat.set(false);
        this.showCsatModal.set(false);
        this.csatComentario = '';
        this.csatRespuestas.set({});
      },
      error: () => this.sendingCsat.set(false),
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