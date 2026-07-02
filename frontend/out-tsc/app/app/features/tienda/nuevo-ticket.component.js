import { __decorate } from "tslib";
import { Component, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject, debounceTime, switchMap, catchError, of } from 'rxjs';
import { TicketService } from '../../core/services/ticket.service';
import { AuthService } from '../../core/services/auth.service';
let NuevoTicketComponent = class NuevoTicketComponent {
    get canContinue() {
        return this.descripcion.length >= 15 && !!this.clasificacion() && !this.clasificando();
    }
    constructor() {
        this.ticket = inject(TicketService);
        this.auth = inject(AuthService);
        this.router = inject(Router);
        this.descripcion = '';
        this.step = signal(1);
        this.clasificando = signal(false);
        this.clasificacion = signal(null);
        this.submitting = signal(false);
        this.error = signal('');
        this.ticketCreado = signal(null);
        this.imagenAdjunta = signal(null);
        this.imagenPreview = signal('');
        this.bajaConfianza = computed(() => {
            const conf = this.clasificacion()?.confianza ?? 100;
            return conf < 40 && !this.clasificacion()?.tipificacion_id;
        });
        this.classify$ = new Subject();
        this.sub = this.classify$.pipe(debounceTime(600), switchMap(desc => {
            if (desc.length < 15) {
                this.clasificacion.set(null);
                this.clasificando.set(false);
                return of(null);
            }
            this.clasificando.set(true);
            const tiendaId = this.auth.currentUser()?.tienda_id ?? 749;
            console.log('Clasificando con tienda_id:', tiendaId, 'descripcion:', desc);
            return this.ticket.classify({ descripcion: desc, tienda_id: tiendaId }).pipe(catchError((err) => {
                console.error('Error en classify:', err);
                return of(null);
            }));
        })).subscribe(res => {
            console.log('Respuesta recibida en subscribe:', res);
            this.clasificando.set(false);
            if (res)
                this.clasificacion.set(res);
        });
    }
    onDescChange(val) {
        this.clasificacion.set(null);
        if (val.length >= 15) {
            this.clasificando.set(true);
        }
        this.classify$.next(val);
    }
    goStep2() {
        if (!this.canContinue)
            return;
        this.step.set(2);
        this.error.set('');
    }
    submit(iaAceptada) {
        if (this.submitting())
            return;
        this.submitting.set(true);
        this.error.set('');
        this.ticket.create({
            descripcion: this.descripcion,
            tipificacion_id: this.clasificacion()?.tipificacion_id,
            ia_clasificacion_aceptada: iaAceptada,
        }).subscribe({
            next: t => {
                this.ticketCreado.set(t);
                // Subir imagen si hay una adjunta
                if (this.imagenAdjunta()) {
                    const fd = new FormData();
                    fd.append('file', this.imagenAdjunta());
                    this.ticket.uploadEvidencia(t.id, fd).subscribe({
                        complete: () => { this.step.set(3); this.submitting.set(false); },
                        error: () => { this.step.set(3); this.submitting.set(false); }, // sigue aunque falle upload
                    });
                }
                else {
                    this.step.set(3);
                    this.submitting.set(false);
                }
            },
            error: err => {
                this.submitting.set(false);
                this.error.set(err.error?.detail ?? 'Error al enviar el reporte');
            },
        });
    }
    urgenciaBadge(u) {
        const map = {
            CRITICA: 'badge--red',
            ALTA: 'badge--amber',
            MEDIA: 'badge--blue',
            BAJA: 'badge--gray',
        };
        return `badge ${map[u] ?? 'badge--gray'}`;
    }
    confidenceClass() {
        const c = this.clasificacion()?.confianza ?? 0;
        if (c >= 70)
            return 'confidence__fill--high';
        if (c >= 40)
            return 'confidence__fill--medium';
        return 'confidence__fill--low';
    }
    newTicket() {
        this.descripcion = '';
        this.clasificacion.set(null);
        this.ticketCreado.set(null);
        this.imagenAdjunta.set(null);
        this.imagenPreview.set('');
        this.error.set('');
        this.step.set(1);
    }
    back() { this.router.navigate(['/tienda']); }
    // ── Adjuntar imagen ────────────────────────────────────────────────────────
    onFileSelect(event) {
        const file = event.target.files?.[0];
        if (file)
            this.setImagen(file);
    }
    onDrop(event) {
        event.preventDefault();
        const file = event.dataTransfer?.files?.[0];
        if (file && file.type.startsWith('image/'))
            this.setImagen(file);
    }
    onPaste(event) {
        const items = event.clipboardData?.items;
        if (!items)
            return;
        for (const item of Array.from(items)) {
            if (item.type.startsWith('image/')) {
                const file = item.getAsFile();
                if (file) {
                    this.setImagen(file);
                    break;
                }
            }
        }
    }
    setImagen(file) {
        this.imagenAdjunta.set(file);
        const reader = new FileReader();
        reader.onload = e => this.imagenPreview.set(e.target?.result);
        reader.readAsDataURL(file);
    }
    quitarImagen() {
        this.imagenAdjunta.set(null);
        this.imagenPreview.set('');
    }
    ngOnDestroy() { this.sub.unsubscribe(); }
};
NuevoTicketComponent = __decorate([
    Component({
        selector: 'app-nuevo-ticket',
        standalone: true,
        imports: [CommonModule, FormsModule],
        template: `
    <div class="form-page fade-in">

      <!-- Header -->
      <div class="form-header">
        <button class="btn btn--ghost btn--sm" (click)="back()">
          ← Volver
        </button>
        <div>
          <h1 class="form-title" style="display: flex; align-items: center; gap: 8px;">
            Reportar un problema
            @if (auth.currentUser()?.tienda_nombre) {
              <span class="badge badge--blue" style="font-size: 13px; font-weight: 500;">
                🏪 {{ auth.currentUser()!.tienda_nombre }}
              </span>
            }
          </h1>
          <p class="form-sub">Describe lo que está pasando — el sistema te ayuda a clasificarlo</p>
        </div>
      </div>

      <!-- Steps indicator -->
      <div class="steps">
        <div class="step" [class.step--active]="step() >= 1" [class.step--done]="step() > 1">
          <div class="step__dot">{{ step() > 1 ? '✓' : '1' }}</div>
          <span>Describe el problema</span>
        </div>
        <div class="step__line"></div>
        <div class="step" [class.step--active]="step() >= 2" [class.step--done]="step() > 2">
          <div class="step__dot">{{ step() > 2 ? '✓' : '2' }}</div>
          <span>Confirmar clasificación</span>
        </div>
        <div class="step__line"></div>
        <div class="step" [class.step--active]="step() >= 3">
          <div class="step__dot">3</div>
          <span>Enviado</span>
        </div>
      </div>

      <!-- Step 1: Descripción + IA -->
      @if (step() === 1) {
        <div class="card slide-down">
          <div class="field">
            <label class="field__label field__label--required">
              ¿Qué está pasando en tu tienda?
            </label>
            <textarea
              class="input desc-input"
              placeholder="Ej: No tenemos internet desde esta mañana, la antena parece apagada..."
              [(ngModel)]="descripcion"
              (ngModelChange)="onDescChange($event)"
              [disabled]="submitting()"
              rows="4"
              maxlength="800"
            ></textarea>
            <div class="field__hint flex justify-between">
              <span>Sé específico — más detalle = resolución más rápida</span>
              <span>{{ descripcion.length }}/800</span>
            </div>
          </div>

          <!-- Adjuntar imagen como evidencia -->
          <div class="adj-zone"
               [class.adj-zone--has-file]="imagenAdjunta()"
               (dragover)="$event.preventDefault()"
               (drop)="onDrop($event)"
               (paste)="onPaste($event)">
            @if (!imagenAdjunta()) {
              <label class="adj-zone-label">
                <span class="adj-zone-icon">📎</span>
                <span class="adj-zone-text">
                  Adjunta una imagen (opcional)<br>
                  <small>Arrastra, pega (Ctrl+V) o haz clic para seleccionar</small>
                </span>
                <input type="file" style="display:none"
                       accept=".jpg,.jpeg,.png,.webp,.gif"
                       (change)="onFileSelect($event)" />
              </label>
            } @else {
              <div class="adj-preview">
                <img [src]="imagenPreview()" alt="Evidencia" class="adj-img-preview" />
                <div class="adj-preview-info">
                  <span class="adj-nombre">{{ imagenAdjunta()!.name }}</span>
                  <span class="adj-tamano">{{ (imagenAdjunta()!.size / 1024).toFixed(0) }} KB</span>
                </div>
                <button class="adj-remove" (click)="quitarImagen()">✕</button>
              </div>
            }
          </div>

          <!-- Aviso baja confianza IA -->
          @if (bajaConfianza()) {
            <div class="baja-confianza-aviso">
              ⚠️ La IA no identificó claramente tu problema (confianza baja).
              El ticket quedará <strong>pendiente de revisión</strong> hasta que un agente lo clasifique.
            </div>
          }

          <!-- IA Classification Result -->
          @if (clasificando()) {
            <div class="ia-thinking">
              <div class="ia-dots">
                <span></span><span></span><span></span>
              </div>
              <span class="text-sm text-muted">Analizando tu descripción...</span>
            </div>
          }

          @if (clasificacion() && !clasificando()) {
            <div class="ia-result slide-down">
              <div class="ia-result__header">
                <span class="ia-chip">
                  <span class="ia-icon">✦</span>
                  Clasificación automática
                </span>
                <div class="confidence">
                  <div
                    class="confidence__fill"
                    [class]="confidenceClass()"
                    [style.width.%]="clasificacion()!.confianza"
                  ></div>
                </div>
                <span class="text-sm text-muted">
                  {{ clasificacion()!.confianza }}% de confianza
                </span>
              </div>

              <div class="ia-result__body">
                <div class="ia-detail">
                  <span class="ia-detail__label">Área</span>
                  <span class="ia-detail__val badge badge--blue">
                    {{ clasificacion()!.area_tecnica }}
                  </span>
                </div>
                <div class="ia-detail">
                  <span class="ia-detail__label">Categoría</span>
                  <span class="ia-detail__val">{{ clasificacion()!.categoria }}</span>
                </div>
                <div class="ia-detail">
                  <span class="ia-detail__label">Problema</span>
                  <span class="ia-detail__val font-medium">
                    {{ clasificacion()!.tipificacion_nombre }}
                  </span>
                </div>
                <div class="ia-detail">
                  <span class="ia-detail__label">Urgencia</span>
                  <span class="ia-detail__val">
                    <span class="badge" [class]="urgenciaBadge(clasificacion()!.urgencia_sugerida)">
                      {{ clasificacion()!.urgencia_sugerida === 'CRITICA' || clasificacion()!.urgencia_sugerida === 'ALTA' ? 'Alta urgencia' : 'Urgencia normal' }}
                    </span>
                  </span>
                </div>
              </div>

              @if (clasificacion()!.palabras_detectadas.length > 0) {
                <div class="ia-result__keywords">
                  <span class="text-sm text-muted">Detectado: </span>
                  @for (kw of clasificacion()!.palabras_detectadas; track kw) {
                    <span class="kw-chip">{{ kw }}</span>
                  }
                </div>
              }

              <p class="ia-result__razon text-sm text-muted">
                {{ clasificacion()!.razon }}
              </p>
            </div>
          }

          <div class="form-actions mt-4">
            <button
              class="btn btn--primary btn--lg"
              (click)="goStep2()"
              [disabled]="!canContinue"
            >
              Continuar →
            </button>
          </div>
        </div>
      }

      <!-- Step 2: Confirmar o ajustar -->
      @if (step() === 2) {
        <div class="card slide-down">
          <h2 class="section-title">¿Es correcto lo que detectamos?</h2>

          <div class="confirm-block">
            <div class="confirm-row">
              <span class="confirm-label">Área técnica</span>
              <span class="badge badge--blue">{{ clasificacion()!.area_tecnica }}</span>
            </div>
            <div class="confirm-row">
              <span class="confirm-label">Tipificación</span>
              <span class="font-medium">{{ clasificacion()!.tipificacion_nombre }}</span>
            </div>
            <div class="confirm-row">
              <span class="confirm-label">Tu descripción</span>
              <span class="confirm-desc">{{ descripcion }}</span>
            </div>
          </div>

          <!-- Urgencia detectada warning -->
          @if (clasificacion()!.urgencia_sugerida === 'CRITICA' ||
               clasificacion()!.urgencia_sugerida === 'ALTA') {
            <div class="urgencia-warning">
              <span style="font-size:20px">⚡</span>
              <div>
<!-- prioridad oculta v5 -->
                <p class="text-sm text-muted">
                  Un analista del área correspondiente será notificado de inmediato.
                </p>
              </div>
            </div>
          }

          @if (error()) {
            <div class="login-error slide-down mt-4">⚠ {{ error() }}</div>
          }

          <div class="form-actions mt-4">
            <button class="btn btn--ghost" (click)="step.set(1)">
              ← Modificar descripción
            </button>
            <button
              class="btn btn--primary btn--lg"
              [class.btn--loading]="submitting()"
              (click)="submit(true)"
              [disabled]="submitting()"
            >
              {{ submitting() ? '' : '✓ Confirmar y enviar' }}
            </button>
          </div>
        </div>
      }

      <!-- Step 3: Éxito -->
      @if (step() === 3 && ticketCreado()) {
        <div class="card success-card fade-in">
          <div class="success-icon">✅</div>
          <h2 class="success-title">¡Reporte enviado!</h2>
          <p class="text-muted" style="margin-bottom:20px">
            Un analista fue asignado automáticamente y recibirás respuesta pronto.
          </p>

          <div class="ticket-summary">
            <div class="summary-row">
              <span class="text-muted">Folio</span>
              <span class="folio-badge">{{ ticketCreado()!.folio }}</span>
            </div>
            <div class="summary-row">
              <span class="text-muted">Área asignada</span>
              <span class="badge badge--blue">
                {{ ticketCreado()!.tipificacion?.area_tecnica }}
              </span>
            </div>
            <div class="summary-row">
              <span class="text-muted">Prioridad</span>
              <!-- Prioridad no visible para la tienda -->
            </div>
            @if (ticketCreado()!.sla_limite) {
              <div class="summary-row">
                <span class="text-muted">Tiempo límite de respuesta</span>
                <span class="font-medium">
                  {{ ticketCreado()!.sla_limite | date:'dd/MM HH:mm' }}
                </span>
              </div>
            }
          </div>

          <div class="form-actions mt-4" style="justify-content:center">
            <button class="btn btn--ghost" (click)="newTicket()">
              + Nuevo reporte
            </button>
            <button class="btn btn--primary" (click)="back()">
              Ver mis reportes
            </button>
          </div>
        </div>
      }
    </div>
  `,
        styles: [`
    .form-page {
      max-width: 680px;
      margin: 0 auto;
      padding: 24px;
    }
    .form-header {
      display: flex;
      align-items: flex-start;
      gap: 16px;
      margin-bottom: 28px;
    }
    .form-title { font-size: 22px; font-weight: 600; }
    .form-sub   { font-size: 14px; color: var(--c-muted); margin-top: 4px; }

    /* Steps */
    .steps {
      display: flex;
      align-items: center;
      gap: 0;
      margin-bottom: 28px;
    }
    .step {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
      color: var(--c-muted);
      white-space: nowrap;
    }
    .step--active { color: var(--c-blue); }
    .step--done   { color: var(--c-green); }
    .step__dot {
      width: 26px; height: 26px;
      border-radius: 50%;
      border: 2px solid var(--c-border);
      display: flex; align-items: center; justify-content: center;
      font-size: 12px; font-weight: 600;
      background: var(--c-surface);
    }
    .step--active .step__dot { border-color: var(--c-blue); color: var(--c-blue); }
    .step--done   .step__dot { border-color: var(--c-green); color: var(--c-green); background: var(--c-green-lt); }
    .step__line {
      flex: 1;
      height: 2px;
      background: var(--c-border);
      min-width: 24px;
      max-width: 60px;
      margin: 0 8px;
    }

    .desc-input { font-size: 15px; line-height: 1.6; }

    /* IA thinking */
    .ia-thinking {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 12px 0;
    }
    .ia-dots {
      display: flex;
      gap: 4px;
    }
    .ia-dots span {
      width: 6px; height: 6px;
      border-radius: 50%;
      background: var(--c-teal);
      animation: bounce .8s ease infinite;
    }
    .ia-dots span:nth-child(2) { animation-delay: .15s; }
    .ia-dots span:nth-child(3) { animation-delay: .30s; }
    @keyframes bounce {
      0%, 80%, 100% { transform: scale(.8); opacity: .5; }
      40%           { transform: scale(1.1); opacity: 1; }
    }

    /* IA result */
    .ia-result {
      margin-top: 16px;
      border: 1px solid var(--c-teal-md);
      border-radius: var(--radius-lg);
      padding: 16px;
      background: var(--c-teal-lt);
    }
    .ia-result__header {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 14px;
      flex-wrap: wrap;
    }
    .ia-result__header .confidence { flex: 1; min-width: 60px; max-width: 120px; }
    .ia-result__body {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
    }
    .ia-detail {
      display: flex;
      flex-direction: column;
      gap: 3px;
    }
    .ia-detail__label { font-size: 11px; color: var(--c-muted); text-transform: uppercase; letter-spacing: .04em; }
    .ia-detail__val   { font-size: 13px; }
    .ia-result__keywords {
      margin-top: 12px;
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 6px;
    }
    .kw-chip {
      background: white;
      border: 1px solid var(--c-teal-md);
      color: var(--c-teal);
      border-radius: 10px;
      padding: 1px 8px;
      font-size: 12px;
    }
    .ia-result__razon { margin-top: 10px; font-style: italic; }

    /* Step 2 confirm */
    .section-title { font-size: 17px; font-weight: 600; margin-bottom: 16px; }
    .confirm-block {
      border: 1px solid var(--c-border);
      border-radius: var(--radius-md);
      overflow: hidden;
    }
    .confirm-row {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 12px 16px;
      border-bottom: 1px solid var(--c-border);
    }
    .confirm-row:last-child { border-bottom: none; }
    .confirm-label { font-size: 13px; color: var(--c-muted); min-width: 110px; padding-top: 2px; }
    .confirm-desc  { font-size: 13px; line-height: 1.5; }
    .urgencia-warning {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 14px 16px;
      background: var(--c-amber-lt);
      border: 1px solid var(--c-amber-md);
      border-radius: var(--radius-md);
      margin-top: 16px;
    }
    .login-error {
      background: var(--c-red-lt);
      color: var(--c-red);
      border: 1px solid var(--c-red-md);
      border-radius: var(--radius-md);
      padding: 10px 14px;
      font-size: 14px;
    }

    /* Success */
    .success-card { text-align: center; padding: 48px 32px; }
    .success-icon  { font-size: 48px; margin-bottom: 16px; }
    .success-title { font-size: 22px; font-weight: 600; margin-bottom: 8px; }
    .ticket-summary {
      background: var(--c-bg);
      border-radius: var(--radius-md);
      overflow: hidden;
      text-align: left;
      margin: 0 auto;
      max-width: 380px;
    }
    .summary-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 10px 16px;
      border-bottom: 1px solid var(--c-border);
      font-size: 14px;
    }
    .summary-row:last-child { border-bottom: none; }
    .folio-badge {
      font-family: monospace;
      font-size: 14px;
      font-weight: 600;
      color: var(--c-blue);
    }

    .form-actions {
      display: flex;
      align-items: center;
      gap: 12px;
    }
  `],
    })
], NuevoTicketComponent);
export { NuevoTicketComponent };
//# sourceMappingURL=nuevo-ticket.component.js.map