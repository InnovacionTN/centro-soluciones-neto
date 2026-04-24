import {
  Component, OnInit, OnDestroy, AfterViewChecked,
  ElementRef, ViewChild, signal, inject, computed, effect
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { Subject, interval, of } from 'rxjs';
import { catchError, takeUntil } from 'rxjs/operators';
import { TicketService } from '../../core/services/ticket.service';
import { AuthService } from '../../core/services/auth.service';
import { AdminService } from '../../core/services/admin.service';
import { NavbarComponent } from '../../shared/components/navbar.component';
import { StatusBadgeComponent } from '../../shared/components/status-badge.component';
import { DashboardMetrics } from '../../core/models';
import { environment } from '../../../environments/environment';

interface DanyMsg { id: string; from: 'dany' | 'user'; text: string; time: Date; }

@Component({
  selector: 'app-agente-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, NavbarComponent, StatusBadgeComponent],
  template: `
    <div class="page">
      <app-navbar section="Dashboard" />

      <div class="workspace" [class.workspace--no-daniel]="!danielOpen()">

        <!-- ══ CENTRO: TICKETS ════════════════════════════════════════════════ -->
        <main class="center-col">
          <div class="center-header">
            <div class="agent-info-row">
              <div class="agent-avatar">{{ initials() }}</div>
              <div>
                <h1 class="page-title">{{ firstName() }}</h1>
                <p class="page-sub">{{ grupoNombre() }} · {{ fechaEsp() }}</p>
              </div>
            </div>
            <div class="center-header-right">
              <a routerLink="/agente/cola" class="btn-cola">Cola completa →</a>
              <button class="daniel-btn" (click)="danielOpen.set(!danielOpen())"
                      [class.daniel-btn--on]="danielOpen()">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="3" y="11" width="18" height="10" rx="2"/>
                  <circle cx="12" cy="5" r="2"/><path d="M12 7v4"/>
                  <circle cx="8" cy="16" r="1" fill="currentColor" stroke="none"/>
                  <circle cx="16" cy="16" r="1" fill="currentColor" stroke="none"/>
                </svg>
                @if (!danielOpen()) { Daniel } @else { Cerrar }
              </button>
            </div>
          </div>

          <!-- KPI bar: cada chip navega a la Cola con filtro pre-aplicado -->
          @if (metrics()) {
            <div class="kpi-bar">

              <!-- Sin tomar: tickets del grupo sin agente — motiva a entrar a la cola -->
              <a [routerLink]="['/agente/cola']" [queryParams]="{f:'__sin_asignar__'}"
                 class="kchip kchip--dashed"
                 title="Tickets de tu grupo que aún no tiene nadie asignado. Haz clic para tomarlos.">
                <span class="kchip-n kchip-n--muted">{{ metrics()!.total_abiertos }}</span>
                <span class="kchip-l">Sin tomar</span>
                <span class="kchip-hint">del grupo</span>
              </a>

              <!-- Separador visual: mis tickets vs grupo -->
              <div class="kchip-sep"></div>

              <!-- Mis asignados -->
              <a [routerLink]="['/agente/cola']" [queryParams]="{f:'__mis_asignados__'}"
                 class="kchip kchip--purple"
                 title="Tickets que ya tomaste y están en trabajo activo (En proceso o Esperando tu respuesta)">
                <span class="kchip-n">{{ metrics()!.total_en_proceso }}</span>
                <span class="kchip-l">Mis asignados</span>
              </a>

              <!-- Esp. confirmación -->
              <a [routerLink]="['/agente/cola']" [queryParams]="{f:'ESPERANDO_TIENDA'}"
                 class="kchip kchip--amber"
                 title="Enviaste solución y esperas que la tienda confirme si quedó resuelto">
                <span class="kchip-n">{{ metrics()!.total_confirmar_solucion }}</span>
                <span class="kchip-l">Esp. tienda</span>
              </a>

              <!-- SLA Vencido: solo si hay alguno -->
              @if (metrics()!.total_vencidos > 0) {
                <a [routerLink]="['/agente/cola']" [queryParams]="{sla:'ROJO'}"
                   class="kchip kchip--red kchip--pulse"
                   title="Tickets cuyo tiempo límite de resolución ya venció. Atención inmediata.">
                  <span class="kchip-n">{{ metrics()!.total_vencidos }}</span>
                  <span class="kchip-l">🔴 SLA Vencido</span>
                </a>
              }

              <!-- Re-abiertos: solo si hay alguno -->
              @if (metrics()!.total_rechazados > 0) {
                <a [routerLink]="['/agente/cola']" [queryParams]="{f:'RECHAZADO'}"
                   class="kchip kchip--red"
                   title="La tienda rechazó la solución propuesta. Requieren re-atención urgente.">
                  <span class="kchip-n">{{ metrics()!.total_rechazados }}</span>
                  <span class="kchip-l">⚠ Re-abiertos</span>
                </a>
              }
            </div>
          }

          <!-- Tickets list -->
          <div class="tickets-wrap">
            @if (loadingTickets()) {
              @for (i of [1,2,3,4]; track i) {
                <div class="tcard tcard--skeleton">
                  <div class="skeleton sk-line sk-line--sm"></div>
                  <div class="skeleton sk-line sk-line--lg"></div>
                </div>
              }
            } @else if (misTickets().length === 0) {
              <div class="empty-state">
                <span class="empty-icon">✅</span>
                <p class="empty-txt">Sin tickets asignados a ti</p>
                @if ((metrics()?.total_abiertos ?? 0) > 0) {
                  <a [routerLink]="['/agente/cola']" [queryParams]="{f:'__sin_asignar__'}"
                     class="empty-cola-link">
                    👀 Hay {{ metrics()!.total_abiertos }} ticket(s) sin tomar en tu grupo →
                  </a>
                }
              </div>
            } @else {
              @for (t of misTickets(); track t.id) {
                <a class="tcard" [routerLink]="['/agente/ticket', t.id]"
                   [class.tcard--red]="t.sla_status === 'ROJO'"
                   [class.tcard--amber]="t.sla_status === 'AMARILLO'">
                  <div class="tcard-row">
                    <span class="sla-pip" [style.background]="slaColor(t.sla_status)"></span>
                    <span class="tcard-folio">{{ t.folio }}</span>
                    <app-status-badge [status]="$any(t.estatus)" />
                    @if (t.sla_vencido) { <span class="badge-vencido">⚠ SLA</span> }
                    <span class="tcard-prio prio--{{ t.prioridad?.toLowerCase() }}">{{ t.prioridad }}</span>
                  </div>
                  <p class="tcard-desc">{{ t.descripcion }}</p>
                  <div class="tcard-footer">
                    @if (t.cat_nivel1) { <span class="tcard-area">{{ t.cat_nivel1 }}</span> }
                    <span class="tcard-fecha">{{ t.fecha_apertura | date:'dd/MM · HH:mm' }}</span>
                  </div>
                </a>
              }
            }
          </div>
        </main>

        <!-- ══ DANIEL — PANEL DERECHO ════════════════════════════════════════ -->
        @if (danielOpen()) {
        <aside class="dany-panel">
          <div class="dany-topbar">
            <div class="dany-orb-wrap">
              <div class="dany-orb" [class.dany-orb--pulse]="thinking()"></div>
            </div>
            <div class="dany-topbar-info">
              <span class="dany-topbar-name">Daniel</span>
              <span class="dany-topbar-sub">
                @if (thinking()) { Analizando… } @else { En línea }
              </span>
            </div>
            @if (chatMsgs().length > 1) {
              <button class="dany-reset" (click)="resetChat()" title="Nueva conversación">↺</button>
            }
          </div>

          <div class="dany-messages" #chatRef>
            @for (msg of chatMsgs(); track msg.id) {
              <div class="dmsg" [class.dmsg--dany]="msg.from === 'dany'" [class.dmsg--user]="msg.from === 'user'">
                @if (msg.from === 'dany') {
                  <div class="dany-mini-orb"><div class="dany-orb dany-orb--xs"></div></div>
                }
                <div class="bubble" [class.bubble--dany]="msg.from === 'dany'" [class.bubble--user]="msg.from === 'user'">
                  {{ msg.text }}
                </div>
              </div>
            }
            @if (thinking()) {
              <div class="dmsg dmsg--dany">
                <div class="dany-mini-orb"><div class="dany-orb dany-orb--xs"></div></div>
                <div class="typing"><span></span><span></span><span></span></div>
              </div>
            }
          </div>

          <div class="dany-chips">
            <button class="dchip" (click)="sendChatQuick('¿Cuántos tickets tengo pendientes?')">📊 Pendientes</button>
            <button class="dchip" (click)="sendChatQuick('¿Qué SLA están en riesgo?')">⚠ SLA riesgo</button>
            <button class="dchip" (click)="sendChatQuick('¿Qué debo atender primero?')">🎯 Prioridad</button>
          </div>

          <div class="dany-input-row">
            <input
              class="dany-input"
              [(ngModel)]="chatInput"
              placeholder="Pregunta a Daniel…"
              [disabled]="thinking()"
              (keydown.enter)="sendChat()"
            />
            <button class="dany-send" [disabled]="!chatInput.trim() || thinking()" (click)="sendChat()">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
            </button>
          </div>
        </aside>
        }

      </div>
    </div>

  `,
  styles: [`
    /* ── Layout ────────────────────────────────────────────────────────────── */
    .workspace {
      flex:1; display:grid; min-height:0; height:100vh; overflow:hidden;
      grid-template-columns: 1fr 360px; transition:grid-template-columns .2s;
    }
    .workspace--no-daniel { grid-template-columns: 1fr 0px; }
    .daniel-btn {
      display:flex; align-items:center; gap:7px;
      padding:9px 16px; border-radius:22px;
      background:linear-gradient(135deg,#1B3462,#2563eb);
      color:white; border:none; cursor:pointer; font-size:13px; font-weight:500;
      box-shadow:0 4px 14px rgba(27,52,98,.3); transition:all .18s;
    }
    .daniel-btn:hover { transform:translateY(-1px); box-shadow:0 6px 18px rgba(27,52,98,.4); }
    .daniel-btn--on { background:linear-gradient(135deg,#0f1f42,#1B3462); box-shadow:0 2px 8px rgba(27,52,98,.25); }

    /* ── Centro ─────────────────────────────────────────────────────────────── */
    .center-col {
      display:flex; flex-direction:column; overflow-y:auto;
      padding:20px; gap:16px; min-height:0; background:var(--c-bg);
    }
    .center-col::-webkit-scrollbar { width:4px; }
    .center-col::-webkit-scrollbar-thumb { background:var(--c-border); }

    .center-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:4px; }
    .agent-info-row { display:flex; align-items:center; gap:10px; }
    .agent-avatar {
      width:38px; height:38px; border-radius:50%; flex-shrink:0;
      background:linear-gradient(135deg,#1B3462,#2a4f8f);
      color:white; font-size:13px; font-weight:700;
      display:flex; align-items:center; justify-content:center;
    }
    .center-header-right { display:flex; align-items:center; gap:10px; }
    .page-title { font-size:18px; font-weight:700; margin:0; }
    .page-sub { font-size:11px; color:var(--c-muted); margin:2px 0 0; text-transform:capitalize; }

    .btn-cola {
      font-size:12px; color:var(--c-blue); text-decoration:none;
      padding:6px 12px; border:1px solid var(--c-blue-md); border-radius:8px;
      transition:background .15s;
    }
    .btn-cola:hover { background:var(--c-blue-lt); }

    .kpi-bar { display:flex; gap:8px; }
    .kchip {
      flex:1; display:flex; flex-direction:column; gap:2px;
      padding:10px 12px; border-radius:12px; border:1px solid var(--c-border);
      background:var(--c-surface); text-decoration:none; color:inherit;
      transition:transform .15s, box-shadow .15s;
      border-top:3px solid transparent;
    }
    .kchip:hover { transform:translateY(-2px); box-shadow:0 4px 12px rgba(0,0,0,.07); }
    .kchip--blue   { border-top-color:var(--c-blue); }
    .kchip--purple { border-top-color:var(--c-purple); }
    .kchip--amber  { border-top-color:var(--c-amber); }
    .kchip--red    { border-top-color:var(--c-red); }
    .kchip--dashed { border-top:2px dashed var(--c-border); background:var(--c-bg); opacity:.85; }
    .kchip--dashed:hover { opacity:1; }
    .kchip--pulse  { animation:chip-pulse 2s ease-in-out infinite; }
    @keyframes chip-pulse {
      0%,100% { box-shadow:0 0 0 0 rgba(239,68,68,0); }
      50%      { box-shadow:0 0 0 4px rgba(239,68,68,.15); }
    }
    .kchip-sep { width:1px; background:var(--c-border); align-self:stretch; margin:4px 0; flex-shrink:0; }
    .kchip-n { font-size:24px; font-weight:800; line-height:1; }
    .kchip-n--muted { color:var(--c-muted); }
    .kchip-l { font-size:11px; color:var(--c-muted); }
    .kchip-hint { font-size:9px; color:var(--c-muted); opacity:.7; }
    .empty-cola-link {
      font-size:12px; color:var(--c-blue); text-decoration:none;
      padding:6px 12px; border:1px solid var(--c-blue-md); border-radius:8px;
      transition:background .15s; margin-top:4px;
    }
    .empty-cola-link:hover { background:var(--c-blue-lt); }

    .tickets-wrap { display:flex; flex-direction:column; gap:8px; }

    .tcard {
      display:block; padding:12px 14px; border-radius:12px;
      border:1px solid var(--c-border); background:var(--c-surface);
      text-decoration:none; color:inherit;
      transition:all .2s; border-left:3px solid transparent;
    }
    .tcard:hover { border-color:var(--c-blue); transform:translateY(-1px); box-shadow:0 4px 14px rgba(0,0,0,.07); }
    .tcard--red    { border-left-color:var(--c-red) !important; background:#fef2f2; }
    .tcard--amber  { border-left-color:var(--c-amber) !important; background:#fffbeb; }
    .tcard--skeleton { pointer-events:none; background:var(--c-surface); }

    .tcard-row { display:flex; align-items:center; gap:6px; margin-bottom:6px; flex-wrap:wrap; }
    .sla-pip { width:8px; height:8px; border-radius:50%; flex-shrink:0; }
    .tcard-folio { font-family:monospace; font-size:11px; font-weight:700; color:var(--c-blue); }
    .badge-vencido {
      font-size:10px; background:#fef2f2; color:var(--c-red);
      border:1px solid #fecaca; padding:1px 6px; border-radius:6px;
    }
    .tcard-prio {
      margin-left:auto; font-size:10px; font-weight:600; padding:1px 7px;
      border-radius:6px; text-transform:lowercase; letter-spacing:.02em;
    }
    .prio--critica { background:#fef2f2; color:var(--c-red); }
    .prio--alta    { background:#fff3e0; color:#e65100; }
    .prio--media   { background:#fffbeb; color:#d97706; }
    .prio--baja    { background:var(--c-bg); color:var(--c-muted); }

    .tcard-desc { font-size:13px; margin:0 0 6px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .tcard-footer { display:flex; align-items:center; gap:8px; }
    .tcard-area {
      font-size:10px; background:var(--c-border); padding:2px 7px;
      border-radius:6px; color:var(--c-muted);
    }
    .tcard-fecha { font-size:10px; color:var(--c-muted); margin-left:auto; }

    .empty-state { display:flex; flex-direction:column; align-items:center; padding:48px 20px; gap:8px; }
    .empty-icon { font-size:36px; }
    .empty-txt { font-size:13px; color:var(--c-muted); }

    /* Skeleton */
    .skeleton { background:linear-gradient(90deg,var(--c-border) 25%,var(--c-bg) 50%,var(--c-border) 75%); background-size:200% 100%; animation:shimmer 1.4s infinite; border-radius:4px; }
    .sk-line { height:10px; margin-bottom:8px; }
    .sk-line--sm { width:40%; }
    .sk-line--lg { width:75%; }
    @keyframes shimmer { 0%{background-position:200% 0;} 100%{background-position:-200% 0;} }

    /* ── Dany Panel ─────────────────────────────────────────────────────────── */
    .dany-panel {
      display:flex; flex-direction:column;
      border-left:1px solid var(--c-border);
      background:var(--c-surface);
      height:100vh; overflow:hidden;
    }

    .dany-topbar {
      display:flex; align-items:center; gap:10px;
      padding:14px 16px; border-bottom:1px solid var(--c-border);
      flex-shrink:0;
      background:linear-gradient(135deg,#0f1f42,#1B3462);
    }

    .dany-orb-wrap { position:relative; flex-shrink:0; }
    .dany-orb {
      width:34px; height:34px; border-radius:50%;
      background:radial-gradient(circle at 32% 32%, #6ba3ff, #1B3462);
      box-shadow:0 0 12px rgba(79,138,255,.4);
    }
    .dany-orb--xs { width:22px; height:22px; }
    .dany-orb--pulse { animation:orb-pulse 1.5s ease-in-out infinite; }
    @keyframes orb-pulse {
      0%,100% { box-shadow:0 0 8px rgba(79,138,255,.4); }
      50%      { box-shadow:0 0 20px rgba(79,138,255,.8); }
    }
    .dany-topbar-name { font-size:14px; font-weight:700; color:white; display:block; }
    .dany-topbar-sub  { font-size:11px; color:rgba(255,255,255,.6); display:block; }
    .dany-reset {
      margin-left:auto; width:28px; height:28px; border-radius:50%;
      border:1px solid rgba(255,255,255,.2); background:rgba(255,255,255,.08);
      color:white; cursor:pointer; font-size:14px; transition:background .15s;
    }
    .dany-reset:hover { background:rgba(255,255,255,.18); }

    .dany-messages {
      flex:1; overflow-y:auto; padding:16px 14px;
      display:flex; flex-direction:column; gap:12px;
      min-height:0; height:0;
    }
    .dany-messages::-webkit-scrollbar { width:3px; }
    .dany-messages::-webkit-scrollbar-thumb { background:var(--c-border); }

    .dmsg { display:flex; align-items:flex-end; gap:7px; max-width:92%; }
    .dmsg--dany { align-self:flex-start; }
    .dmsg--user { align-self:flex-end; flex-direction:row-reverse; }
    .dany-mini-orb { flex-shrink:0; margin-bottom:2px; }

    .bubble {
      padding:9px 13px; border-radius:16px; font-size:13px;
      line-height:1.5; white-space:pre-wrap; word-break:break-word;
      animation:bubble-in .2s ease;
    }
    @keyframes bubble-in { from{opacity:0;transform:translateY(4px);} to{opacity:1;transform:translateY(0);} }
    .bubble--dany {
      background:var(--c-bg); color:var(--c-text);
      border:1px solid var(--c-border);
      border-bottom-left-radius:4px;
      box-shadow:0 1px 4px rgba(0,0,0,.06);
    }
    .bubble--user {
      background:linear-gradient(135deg,#1B3462,#2563eb);
      color:white; border-bottom-right-radius:4px;
    }

    .typing {
      display:flex; gap:5px; padding:11px 15px;
      background:var(--c-bg); border:1px solid var(--c-border);
      border-radius:16px; border-bottom-left-radius:4px;
    }
    .typing span {
      width:7px; height:7px; background:var(--c-blue);
      border-radius:50%; animation:bounce 1.2s ease-in-out infinite;
    }
    .typing span:nth-child(2){animation-delay:.2s;}
    .typing span:nth-child(3){animation-delay:.4s;}
    @keyframes bounce {
      0%,80%,100%{transform:translateY(0);opacity:.4;}
      40%{transform:translateY(-6px);opacity:1;}
    }

    .dany-chips {
      display:flex; gap:6px; flex-wrap:wrap;
      padding:10px 14px; border-top:1px solid var(--c-border);
      flex-shrink:0;
    }
    .dchip {
      padding:5px 11px; border-radius:20px; font-size:11px; font-weight:500;
      border:1px solid var(--c-blue-md); background:var(--c-surface);
      color:var(--c-blue); cursor:pointer; transition:all .15s;
    }
    .dchip:hover { background:var(--c-blue-lt); transform:translateY(-1px); }

    .dany-input-row {
      display:flex; align-items:center; gap:8px;
      padding:12px 14px; border-top:1px solid var(--c-border); flex-shrink:0;
    }
    .dany-input {
      flex:1; border-radius:22px; border:1.5px solid var(--c-border);
      padding:9px 16px; font-size:13px; font-family:inherit;
      background:var(--c-bg); color:var(--c-text); transition:border-color .15s;
    }
    .dany-input:focus { outline:none; border-color:var(--c-blue); }
    .dany-input::placeholder { color:var(--c-muted); }
    .dany-send {
      width:38px; height:38px; border-radius:50%; flex-shrink:0;
      background:var(--c-blue); color:white; border:none;
      cursor:pointer; display:flex; align-items:center; justify-content:center;
      transition:all .15s;
    }
    .dany-send:hover:not(:disabled) { filter:brightness(.88); transform:scale(1.05); }
    .dany-send:disabled { opacity:.4; cursor:not-allowed; }
  `],
})
export class AgenteDashboardComponent implements OnInit, OnDestroy, AfterViewChecked {
  @ViewChild('chatRef') private chatRef?: ElementRef<HTMLDivElement>;

  auth = inject(AuthService);
  private ticketSvc = inject(TicketService);
  private adminSvc = inject(AdminService);
  private http = inject(HttpClient);
  private destroy$ = new Subject<void>();


  metrics = signal<DashboardMetrics | null>(null);
  loadingTickets = signal(true);
  allTickets = signal<any[]>([]);
  disponible = signal(true);
  togglingDisp = signal(false);
  deflexion = signal<number | null>(null);
  now = new Date();

  initials = computed(() => {
    const nombre = this.auth.currentUser()?.nombre ?? '';
    return nombre.split(' ').slice(0, 2).map((p: string) => p[0]).join('').toUpperCase();
  });

  fechaEsp = computed(() => {
    const d = new Date();
    return d.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'short' });
  });

  firstName = computed(() =>
    (this.auth.currentUser()?.nombre ?? '').split(' ')[0]
  );

  grupoNombre = computed(() => (this.auth.currentUser() as any)?.grupo_nombre ?? '');

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

  danielOpen = signal(true); // panel derecho abierto por defecto

  // ── Chat ──────────────────────────────────────────────────────────────────
  chatMsgs = signal<DanyMsg[]>([]);
  chatInput = '';
  thinking = signal(false);
  private readonly proxyUrl = `${environment.apiUrl}/dany/chat`;
  private needsScroll = false;

  ngOnInit() {
    const user = this.auth.currentUser();
    if (user) this.disponible.set((user as any).disponible ?? true);

    this.ticketSvc.dashboard().subscribe({ next: m => this.metrics.set(m), error: () => { } });

    const areaFilter = user?.rol === 'ADMIN_AREA' && user?.area_restriccion
      ? { area: user.area_restriccion } : {};
    this.ticketSvc.list(areaFilter).subscribe({
      next: ts => { this.allTickets.set(ts as any); this.loadingTickets.set(false); },
      error: () => this.loadingTickets.set(false),
    });

    this.http.get<any>(`${environment.apiUrl}/admin/kpis/dany`).pipe(catchError(() => of(null)))
      .subscribe(d => { if (d) this.deflexion.set(d.tasa_deflexion_pct ?? null); });

    this.pushWelcome();
    setTimeout(() => {
      const el = this.chatRef?.nativeElement;
      if (el) el.scrollTop = el.scrollHeight;
    }, 100);

    interval(90_000).pipe(takeUntil(this.destroy$))
      .subscribe(() => { const af2 = (() => { const u2 = this.auth.currentUser(); return u2?.rol === 'ADMIN_AREA' && u2?.area_restriccion ? { area: u2.area_restriccion } : {}; })(); this.ticketSvc.list(af2).subscribe({ next: ts => this.allTickets.set(ts as any), error: () => { } }); });
  }

  ngOnDestroy() { this.destroy$.next(); this.destroy$.complete(); }

  ngAfterViewChecked() {
    if (this.needsScroll) {
      this.needsScroll = false;
      setTimeout(() => {
        const el = this.chatRef?.nativeElement;
        if (el) el.scrollTop = el.scrollHeight;
      }, 50);
    }
  }

  toggleDisponibilidad() {
    const user = this.auth.currentUser();
    if (!user || this.togglingDisp()) return;
    this.togglingDisp.set(true);
    const nuevo = !this.disponible();
    this.adminSvc.setDisponibilidad(user.id, nuevo).subscribe({
      next: () => {
        this.disponible.set(nuevo); this.togglingDisp.set(false);
        this.auth.currentUser.update(u => u ? { ...u, disponible: nuevo } : u);
      },
      error: () => this.togglingDisp.set(false),
    });
  }

  sendChat() {
    const text = this.chatInput.trim();
    if (!text || this.thinking()) return;
    this.chatInput = '';
    this.addChatMsg({ from: 'user', text });
    this.thinking.set(true);
    this.needsScroll = true;

    const user = this.auth.currentUser();
    const payload = {
      mensaje: text,
      tienda_id: null,
      sesion_id: 'agente-' + user?.id,
      usuario_id: user?.id ?? null,
      rol_usuario: user?.rol ?? 'AGENTE',  // usa el rol real del usuario
      jwt: this.auth.getToken() ?? '',
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

  sendChatQuick(text: string) { this.chatInput = text; this.sendChat(); }
  resetChat() { this.chatMsgs.set([]); this.pushWelcome(); }

  private agenteFallback(text: string): string {
    const l = text.toLowerCase();
    if (l.includes('pendiente') || l.includes('cuántos'))
      return `Tienes ${this.misTickets().length} tickets asignados activos.`;
    if (l.includes('riesgo') || l.includes('sla')) {
      const n = this.misTickets().filter(t => t.sla_status === 'ROJO').length;
      return n > 0 ? `⚠ Hay ${n} ticket(s) con SLA vencido.` : '✅ Todos tus SLA están en tiempo.';
    }
    if (l.includes('prioridad') || l.includes('primero')) {
      const t = this.misTickets()[0];
      return t ? `El más urgente es ${t.folio}: "${t.descripcion?.slice(0, 60)}"` : 'No tienes tickets asignados.';
    }
    return 'Soy Daniel, del equipo CSN. Pregúntame sobre tickets, prioridades o SLA.';
  }

  private pushWelcome() {
    const nombre = this.firstName();
    this.addChatMsg({
      from: 'dany',
      text: `Hola${nombre ? ` ${nombre}` : ''} 👋 Soy Daniel, parte del equipo CSN. Pregúntame sobre tu cola, prioridades o un ticket específico.`
    });
  }

  private addChatMsg(p: Omit<DanyMsg, 'id' | 'time'>) {
    this.chatMsgs.update(m => [...m, { id: Math.random().toString(36).slice(2), time: new Date(), ...p }]);
  }

  slaColor(s: string): string {
    return ({ ROJO: '#ef4444', AMARILLO: '#f59e0b', VERDE: '#22c55e' } as any)[s] ?? '#9ca3af';
  }
}