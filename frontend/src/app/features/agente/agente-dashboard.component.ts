import { Component, OnInit, OnDestroy, AfterViewChecked, ElementRef, ViewChild, signal, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { catchError, takeUntil } from 'rxjs/operators';
import { Subject, interval, of } from 'rxjs';
import { TicketService } from '../../core/services/ticket.service';
import { AuthService } from '../../core/services/auth.service';
import { AdminService } from '../../core/services/admin.service';
import { NavbarComponent } from '../../shared/components/navbar.component';
import { StatusBadgeComponent } from '../../shared/components/status-badge.component';
import { DashboardMetrics } from '../../core/models';
import { environment } from '../../../environments/environment';

interface DanyMsg { id: string; from: 'dany' | 'user'; text: string; time: Date; }

// ─────────────────────────────────────────────────────────────────────────────

@Component({
  selector: 'app-agente-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, NavbarComponent, StatusBadgeComponent],
  template: `
    <div class="page">
      <app-navbar section="Dashboard" />

      <div class="dash-body">

        <!-- ══ COLUMNA IZQUIERDA: métricas + tickets asignados ═════════════ -->
        <div class="left-col">

          <!-- Top bar del agente -->
          <div class="agent-topbar">
            <div>
              <h1 class="page-title">{{ auth.currentUser()?.nombre }}</h1>
              <p class="page-sub">{{ now | date:'EEEE dd/MM/yyyy' }} · {{ grupoNombre() }}</p>
            </div>
            <button
              class="disponibilidad-btn"
              [class.disponibilidad-btn--activo]="disponible()"
              [class.disponibilidad-btn--pausa]="!disponible()"
              (click)="toggleDisponibilidad()"
              [disabled]="togglingDisp()">
              <span class="disp-dot"
                    [class.disp-dot--verde]="disponible()"
                    [class.disp-dot--rojo]="!disponible()"></span>
              {{ disponible() ? 'Disponible' : 'En pausa' }}
            </button>
          </div>

          <!-- KPI chips homologados -->
          @if (metrics()) {
            <div class="kpi-row">
              <a routerLink="/agente/cola" class="kpi-card kpi-card--blue">
                <span class="kpi-val">{{ metrics()!.total_abiertos }}</span>
                <span class="kpi-lbl">Sin asignar</span>
              </a>
              <a routerLink="/agente/cola" class="kpi-card kpi-card--purple">
                <span class="kpi-val">{{ metrics()!.total_en_proceso }}</span>
                <span class="kpi-lbl">Tomados</span>
              </a>
              <a routerLink="/agente/cola" class="kpi-card kpi-card--amber">
                <span class="kpi-val">{{ metrics()!.total_confirmar_solucion }}</span>
                <span class="kpi-lbl">Confirmados</span>
              </a>
              <a routerLink="/agente/cola" class="kpi-card"
                 [class.kpi-card--red]="metrics()!.total_vencidos > 0">
                <span class="kpi-val" [class.val-red]="metrics()!.total_vencidos > 0">
                  {{ metrics()!.total_vencidos }}
                </span>
                <span class="kpi-lbl">🔴 SLA Vencido</span>
              </a>
              <a routerLink="/agente/cola" class="kpi-card"
                 [class.kpi-card--amber]="(metrics()!.por_sla_status.AMARILLO) > 0">
                <span class="kpi-val">{{ metrics()!.por_sla_status.AMARILLO }}</span>
                <span class="kpi-lbl">🟡 En riesgo</span>
              </a>
              <div class="kpi-card kpi-card--green">
                <span class="kpi-val">{{ metrics()!.total_cerrados_hoy }}</span>
                <span class="kpi-lbl">Cerrados hoy</span>
              </div>
            </div>
          }

          <!-- Mis tickets asignados (ordenados por prioridad) -->
          <div class="section-header">
            <h2 class="section-title">Mis tickets asignados</h2>
            <a routerLink="/agente/cola" class="ver-todos-link">Ver cola completa →</a>
          </div>

          @if (loadingTickets()) {
            @for (i of [1,2,3]; track i) {
              <div class="tcard tcard--skeleton">
                <div class="skeleton" style="height:11px;width:80px;border-radius:3px;margin-bottom:6px"></div>
                <div class="skeleton" style="height:13px;width:75%;border-radius:3px"></div>
              </div>
            }
          } @else if (misTickets().length === 0) {
            <div class="empty-tickets">
              <span style="font-size:28px">✅</span>
              <p style="font-size:13px;color:var(--c-muted);margin:4px 0 0">Sin tickets asignados · Todo al día</p>
            </div>
          } @else {
            <div class="tickets-list">
              @for (t of misTickets(); track t.id) {
                <a class="tcard" [routerLink]="['/agente/ticket', t.id]"
                   [class.tcard--rojo]="t.sla_status === 'ROJO'"
                   [class.tcard--amarillo]="t.sla_status === 'AMARILLO'">
                  <div class="tcard-top">
                    <span class="sla-dot" [style.background]="slaColor(t.sla_status)"></span>
                    <span class="tcard-folio">{{ t.folio }}</span>
                    <app-status-badge [status]="t.estatus" />
                    @if (t.sla_vencido) {
                      <span class="badge badge--red" style="font-size:10px">⚠</span>
                    }
                  </div>
                  <p class="tcard-desc">{{ t.descripcion }}</p>
                  <div class="tcard-meta">
                    @if (t.cat_nivel1) { <span class="tcard-area">{{ t.cat_nivel1 }}</span> }
                    <span class="tcard-fecha">{{ t.fecha_apertura | date:'dd/MM · HH:mm' }}</span>
                  </div>
                </a>
              }
            </div>
          }
        </div>

        <!-- ══ COLUMNA DERECHA: Dany copiloto ══════════════════════════════ -->
        <div class="dany-col">
          <div class="dany-card">

            <!-- Header Dany -->
            <div class="dany-header">
              <div class="dany-avatar-wrap">
                <div class="dany-orb"></div>
                @if (thinking()) { <div class="thinking-ring"></div> }
              </div>
              <div>
                <p class="dany-name">Dany · Copiloto IA</p>
                <p class="dany-status">
                  @if (thinking()) {
                    <span class="dot dot--thinking"></span> Analizando…
                  } @else {
                    <span class="dot dot--online"></span> Listo para ayudarte
                  }
                </p>
              </div>
              @if (chatMsgs().length > 1) {
                <button class="reset-btn" (click)="resetChat()">↺</button>
              }
            </div>

            <!-- Mensajes -->
            <div class="dany-messages" #chatRef>
              @for (msg of chatMsgs(); track msg.id) {
                @if (msg.from === 'dany') {
                  <div class="dmsg dmsg--dany">
                    <div class="dmsg-orb">
                      <div class="dany-orb dany-orb--xs"></div>
                    </div>
                    <div class="bubble bubble--dany">{{ msg.text }}</div>
                  </div>
                } @else {
                  <div class="dmsg dmsg--user">
                    <div class="bubble bubble--user">{{ msg.text }}</div>
                  </div>
                }
              }
              @if (thinking()) {
                <div class="dmsg dmsg--dany">
                  <div class="dmsg-orb"><div class="dany-orb dany-orb--xs"></div></div>
                  <div class="typing">
                    <span></span><span></span><span></span>
                  </div>
                </div>
              }
            </div>

            <!-- Input -->
            <div class="dany-input-area">
              <input
                class="dany-input"
                [(ngModel)]="chatInput"
                placeholder="Pregunta a Dany sobre un ticket…"
                [disabled]="thinking()"
                (keydown.enter)="sendChat()"
              />
              <button class="dany-send-btn"
                      [disabled]="!chatInput.trim() || thinking()"
                      (click)="sendChat()">
                ➤
              </button>
            </div>

            <!-- Chips de contexto rápido para el agente -->
            <div class="dany-chips">
              <button class="dany-chip" (click)="sendChatQuick('¿Cuántos tickets tengo pendientes?')">
                📊 Mis pendientes
              </button>
              <button class="dany-chip" (click)="sendChatQuick('¿Qué SLA están en riesgo?')">
                ⚠ SLA en riesgo
              </button>
              <button class="dany-chip" (click)="sendChatQuick('¿Qué debo atender primero?')">
                🎯 Prioridad
              </button>
            </div>
          </div>

          <!-- Métricas Dany (tasa de deflexión) -->
          @if (deflexion() !== null) {
            <div class="deflexion-card">
              <div class="deflexion-orb">
                <div class="dany-orb" style="width:36px;height:36px"></div>
              </div>
              <div>
                <p class="deflexion-val">{{ deflexion() | number:'1.1-1' }}%</p>
                <p class="deflexion-lbl">Tasa deflexión Dany · últimos 30d</p>
              </div>
              <div class="deflexion-bar-wrap">
                <div class="deflexion-bar"
                     [style.width.%]="(deflexion()! / 25) * 100 | number:'1.0-0'"
                     [class.deflexion-bar--ok]="deflexion()! >= 25">
                </div>
              </div>
              <span class="deflexion-meta">Meta 25%</span>
            </div>
          }
        </div>

      </div>
    </div>
  `,
  styles: [`
    .dash-body {
      display: grid;
      grid-template-columns: 1fr 360px;
      gap: 20px;
      padding: 20px;
      height: calc(100vh - 56px);
      overflow: hidden;
      box-sizing: border-box;
    }
    @media (max-width: 1100px) { .dash-body { grid-template-columns: 1fr; } }

    /* ── Columna izquierda ───────────────────────────────────────────────── */
    .left-col { display: flex; flex-direction: column; gap: 16px; overflow-y: auto; }
    .left-col::-webkit-scrollbar { width: 4px; }
    .left-col::-webkit-scrollbar-thumb { background: var(--c-border); }

    .agent-topbar { display: flex; justify-content: space-between; align-items: flex-start; }
    .page-title  { font-size: 20px; font-weight: 700; margin: 0; }
    .page-sub    { font-size: 12px; color: var(--c-muted); margin: 2px 0 0; }

    .kpi-row {
      display: grid; grid-template-columns: repeat(3, 1fr);
      gap: 10px;
    }
    .kpi-card {
      background: var(--c-surface); border: 1px solid var(--c-border);
      border-radius: var(--radius-md); padding: 12px 14px;
      display: flex; flex-direction: column; gap: 2px;
      text-decoration: none; color: inherit; transition: transform .1s;
      border-top: 3px solid var(--c-border);
    }
    .kpi-card:hover { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0,0,0,.07); }
    .kpi-card--blue   { border-top-color: var(--c-blue); }
    .kpi-card--purple { border-top-color: var(--c-purple); }
    .kpi-card--amber  { border-top-color: var(--c-amber); }
    .kpi-card--red    { border-top-color: var(--c-red); }
    .kpi-card--green  { border-top-color: var(--c-green); }
    .kpi-val { font-size: 26px; font-weight: 800; line-height: 1; }
    .kpi-lbl { font-size: 11px; color: var(--c-muted); }
    .val-red { color: var(--c-red); }

    .section-header { display: flex; justify-content: space-between; align-items: center; }
    .section-title  { font-size: 15px; font-weight: 600; margin: 0; }
    .ver-todos-link { font-size: 12px; color: var(--c-blue); text-decoration: none; }
    .ver-todos-link:hover { text-decoration: underline; }

    .tickets-list { display: flex; flex-direction: column; gap: 8px; }
    .tcard {
      display: block; padding: 10px 12px; border-radius: 10px;
      border: 1px solid var(--c-border); background: var(--c-surface);
      text-decoration: none; color: inherit; transition: all .15s;
    }
    .tcard:hover { border-color: var(--c-blue); transform: translateY(-1px); box-shadow: 0 3px 10px rgba(0,0,0,.07); }
    .tcard--rojo    { border-left: 3px solid var(--c-red) !important; }
    .tcard--amarillo{ border-left: 3px solid var(--c-amber) !important; }
    .tcard--skeleton{ pointer-events: none; }
    .tcard-top  { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; flex-wrap: wrap; }
    .tcard-folio{ font-family: monospace; font-size: 11px; font-weight: 700; color: var(--c-blue); }
    .tcard-desc { font-size: 13px; margin: 0 0 6px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .tcard-meta { display: flex; align-items: center; gap: 8px; }
    .tcard-area { font-size: 10px; background: var(--c-border); padding: 1px 6px; border-radius: 6px; color: var(--c-muted); }
    .tcard-fecha{ font-size: 10px; color: var(--c-muted); }
    .sla-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }

    .empty-tickets { display: flex; flex-direction: column; align-items: center; padding: 32px; }

    /* ── Dany columna ───────────────────────────────────────────────────── */
    .dany-col {
      display: flex; flex-direction: column; gap: 12px;
      overflow: hidden;
    }
    .dany-card {
      flex: 1; display: flex; flex-direction: column;
      background: var(--c-surface); border: 1px solid var(--c-border);
      border-radius: var(--radius-lg); overflow: hidden;
      min-height: 0;
    }

    /* Dany orb */
    .dany-orb {
      border-radius: 50%; flex-shrink: 0;
      background: radial-gradient(circle at 35% 35%, #4f8aff, #1B3462);
      box-shadow: 0 2px 10px rgba(27,52,98,.3);
      width: 36px; height: 36px;
    }
    .dany-orb--xs { width: 22px; height: 22px; }
    .dany-avatar-wrap { position: relative; display: flex; align-items: center; justify-content: center; }
    .thinking-ring {
      position: absolute; inset: -4px; border-radius: 50%;
      border: 2px solid transparent; border-top-color: #4f8aff;
      animation: spin 1s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    .dany-header {
      display: flex; align-items: center; gap: 10px;
      padding: 12px 14px; border-bottom: 1px solid var(--c-border);
      flex-shrink: 0;
    }
    .dany-name   { font-size: 14px; font-weight: 700; margin: 0; }
    .dany-status { font-size: 11px; color: var(--c-muted); margin: 0; display: flex; align-items: center; gap: 4px; }
    .dot { display: inline-block; width: 7px; height: 7px; border-radius: 50%; }
    .dot--online   { background: #22c55e; }
    .dot--thinking { background: #f59e0b; animation: pulse 1s infinite; }
    @keyframes pulse { 0%,100%{opacity:1;} 50%{opacity:.4;} }
    .reset-btn {
      margin-left: auto; width: 28px; height: 28px; border-radius: 50%;
      border: 1px solid var(--c-border); background: transparent;
      cursor: pointer; font-size: 14px; display: flex; align-items: center; justify-content: center;
    }
    .reset-btn:hover { background: var(--c-bg); }

    .dany-messages {
      flex: 1; overflow-y: auto; padding: 12px;
      display: flex; flex-direction: column; gap: 10px; min-height: 0;
    }
    .dany-messages::-webkit-scrollbar { width: 3px; }
    .dany-messages::-webkit-scrollbar-thumb { background: var(--c-border); }

    .dmsg { display: flex; align-items: flex-end; gap: 6px; max-width: 90%; }
    .dmsg--dany { align-self: flex-start; }
    .dmsg--user { align-self: flex-end; flex-direction: row-reverse; }
    .dmsg-orb   { flex-shrink: 0; }

    .bubble { padding: 8px 12px; border-radius: 14px; font-size: 13px; line-height: 1.45; }
    .bubble--dany {
      background: var(--c-bg); color: var(--c-text);
      border-radius: 3px 14px 14px 14px;
      box-shadow: 0 1px 3px rgba(0,0,0,.07);
    }
    .bubble--user {
      background: linear-gradient(135deg, #1B3462, #2a4f8f);
      color: white; border-radius: 14px 3px 14px 14px;
    }

    .typing {
      display: flex; gap: 4px; padding: 10px 14px;
      background: var(--c-bg); border-radius: 14px;
      box-shadow: 0 1px 3px rgba(0,0,0,.07);
    }
    .typing span {
      width: 7px; height: 7px; background: var(--c-blue);
      border-radius: 50%; animation: bounce 1.2s infinite;
    }
    .typing span:nth-child(2) { animation-delay: .2s; }
    .typing span:nth-child(3) { animation-delay: .4s; }
    @keyframes bounce { 0%,80%,100%{transform:translateY(0);opacity:.4;} 40%{transform:translateY(-5px);opacity:1;} }

    .dany-input-area {
      display: flex; gap: 8px; padding: 10px 12px;
      border-top: 1px solid var(--c-border); flex-shrink: 0;
    }
    .dany-input {
      flex: 1; border-radius: 10px; border: 1.5px solid var(--c-border);
      padding: 8px 12px; font-size: 13px; font-family: inherit;
      background: var(--c-bg); transition: border-color .15s;
    }
    .dany-input:focus { outline: none; border-color: var(--c-blue); }
    .dany-send-btn {
      width: 36px; height: 36px; border-radius: 50%; flex-shrink: 0;
      background: var(--c-blue); color: white; border: none;
      cursor: pointer; font-size: 14px; transition: all .15s;
    }
    .dany-send-btn:not(:disabled):hover { filter: brightness(.88); }
    .dany-send-btn:disabled { opacity: .4; cursor: not-allowed; }

    .dany-chips {
      display: flex; gap: 6px; flex-wrap: wrap;
      padding: 0 12px 10px; flex-shrink: 0;
    }
    .dany-chip {
      padding: 4px 10px; border-radius: 12px; font-size: 11px;
      border: 1px solid var(--c-blue-md); background: var(--c-surface);
      color: var(--c-blue); cursor: pointer; transition: all .15s;
    }
    .dany-chip:hover { background: var(--c-blue-lt); }

    /* Deflexión card */
    .deflexion-card {
      background: var(--c-surface); border: 1px solid var(--c-border);
      border-radius: var(--radius-md); padding: 12px 14px;
      display: grid; grid-template-columns: auto 1fr; gap: 8px;
      align-items: center; flex-shrink: 0;
    }
    .deflexion-orb { grid-row: span 2; }
    .deflexion-val  { font-size: 20px; font-weight: 800; color: #1B3462; margin: 0; }
    .deflexion-lbl  { font-size: 11px; color: var(--c-muted); margin: 0; }
    .deflexion-bar-wrap {
      grid-column: 2; height: 6px;
      background: var(--c-border); border-radius: 3px; overflow: hidden;
    }
    .deflexion-bar { height: 100%; background: var(--c-blue); border-radius: 3px; transition: width .5s; max-width: 100%; }
    .deflexion-bar--ok { background: #00A878; }
    .deflexion-meta { grid-column: 2; font-size: 10px; color: var(--c-muted); }

    /* Misc */
    .disponibilidad-btn {
      display: flex; align-items: center; gap: 6px;
      padding: 6px 12px; border-radius: var(--radius-md); font-size: 12px;
      font-weight: 500; cursor: pointer; border: 1px solid; transition: all .15s;
    }
    .disponibilidad-btn--activo { background: #E8F5E9; color: #2E7D32; border-color: #A5D6A7; }
    .disponibilidad-btn--pausa  { background: #FFF3E0; color: #E65100; border-color: #FFCC80; }
    .disponibilidad-btn:disabled { opacity: .6; cursor: not-allowed; }
    .disp-dot { width: 8px; height: 8px; border-radius: 50%; }
    .disp-dot--verde { background: #2E7D32; }
    .disp-dot--rojo  { background: #E65100; }
  `],
})
export class AgenteDashboardComponent implements OnInit, OnDestroy, AfterViewChecked {
  @ViewChild('chatRef') private chatRef?: ElementRef<HTMLDivElement>;

  auth = inject(AuthService);
  private ticketSvc = inject(TicketService);
  private adminSvc = inject(AdminService);
  private http = inject(HttpClient);
  private destroy$ = new Subject<void>();

  // ── Estado métricas ────────────────────────────────────────────────────────
  metrics = signal<DashboardMetrics | null>(null);
  loadingTickets = signal(true);
  allTickets = signal<any[]>([]);
  disponible = signal(true);
  togglingDisp = signal(false);
  deflexion = signal<number | null>(null);
  now = new Date();

  grupoNombre = computed(() => {
    const user = this.auth.currentUser();
    return (user as any)?.grupo_nombre ?? '';
  });

  misTickets = computed(() => {
    const userId = this.auth.currentUser()?.id;
    const SLA_ORDER: Record<string, number> = { ROJO: 0, AMARILLO: 1, VERDE: 2, SIN_SLA: 3 };
    const PRIO_ORDER: Record<string, number> = { CRITICA: 0, ALTA: 1, MEDIA: 2, BAJA: 3 };
    return this.allTickets()
      .filter(t => t.agente_id === userId && !['CERRADO', 'CANCELADO', 'RESUELTO'].includes(t.estatus))
      .sort((a, b) => {
        const s = (SLA_ORDER[a.sla_status] ?? 3) - (SLA_ORDER[b.sla_status] ?? 3);
        if (s !== 0) return s;
        return (PRIO_ORDER[a.prioridad] ?? 9) - (PRIO_ORDER[b.prioridad] ?? 9);
      });
  });

  // ── Chat Dany copiloto ─────────────────────────────────────────────────────
  chatMsgs = signal<DanyMsg[]>([]);
  chatInput = '';
  thinking = signal(false);
  private readonly proxyUrl = `${environment.apiUrl}/dany/chat`;
  private needsScroll = false;

  ngOnInit() {
    const user = this.auth.currentUser();
    if (user) this.disponible.set(user.disponible ?? true);

    this.ticketSvc.dashboard().subscribe({
      next: m => { this.metrics.set(m); },
      error: () => { },
    });

    this.ticketSvc.list({}).subscribe({
      next: ts => { this.allTickets.set(ts as any); this.loadingTickets.set(false); },
      error: () => this.loadingTickets.set(false),
    });

    // Cargar deflexión Dany
    this.http.get<any>(`${environment.apiUrl}/admin/kpis/dany`).pipe(
      catchError(() => of(null))
    ).subscribe(d => { if (d) this.deflexion.set(d.tasa_deflexion_pct ?? null); });

    this.pushWelcome();

    // Polling cada 90s
    interval(90_000).pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.ticketSvc.list({}).subscribe({ next: ts => this.allTickets.set(ts as any), error: () => { } });
      });
  }

  ngOnDestroy() { this.destroy$.next(); this.destroy$.complete(); }

  ngAfterViewChecked() {
    if (this.needsScroll) {
      const el = this.chatRef?.nativeElement;
      if (el) el.scrollTop = el.scrollHeight;
      this.needsScroll = false;
    }
  }

  // ── Disponibilidad ────────────────────────────────────────────────────────
  toggleDisponibilidad() {
    const user = this.auth.currentUser();
    if (!user || this.togglingDisp()) return;
    this.togglingDisp.set(true);
    const nuevo = !this.disponible();
    this.adminSvc.setDisponibilidad(user.id, nuevo).subscribe({
      next: () => {
        this.disponible.set(nuevo);
        this.togglingDisp.set(false);
        this.auth.currentUser.update(u => u ? { ...u, disponible: nuevo } : u);
      },
      error: () => this.togglingDisp.set(false),
    });
  }

  // ── Chat ──────────────────────────────────────────────────────────────────
  sendChat() {
    const text = this.chatInput.trim();
    if (!text || this.thinking()) return;
    this.chatInput = '';
    this.addChatMsg({ from: 'user', text });
    this.thinking.set(true);
    this.needsScroll = true;

    const payload = {
      mensaje: text,
      tienda_id: null,
      sesion_id: 'agente-' + this.auth.currentUser()?.id,
      contexto: {
        rol: 'agente',
        grupo: this.grupoNombre(),
        mis_tickets: this.misTickets().length,
      },
      historial: this.chatMsgs().slice(-6).map(m => ({ de: m.from, texto: m.text })),
    };

    this.http.post<any>(this.proxyUrl, payload).pipe(
      takeUntil(this.destroy$),
      catchError(() => of({ respuesta: this.agenteFallback(text) }))
    ).subscribe(res => {
      this.thinking.set(false);
      this.addChatMsg({ from: 'dany', text: res?.respuesta ?? res?.output ?? 'No pude obtener respuesta.' });
      this.needsScroll = true;
    });
  }

  sendChatQuick(text: string) {
    this.chatInput = text;
    this.sendChat();
  }

  resetChat() {
    this.chatMsgs.set([]);
    this.pushWelcome();
  }

  private agenteFallback(text: string): string {
    const l = text.toLowerCase();
    if (l.includes('pendiente') || l.includes('cuántos')) {
      return `Tienes ${this.misTickets().length} tickets asignados activos. Revísalos en la cola.`;
    }
    if (l.includes('riesgo') || l.includes('sla')) {
      const n = this.misTickets().filter(t => t.sla_status === 'ROJO').length;
      return n > 0 ? `⚠ Hay ${n} ticket(s) con SLA vencido. Atiéndelos primero.` : '✅ Todos tus SLA están en tiempo.';
    }
    if (l.includes('prioridad') || l.includes('primero')) {
      const t = this.misTickets()[0];
      return t ? `El más urgente es ${t.folio}: "${t.descripcion}".` : 'No tienes tickets asignados ahora mismo.';
    }
    return 'Como copiloto estoy aquí para ayudarte a priorizar y resolver tickets. ¿Qué necesitas?';
  }

  private pushWelcome() {
    const nombre = this.auth.currentUser()?.nombre?.split(' ')[0] ?? '';
    this.addChatMsg({
      from: 'dany',
      text: `Hola${nombre ? ` ${nombre}` : ''} 👋 Soy tu copiloto IA. Pregúntame sobre tus tickets, prioridades o cualquier consulta de soporte.`,
    });
  }

  private addChatMsg(partial: Omit<DanyMsg, 'id' | 'time'>) {
    this.chatMsgs.update(m => [...m, { id: Math.random().toString(36).slice(2), time: new Date(), ...partial }]);
  }

  slaColor(status: string): string {
    const map: Record<string, string> = { ROJO: '#EF4444', AMARILLO: '#F59E0B', VERDE: '#22C55E' };
    return map[status] ?? '#9CA3AF';
  }
}