import { __decorate } from "tslib";
import { Component, ViewChild, inject, signal, computed, } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { Subject, interval, of } from 'rxjs';
import { catchError, takeUntil } from 'rxjs/operators';
import { TicketService } from '../../core/services/ticket.service';
import { AuthService } from '../../core/services/auth.service';
import { StatusBadgeComponent } from '../../shared/components/status-badge.component';
import { environment } from '../../../environments/environment';
const QUICK_CHIPS = [
    'No tenemos internet 📡',
    'Falla en el sistema POS',
    'Problema con impresora',
    'No abre el sistema',
    'Falla eléctrica',
];
// ─────────────────────────────────────────────────────────────────────────────
let TiendaDashboardComponent = class TiendaDashboardComponent {
    constructor() {
        this.auth = inject(AuthService);
        this.http = inject(HttpClient);
        this.ticketSvc = inject(TicketService);
        this.router = inject(Router);
        this.destroy$ = new Subject();
        // ── Estado del chat ───────────────────────────────────────────────────────
        this.messages = signal([]);
        this.inputText = '';
        this.thinking = signal(false);
        this.ticketCreado = signal(null);
        this.esResueltoIA = signal(false);
        this.creatingTicket = signal(false);
        this.demoMode = signal(false);
        this.needsScroll = false;
        this.sesionId = this.newSesionId();
        this.proxyUrl = `${environment.apiUrl}/dany/chat`;
        this.quickChips = QUICK_CHIPS;
        // ── Estado de tickets ─────────────────────────────────────────────────────
        this.tickets = signal([]);
        this.loadingTickets = signal(true);
        this.filtro = signal('');
        this.ticketsOpen = signal(true); // visible por defecto en desktop
        this.statusFilters = [
            { v: '', label: 'Todos' },
            { v: 'NUEVO', label: 'Nuevo' },
            { v: 'EN_PROCESO', label: 'En proceso' },
            { v: 'ESPERANDO_TIENDA', label: 'Esperando' },
            { v: 'RESUELTO', label: 'Resuelto' },
        ];
        this.counts = computed(() => {
            const ts = this.tickets();
            const activos = ts.filter(t => !['CERRADO', 'CANCELADO', 'RESUELTO'].includes(t.estatus));
            return {
                abiertos: activos.length,
                vencidos: activos.filter(t => t.sla_vencido).length,
                proceso: ts.filter(t => ['EN_PROCESO', 'ESPERANDO_AGENTE'].includes(t.estatus)).length,
                confirmar: ts.filter(t => t.estatus === 'ESPERANDO_TIENDA').length,
            };
        });
        this.countsActivos = computed(() => this.counts().abiertos);
        this.ticketsFiltrados = computed(() => {
            const f = this.filtro();
            const ts = this.tickets();
            return f ? ts.filter(t => t.estatus === f) : ts;
        });
        this.tiendaNombre = () => this.auth.currentUser()?.tienda_nombre ?? 'Mi tienda';
    }
    // ── Lifecycle ─────────────────────────────────────────────────────────────
    ngOnInit() {
        this.pushWelcome();
        this.loadTickets();
        // Polling tickets cada 60s
        interval(60_000).pipe(takeUntil(this.destroy$))
            .subscribe(() => this.loadTickets());
    }
    ngOnDestroy() { this.destroy$.next(); this.destroy$.complete(); }
    ngAfterViewChecked() {
        if (this.needsScroll) {
            this.scrollToBottom();
            this.needsScroll = false;
        }
    }
    // ── Tickets ───────────────────────────────────────────────────────────────
    loadTickets() {
        this.ticketSvc.list({}).subscribe({
            next: ts => { this.tickets.set(ts); this.loadingTickets.set(false); },
            error: () => this.loadingTickets.set(false),
        });
    }
    // ── Chat ──────────────────────────────────────────────────────────────────
    sendMessage() {
        const text = this.inputText.trim();
        if (!text || this.thinking())
            return;
        this.inputText = '';
        this.send(text);
    }
    sendQuick(text) { this.send(text); }
    onKeydown(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            this.sendMessage();
        }
    }
    autoResize(e) {
        const el = e.target;
        el.style.height = 'auto';
        el.style.height = Math.min(el.scrollHeight, 120) + 'px';
    }
    send(text) {
        this.addMsg({ from: 'user', text });
        this.thinking.set(true);
        this.needsScroll = true;
        const payload = {
            mensaje: text,
            tienda_id: this.auth.currentUser()?.tienda_id,
            tienda_nombre: this.tiendaNombre(),
            sesion_id: this.sesionId,
            historial: this.messages().map(m => ({
                de: m.from, texto: m.text, tiempo: m.time.toISOString(),
            })),
        };
        this.http.post(this.proxyUrl, payload).pipe(takeUntil(this.destroy$), catchError(err => {
            if (err?.status === 503) {
                this.demoMode.set(true);
                setTimeout(() => this.handleDemoResponse(text), 800);
                return of(null);
            }
            return of({ respuesta: 'Hubo un problema al conectar. Intenta de nuevo.', accion: 'continuar' });
        })).subscribe(res => {
            if (res === null)
                return;
            this.thinking.set(false);
            const accion = res.accion ?? 'continuar';
            this.addMsg({
                from: 'dany',
                text: res.respuesta ?? res.output ?? 'No pude entender la respuesta.',
                accion: accion === 'continuar' ? null : accion,
                resumen: res.resumen,
            });
            this.needsScroll = true;
        });
    }
    handleDemoResponse(userText) {
        this.thinking.set(false);
        const lower = userText.toLowerCase();
        let text = 'Cuéntame más detalles sobre el problema. ¿Cuándo empezó y qué has intentado?';
        let accion = 'continuar';
        let resumen = '';
        if (lower.includes('internet') || lower.includes('antena') || lower.includes('red')) {
            text = 'Entendido. ¿Hay alguna luz roja o apagada en el router o antena? Intenta reiniciarla desconectándola 30 segundos.';
        }
        else if (lower.includes('pos') || lower.includes('sistema') || lower.includes('caja')) {
            text = '¿Cuándo empezó el problema? ¿Intentaron cerrar y volver a abrir el sistema?';
        }
        else if (lower.includes('sí') || lower.includes('ya funciona') || lower.includes('se resolvió')) {
            text = '¡Excelente! Me alegra que funcione. ¿Quieres que registre esto como resuelto en el historial?';
            accion = 'resuelto';
            resumen = userText;
        }
        else if (lower.includes('no') || lower.includes('sigue') || lower.includes('persiste')) {
            text = 'Entiendo que el problema persiste. Lo mejor es que un agente especializado lo revise. ¿Creo el reporte ahora?';
            accion = 'escalar';
            resumen = userText;
        }
        this.addMsg({ from: 'dany', text, accion: accion === 'continuar' ? null : accion, resumen });
        this.needsScroll = true;
    }
    // ── Acciones sobre tickets ────────────────────────────────────────────────
    crearTicket(resumen) {
        if (this.creatingTicket())
            return;
        this.creatingTicket.set(true);
        const desc = this.buildDescription();
        this.ticketSvc.create({
            descripcion: desc,
            tipificacion_id: undefined,
            ia_clasificacion_aceptada: false,
        }).subscribe({
            next: ticket => {
                if (resumen) {
                    this.ticketSvc.update(ticket.id, {
                        comentario: `Contexto Dany: ${resumen}`, tipo_comentario: 'PUBLICO'
                    }).subscribe();
                }
                this.ticketCreado.set({ id: ticket.id, folio: ticket.folio });
                this.esResueltoIA.set(false);
                this.creatingTicket.set(false);
                this.loadTickets(); // refrescar lista
            },
            error: () => this.creatingTicket.set(false),
        });
    }
    registrarResuelto(resumen) {
        if (this.creatingTicket())
            return;
        this.creatingTicket.set(true);
        const desc = `[Dany IA] ${this.buildDescription()}`;
        this.ticketSvc.create({
            descripcion: desc, tipificacion_id: undefined, ia_clasificacion_aceptada: false,
        }).subscribe({
            next: ticket => {
                this.ticketSvc.update(ticket.id, {
                    estatus: 'RESUELTO', comentario: `Resuelto por Dany: ${resumen}`,
                }).subscribe({
                    next: t => {
                        this.ticketCreado.set({ id: t.id, folio: t.folio });
                        this.esResueltoIA.set(true);
                        this.creatingTicket.set(false);
                        this.loadTickets();
                    },
                    error: () => {
                        this.ticketCreado.set({ id: ticket.id, folio: ticket.folio });
                        this.esResueltoIA.set(true);
                        this.creatingTicket.set(false);
                    },
                });
            },
            error: () => this.creatingTicket.set(false),
        });
    }
    irAlTicket() {
        const t = this.ticketCreado();
        if (t)
            this.router.navigate(['/tienda/ticket', t.id]);
    }
    resetChat() {
        this.messages.set([]);
        this.ticketCreado.set(null);
        this.esResueltoIA.set(false);
        this.sesionId = this.newSesionId();
        this.pushWelcome();
    }
    logout() { this.auth.logout(); }
    // ── Utils ─────────────────────────────────────────────────────────────────
    pushWelcome() {
        const nombre = this.tiendaNombre();
        this.addMsg({
            from: 'dany',
            text: `¡Hola${nombre ? ` — ${nombre}` : ''}! Soy Dany, tu asistente de soporte. ¿En qué puedo ayudarte hoy? Cuéntame qué está pasando en tu tienda.`,
        });
    }
    addMsg(partial) {
        this.messages.update(msgs => [...msgs, {
                id: Math.random().toString(36).slice(2),
                time: new Date(), ...partial,
            }]);
    }
    buildDescription() {
        const userMsgs = this.messages()
            .filter(m => m.from === 'user').map(m => m.text).join(' / ');
        return userMsgs || 'Consulta iniciada a través de Dany';
    }
    scrollToBottom() {
        const el = this.messagesRef?.nativeElement;
        if (el)
            el.scrollTop = el.scrollHeight;
    }
    newSesionId() {
        return Math.random().toString(36).slice(2) + Date.now().toString(36);
    }
};
__decorate([
    ViewChild('messagesRef')
], TiendaDashboardComponent.prototype, "messagesRef", void 0);
TiendaDashboardComponent = __decorate([
    Component({
        selector: 'app-tienda-dashboard',
        standalone: true,
        imports: [CommonModule, FormsModule, RouterModule, StatusBadgeComponent],
        template: `
    <div class="shell">

      <!-- ══ TOPBAR ══════════════════════════════════════════════════════════ -->
      <header class="topbar">
        <div class="topbar-brand">
          <div class="dany-orb topbar-orb"></div>
          <span class="topbar-title">
            Centro de Soluciones
            <span class="topbar-tienda">· {{ tiendaNombre() }}</span>
          </span>
        </div>
        <div class="topbar-actions">
          <!-- Toggle panel de tickets en móvil -->
          <button class="icon-btn" (click)="ticketsOpen.set(!ticketsOpen())"
                  title="Ver mis reportes">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" stroke-width="2" stroke-linecap="round"
                 stroke-linejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="16" y1="13" x2="8" y2="13"/>
              <line x1="16" y1="17" x2="8" y2="17"/>
            </svg>
            @if (countsActivos() > 0) {
              <span class="badge-dot">{{ countsActivos() }}</span>
            }
          </button>
          <button class="icon-btn" routerLink="/tienda/nuevo" title="Nuevo reporte manual">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" stroke-width="2" stroke-linecap="round"
                 stroke-linejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"/>
              <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
          </button>
          <button class="logout-btn" (click)="logout()">Salir</button>
        </div>
      </header>

      <!-- ══ BODY ════════════════════════════════════════════════════════════ -->
      <div class="body">

        <!-- ── CHAT DANY (protagonista) ─────────────────────────────────── -->
        <div class="chat-panel">

          <!-- Chat header -->
          <div class="chat-header">
            <div class="dany-avatar-wrap">
              <div class="dany-orb dany-orb--lg"></div>
              @if (thinking()) { <div class="thinking-ring"></div> }
            </div>
            <div>
              <p class="chat-name">Dany</p>
              <p class="chat-status">
                @if (thinking()) { <span class="status-dot status-dot--thinking"></span> Analizando… }
                @else { <span class="status-dot status-dot--online"></span> En línea · Asistente IA }
              </p>
            </div>
            @if (messages().length > 1) {
              <button class="reset-btn" (click)="resetChat()" title="Nueva conversación">
                ↺ Nueva
              </button>
            }
          </div>

          <!-- Mensajes -->
          <div class="messages-wrap" #messagesRef>

            @for (msg of messages(); track msg.id) {

              <!-- Mensaje Dany -->
              @if (msg.from === 'dany') {
                <div class="msg-row msg-row--dany">
                  <div class="msg-avatar">
                    <div class="dany-orb dany-orb--sm"></div>
                  </div>
                  <div class="msg-body">
                    <div class="bubble bubble--dany">{{ msg.text }}</div>
                    <span class="msg-time">{{ msg.time | date:'HH:mm' }}</span>

                    <!-- Acciones inline -->
                    @if (msg.accion === 'escalar' && !ticketCreado()) {
                      <div class="msg-actions">
                        <button class="action-btn action-btn--primary"
                                [disabled]="creatingTicket()"
                                (click)="crearTicket(msg.resumen)">
                          @if (creatingTicket()) { ⏳ Creando… }
                          @else { 🎫 Crear reporte ahora }
                        </button>
                        <button class="action-btn action-btn--ghost"
                                (click)="sendQuick('Dame más tiempo, lo sigo revisando')">
                          Seguir probando
                        </button>
                      </div>
                    }
                    @if (msg.accion === 'resuelto' && !ticketCreado()) {
                      <div class="msg-actions">
                        <button class="action-btn action-btn--success"
                                [disabled]="creatingTicket()"
                                (click)="registrarResuelto(msg.resumen ?? '')">
                          @if (creatingTicket()) { ⏳ Guardando… }
                          @else { ✅ Sí, quedó resuelto }
                        </button>
                        <button class="action-btn action-btn--ghost"
                                (click)="sendQuick('No, el problema sigue')">
                          No, sigue el problema
                        </button>
                      </div>
                    }
                  </div>
                </div>
              }

              <!-- Mensaje usuario -->
              @if (msg.from === 'user') {
                <div class="msg-row msg-row--user">
                  <div class="msg-body msg-body--user">
                    <div class="bubble bubble--user">{{ msg.text }}</div>
                    <span class="msg-time msg-time--right">{{ msg.time | date:'HH:mm' }}</span>
                  </div>
                </div>
              }
            }

            <!-- Ticket creado → confirmación -->
            @if (ticketCreado()) {
              <div class="ticket-confirm">
                @if (esResueltoIA()) {
                  <div class="ticket-confirm__icon">✅</div>
                  <p class="ticket-confirm__title">¡Problema resuelto!</p>
                  <p class="ticket-confirm__sub">Folio {{ ticketCreado()!.folio }} · registrado en tu historial</p>
                } @else {
                  <div class="ticket-confirm__icon">🎫</div>
                  <p class="ticket-confirm__title">Reporte creado exitosamente</p>
                  <p class="ticket-confirm__sub">Folio <strong>{{ ticketCreado()!.folio }}</strong> · Un agente lo atenderá pronto</p>
                  <button class="action-btn action-btn--primary" (click)="irAlTicket()">
                    Ver mi reporte →
                  </button>
                }
                <button class="action-btn action-btn--ghost" (click)="resetChat()">
                  Nueva consulta
                </button>
              </div>
            }

            <!-- Typing indicator -->
            @if (thinking()) {
              <div class="msg-row msg-row--dany">
                <div class="msg-avatar"><div class="dany-orb dany-orb--sm"></div></div>
                <div class="typing-indicator">
                  <span></span><span></span><span></span>
                </div>
              </div>
            }
          </div>

          <!-- Chips de acceso rápido (solo si chat vacío) -->
          @if (messages().length <= 1 && !thinking()) {
            <div class="quick-chips">
              @for (q of quickChips; track q) {
                <button class="quick-chip" (click)="sendQuick(q)">{{ q }}</button>
              }
            </div>
          }

          <!-- Input -->
          <div class="input-area">
            <textarea
              class="chat-input"
              [(ngModel)]="inputText"
              placeholder="Describe tu problema aquí… (Enter para enviar)"
              rows="1"
              [disabled]="thinking() || !!ticketCreado()"
              (keydown)="onKeydown($event)"
              (input)="autoResize($event)"
            ></textarea>
            <button class="send-btn"
                    [disabled]="!inputText.trim() || thinking() || !!ticketCreado()"
                    (click)="sendMessage()">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
                   stroke="currentColor" stroke-width="2.5"
                   stroke-linecap="round" stroke-linejoin="round">
                <line x1="22" y1="2" x2="11" y2="13"/>
                <polygon points="22 2 15 22 11 13 2 9 22 2"/>
              </svg>
            </button>
          </div>

          <!-- Footer disclaimer -->
          <p class="chat-disclaimer">
            Dany es un asistente IA · Si no puede resolver tu problema, creará un reporte automáticamente
          </p>
        </div>

        <!-- ── PANEL DE TICKETS (lateral) ────────────────────────────────── -->
        <div class="tickets-panel" [class.tickets-panel--open]="ticketsOpen()">

          <div class="tickets-header">
            <h2 class="tickets-title">Mis reportes</h2>
            <div class="tickets-counts">
              <span class="count-chip count-chip--blue">{{ counts().abiertos }} activos</span>
              @if (counts().vencidos > 0) {
                <span class="count-chip count-chip--red">{{ counts().vencidos }} vencidos</span>
              }
            </div>
          </div>

          <!-- Filtros compactos -->
          <div class="tickets-filters">
            @for (f of statusFilters; track f.v) {
              <button class="tfilter-btn"
                      [class.tfilter-btn--active]="filtro() === f.v"
                      (click)="filtro.set(f.v)">
                {{ f.label }}
              </button>
            }
          </div>

          <!-- Lista -->
          <div class="tickets-list">
            @if (loadingTickets()) {
              @for (i of [1,2,3]; track i) {
                <div class="tcard tcard--skeleton">
                  <div class="skeleton" style="height:11px;width:70px;border-radius:3px;margin-bottom:6px"></div>
                  <div class="skeleton" style="height:13px;width:90%;border-radius:3px"></div>
                </div>
              }
            } @else if (ticketsFiltrados().length === 0) {
              <div class="tickets-empty">
                <div style="font-size:32px;margin-bottom:8px">📭</div>
                <p style="font-size:13px;color:var(--c-muted)">
                  {{ filtro() ? 'Sin reportes con este estado' : 'Sin reportes activos' }}
                </p>
              </div>
            } @else {
              @for (t of ticketsFiltrados(); track t.id) {
                <a class="tcard" [routerLink]="['/tienda/ticket', t.id]">
                  <div class="tcard-top">
                    <span class="tcard-folio">{{ t.folio }}</span>
                    <app-status-badge [status]="t.estatus" />
                    @if (t.sla_vencido) {
                      <span class="badge badge--red" style="font-size:10px">⚠</span>
                    }
                  </div>
                  <p class="tcard-desc">{{ t.descripcion }}</p>
                  @if (t.cat_nivel1) {
                    <span class="tcard-area">{{ t.cat_nivel1 }}</span>
                  }
                  <span class="tcard-fecha">{{ t.fecha_apertura | date:'dd/MM · HH:mm' }}</span>
                </a>
              }
            }
          </div>

          <!-- CTA crear ticket manual -->
          <a routerLink="/tienda/nuevo" class="new-ticket-cta">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" stroke-width="2.5"
                 stroke-linecap="round" stroke-linejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"/>
              <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Abrir reporte manual
          </a>

        </div>
      </div>
    </div>
  `,
        styles: [`
    /* ── Shell ────────────────────────────────────────────────────────────── */
    .shell {
      display: flex; flex-direction: column;
      height: 100dvh; overflow: hidden;
      background: var(--c-bg);
    }

    /* ── Topbar ───────────────────────────────────────────────────────────── */
    .topbar {
      height: 56px; flex-shrink: 0;
      display: flex; align-items: center; justify-content: space-between;
      padding: 0 20px;
      background: var(--c-surface); border-bottom: 1px solid var(--c-border);
      z-index: 10;
    }
    .topbar-brand { display: flex; align-items: center; gap: 10px; }
    .topbar-title { font-size: 15px; font-weight: 700; color: var(--c-text); }
    .topbar-tienda { font-weight: 400; color: var(--c-muted); font-size: 13px; }
    .topbar-actions { display: flex; align-items: center; gap: 8px; }
    .icon-btn {
      position: relative; width: 36px; height: 36px; border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      border: 1px solid var(--c-border); background: var(--c-surface);
      cursor: pointer; transition: background .15s;
    }
    .icon-btn:hover { background: var(--c-bg); }
    .badge-dot {
      position: absolute; top: -4px; right: -4px;
      background: var(--c-red); color: white;
      font-size: 9px; font-weight: 700;
      width: 16px; height: 16px; border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
    }
    .logout-btn {
      padding: 6px 14px; border-radius: 8px; font-size: 13px;
      border: 1px solid var(--c-border); background: transparent;
      cursor: pointer; color: var(--c-muted); transition: all .15s;
    }
    .logout-btn:hover { background: var(--c-bg); color: var(--c-text); }

    /* ── Body (flex row) ──────────────────────────────────────────────────── */
    .body {
      flex: 1; display: flex; overflow: hidden; min-height: 0;
    }

    /* ══ DANY ORB (identidad visual) ═══════════════════════════════════════ */
    .dany-orb {
      border-radius: 50%; flex-shrink: 0;
      background: radial-gradient(circle at 35% 35%, #4f8aff, #1B3462);
      box-shadow: 0 2px 12px rgba(27,52,98,.35);
    }
    .topbar-orb { width: 28px; height: 28px; }
    .dany-orb--lg { width: 42px; height: 42px; }
    .dany-orb--sm { width: 28px; height: 28px; }
    .thinking-ring {
      position: absolute; inset: -4px; border-radius: 50%;
      border: 2px solid transparent;
      border-top-color: #4f8aff;
      animation: spin 1s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    /* ══ CHAT PANEL ════════════════════════════════════════════════════════ */
    .chat-panel {
      flex: 1; min-width: 0;
      display: flex; flex-direction: column;
      background: #f0f4f9;
      /* Fondo tipo papel con sutil patrón */
      background-image: radial-gradient(circle, #d0ddf0 1px, transparent 1px);
      background-size: 24px 24px;
    }

    /* Header del chat */
    .chat-header {
      display: flex; align-items: center; gap: 12px;
      padding: 14px 20px; background: var(--c-surface);
      border-bottom: 1px solid var(--c-border);
      position: relative;
    }
    .dany-avatar-wrap { position: relative; display: flex; align-items: center; justify-content: center; }
    .chat-name { font-size: 15px; font-weight: 700; margin: 0; }
    .chat-status { font-size: 12px; color: var(--c-muted); margin: 0; display: flex; align-items: center; gap: 4px; }
    .status-dot {
      display: inline-block; width: 8px; height: 8px; border-radius: 50%;
    }
    .status-dot--online { background: #22c55e; }
    .status-dot--thinking { background: #f59e0b; animation: pulse 1s infinite; }
    @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:.4; } }
    .reset-btn {
      margin-left: auto; padding: 5px 12px; border-radius: 8px;
      font-size: 12px; font-weight: 500;
      border: 1px solid var(--c-border); background: var(--c-surface);
      cursor: pointer; color: var(--c-muted); transition: all .15s;
    }
    .reset-btn:hover { background: var(--c-bg); color: var(--c-text); }

    /* Área de mensajes */
    .messages-wrap {
      flex: 1; overflow-y: auto; padding: 20px 16px;
      display: flex; flex-direction: column; gap: 16px;
      scroll-behavior: smooth;
    }
    .messages-wrap::-webkit-scrollbar { width: 4px; }
    .messages-wrap::-webkit-scrollbar-thumb { background: var(--c-border); border-radius: 2px; }

    /* Filas de mensaje */
    .msg-row { display: flex; gap: 8px; max-width: 85%; }
    .msg-row--dany { align-self: flex-start; }
    .msg-row--user { align-self: flex-end; flex-direction: row-reverse; }

    .msg-avatar { display: flex; align-items: flex-end; flex-shrink: 0; }
    .msg-body { display: flex; flex-direction: column; gap: 4px; }
    .msg-body--user { align-items: flex-end; }

    /* Burbujas */
    .bubble {
      padding: 12px 16px; border-radius: 18px;
      font-size: 14px; line-height: 1.5;
      max-width: 520px; word-wrap: break-word;
      animation: fadeIn .2s ease;
    }
    @keyframes fadeIn { from { opacity:0; transform:translateY(4px); } to { opacity:1; transform:none; } }
    .bubble--dany {
      background: var(--c-surface); color: var(--c-text);
      border-radius: 4px 18px 18px 18px;
      box-shadow: 0 1px 4px rgba(0,0,0,.08);
    }
    .bubble--user {
      background: linear-gradient(135deg, #1B3462, #2a4f8f);
      color: white;
      border-radius: 18px 4px 18px 18px;
      box-shadow: 0 2px 8px rgba(27,52,98,.3);
    }

    .msg-time { font-size: 10px; color: var(--c-muted); padding: 0 4px; }
    .msg-time--right { text-align: right; }

    /* Botones de acción inline */
    .msg-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 4px; }
    .action-btn {
      padding: 8px 16px; border-radius: 20px; font-size: 13px;
      font-weight: 600; cursor: pointer; border: none; transition: all .15s;
    }
    .action-btn:disabled { opacity: .5; cursor: not-allowed; }
    .action-btn--primary { background: var(--c-blue); color: white; }
    .action-btn--primary:not(:disabled):hover { filter: brightness(.88); }
    .action-btn--success { background: #00A878; color: white; }
    .action-btn--success:not(:disabled):hover { filter: brightness(.88); }
    .action-btn--ghost {
      background: transparent; color: var(--c-muted);
      border: 1px solid var(--c-border);
    }
    .action-btn--ghost:hover { background: var(--c-bg); }

    /* Typing indicator */
    .typing-indicator {
      display: flex; align-items: center; gap: 4px;
      background: var(--c-surface); border-radius: 18px;
      padding: 12px 16px; box-shadow: 0 1px 4px rgba(0,0,0,.08);
    }
    .typing-indicator span {
      width: 8px; height: 8px; background: var(--c-blue);
      border-radius: 50%; opacity: .4;
      animation: bounce 1.2s ease infinite;
    }
    .typing-indicator span:nth-child(2) { animation-delay: .2s; }
    .typing-indicator span:nth-child(3) { animation-delay: .4s; }
    @keyframes bounce {
      0%,80%,100% { transform: translateY(0); opacity:.4; }
      40% { transform: translateY(-6px); opacity:1; }
    }

    /* Confirmación ticket */
    .ticket-confirm {
      align-self: center; text-align: center;
      background: var(--c-surface); border-radius: 16px;
      padding: 24px 28px; max-width: 320px;
      box-shadow: 0 4px 16px rgba(0,0,0,.1);
      display: flex; flex-direction: column; align-items: center; gap: 8px;
      animation: fadeIn .3s ease;
    }
    .ticket-confirm__icon { font-size: 36px; }
    .ticket-confirm__title { font-size: 16px; font-weight: 700; margin: 0; }
    .ticket-confirm__sub { font-size: 13px; color: var(--c-muted); margin: 0; }

    /* Quick chips */
    .quick-chips {
      display: flex; gap: 8px; flex-wrap: wrap;
      padding: 0 16px 12px;
    }
    .quick-chip {
      padding: 8px 14px; border-radius: 20px; font-size: 13px;
      border: 1px solid var(--c-blue-md);
      background: var(--c-surface); color: var(--c-blue);
      cursor: pointer; transition: all .15s;
    }
    .quick-chip:hover { background: var(--c-blue-lt); }

    /* Input area */
    .input-area {
      display: flex; align-items: flex-end; gap: 10px;
      padding: 12px 16px;
      background: var(--c-surface); border-top: 1px solid var(--c-border);
    }
    .chat-input {
      flex: 1; resize: none; border-radius: 12px;
      border: 1.5px solid var(--c-border);
      padding: 10px 14px; font-size: 14px; font-family: inherit;
      background: var(--c-bg); transition: border-color .15s;
      max-height: 120px; overflow-y: auto;
      line-height: 1.5;
    }
    .chat-input:focus { outline: none; border-color: var(--c-blue); }
    .chat-input:disabled { opacity: .6; cursor: not-allowed; }
    .send-btn {
      width: 44px; height: 44px; border-radius: 50%; flex-shrink: 0;
      background: var(--c-blue); color: white; border: none;
      display: flex; align-items: center; justify-content: center;
      cursor: pointer; transition: all .15s;
    }
    .send-btn:not(:disabled):hover { filter: brightness(.88); transform: scale(1.05); }
    .send-btn:disabled { opacity: .4; cursor: not-allowed; }

    .chat-disclaimer {
      text-align: center; font-size: 10px; color: var(--c-muted);
      padding: 4px 16px 8px; margin: 0;
    }

    /* ══ PANEL DE TICKETS ══════════════════════════════════════════════════ */
    .tickets-panel {
      width: 320px; flex-shrink: 0;
      display: flex; flex-direction: column;
      background: var(--c-surface); border-left: 1px solid var(--c-border);
      transition: width .3s ease;
      overflow: hidden;
    }

    .tickets-header {
      padding: 16px 16px 10px;
      border-bottom: 1px solid var(--c-border);
    }
    .tickets-title { font-size: 15px; font-weight: 700; margin: 0 0 8px; }
    .tickets-counts { display: flex; gap: 6px; flex-wrap: wrap; }
    .count-chip {
      padding: 2px 8px; border-radius: 10px;
      font-size: 11px; font-weight: 600;
    }
    .count-chip--blue { background: var(--c-blue-lt); color: var(--c-blue); }
    .count-chip--red  { background: #fef2f2; color: #DC2626; }

    .tickets-filters {
      display: flex; gap: 4px; flex-wrap: wrap;
      padding: 10px 12px; border-bottom: 1px solid var(--c-border);
    }
    .tfilter-btn {
      padding: 4px 10px; border-radius: 12px; font-size: 11px;
      font-weight: 500; border: 1px solid var(--c-border);
      background: transparent; cursor: pointer;
      color: var(--c-muted); transition: all .15s;
    }
    .tfilter-btn--active {
      background: var(--c-blue); color: white; border-color: var(--c-blue);
    }
    .tfilter-btn:not(.tfilter-btn--active):hover { background: var(--c-bg); color: var(--c-text); }

    .tickets-list { flex: 1; overflow-y: auto; padding: 8px; display: flex; flex-direction: column; gap: 6px; }
    .tickets-list::-webkit-scrollbar { width: 3px; }
    .tickets-list::-webkit-scrollbar-thumb { background: var(--c-border); }

    .tcard {
      display: block; padding: 10px 12px; border-radius: 10px;
      border: 1px solid var(--c-border); background: var(--c-bg);
      text-decoration: none; color: inherit;
      transition: all .15s; cursor: pointer;
    }
    .tcard:hover { border-color: var(--c-blue); background: var(--c-blue-lt); transform: translateY(-1px); }
    .tcard--skeleton { pointer-events: none; }
    .tcard-top { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; flex-wrap: wrap; }
    .tcard-folio { font-family: monospace; font-size: 11px; font-weight: 700; color: var(--c-blue); }
    .tcard-desc { font-size: 12px; color: var(--c-text); margin: 0 0 6px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .tcard-area { font-size: 10px; color: var(--c-muted); background: var(--c-border); padding: 1px 6px; border-radius: 6px; display: inline-block; margin-bottom: 4px; }
    .tcard-fecha { font-size: 10px; color: var(--c-muted); display: block; }

    .tickets-empty { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 32px 16px; }

    .new-ticket-cta {
      display: flex; align-items: center; justify-content: center; gap: 6px;
      padding: 12px; margin: 8px; border-radius: 10px;
      border: 1.5px dashed var(--c-border);
      background: transparent; color: var(--c-muted);
      text-decoration: none; font-size: 13px;
      transition: all .15s; cursor: pointer;
    }
    .new-ticket-cta:hover { border-color: var(--c-blue); color: var(--c-blue); background: var(--c-blue-lt); }

    /* ── Responsive ───────────────────────────────────────────────────────── */
    @media (max-width: 768px) {
      .tickets-panel { position: fixed; right: 0; top: 56px; bottom: 0; z-index: 20; transform: translateX(100%); }
      .tickets-panel--open { transform: translateX(0); box-shadow: -4px 0 20px rgba(0,0,0,.15); }
    }
  `],
    })
], TiendaDashboardComponent);
export { TiendaDashboardComponent };
//# sourceMappingURL=tienda-dashboard.component.js.map