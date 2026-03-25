import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { TicketService, Grupo, Plantilla } from '../../core/services/ticket.service';
import { AuthService } from '../../core/services/auth.service';
import { NavbarComponent } from '../../shared/components/navbar.component';
import { StatusBadgeComponent } from '../../shared/components/status-badge.component';
import { EvidenciasComponent } from '../../shared/components/evidencias.component';
import { Ticket, EstatusTicket } from '../../core/models';

const NEXT_ACTIONS: Record<string, { label: string; estatus: EstatusTicket; cls: string; requiresText?: boolean }[]> = {
  NUEVO: [{ label: 'Tomar ticket', estatus: 'EN_PROCESO', cls: 'btn--primary' }],
  ASIGNADO: [{ label: 'Tomar ticket', estatus: 'EN_PROCESO', cls: 'btn--primary' }],
  EN_PROCESO: [{ label: 'Enviar solución', estatus: 'ESPERANDO_TIENDA', cls: 'btn--success', requiresText: true }],
  ESPERANDO_TIENDA: [
    { label: 'Marcar como Resuelto', estatus: 'RESUELTO', cls: 'btn--success' }
  ],
  ESPERANDO_AGENTE: [
    { label: 'Enviar solución', estatus: 'ESPERANDO_TIENDA', cls: 'btn--primary', requiresText: true },
    { label: 'Marcar como Resuelto', estatus: 'RESUELTO', cls: 'btn--success' }
  ],
  RECHAZADO: [{ label: 'Retomar ticket', estatus: 'EN_PROCESO', cls: 'btn--primary' }],
  RESUELTO: [{ label: 'Cerrar ticket', estatus: 'CERRADO', cls: 'btn--ghost' }],
};

@Component({
  selector: 'app-agente-ticket',
  standalone: true,
  imports: [CommonModule, FormsModule, NavbarComponent, StatusBadgeComponent, EvidenciasComponent],
  template: `
    <div class="page">
      <app-navbar section="Ticket" />

      <div class="agente-layout">

        <!-- COLUMNA IZQUIERDA: info del ticket + historial -->
        <div class="ticket-main-col">
          @if (loading()) {
            <div class="loading-placeholder">Cargando ticket...</div>
          }

          @if (ticket()) {
            <div class="detail-header">
              <button class="btn btn--ghost btn--sm" (click)="back()">← Cola</button>
              <div class="header-meta">
                <span class="folio">{{ ticket()!.folio }}</span>
                <app-status-badge [status]="ticket()!.estatus" />
                @if (ticket()!.sla_vencido) {
                  <span class="badge badge--red">⚠ SLA Vencido</span>
                }
              </div>
            </div>

            <div class="card mt-4">
              <div class="card-header">
                <h3 class="section-h">Problema reportado</h3>
                <span class="badge badge--gray">#{{ ticket()!.tienda_id }}</span>
              </div>
              <p class="desc-text">{{ ticket()!.descripcion }}</p>

              @if (ticket()!.tipificacion) {
                <div class="divider"></div>
                <div class="meta-chips">
                  <span class="badge badge--blue">{{ ticket()!.tipificacion!.area_tecnica }}</span>
                  <span class="badge badge--gray">{{ ticket()!.tipificacion!.categoria }}</span>
                  <span class="badge badge--gray">{{ ticket()!.tipificacion!.problema }}</span>
                  <span class="prio" [class]="'prio--' + ticket()!.prioridad">{{ ticket()!.prioridad }}</span>
                </div>
                <div class="sla-row">
                  <span class="text-sm text-muted">SLA límite:</span>
                  <span class="text-sm" [class.sla-vencido]="ticket()!.sla_vencido">
                    {{ ticket()!.sla_limite | date:'dd/MM/yyyy HH:mm' }}
                    @if (ticket()!.sla_vencido) { — Vencido ⚠ }
                  </span>
                </div>
              }

              @if (ticket()!.ia_confianza !== null) {
                <div class="ia-badge-row">
                  <span class="ia-chip"><span>✦</span> IA — {{ ticket()!.ia_confianza }}% confianza</span>
                  <span class="text-sm text-muted">
                    {{ ticket()!.ia_clasificacion_aceptada ? 'Confirmado por tienda' : 'Ajustado por tienda' }}
                  </span>
                </div>
              }
            </div>

            <!-- Evidencias -->
            <div class="card mt-4">
              <app-evidencias
                [ticketId]="ticket()!.id"
                [canUpload]="true"
              />
            </div>

            <div class="card mt-4">
              <h3 class="section-h" style="margin-bottom:16px">Historial</h3>
              <div class="timeline">
                @for (ev of ticket()!.eventos; track ev.id) {
                  <div class="timeline__item">
                    <div class="timeline__dot" [class]="dotClass(ev.accion)">{{ accionIcon(ev.accion) }}</div>
                    <div class="timeline__body">
                      <p class="timeline__action">
                        {{ accionLabel(ev.accion) }}
                        @if (ev.estado_nuevo) { → <strong>{{ ev.estado_nuevo }}</strong> }
                      </p>
                      <p class="timeline__meta">
                        {{ ev.usuario?.nombre ?? 'Sistema' }} · {{ ev.timestamp | date:'dd/MM HH:mm' }}
                        @if (ev.tipo_comentario === 'INTERNO') {
                          <span class="badge-interno">Nota interna</span>
                        }
                      </p>
                      @if (ev.comentario) {
                        <div class="timeline__comment" [class.interno]="ev.tipo_comentario === 'INTERNO'">
                          {{ ev.comentario }}
                        </div>
                      }
                      @if (ev.evidencia) {
                        <div class="ev-inline">
                          @if (isImg(ev.evidencia.tipo_mime)) {
                            <a [href]="ev.evidencia.url" target="_blank">
                              <img [src]="ev.evidencia.url" [alt]="ev.evidencia.nombre_archivo" class="ev-inline-img" />
                            </a>
                          } @else {
                            <a [href]="ev.evidencia.url" target="_blank" class="ev-inline-file">
                              📎 {{ ev.evidencia.nombre_archivo }}
                              @if (ev.evidencia.tamanio_bytes) {
                                <span class="text-muted"> ({{ (ev.evidencia.tamanio_bytes / 1024).toFixed(0) }} KB)</span>
                              }
                            </a>
                          }
                        </div>
                      }
                    </div>
                  </div>
                }
              </div>
            </div>
          }
        </div>

        <!-- COLUMNA DERECHA: acciones -->
        @if (ticket()) {
          <div class="action-col">

            <!-- Área de respuesta -->
            <div class="card">
              <h3 class="section-h">Respuesta al ticket</h3>

              @if (['NUEVO','ASIGNADO'].includes(ticket()!.estatus)) {
                <div class="tomar-templates">
                  <p class="tomar-templates__label">Selecciona un mensaje de confirmación para la tienda:</p>
                  @for (tp of tomarPlantillas; track tp.id) {
                    <button class="tomar-tpl-item" (click)="usarTomarPlantilla(tp.texto)">
                      <span class="tomar-tpl-titulo">{{ tp.label }}</span>
                      <span class="tomar-tpl-preview">{{ tp.preview }}</span>
                    </button>
                  }
                </div>
              }

              <div class="field mt-4">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
                  <label class="field__label">Comentario / Solución</label>
  <button
                    class="btn btn--ghost btn--sm"
                    style="font-size:11px"
                    (click)="togglePlantillas()"
                  >
                    {{ showPlantillas() ? '✕' : '⚡ Plantillas' }}
                  </button>
                  <label class="btn btn--ghost btn--sm" style="font-size:11px;cursor:pointer">
                    📎
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

                @if (showPlantillas() && plantillas().length > 0) {
                  <div class="plantillas-list">
                    @for (p of plantillas(); track p.id) {
                      <button class="plantilla-item" (click)="usarPlantilla(p)">
                        <span class="plantilla-titulo">{{ p.titulo }}</span>
                        @if (p.area_tecnica) {
                          <span class="badge badge--gray" style="font-size:10px">{{ p.area_tecnica }}</span>
                        }
                      </button>
                    }
                  </div>
                }
                @if (showPlantillas() && plantillas().length === 0) {
                  <p class="text-sm text-muted" style="padding:8px 0">No hay plantillas para esta área.</p>
                }

                <textarea
                  class="input"
                  [(ngModel)]="comentario"
                  placeholder="Describe la solución o escribe un comentario..."
                  rows="5"
                  [disabled]="updating()"
                ></textarea>
              </div>

              @if (error()) {
                <div class="error-msg mt-4">⚠ {{ error() }}</div>
              }

              <!-- Botones de acción según estado -->
              <div class="action-btns">
                @for (action of nextActions(); track action.estatus) {
                  <button
                    class="btn btn--full"
                    [class]="action.cls"
                    [class.btn--loading]="updating() && pendingStatus() === action.estatus"
                    [disabled]="updating()"
                    (click)="executeAction(action)"
                  >
                    {{ updating() && pendingStatus() === action.estatus ? '' : action.label }}
                    @if (action.requiresText) {
                      <span style="font-size:11px;opacity:.7;margin-left:4px">(requiere texto)</span>
                    }
                  </button>
                }

                @if (ticket()!.estatus === 'EN_PROCESO' || ticket()!.estatus === 'ESPERANDO_TIENDA') {
                  <label class="nota-interna-toggle">
                    <input type="checkbox" [(ngModel)]="esNotaInterna" />
                    <span>Nota interna</span>
                    <span class="nota-hint">La tienda no verá este comentario</span>
                  </label>
                }

                @if (!nextActions().length && ticket()!.estatus === 'ESPERANDO_TIENDA') {
                  <div class="esperando-box">⏳ Esperando respuesta de la tienda</div>
                }
                @if (ticket()!.estatus === 'ESPERANDO_AGENTE') {
                  <div class="esperando-box" style="background:var(--c-teal-lt);border-color:var(--c-teal-md);color:var(--c-teal)">
                    ↩ La tienda respondió — continúa la atención
                  </div>
                }
              </div>
            </div>

            <!-- Sección de escalación -->
            @if (canEscalar()) {
              <div class="escalacion-section">
                <button
                  class="btn btn--ghost btn--full escalacion-btn"
                  (click)="toggleEscalacion()"
                >
                  {{ showEscalacion() ? '✕ Cancelar escalación' : '↗ Escalar a otra área' }}
                </button>

                @if (showEscalacion()) {
                  <div class="escalacion-form slide-down">
                    <div class="field">
                      <label class="field__label field__label--required">Área destino</label>
                      <select class="input" [(ngModel)]="grupoSeleccionado" (change)="onGrupoChange()">
                        <option value="">Selecciona el grupo...</option>
                        @for (g of grupos(); track g.id) {
                          <option [value]="g.id">{{ g.area_tecnica }} — {{ g.nombre }}</option>
                        }
                      </select>
                    </div>
                    <div class="field">
                      <label class="field__label field__label--required">Motivo de escalación</label>
                      <textarea
                        class="input"
                        [(ngModel)]="motivoEscalacion"
                        placeholder="Ej: Requiere intervención del área de Sistemas..."
                        rows="3"
                        [disabled]="escalando()"
                      ></textarea>
                      <span class="field__hint">Mínimo 10 caracteres</span>
                    </div>
                    @if (errorEscalacion()) {
                      <div class="error-msg">⚠ {{ errorEscalacion() }}</div>
                    }
                    <button
                      class="btn btn--primary btn--full"
                      [class.btn--loading]="escalando()"
                      [disabled]="escalando() || !grupoSeleccionado || motivoEscalacion.length < 10"
                      (click)="ejecutarEscalacion()"
                    >
                      {{ escalando() ? '' : '↗ Confirmar escalación' }}
                    </button>
                  </div>
                }
              </div>
            }

            <!-- Metadata del ticket -->
            <div class="card card--flat meta-card">
              <div class="meta-row">
                <span class="meta-label">Fecha apertura</span>
                <span>{{ ticket()!.fecha_apertura | date:'dd/MM/yyyy HH:mm' }}</span>
              </div>
              @if (ticket()!.fecha_primera_respuesta) {
                <div class="meta-row">
                  <span class="meta-label">Primera respuesta</span>
                  <span>{{ ticket()!.fecha_primera_respuesta | date:'dd/MM/yyyy HH:mm' }}</span>
                </div>
              }
              @if (ticket()!.fecha_cierre) {
                <div class="meta-row">
                  <span class="meta-label">Fecha cierre</span>
                  <span>{{ ticket()!.fecha_cierre | date:'dd/MM/yyyy HH:mm' }}</span>
                </div>
              }
              <div class="meta-row">
                <span class="meta-label">Agente asignado</span>
                <span>{{ ticket()!.agente_id ? '#' + ticket()!.agente_id : 'Sin asignar' }}</span>
              </div>
            </div>

          </div>
        }
      </div>
    </div>
  `,
  styles: [`
    .page { display: flex; flex-direction: column; min-height: 100vh; }
    .agente-layout {
      display: grid;
      grid-template-columns: 1fr 360px;
      gap: 20px;
      padding: 20px 24px;
      max-width: 1300px;
      margin: 0 auto;
      width: 100%;
      align-items: start;
    }
    @media (max-width: 900px) {
      .agente-layout { grid-template-columns: 1fr; }
      .action-col { order: -1; }
    }
    .loading-placeholder { padding: 60px; text-align: center; color: var(--c-muted); }
    .detail-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
    .header-meta { display: flex; align-items: center; gap: 8px; }
    .folio { font-family: monospace; font-weight: 700; color: var(--c-blue); font-size: 14px; }
    .card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
    .section-h { font-size: 15px; font-weight: 600; }
    .desc-text { font-size: 15px; line-height: 1.6; }
    .meta-chips { display: flex; flex-wrap: wrap; gap: 6px; }
    .sla-row { display: flex; gap: 8px; align-items: center; margin-top: 8px; }
    .sla-vencido { color: var(--c-red); font-weight: 500; }
    .ia-badge-row { display: flex; align-items: center; gap: 10px; margin-top: 10px; flex-wrap: wrap; }
    .action-btns { display: flex; flex-direction: column; gap: 8px; margin-top: 14px; }
    .error-msg {
      background: var(--c-red-lt);
      color: var(--c-red);
      border: 1px solid var(--c-red-md);
      border-radius: var(--radius-md);
      padding: 10px 14px;
      font-size: 13px;
    }
    .nota-interna-toggle {
      display: flex; align-items: center; gap: 8px;
      padding: 10px 12px;
      background: var(--c-amber-lt);
      border: 1px solid var(--c-amber-md);
      border-radius: var(--radius-md);
      font-size: 13px; cursor: pointer;
    }
    .nota-hint { font-size: 11px; color: var(--c-amber); margin-left: 4px; }
    .esperando-box {
      padding: 12px;
      background: var(--c-amber-lt);
      border: 1px solid var(--c-amber-md);
      border-radius: var(--radius-md);
      font-size: 13px; color: var(--c-amber); text-align: center;
    }
    .tomar-templates {
      background: var(--c-blue-lt);
      border: 1px solid var(--c-blue-md);
      border-radius: var(--radius-md);
      padding: 12px 14px;
      margin-bottom: 14px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .tomar-templates__label {
      font-size: 11px; font-weight: 600; color: var(--c-blue);
      text-transform: uppercase; letter-spacing: .04em; margin-bottom: 4px;
    }
    .tomar-tpl-item {
      display: flex; flex-direction: column; gap: 2px;
      width: 100%; padding: 8px 12px;
      background: white; border: 1px solid var(--c-blue-md);
      border-radius: var(--radius-sm); text-align: left;
      cursor: pointer; transition: background .1s;
    }
    .tomar-tpl-item:hover { background: var(--c-blue-lt); }
    .tomar-tpl-titulo { font-size: 12px; font-weight: 600; color: var(--c-blue); }
    .tomar-tpl-preview { font-size: 11px; color: var(--c-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

    .plantillas-list {
      max-height: 160px;
      overflow-y: auto;
      border: 1px solid var(--c-border);
      border-radius: var(--radius-md);
      margin-bottom: 8px;
      background: var(--c-surface);
    }
    .plantilla-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      width: 100%;
      padding: 8px 12px;
      background: none;
      border: none;
      border-bottom: 0.5px solid var(--c-border);
      text-align: left;
      cursor: pointer;
      font-size: 12px;
      color: var(--c-text);
      transition: background .1s;
    }
    .plantilla-item:last-child { border-bottom: none; }
    .plantilla-item:hover { background: var(--c-blue-lt); }
    .plantilla-titulo { font-weight: 500; }
    .adj-chip {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: 11px;
      background: var(--c-blue-lt);
      color: var(--c-blue);
      padding: 2px 8px;
      border-radius: 8px;
    }
    .adj-chip button { background:none;border:none;cursor:pointer;color:inherit;font-size:12px;padding:0; }
    .escalacion-section { margin-top: 12px; }
    .escalacion-btn { border-color: var(--c-amber-md); color: var(--c-amber); font-size: 13px; }
    .escalacion-btn:hover { background: var(--c-amber-lt); }
    .escalacion-form {
      margin-top: 10px; display: flex; flex-direction: column; gap: 12px;
      padding: 14px;
      background: var(--c-amber-lt);
      border: 1px solid var(--c-amber-md);
      border-radius: var(--radius-md);
    }
    .meta-card { padding: 0; overflow: hidden; margin-top: 12px; }
    .meta-row {
      display: flex; justify-content: space-between; align-items: center;
      padding: 10px 16px; border-bottom: 1px solid var(--c-border); font-size: 13px;
    }
    .meta-row:last-child { border-bottom: none; }
    .meta-label { color: var(--c-muted); font-size: 12px; }
    .ev-inline { margin-top: 8px; }
    .ev-inline-img {
      max-width: 220px;
      max-height: 140px;
      object-fit: cover;
      border-radius: var(--radius-sm);
      border: 1px solid var(--c-border);
      cursor: pointer;
      display: block;
    }
    .ev-inline-file {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      color: var(--c-blue);
      text-decoration: none;
      padding: 4px 8px;
      background: var(--c-blue-lt);
      border-radius: 4px;
    }
    .ev-inline-file:hover { text-decoration: underline; }
    .badge-interno {
      display: inline-block; font-size: 10px; font-weight: 600;
      padding: 1px 6px; border-radius: 8px;
      background: var(--c-amber-lt); color: var(--c-amber);
      border: 1px solid var(--c-amber-md); margin-left: 6px;
    }
    .timeline__comment.interno {
      background: var(--c-amber-lt);
      border-left: 3px solid var(--c-amber);
    }
  `],
})
export class AgenteTicketComponent implements OnInit {
  ticket = signal<Ticket | null>(null);
  loading = signal(true);
  updating = signal(false);
  error = signal('');
  comentario = '';
  esNotaInterna = false;
  pendingStatus = signal<EstatusTicket | null>(null);
  showEscalacion = signal(false);
  escalando = signal(false);
  errorEscalacion = signal('');
  grupos = signal<Grupo[]>([]);
  grupoSeleccionado = '';
  motivoEscalacion = '';
  plantillas = signal<Plantilla[]>([]);
  showPlantillas = signal(false);
  adjuntoSeleccionado = signal<{ id: number; nombre: string } | null>(null);

  nextActions = () => NEXT_ACTIONS[this.ticket()?.estatus ?? ''] ?? [];

  readonly tomarPlantillas = [
    {
      id: 1,
      label: 'Confirmación estándar',
      preview: 'Hemos recibido tu reporte y ya lo estamos atendiendo...',
      texto: 'Hemos recibido tu reporte y ya lo estamos atendiendo. Te mantendremos informado sobre el avance y cualquier actualización.',
    },
    {
      id: 2,
      label: 'En revisión con el equipo',
      preview: 'Entendido. Hemos tomado tu caso y nuestro equipo está trabajando...',
      texto: 'Entendido. Hemos tomado tu caso y nuestro equipo ya está trabajando en ello. Te contactaremos a la brevedad con una solución.',
    },
    {
      id: 3,
      label: 'Atención prioritaria',
      preview: 'Tu reporte ha sido tomado con prioridad. Estamos en proceso...',
      texto: 'Tu reporte ha sido tomado con prioridad. Estamos en proceso de diagnóstico y resolución. Nos pondremos en contacto contigo muy pronto.',
    },
  ];

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private ticketSvc: TicketService,
    public auth: AuthService,
  ) { }

  ngOnInit() {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    this.ticketSvc.get(id).subscribe({
      next: t => { this.ticket.set(t); this.loading.set(false); },
      error: () => { this.loading.set(false); this.router.navigate(['/agente']); },
    });
  }

  usarTomarPlantilla(texto: string) {
    this.comentario = texto;
  }

  executeAction(action: { estatus: EstatusTicket; requiresText?: boolean }) {
    if (this.updating()) return;
    if (action.requiresText && (!this.comentario || this.comentario.trim().length < 10)) {
      this.error.set('Debes describir la solución antes de enviarla (mínimo 10 caracteres)');
      return;
    }
    this.updating.set(true);
    this.error.set('');
    this.pendingStatus.set(action.estatus);

    this.ticketSvc.update(this.ticket()!.id, {
      estatus: action.estatus,
      solucion_propuesta: action.estatus === 'ESPERANDO_TIENDA' ? this.comentario : undefined,
      comentario: this.comentario || undefined,
      tipo_comentario: this.esNotaInterna ? 'INTERNO' : 'PUBLICO',
      evidencia_id: this.adjuntoSeleccionado()?.id ?? undefined,
    }).subscribe({
      next: t => {
        this.ticket.set(t);
        this.updating.set(false);
        this.pendingStatus.set(null);
        this.comentario = '';
        this.esNotaInterna = false;
        this.adjuntoSeleccionado.set(null);
      },
      error: err => {
        this.updating.set(false);
        this.pendingStatus.set(null);
        this.error.set(err.error?.detail ?? 'Error al actualizar el ticket');
      },
    });
  }

  canEscalar() {
    const s = this.ticket()?.estatus;
    return s && ['NUEVO', 'ASIGNADO', 'EN_PROCESO', 'RECHAZADO'].includes(s);
  }

  togglePlantillas() {
    const next = !this.showPlantillas();
    this.showPlantillas.set(next);
    if (next && this.plantillas().length === 0) {
      const area = this.ticket()?.tipificacion?.area_tecnica;
      this.ticketSvc.getPlantillas(area ?? undefined)
        .subscribe(ps => this.plantillas.set(ps));
    }
  }

  usarPlantilla(p: Plantilla) {
    this.comentario = p.contenido;
    this.showPlantillas.set(false);
  }

  toggleEscalacion() {
    const next = !this.showEscalacion();
    this.showEscalacion.set(next);
    if (next && this.grupos().length === 0) {
      this.ticketSvc.getGrupos().subscribe(gs => this.grupos.set(gs));
    }
    this.errorEscalacion.set('');
    this.motivoEscalacion = '';
    this.grupoSeleccionado = '';
  }

  onGrupoChange() { this.errorEscalacion.set(''); }

  ejecutarEscalacion() {
    if (this.escalando() || !this.grupoSeleccionado || this.motivoEscalacion.trim().length < 10) return;
    this.escalando.set(true);
    this.errorEscalacion.set('');

    this.ticketSvc.escalar(
      this.ticket()!.id,
      Number(this.grupoSeleccionado),
      this.motivoEscalacion.trim()
    ).subscribe({
      next: t => {
        this.ticket.set(t);
        this.escalando.set(false);
        this.showEscalacion.set(false);
        this.motivoEscalacion = '';
        this.grupoSeleccionado = '';
      },
      error: err => {
        this.escalando.set(false);
        this.errorEscalacion.set(err.error?.detail ?? 'Error al escalar el ticket');
      },
    });
  }

  accionIcon(a: string) {
    const map: Record<string, string> = {
      CREACION: '📋', ASIGNACION_AUTO: '✦', ASIGNACION: '👤',
      CAMBIO_ESTADO: '🔄', ACTUALIZACION: '✏', ESCALACION: '↗',
    };
    return map[a] ?? '•';
  }

  accionLabel(a: string) {
    const map: Record<string, string> = {
      CREACION: 'Reporte creado', ASIGNACION_AUTO: 'Asignado automáticamente (IA)',
      ASIGNACION: 'Reasignado', CAMBIO_ESTADO: 'Cambio de estado',
      ACTUALIZACION: 'Actualización', ESCALACION: 'Escalado a otro grupo',
      RESPUESTA_TIENDA: 'Tienda respondió',
    };
    return map[a] ?? a;
  }

  adjuntarArchivo(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    // Subir el archivo y guardar el ID devuelto
    const fd = new FormData();
    fd.append('file', file);
    this.ticketSvc.uploadEvidencia(this.ticket()!.id, fd).subscribe({
      next: ev => this.adjuntoSeleccionado.set({ id: ev.id, nombre: file.name }),
      error: () => { },
    });
    input.value = '';
  }

  quitarAdjunto() { this.adjuntoSeleccionado.set(null); }

  isImg(mime: string | null) { return mime?.startsWith('image/') ?? false; }

  dotClass(a: string) {
    if (a === 'ASIGNACION_AUTO') return 'timeline__dot--teal';
    if (a === 'CREACION') return 'timeline__dot--blue';
    if (a === 'CAMBIO_ESTADO') return 'timeline__dot--amber';
    if (a === 'ESCALACION') return 'timeline__dot--amber';
    return '';
  }

  back() { this.router.navigate(['/agente']); }
}