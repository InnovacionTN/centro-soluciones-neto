import {
  Component, OnInit, OnDestroy, AfterViewChecked,
  ElementRef, ViewChild, inject, signal, computed,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { Subject, Subscription, interval, of } from 'rxjs';
import { catchError, takeUntil, timeout } from 'rxjs/operators';
import { TicketService } from '../../core/services/ticket.service';
import { AuthService } from '../../core/services/auth.service';
import { StatusBadgeComponent } from '../../shared/components/status-badge.component';
import { NavbarComponent } from '../../shared/components/navbar.component';
import { environment } from '../../../environments/environment';

// ── Tipos de mensaje ──────────────────────────────────────────────────────────

interface DanyMsg {
  imagen?: string;
  id: string;
  from: 'dany' | 'user';
  text: string;
  time: Date;
  accion?: 'resuelto' | 'escalar' | null;
  resumen?: string;
  mediaUrls?: string[];
}

interface TicketResumen {
  id: number;
  folio: string;
  descripcion: string;
  estatus: string;
  sla_vencido: boolean;
  fecha_apertura: string;
  cat_nivel1: string | null;
}

const QUICK_CHIPS = [
  'No tenemos internet 📡',
  'Falla en el sistema POS',
  'Problema con impresora',
  'No abre el sistema',
  'Falla eléctrica',
];

// ─────────────────────────────────────────────────────────────────────────────

@Component({
  selector: 'app-tienda-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, StatusBadgeComponent, NavbarComponent],
  template: `
    <div class="shell">

      <!-- ══ SIDEBAR NAVBAR ═══════════════════════════════════════════════════ -->
      <app-navbar section="Inicio" />

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
              <p class="chat-name">Daniel</p>
              <p class="chat-status">
                @if (thinking()) { <span class="status-dot status-dot--thinking"></span> Escribiendo… }
                @else { <span class="status-dot status-dot--online"></span> En línea }
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
                    <div class="bubble bubble--dany" [innerHTML]="formatMsg(msg.text)"></div>
                    @if (msg.mediaUrls && msg.mediaUrls.length > 0) {
                      <div class="bubble bubble--media">
                        @for (url of msg.mediaUrls; track url) {
                          @if (isVideo(url)) {
                            <video controls [src]="toProxyUrl(url)"
                                   style="max-width:280px;width:100%;border-radius:8px;margin-top:6px;display:block"
                                   preload="metadata">
                            </video>
                          } @else {
                            <img [src]="toProxyUrl(url)" alt="Imagen"
                                 style="max-width:100%;border-radius:8px;margin-top:6px;cursor:pointer;display:block"
                                 (click)="openMedia(toProxyUrl(url))">
                          }
                        }
                      </div>
                    }
                    <span class="msg-time">{{ msg.time | date:'HH:mm' }}</span>

                    <!-- Acciones inline deshabilitadas temporalmente -->
                  </div>
                </div>
              }

              <!-- Mensaje usuario -->
              @if (msg.from === 'user') {
                <div class="msg-row msg-row--user">
                  <div class="msg-body msg-body--user">
                    <div class="bubble bubble--user">
                @if (msg.imagen) { <img [src]="msg.imagen" style="max-width:180px;border-radius:8px;display:block;margin-bottom:4px"> }
                @if (msg.text) { {{ msg.text }} }
              </div>
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
          <!-- Preview imagen adjunta -->
          @if (imagenAdjunta()) {
            <div class="img-preview-row">
              <div style="position:relative;display:inline-flex">
                <img [src]="imagenAdjunta()!" alt="Imagen" style="height:56px;border-radius:8px;border:2px solid var(--c-blue-md)">
                <button (click)="imagenAdjunta.set(null)"
                        style="position:absolute;top:-6px;right:-6px;width:18px;height:18px;border-radius:50%;background:#ef4444;color:#fff;border:none;font-size:10px;cursor:pointer;display:flex;align-items:center;justify-content:center">✕</button>
              </div>
              <span style="font-size:11px;color:var(--c-muted);align-self:center">Imagen lista para enviar</span>
            </div>
          }

          <div class="input-area"
               (dragover)="$event.preventDefault(); chatDrag.set(true)"
               (dragleave)="chatDrag.set(false)"
               (drop)="onImgDrop($event)"
               [style.border-color]="chatDrag() ? 'var(--c-blue)' : ''">
            <!-- Botón adjuntar -->
            <button class="attach-img-btn" (click)="imgFileInput.click()"
                    title="Adjuntar imagen (o Ctrl+V / arrastra)" [disabled]="thinking() || !!ticketCreado()">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
              </svg>
            </button>
            <input #imgFileInput type="file" accept="image/*"
                   style="position:fixed;left:-9999px;opacity:0;width:1px;height:1px"
                   (change)="onImgFile($event)">
            <textarea
              class="chat-input"
              [(ngModel)]="inputText"
              placeholder="Describe tu problema… (Ctrl+V para pegar imagen)"
              rows="1"
              [disabled]="thinking() || !!ticketCreado()"
              (keydown)="onKeydown($event)"
              (input)="autoResize($event)"
              (paste)="onImgPaste($event)"
            ></textarea>
            <button class="send-btn"
                    [disabled]="(!inputText.trim() && !imagenAdjunta()) || thinking() || !!ticketCreado()"
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
            Daniel · Adjunta imágenes con 📎, arrastrando o Ctrl+V
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
                    <app-status-badge [status]="$any(t.estatus)" />
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
      display: flex; flex-direction: row;
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
      background: var(--c-bg);
      background-image: radial-gradient(circle, var(--c-border) 1px, transparent 1px);
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
    .bubble--media { background: transparent; padding: 0; box-shadow: none; border: none; }
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

    .attach-img-btn { background:transparent; border:none; cursor:pointer; color:var(--c-muted); padding:6px 8px; border-radius:6px; display:flex; align-items:center; flex-shrink:0; transition:color .15s; }
    .attach-img-btn:hover { color:var(--c-blue); }
    .attach-img-btn:disabled { opacity:.4; cursor:default; }
    .img-preview-row { display:flex; align-items:center; gap:10px; padding:6px 12px 0; }
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
    .count-chip--red  { background: var(--c-red-lt); color: var(--c-red); }

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
export class TiendaDashboardComponent implements OnInit, OnDestroy, AfterViewChecked {
  @ViewChild('messagesRef') private messagesRef?: ElementRef<HTMLDivElement>;

  private auth = inject(AuthService);
  private http = inject(HttpClient);
  private ticketSvc = inject(TicketService);
  private router = inject(Router);
  private destroy$ = new Subject<void>();

  // ── Estado del chat ───────────────────────────────────────────────────────
  messages = signal<DanyMsg[]>([]);
  inputText = '';
  thinking = signal(false);
  ticketCreado = signal<{ id: number; folio: string } | null>(null);
  esResueltoIA = signal(false);
  creatingTicket = signal(false);
  demoMode = signal(false);
  private needsScroll = false;
  private sesionId = this.newSesionId();
  private readonly proxyUrl = `${environment.apiUrl}/dany/chat`;

  readonly quickChips = QUICK_CHIPS;

  // ── Estado de tickets ─────────────────────────────────────────────────────
  tickets = signal<TicketResumen[]>([]);
  loadingTickets = signal(true);
  filtro = signal('');
  ticketsOpen = signal(true); // visible por defecto en desktop

  readonly statusFilters = [
    { v: '', label: 'Todos' },
    { v: 'NUEVO', label: 'Nuevo' },
    { v: 'EN_PROCESO', label: 'En proceso' },
    { v: 'ESPERANDO_TIENDA', label: 'Esperando' },
    { v: 'RESUELTO', label: 'Resuelto' },
  ];

  counts = computed(() => {
    const ts = this.tickets();
    const activos = ts.filter(t => !['CERRADO', 'CANCELADO', 'RESUELTO'].includes(t.estatus));
    return {
      abiertos: activos.length,
      vencidos: activos.filter(t => t.sla_vencido).length,
      proceso: ts.filter(t => ['EN_PROCESO', 'ESPERANDO_AGENTE'].includes(t.estatus)).length,
      confirmar: ts.filter(t => t.estatus === 'ESPERANDO_TIENDA').length,
    };
  });

  countsActivos = computed(() => this.counts().abiertos);

  ticketsFiltrados = computed(() => {
    const f = this.filtro();
    const ts = this.tickets();
    return f ? ts.filter(t => t.estatus === f) : ts;
  });

  tiendaNombre = () => (this.auth.currentUser() as any)?.tienda_nombre ?? 'Mi tienda';

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
    if (this.needsScroll) { this.scrollToBottom(); this.needsScroll = false; }
  }

  // ── Tickets ───────────────────────────────────────────────────────────────
  private loadTickets() {
    this.ticketSvc.list({}).subscribe({
      next: ts => { this.tickets.set(ts as any); this.loadingTickets.set(false); },
      error: () => this.loadingTickets.set(false),
    });
  }

  // ── Chat ──────────────────────────────────────────────────────────────────
  imagenAdjunta = signal<string | null>(null);
  chatDrag = signal(false);

  sendMessage() {
    const text = this.inputText.trim();
    const img = this.imagenAdjunta();
    if ((!text && !img) || this.thinking()) return;
    this.inputText = '';
    this.imagenAdjunta.set(null);
    this.chatDrag.set(false);
    this.send(text, img ?? undefined);
  }

  sendQuick(text: string) { this.send(text); }

  onKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.sendMessage(); }
  }

  private async toBase64(file: File): Promise<string> {
    return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.onerror = rej; r.readAsDataURL(file); });
  }
  private async loadImg(file: File) {
    if (!file.type.startsWith('image/') || file.size > 5 * 1024 * 1024) return;
    this.imagenAdjunta.set(await this.toBase64(file));
  }
  onImgFile(e: Event) { const f = (e.target as HTMLInputElement).files?.[0]; if (f) this.loadImg(f); (e.target as HTMLInputElement).value = ''; }
  onImgPaste(e: ClipboardEvent) {
    for (const item of Array.from(e.clipboardData?.items ?? [])) {
      if (item.type.startsWith('image/')) { e.preventDefault(); const f = item.getAsFile(); if (f) this.loadImg(f); return; }
    }
  }
  onImgDrop(e: DragEvent) { e.preventDefault(); this.chatDrag.set(false); const f = e.dataTransfer?.files[0]; if (f) this.loadImg(f); }

  autoResize(e: Event) {
    const el = e.target as HTMLTextAreaElement;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  }

  private send(text: string, imagen?: string) {
    this.addMsg({ from: 'user', text, imagen });
    this.needsScroll = true;
    setTimeout(() => { this.thinking.set(true); this.needsScroll = true; }, 1000);

    const payload = {
      mensaje: text || '(imagen adjunta)',
      imagen: imagen,
      tienda_id: this.auth.currentUser()?.tienda_id,
      tienda_nombre: this.tiendaNombre(),
      sesion_id: this.sesionId,
      // historial: this.messages().map(m => ({
      //   de: m.from, texto: m.text, tiempo: m.time.toISOString(),
      // })),
    };

    this.http.post<any>(this.proxyUrl, payload).pipe(
      takeUntil(this.destroy$),
      timeout(115000),
      catchError(err => {
        if (err?.status === 503) {
          this.demoMode.set(true);
          setTimeout(() => this.handleDemoResponse(text), 800);
          return of(null);
        }
        return of({ respuesta: 'Tardé más de lo esperado en responder 😅 ¿Puedes intentarlo de nuevo?', accion: 'continuar' });
      })
    ).subscribe(res => {
      if (res === null) return;
      this.thinking.set(false);
      const accion = res.accion ?? 'continuar';
      this.addMsg({
        from: 'dany',
        text: res.respuesta ?? res.output ?? 'No pude entender la respuesta.',
        accion: accion === 'continuar' ? null : accion,
        resumen: res.resumen,
        mediaUrls: res.multimedia_url
          ? res.multimedia_url.replace(/^=/, '').split(',').map((u: string) => u.trim()).filter((u: string) => u.length > 0)
          : [],
      });
      this.needsScroll = true;
    });
  }

  private handleDemoResponse(userText: string) {
    this.thinking.set(false);
    const lower = userText.toLowerCase();
    let text = 'Cuéntame más detalles sobre el problema. ¿Cuándo empezó y qué has intentado?';
    let accion: 'continuar' | 'resuelto' | 'escalar' = 'continuar';
    let resumen = '';

    if (lower.includes('internet') || lower.includes('antena') || lower.includes('red')) {
      text = 'Entendido. ¿Hay alguna luz roja o apagada en el router o antena? Intenta reiniciarla desconectándola 30 segundos.';
    } else if (lower.includes('pos') || lower.includes('sistema') || lower.includes('caja')) {
      text = '¿Cuándo empezó el problema? ¿Intentaron cerrar y volver a abrir el sistema?';
    } else if (lower.includes('sí') || lower.includes('ya funciona') || lower.includes('se resolvió')) {
      text = '¡Excelente! Me alegra que funcione. ¿Quieres que registre esto como resuelto en el historial?';
      accion = 'resuelto'; resumen = userText;
    } else if (lower.includes('no') || lower.includes('sigue') || lower.includes('persiste')) {
      text = 'Entiendo que el problema persiste. Lo mejor es que un agente especializado lo revise. ¿Creo el reporte ahora?';
      accion = 'escalar'; resumen = userText;
    }

    this.addMsg({ from: 'dany', text, accion: accion === 'continuar' ? null : accion, resumen });
    this.needsScroll = true;
  }

  // ── Acciones sobre tickets ────────────────────────────────────────────────
  crearTicket(resumen?: string) {
    if (this.creatingTicket()) return;
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
        this.ticketCreado.set({ id: ticket.id, folio: (ticket as any).folio });
        this.esResueltoIA.set(false);
        this.creatingTicket.set(false);
        this.loadTickets(); // refrescar lista
      },
      error: () => this.creatingTicket.set(false),
    });
  }

  registrarResuelto(resumen: string) {
    if (this.creatingTicket()) return;
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
            this.ticketCreado.set({ id: t.id, folio: (t as any).folio });
            this.esResueltoIA.set(true);
            this.creatingTicket.set(false);
            this.loadTickets();
          },
          error: () => {
            this.ticketCreado.set({ id: ticket.id, folio: (ticket as any).folio });
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
    if (t) this.router.navigate(['/tienda/ticket', t.id]);
  }

  resetChat() {
    this.messages.set([]);
    this.ticketCreado.set(null);
    this.esResueltoIA.set(false);
    this.sesionId = this.newSesionId();
    this.pushWelcome();
  }

  formatMsg(text: string): string {
    if (!text) return '';
    return text
      .replace(/\n/g, '<br>')
      .replace(/\*([^*\n]+)\*/g, '<strong>$1</strong>')
      .replace(/_([^_\n]+)_/g, '<em>$1</em>')
      .replace(/~([^~\n]+)~/g, '<del>$1</del>')
      .replace(/`([^`]+)`/g, '<code style="background:rgba(128,128,128,.15);padding:1px 4px;border-radius:3px;font-family:monospace">$1</code>')
      .replace(/^[•·]\s*/gm, '&bull;&nbsp;')
      .replace(/^>\s*(.+)/gm, '<span style="border-left:3px solid rgba(128,128,128,.4);padding-left:8px;opacity:.7;display:block">$1</span>');
  }

  isVideo(url: string): boolean { return /\.mp4|\.mov|\.webm/i.test(url); }

  toProxyUrl(url: string): string {
    return environment.apiUrl + '/media/proxy?url=' + encodeURIComponent(url);
  }

  openMedia(url: string) { window.open(url, '_blank'); }

  logout() { this.auth.logout(); }

  // ── Utils ─────────────────────────────────────────────────────────────────
  private pushWelcome() {
    const nombre = this.tiendaNombre();
    this.addMsg({
      from: 'dany',
      text: `¡Hola${nombre ? ` — ${nombre}` : ''}! Soy Daniel, del equipo de soporte. ¿En qué te puedo ayudar hoy? Cuéntame qué está pasando.`,
    });
  }

  private addMsg(partial: Omit<DanyMsg, 'id' | 'time'>) {
    this.messages.update(msgs => [...msgs, {
      id: Math.random().toString(36).slice(2),
      time: new Date(), ...partial,
    }]);
  }

  private buildDescription(): string {
    const userMsgs = this.messages()
      .filter(m => m.from === 'user').map(m => m.text).join(' / ');
    return userMsgs || 'Consulta iniciada a través de Dany';
  }

  private scrollToBottom() {
    const el = this.messagesRef?.nativeElement;
    if (el) el.scrollTop = el.scrollHeight;
  }

  private newSesionId(): string {
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }
}