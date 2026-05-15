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

interface DanyMsg { id: string; from: 'dany' | 'user'; text: string; time: Date; imagen?: string; }

// ─────────────────────────────────────────────────────────────────────────────

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

          <!-- KPI bar -->
          @if (metrics()) {
            <div class="kpi-bar">
              <a [routerLink]="['/agente/cola']" [queryParams]="{f:'__sin_asignar__'}"
                 class="kchip kchip--dashed"
                 title="Tickets de tu grupo sin agente asignado. Haz clic para tomarlos.">
                <span class="kchip-n kchip-n--muted">{{ metrics()!.total_abiertos }}</span>
                <span class="kchip-l">Sin tomar</span>
                <span class="kchip-hint">del grupo</span>
              </a>
              <div class="kchip-sep"></div>
              <a [routerLink]="['/agente/cola']" [queryParams]="{f:'__mis_asignados__'}"
                 class="kchip kchip--purple"
                 title="Tickets que ya tomaste en trabajo activo.">
                <span class="kchip-n">{{ metrics()!.total_en_proceso }}</span>
                <span class="kchip-l">Mis asignados</span>
              </a>
              <a [routerLink]="['/agente/cola']" [queryParams]="{f:'ESPERANDO_TIENDA'}"
                 class="kchip kchip--amber"
                 title="Enviaste solución y esperas confirmación de la tienda.">
                <span class="kchip-n">{{ metrics()!.total_confirmar_solucion }}</span>
                <span class="kchip-l">Esp. tienda</span>
              </a>
              @if (metrics()!.total_vencidos > 0) {
                <a [routerLink]="['/agente/cola']" [queryParams]="{sla:'ROJO'}"
                   class="kchip kchip--red kchip--pulse"
                   title="SLA vencido. Atención inmediata.">
                  <span class="kchip-n">{{ metrics()!.total_vencidos }}</span>
                  <span class="kchip-l">🔴 SLA Vencido</span>
                </a>
              }
              @if (metrics()!.total_rechazados > 0) {
                <a [routerLink]="['/agente/cola']" [queryParams]="{f:'RECHAZADO'}"
                   class="kchip kchip--red"
                   title="La tienda rechazó la solución. Re-atención urgente.">
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
            } @else if (auth.isAdminArea()) {
              <!-- ADMIN_AREA: mini-torre por grupos -->
              <div class="grupo-torre">
                @for (g of gruposTorre(); track g.nombre) {
                  <a class="grupo-card" [routerLink]="['/agente/cola']"
                     [queryParams]="{grupo: g.nombre}"
                     [class.grupo-card--alerta]="g.vencidos > 0">
                    <div class="grupo-card-header">
                      <span class="grupo-nombre">{{ g.nombre }}</span>
                      @if (g.vencidos > 0) {
                        <span class="grupo-badge grupo-badge--rojo">{{ g.vencidos }} vencido(s)</span>
                      }
                    </div>
                    <div class="grupo-stats">
                      <span class="grupo-stat" title="Sin tomar">
                        <span class="grupo-stat-n">{{ g.sin_tomar }}</span>
                        <span class="grupo-stat-l">Sin tomar</span>
                      </span>
                      <span class="grupo-stat" title="En proceso">
                        <span class="grupo-stat-n">{{ g.en_proceso }}</span>
                        <span class="grupo-stat-l">En proceso</span>
                      </span>
                      <span class="grupo-stat" title="Esp. tienda">
                        <span class="grupo-stat-n">{{ g.esperando }}</span>
                        <span class="grupo-stat-l">Esp. tienda</span>
                      </span>
                      <span class="grupo-stat" title="SLA en riesgo">
                        <span class="grupo-stat-n grupo-stat-n--amber">{{ g.en_riesgo }}</span>
                        <span class="grupo-stat-l">En riesgo</span>
                      </span>
                    </div>
                  </a>
                }
                @if (gruposTorre().length === 0) {
                  <div class="empty-state">
                    <span class="empty-icon">✅</span>
                    <p class="empty-txt">Sin tickets activos en tu área</p>
                  </div>
                }
              </div>
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
                  @if (msg.imagen) {
                    <img [src]="msg.imagen" style="max-width:160px;border-radius:8px;display:block;margin-bottom:4px;cursor:zoom-in" (click)="imagenModal.set(msg.imagen!)">
                  }
                  @if (msg.text) { {{ msg.text }} }
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

          <!-- Preview imagen -->
          @if (chatImagen()) {
            <div class="chat-img-preview-row">
              <div style="position:relative;display:inline-flex">
                <img [src]="chatImagen()!" style="height:50px;border-radius:6px;border:2px solid var(--c-blue-md)">
                <button (click)="chatImagen.set(null)"
                        style="position:absolute;top:-5px;right:-5px;width:16px;height:16px;border-radius:50%;background:var(--c-red);color:#fff;border:none;font-size:9px;cursor:pointer;display:flex;align-items:center;justify-content:center">✕</button>
              </div>
              <span style="font-size:11px;color:var(--c-muted)">Lista para enviar</span>
            </div>
          }

          <div class="dany-input-row"
               (dragover)="$event.preventDefault(); chatDrag.set(true)"
               (dragleave)="chatDrag.set(false)"
               (drop)="onChatDrop($event)"
               [class.dany-input-row--drag]="chatDrag()">
            <button class="chat-attach-btn" (click)="chatFileInput.click()" title="Adjuntar imagen" [disabled]="thinking()">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
              </svg>
            </button>
            <input #chatFileInput type="file" accept="image/*" style="display:none" (change)="onChatFile($event)">
            <input
              class="dany-input"
              [(ngModel)]="chatInput"
              placeholder="Pregunta a Daniel… (Ctrl+V para imagen)"
              [disabled]="thinking()"
              (keydown.enter)="sendChat()"
              (paste)="onChatPaste($event)"
            />
            <button class="dany-send" [disabled]="(!chatInput.trim() && !chatImagen()) || thinking()" (click)="sendChat()">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
            </button>
          </div>
        </aside>
        }

      </div>

      <!-- Modal imagen -->
      @if (imagenModal()) {
        <div style="position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.85);display:flex;align-items:center;justify-content:center;cursor:zoom-out"
             (click)="imagenModal.set(null)">
          <img [src]="imagenModal()!" style="max-width:90vw;max-height:90vh;border-radius:10px" (click)="$event.stopPropagation()">
        </div>
      }
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

    /* KPI bar */
    .kpi-bar { display:flex; gap:8px; flex-wrap:nowrap; overflow-x:auto; width:100%; }
    .kchip {
      flex:1; min-width:80px; display:flex; flex-direction:column; gap:2px;
      padding:10px 12px; border-radius:12px; border:1px solid var(--c-border);
      background:var(--c-surface); text-decoration:none; color:inherit;
      transition:transform .15s, box-shadow .15s; border-top:3px solid transparent;
    }
    .kchip:hover { transform:translateY(-2px); box-shadow:0 4px 12px rgba(0,0,0,.07); }
    .kchip--purple { border-top-color:var(--c-purple); }
    .kchip--amber  { border-top-color:var(--c-amber); }
    .kchip--red    { border-top-color:var(--c-red); }
    .kchip--dashed { border-top:2px dashed var(--c-border); background:var(--c-bg); opacity:.85; }
    .kchip--dashed:hover { opacity:1; }
    .kchip--pulse  { animation:chip-pulse 2s ease-in-out infinite; }
    @keyframes chip-pulse { 0%,100%{box-shadow:0 0 0 0 rgba(239,68,68,0);} 50%{box-shadow:0 0 0 4px rgba(239,68,68,.15);} }
    .kchip-sep { width:1px; background:var(--c-border); align-self:stretch; margin:4px 0; flex-shrink:0; }
    .kchip-n { font-size:24px; font-weight:800; line-height:1; }
    .kchip-n--muted { color:var(--c-muted); }
    .kchip-l { font-size:11px; color:var(--c-muted); }
    .kchip-hint { font-size:9px; color:var(--c-muted); opacity:.7; }

    /* Tickets */
    .tickets-wrap { display:flex; flex-direction:column; gap:8px; }
    .tcard {
      display:block; padding:12px 14px; border-radius:12px;
      border:1px solid var(--c-border); background:var(--c-surface);
      text-decoration:none; color:inherit;
      transition:all .2s; border-left:3px solid transparent;
    }
    .tcard:hover { border-color:var(--c-blue); transform:translateY(-1px); box-shadow:0 4px 14px rgba(0,0,0,.07); }
    .tcard--red   { border-left-color:var(--c-red) !important; background:#fef2f2; }
    .tcard--amber { border-left-color:var(--c-amber) !important; background:#fffbeb; }
    .tcard--skeleton { pointer-events:none; background:var(--c-surface); }
    .tcard-row { display:flex; align-items:center; gap:6px; margin-bottom:6px; flex-wrap:wrap; }
    .sla-pip { width:8px; height:8px; border-radius:50%; flex-shrink:0; }
    .tcard-folio { font-family:monospace; font-size:11px; font-weight:700; color:var(--c-blue); }
    .badge-vencido { font-size:10px; background:#fef2f2; color:var(--c-red); border:1px solid #fecaca; padding:1px 6px; border-radius:6px; }
    .tcard-prio { margin-left:auto; font-size:10px; font-weight:600; padding:1px 7px; border-radius:6px; text-transform:lowercase; }
    .prio--critica { background:#fef2f2; color:var(--c-red); }
    .prio--alta    { background:#fff3e0; color:#e65100; }
    .prio--media   { background:#fffbeb; color:#d97706; }
    .prio--baja    { background:var(--c-bg); color:var(--c-muted); }
    .tcard-desc { font-size:13px; margin:0 0 6px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .tcard-footer { display:flex; align-items:center; gap:8px; }
    .tcard-area { font-size:10px; background:var(--c-border); padding:2px 7px; border-radius:6px; color:var(--c-muted); }
    .tcard-fecha { font-size:10px; color:var(--c-muted); margin-left:auto; }

    .empty-state { display:flex; flex-direction:column; align-items:center; padding:48px 20px; gap:8px; }
    .empty-icon { font-size:36px; }
    .empty-txt { font-size:13px; color:var(--c-muted); }
    .empty-cola-link { font-size:12px; color:var(--c-blue); text-decoration:none; padding:6px 12px; border:1px solid var(--c-blue-md); border-radius:8px; transition:background .15s; margin-top:4px; display:inline-block; }
    .empty-cola-link:hover { background:var(--c-blue-lt); }

    .skeleton { background:linear-gradient(90deg,var(--c-border) 25%,var(--c-bg) 50%,var(--c-border) 75%); background-size:200% 100%; animation:shimmer 1.4s infinite; border-radius:4px; }
    .sk-line { height:10px; margin-bottom:8px; }
    .sk-line--sm { width:40%; }
    .sk-line--lg { width:75%; }
    @keyframes shimmer { 0%{background-position:200% 0;} 100%{background-position:-200% 0;} }

    /* Grupo torre */
    .grupo-torre { display:flex; flex-direction:column; gap:10px; }
    .grupo-card { display:block; text-decoration:none; color:inherit; background:var(--c-surface); border:1px solid var(--c-border); border-left:3px solid var(--c-border); border-radius:12px; padding:12px 14px; transition:box-shadow .15s; }
    .grupo-card:hover { box-shadow:0 2px 8px rgba(0,0,0,.06); }
    .grupo-card--alerta { border-left-color:var(--c-red); }
    .grupo-card-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; }
    .grupo-nombre { font-size:13px; font-weight:600; }
    .grupo-badge { font-size:11px; padding:2px 8px; border-radius:4px; font-weight:600; }
    .grupo-badge--rojo { background:#fef2f2; color:var(--c-red); }
    .grupo-stats { display:flex; gap:16px; }
    .grupo-stat { display:flex; flex-direction:column; align-items:center; gap:2px; }
    .grupo-stat-n { font-size:20px; font-weight:700; line-height:1; }
    .grupo-stat-n--amber { color:var(--c-amber); }
    .grupo-stat-l { font-size:10px; color:var(--c-muted); }

    /* ── Dany Panel ─────────────────────────────────────────────────────────── */
    .dany-panel { display:flex; flex-direction:column; border-left:1px solid var(--c-border); background:var(--c-surface); height:100vh; overflow:hidden; }
    .dany-topbar { display:flex; align-items:center; gap:10px; padding:14px 16px; border-bottom:1px solid var(--c-border); flex-shrink:0; background:linear-gradient(135deg,#0f1f42,#1B3462); }
    .dany-orb-wrap { position:relative; flex-shrink:0; }
    .dany-orb { width:34px; height:34px; border-radius:50%; background:radial-gradient(circle at 32% 32%, #6ba3ff, #1B3462); box-shadow:0 0 12px rgba(79,138,255,.4); }
    .dany-orb--xs { width:22px; height:22px; }
    .dany-orb--pulse { animation:orb-pulse 1.5s ease-in-out infinite; }
    @keyframes orb-pulse { 0%,100%{box-shadow:0 0 8px rgba(79,138,255,.4);} 50%{box-shadow:0 0 20px rgba(79,138,255,.8);} }
    .dany-topbar-info { flex:1; }
    .dany-topbar-name { font-size:14px; font-weight:700; color:white; display:block; }
    .dany-topbar-sub  { font-size:11px; color:rgba(255,255,255,.6); display:block; }
    .dany-reset { margin-left:auto; width:28px; height:28px; border-radius:50%; border:1px solid rgba(255,255,255,.2); background:rgba(255,255,255,.08); color:white; cursor:pointer; font-size:14px; transition:background .15s; }
    .dany-reset:hover { background:rgba(255,255,255,.18); }
    .dany-messages { flex:1; overflow-y:auto; padding:16px 14px; display:flex; flex-direction:column; gap:12px; min-height:0; height:0; }
    .dany-messages::-webkit-scrollbar { width:3px; }
    .dany-messages::-webkit-scrollbar-thumb { background:var(--c-border); }
    .dmsg { display:flex; align-items:flex-end; gap:7px; max-width:92%; }
    .dmsg--dany { align-self:flex-start; }
    .dmsg--user { align-self:flex-end; flex-direction:row-reverse; }
    .dany-mini-orb { flex-shrink:0; margin-bottom:2px; }
    .bubble { padding:9px 13px; border-radius:16px; font-size:13px; line-height:1.5; white-space:pre-wrap; word-break:break-word; animation:bubble-in .2s ease; }
    @keyframes bubble-in { from{opacity:0;transform:translateY(4px);} to{opacity:1;transform:translateY(0);} }
    .bubble--dany { background:var(--c-bg); color:var(--c-text); border:1px solid var(--c-border); border-bottom-left-radius:4px; box-shadow:0 1px 4px rgba(0,0,0,.06); }
    .bubble--user { background:linear-gradient(135deg,#1B3462,#2563eb); color:white; border-bottom-right-radius:4px; }
    .typing { display:flex; gap:5px; padding:11px 15px; background:var(--c-bg); border:1px solid var(--c-border); border-radius:16px; border-bottom-left-radius:4px; }
    .typing span { width:7px; height:7px; background:var(--c-blue); border-radius:50%; animation:bounce 1.2s ease-in-out infinite; }
    .typing span:nth-child(2){animation-delay:.2s;} .typing span:nth-child(3){animation-delay:.4s;}
    @keyframes bounce { 0%,80%,100%{transform:translateY(0);opacity:.4;} 40%{transform:translateY(-6px);opacity:1;} }
    .dany-chips { display:flex; gap:6px; flex-wrap:wrap; padding:10px 14px; border-top:1px solid var(--c-border); flex-shrink:0; }
    .dchip { padding:5px 11px; border-radius:20px; font-size:11px; font-weight:500; border:1px solid var(--c-blue-md); background:var(--c-surface); color:var(--c-blue); cursor:pointer; transition:all .15s; }
    .dchip:hover { background:var(--c-blue-lt); transform:translateY(-1px); }

    /* Chat imagen */
    .chat-img-preview-row { display:flex; align-items:center; gap:8px; padding:6px 14px 0; flex-shrink:0; }
    .dany-input-row { display:flex; align-items:center; gap:8px; padding:12px 14px; border-top:1px solid var(--c-border); flex-shrink:0; position:relative; }
    .dany-input-row--drag { border-color:var(--c-blue); background:var(--c-blue-lt); }
    .chat-attach-btn { background:transparent; border:none; cursor:pointer; color:var(--c-muted); padding:4px 6px; border-radius:5px; display:flex; align-items:center; flex-shrink:0; }
    .chat-attach-btn:hover { color:var(--c-blue); background:var(--c-blue-lt); }
    .chat-attach-btn:disabled { opacity:.4; cursor:default; }
    .dany-input { flex:1; border-radius:22px; border:1.5px solid var(--c-border); padding:9px 16px; font-size:13px; font-family:inherit; background:var(--c-bg); color:var(--c-text); transition:border-color .15s; }
    .dany-input:focus { outline:none; border-color:var(--c-blue); }
    .dany-input::placeholder { color:var(--c-muted); }
    .dany-send { width:38px; height:38px; border-radius:50%; flex-shrink:0; background:var(--c-blue); color:white; border:none; cursor:pointer; display:flex; align-items:center; justify-content:center; transition:all .15s; }
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

  // Imagen en chat
  chatImagen = signal<string | null>(null);
  chatDrag = signal(false);
  imagenModal = signal<string | null>(null);

  initials = computed(() => {
    const nombre = this.auth.currentUser()?.nombre ?? '';
    return nombre.split(' ').slice(0, 2).map((p: string) => p[0]).join('').toUpperCase();
  });

  fechaEsp = computed(() => {
    const d = new Date();
    return d.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'short' });
  });

  firstName = computed(() => (this.auth.currentUser()?.nombre ?? '').split(' ')[0]);

  grupoNombre = computed(() => (this.auth.currentUser() as any)?.grupo_nombre ?? '');

  gruposTorre = computed(() => {
    const tickets = this.allTickets();
    const ACTIVOS = ['NUEVO', 'ASIGNADO', 'EN_PROCESO', 'ESPERANDO_TIENDA', 'ESPERANDO_AGENTE', 'RECHAZADO', 'PROGRAMADO_VISITA', 'EN_VISITA', 'ESPERANDO_PIEZA'];
    const activos = tickets.filter((t: any) => ACTIVOS.includes(t.estatus));
    const map: Record<string, { nombre: string; sin_tomar: number; en_proceso: number; esperando: number; vencidos: number; en_riesgo: number }> = {};
    for (const t of activos as any[]) {
      const g = t.grupo_nombre ?? 'Sin grupo';
      if (!map[g]) map[g] = { nombre: g, sin_tomar: 0, en_proceso: 0, esperando: 0, vencidos: 0, en_riesgo: 0 };
      if (['NUEVO', 'ASIGNADO'].includes(t.estatus) && !t.agente_id) map[g].sin_tomar++;
      if (['EN_PROCESO', 'ESPERANDO_AGENTE'].includes(t.estatus)) map[g].en_proceso++;
      if (t.estatus === 'ESPERANDO_TIENDA') map[g].esperando++;
      if (t.sla_status === 'ROJO') map[g].vencidos++;
      if (t.sla_status === 'AMARILLO') map[g].en_riesgo++;
    }
    return Object.values(map).sort((a, b) => b.vencidos - a.vencidos || b.sin_tomar - a.sin_tomar);
  });

  misTickets = computed(() => {
    const userId = this.auth.currentUser()?.id;
    const SLA_ORDER: Record<string, number> = { ROJO: 0, AMARILLO: 1, VERDE: 2, SIN_SLA: 3 };
    const PRIO_ORDER: Record<string, number> = { CRITICA: 0, ALTA: 1, MEDIA: 2, BAJA: 3 };
    return this.allTickets()
      .filter((t: any) => t.agente_id === userId && !['CERRADO', 'CANCELADO', 'RESUELTO'].includes(t.estatus))
      .sort((a: any, b: any) => {
        const s = (SLA_ORDER[a.sla_status] ?? 3) - (SLA_ORDER[b.sla_status] ?? 3);
        if (s !== 0) return s;
        return (PRIO_ORDER[a.prioridad] ?? 9) - (PRIO_ORDER[b.prioridad] ?? 9);
      });
  });

  danielOpen = signal(true);

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
    setTimeout(() => { const el = this.chatRef?.nativeElement; if (el) el.scrollTop = el.scrollHeight; }, 100);

    interval(90_000).pipe(takeUntil(this.destroy$)).subscribe(() => {
      const u2 = this.auth.currentUser();
      const af2 = u2?.rol === 'ADMIN_AREA' && u2?.area_restriccion ? { area: u2.area_restriccion } : {};
      this.ticketSvc.list(af2).subscribe({ next: ts => this.allTickets.set(ts as any), error: () => { } });
    });
  }

  ngOnDestroy() { this.destroy$.next(); this.destroy$.complete(); }

  ngAfterViewChecked() {
    if (this.needsScroll) {
      this.needsScroll = false;
      setTimeout(() => { const el = this.chatRef?.nativeElement; if (el) el.scrollTop = el.scrollHeight; }, 50);
    }
  }

  sendChat() {
    const text = this.chatInput.trim();
    const img = this.chatImagen();
    if ((!text && !img) || this.thinking()) return;
    this.chatInput = '';
    this.chatImagen.set(null);
    this.chatDrag.set(false);
    this.addChatMsg({ from: 'user', text, imagen: img ?? undefined });
    this.thinking.set(true);
    this.needsScroll = true;

    const user = this.auth.currentUser();
    const payload: Record<string, unknown> = {
      mensaje: text || '(imagen adjunta)',
      tienda_id: null,
      sesion_id: 'agente-' + user?.id,
      usuario_id: user?.id ?? null,
      rol_usuario: user?.rol ?? 'AGENTE',
      jwt: this.auth.getToken() ?? '',
      historial: this.chatMsgs().slice(-6).map(m => ({ de: m.from, texto: m.text })),
    };
    if (img) payload['imagen_base64'] = img;

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

  // ── Imagen ────────────────────────────────────────────────────────────────
  private async toBase64(file: File): Promise<string> {
    return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.onerror = rej; r.readAsDataURL(file); });
  }
  private async procesarImg(file: File) {
    if (!file.type.startsWith('image/')) return;
    if (file.size > 5 * 1024 * 1024) { alert('La imagen no puede superar 5 MB'); return; }
    this.chatImagen.set(await this.toBase64(file));
  }
  onChatFile(e: Event) { const f = (e.target as HTMLInputElement).files?.[0]; if (f) this.procesarImg(f); (e.target as HTMLInputElement).value = ''; }
  onChatPaste(e: ClipboardEvent) {
    for (const item of Array.from(e.clipboardData?.items ?? [])) {
      if (item.type.startsWith('image/')) { e.preventDefault(); const f = item.getAsFile(); if (f) this.procesarImg(f); return; }
    }
  }
  onChatDrop(e: DragEvent) { e.preventDefault(); this.chatDrag.set(false); const f = e.dataTransfer?.files[0]; if (f) this.procesarImg(f); }

  private agenteFallback(text: string): string {
    const l = text.toLowerCase();
    if (l.includes('pendiente') || l.includes('cuántos'))
      return `Tienes ${this.misTickets().length} tickets asignados activos.`;
    if (l.includes('riesgo') || l.includes('sla')) {
      const n = this.misTickets().filter((t: any) => t.sla_status === 'ROJO').length;
      return n > 0 ? `⚠ Hay ${n} ticket(s) con SLA vencido.` : '✅ Todos tus SLA están en tiempo.';
    }
    if (l.includes('prioridad') || l.includes('primero')) {
      const t = this.misTickets()[0] as any;
      return t ? `El más urgente es ${t.folio}: "${t.descripcion?.slice(0, 60)}"` : 'No tienes tickets asignados.';
    }
    return 'Soy Daniel, del equipo CSN. Pregúntame sobre tickets, prioridades o SLA.';
  }

  private pushWelcome() {
    const nombre = this.firstName();
    this.addChatMsg({ from: 'dany', text: `Hola${nombre ? ` ${nombre}` : ''} 👋 Soy Daniel, parte del equipo CSN. Pregúntame sobre tu cola, prioridades o un ticket específico.` });
  }

  private addChatMsg(p: Omit<DanyMsg, 'id' | 'time'>) {
    this.chatMsgs.update(m => [...m, { id: Math.random().toString(36).slice(2), time: new Date(), ...p }]);
  }

  toggleDisponibilidad() {
    const user = this.auth.currentUser();
    if (!user || this.togglingDisp()) return;
    this.togglingDisp.set(true);
    const nuevo = !this.disponible();
    this.adminSvc.setDisponibilidad(user.id, nuevo).subscribe({
      next: () => { this.disponible.set(nuevo); this.togglingDisp.set(false); (this.auth.currentUser as any).update((u: any) => u ? { ...u, disponible: nuevo } : u); },
      error: () => this.togglingDisp.set(false),
    });
  }

  slaColor(s: string): string {
    return ({ ROJO: '#ef4444', AMARILLO: '#f59e0b', VERDE: '#22c55e' } as any)[s] ?? '#9ca3af';
  }
}