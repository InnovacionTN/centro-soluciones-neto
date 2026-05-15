import {
  Component, Output, EventEmitter, signal, inject,
  ViewChild, ElementRef, AfterViewChecked, OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { catchError, of } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { TicketService } from '../../core/services/ticket.service';
import { environment } from '../../../environments/environment';

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface DanyMsg {
  id: string;
  from: 'dany' | 'user';
  text: string;
  time: Date;
  /** Imagen adjunta como base64 data URL */
  imagen?: string;
  /** Acción especial que muestra botones debajo del mensaje */
  accion?: 'resuelto' | 'escalar' | null;
  resumen?: string;
}

interface DanyWebhookResponse {
  /** Texto que Dany responde */
  respuesta?: string;
  /** n8n default output field */
  output?: string;
  /** continuar = sigue el chat | resuelto = Dany resolvió | escalar = crear ticket */
  accion?: 'continuar' | 'resuelto' | 'escalar';
  /** Resumen para el ticket (cuando accion es resuelto o escalar) */
  resumen?: string;
}

// Chips de acceso rápido al abrir el chat
const QUICK_CHIPS = [
  'Sin internet o antena sin señal',
  'Caja bloqueada o sin apertura',
  'Precio diferente al sistema',
  'Promoción no pasa en caja',
  'Problema con proveedor',
  'Otro problema...',
];

// ─── Componente ───────────────────────────────────────────────────────────────

@Component({
  selector: 'app-dany-chat',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <!-- ══ ESTADO CERRADO: tarjeta de bienvenida ══ -->
    @if (!isOpen()) {
      <div class="dany-closed-card">
        <div class="dany-closed-header">
          <div class="dany-avatar-wrap">
            <div class="dany-avatar">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M12 2L14.5 9.5H22L16 14L18.5 21.5L12 17L5.5 21.5L8 14L2 9.5H9.5L12 2Z"
                  fill="white" opacity=".9"/>
              </svg>
            </div>
            <span class="dany-online-dot"></span>
          </div>
          <div>
            <div class="dany-name-row">
              <span class="dany-name">Dany</span>
              <span class="dany-badge">IA</span>
            </div>
            <span class="dany-sub">Asistente de tienda · En línea</span>
          </div>
        </div>

        <div class="dany-closed-body">
          <p class="dany-closed-desc">
            Hola! Soy Dany, tu primera línea de soporte. Cuéntame qué está pasando y
            trataré de resolverlo sin necesidad de abrir un reporte.
          </p>

          <div class="dany-chips-preview">
            @for (q of quickChips.slice(0,4); track q) {
              <button class="chip chip--preview" (click)="openWithMessage(q)">{{ q }}</button>
            }
          </div>

          <button class="btn-open-chat" (click)="open()">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
            </svg>
            Iniciar chat con Dany
          </button>
        </div>
      </div>
    }

    <!-- ══ ESTADO ABIERTO: panel de chat ══ -->
    @if (isOpen()) {
      <div class="dany-panel">

        <!-- Header -->
        <div class="dany-panel-header">
          <div class="dany-panel-avatar">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L14.5 9.5H22L16 14L18.5 21.5L12 17L5.5 21.5L8 14L2 9.5H9.5L12 2Z"
                fill="white" opacity=".9"/>
            </svg>
          </div>
          <div class="dany-panel-info">
            <div style="display:flex;align-items:center;gap:6px">
              <span class="dany-panel-name">Dany</span>
              <span class="dany-badge-sm">IA</span>
            </div>
            <span class="dany-panel-sub">
              {{ thinking() ? 'Analizando tu caso...' : 'En línea · Primera línea de soporte' }}
            </span>
          </div>
          <div style="display:flex;align-items:center;gap:8px;margin-left:auto">
            @if (messages().length > 1) {
              <button class="panel-icon-btn" title="Nueva conversación" (click)="resetChat()">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/></svg>
              </button>
            }
            <button class="panel-icon-btn" title="Cerrar" (click)="close()">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        </div>

        <!-- Contexto de tienda -->
        <div class="dany-context-bar">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
          Tienda #{{ tiendaId() }}
          @if (tiendaNombre()) { · {{ tiendaNombre() }} }
        </div>

        <!-- Mensajes -->
        <div class="dany-messages" #messagesRef>
          @for (msg of messages(); track msg.id) {
            <div class="msg-row" [class.msg-row--user]="msg.from === 'user'">
              @if (msg.from === 'dany') {
                <div class="msg-avatar-sm">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                    <path d="M12 2L14.5 9.5H22L16 14L18.5 21.5L12 17L5.5 21.5L8 14L2 9.5H9.5L12 2Z" fill="white" opacity=".9"/>
                  </svg>
                </div>
              }
              <div class="msg-col">
                <div class="bubble" [class.bubble--dany]="msg.from === 'dany'" [class.bubble--user]="msg.from === 'user'">
                  @if (msg.imagen) {
                    <img [src]="msg.imagen" alt="Imagen adjunta" class="bubble-img" (click)="abrirImagen(msg.imagen!)">
                  }
                  @if (msg.text) { {{ msg.text }} }
                </div>
                <span class="msg-time">{{ msg.time | date:'HH:mm' }}</span>

                <!-- Botones de acción especiales -->
                @if (msg.accion === 'resuelto' && !ticketCreado()) {
                  <div class="msg-actions slide-down">
                    <button class="action-btn action-btn--success" [class.action-btn--loading]="creatingTicket()" (click)="registrarResuelto(msg.resumen ?? '')">
                      @if (!creatingTicket()) { ✓ Registrar solución }
                    </button>
                    <button class="action-btn action-btn--ghost" (click)="resetChat()">
                      Seguir hablando
                    </button>
                  </div>
                }
                @if (msg.accion === 'escalar' && !ticketCreado()) {
                  <div class="msg-actions slide-down">
                    <button class="action-btn action-btn--primary" [class.action-btn--loading]="creatingTicket()" (click)="crearTicket(msg.resumen)">
                      @if (!creatingTicket()) { → Crear ticket con agente }
                    </button>
                  </div>
                }
              </div>
            </div>
          }

          <!-- Indicador de escritura -->
          @if (thinking()) {
            <div class="msg-row">
              <div class="msg-avatar-sm">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                  <path d="M12 2L14.5 9.5H22L16 14L18.5 21.5L12 17L5.5 21.5L8 14L2 9.5H9.5L12 2Z" fill="white" opacity=".9"/>
                </svg>
              </div>
              <div class="typing-indicator">
                <span></span><span></span><span></span>
              </div>
            </div>
          }

          <!-- Éxito: ticket creado -->
          @if (ticketCreado()) {
            <div class="ticket-creado-card slide-down">
              <div class="tc-icon">{{ esResueltoIA() ? '✓' : '📋' }}</div>
              <div class="tc-body">
                <p class="tc-title">
                  {{ esResueltoIA() ? '¡Problema registrado como resuelto!' : 'Ticket creado exitosamente' }}
                </p>
                <p class="tc-folio">Folio: <strong>{{ ticketCreado()!.folio }}</strong></p>
                @if (!esResueltoIA()) {
                  <p class="tc-sub">Un agente tomará tu caso pronto.</p>
                }
              </div>
              <button class="tc-link" (click)="irAlTicket()">Ver →</button>
            </div>
          }
        </div>

        <!-- Quick chips (solo al inicio) -->
        @if (messages().length <= 1 && !thinking() && !ticketCreado()) {
          <div class="quick-chips-area">
            <p class="chips-label">Selecciona tu problema o escribe:</p>
            <div class="chips-grid">
              @for (q of quickChips; track q) {
                <button class="chip" (click)="sendQuick(q)">{{ q }}</button>
              }
            </div>
          </div>
        }

        <!-- Webhook no configurado en backend -->
        @if (demoMode() && messages().length <= 1) {
          <div class="webhook-warning">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            Modo demo · Configura <code>DANY_WEBHOOK_URL</code> en el <code>.env</code> del backend para conectar con n8n.
          </div>
        }

        <!-- Input -->
        @if (!ticketCreado()) {
          <!-- Preview imagen adjunta -->
          @if (imagenAdjunta()) {
            <div class="img-preview-row">
              <div class="img-preview-wrap">
                <img [src]="imagenAdjunta()" alt="Imagen adjunta" class="img-preview-thumb">
                <button class="img-preview-remove" (click)="quitarImagen()" title="Quitar imagen">✕</button>
              </div>
              <span class="img-preview-hint">Imagen lista para enviar</span>
            </div>
          }

          <div class="dany-input-area"
               [class.dany-input-area--drag]="dragging()"
               (dragover)="onDragOver($event)"
               (dragleave)="onDragLeave($event)"
               (drop)="onDrop($event)">

            <!-- Botón adjuntar -->
            <button class="attach-btn" (click)="fileInput.click()" title="Adjuntar imagen"
                    [disabled]="thinking()">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
              </svg>
            </button>
            <input #fileInput type="file" accept="image/*"
                   style="position:fixed;left:-9999px;top:-9999px;opacity:0;width:1px;height:1px"
                   (change)="onFileSelected($event)">

            <textarea
              class="dany-input"
              [(ngModel)]="inputText"
              placeholder="Escribe aquí tu problema... (o pega una imagen con Ctrl+V)"
              rows="2"
              [disabled]="thinking()"
              (keydown)="onKeydown($event)"
              (paste)="onPaste($event)"
            ></textarea>

            <button
              class="send-btn"
              [disabled]="(!inputText.trim() && !imagenAdjunta()) || thinking()"
              (click)="sendMessage()"
              title="Enviar"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
              </svg>
            </button>
          </div>
          <p class="dany-disclaimer">
            Adjunta una imagen con 📎, arrastrándola aquí, o pegando con Ctrl+V.
          </p>
        }
        @if (ticketCreado()) {
          <div class="post-ticket-actions">
            <button class="btn-outline" (click)="resetChat()">Nueva consulta</button>
            <button class="btn-primary-sm" (click)="irAlTicket()">Ir a mis reportes</button>
          </div>
        }

      </div>
    }

    <!-- Modal imagen completa -->
    @if (imagenModal()) {
      <div class="img-modal-backdrop" (click)="imagenModal.set(null)">
        <img [src]="imagenModal()!" alt="Imagen" class="img-modal-img" (click)="$event.stopPropagation()">
        <button class="img-modal-close" (click)="imagenModal.set(null)">✕</button>
      </div>
    }
  `,
  styles: [`
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
    }

    /* ══ CARD CERRADO ══ */
    .dany-closed-card {
      flex: 1;
      display: flex;
      flex-direction: column;
      background: var(--c-bg);
      overflow-y: auto;
    }
    .dany-closed-header {
      display: flex; align-items: center; gap: 12px;
      padding: 20px 20px 18px;
      background: var(--c-blue);
      flex-shrink: 0;
    }
    .dany-avatar-wrap { position: relative; flex-shrink: 0; }
    .dany-avatar {
      width: 48px; height: 48px; border-radius: 50%;
      background: rgba(255,255,255,.2);
      border: 2px solid rgba(255,255,255,.4);
      display: flex; align-items: center; justify-content: center;
    }
    .dany-online-dot {
      position: absolute; bottom: 0; right: 0;
      width: 11px; height: 11px; background: var(--c-green);
      border-radius: 50%; border: 2px solid white;
    }
    .dany-name-row { display: flex; align-items: center; gap: 7px; }
    .dany-name { font-size: 16px; font-weight: 700; color: white; }
    .dany-badge {
      font-size: 10px; font-weight: 700;
      background: rgba(255,255,255,.25); color: white;
      padding: 1px 7px; border-radius: 8px; letter-spacing: .06em;
    }
    .dany-sub { font-size: 11px; color: rgba(255,255,255,.75); }

    .dany-closed-body {
      flex: 1;
      display: flex;
      flex-direction: column;
      padding: 20px;
      gap: 16px;
    }
    .dany-closed-desc {
      font-size: 13px; color: var(--c-text); line-height: 1.6;
    }
    .dany-chips-preview {
      display: flex; flex-direction: column; gap: 6px;
    }
    .chip--preview {
      text-align: left; padding: 8px 12px;
      background: var(--c-surface); border: 1px solid var(--c-blue-md);
      border-radius: var(--radius-md); font-size: 13px; color: var(--c-blue);
      cursor: pointer; transition: background .1s;
    }
    .chip--preview:hover { background: var(--c-blue-lt); }
    .btn-open-chat {
      display: flex; align-items: center; justify-content: center; gap: 8px;
      width: 100%; padding: 12px 16px; margin-top: auto;
      background: var(--c-blue); color: white;
      font-size: 14px; font-weight: 600;
      border: none; border-radius: var(--radius-md); cursor: pointer;
      transition: filter .15s, transform .1s;
    }
    .btn-open-chat:hover { filter: brightness(0.88); transform: translateY(-1px); }

    /* ══ PANEL ABIERTO ══ */
    .dany-panel {
      display: flex; flex-direction: column;
      flex: 1;
      background: var(--c-bg);
      overflow: hidden;
    }
    .dany-panel-header {
      display: flex; align-items: center; gap: 10px;
      padding: 14px 16px;
      background: var(--c-blue);
      flex-shrink: 0;
    }
    .dany-panel-avatar {
      width: 36px; height: 36px; border-radius: 50%;
      background: rgba(255,255,255,.2);
      border: 2px solid rgba(255,255,255,.35);
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0;
    }
    .dany-panel-name { font-size: 14px; font-weight: 700; color: white; }
    .dany-badge-sm {
      font-size: 9px; font-weight: 700;
      background: rgba(255,255,255,.25); color: white;
      padding: 1px 6px; border-radius: 6px; letter-spacing: .06em;
    }
    .dany-panel-sub { font-size: 11px; color: rgba(255,255,255,.75); }
    .panel-icon-btn {
      background: rgba(255,255,255,.15); border: none;
      border-radius: 6px; padding: 5px; cursor: pointer;
      color: white; display: flex; align-items: center;
      transition: background .12s;
    }
    .panel-icon-btn:hover { background: rgba(255,255,255,.28); }

    .dany-context-bar {
      display: flex; align-items: center; gap: 5px;
      padding: 6px 14px;
      background: var(--c-blue-lt);
      font-size: 11px; color: var(--c-blue);
      border-bottom: 1px solid var(--c-blue-md);
      flex-shrink: 0;
    }

    /* ══ MENSAJES ══ */
    .dany-messages {
      flex: 1; overflow-y: auto;
      padding: 14px; display: flex; flex-direction: column; gap: 10px;
      scroll-behavior: smooth;
    }
    .msg-row {
      display: flex; align-items: flex-end; gap: 7px;
    }
    .msg-row--user { flex-direction: row-reverse; }
    .msg-avatar-sm {
      width: 26px; height: 26px; border-radius: 50%;
      background: var(--c-blue);
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0; margin-bottom: 2px;
    }
    .msg-col { display: flex; flex-direction: column; gap: 3px; max-width: 85%; }
    .msg-row--user .msg-col { align-items: flex-end; }

    .bubble {
      padding: 9px 12px;
      border-radius: 14px;
      font-size: 13px; line-height: 1.5;
      white-space: pre-wrap; word-break: break-word;
    }
    .bubble--dany {
      background: var(--c-surface);
      border: 1px solid var(--c-blue-lt);
      color: var(--c-text);
      border-bottom-left-radius: 4px;
    }
    .bubble--user {
      background: var(--c-blue);
      color: white;
      border-bottom-right-radius: 4px;
    }
    .msg-time { font-size: 10px; color: var(--c-blue-md); padding: 0 2px; }

    /* Acciones debajo de burbuja */
    .msg-actions { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px; }
    .action-btn {
      padding: 7px 14px; border-radius: 8px;
      font-size: 12px; font-weight: 600; cursor: pointer;
      border: none; transition: all .12s; min-height: 34px;
    }
    .action-btn--success { background: var(--c-green); color: white; }
    .action-btn--success:hover { filter: brightness(0.88); }
    .action-btn--primary { background: var(--c-blue); color: white; }
    .action-btn--primary:hover { filter: brightness(0.88); }
    .action-btn--ghost {
      background: var(--c-surface); color: var(--c-blue);
      border: 1px solid var(--c-blue-md);
    }
    .action-btn--ghost:hover { background: var(--c-blue-lt); }
    .action-btn--loading {
      opacity: .6; cursor: default;
      background: var(--c-blue-lt); color: var(--c-blue);
    }

    /* Typing indicator */
    .typing-indicator {
      display: flex; align-items: center; gap: 4px;
      padding: 12px 14px;
      background: var(--c-surface); border: 1px solid var(--c-blue-lt);
      border-radius: 14px; border-bottom-left-radius: 4px;
      width: fit-content;
    }
    .typing-indicator span {
      width: 6px; height: 6px; border-radius: 50%;
      background: var(--c-blue-md);
      animation: bounce 1.2s ease infinite;
    }
    .typing-indicator span:nth-child(2) { animation-delay: .2s; }
    .typing-indicator span:nth-child(3) { animation-delay: .4s; }
    @keyframes bounce {
      0%, 60%, 100% { transform: translateY(0); opacity: .5; }
      30% { transform: translateY(-5px); opacity: 1; }
    }

    /* Ticket creado */
    .ticket-creado-card {
      display: flex; align-items: center; gap: 12px;
      background: var(--c-green-lt); border: 1px solid var(--c-green-md);
      border-radius: 12px; padding: 12px 14px;
      margin: 4px 0;
    }
    .tc-icon { font-size: 22px; flex-shrink: 0; }
    .tc-body { flex: 1; min-width: 0; }
    .tc-title { font-size: 13px; font-weight: 600; color: var(--c-green); margin-bottom: 2px; }
    .tc-folio { font-size: 12px; color: var(--c-green); }
    .tc-folio strong { font-family: monospace; }
    .tc-sub { font-size: 11px; color: var(--c-green); margin-top: 2px; }
    .tc-link {
      background: var(--c-green); color: white; border: none;
      border-radius: 8px; padding: 6px 10px;
      font-size: 12px; font-weight: 600; cursor: pointer;
      white-space: nowrap;
    }
    .tc-link:hover { filter: brightness(0.88); }

    /* Quick chips */
    .quick-chips-area {
      padding: 0 12px 8px; flex-shrink: 0;
      border-top: 1px solid var(--c-blue-lt);
    }
    .chips-label {
      font-size: 10px; color: var(--c-blue); font-weight: 600;
      text-transform: uppercase; letter-spacing: .05em;
      padding: 8px 0 6px;
    }
    .chips-grid { display: flex; flex-wrap: wrap; gap: 5px; }
    .chip {
      padding: 5px 10px;
      background: var(--c-surface); border: 1px solid var(--c-blue-md);
      border-radius: 20px; font-size: 11px; color: var(--c-blue);
      cursor: pointer; transition: background .1s;
      white-space: nowrap;
    }
    .chip:hover { background: var(--c-blue-lt); }

    /* Webhook warning */
    .webhook-warning {
      display: flex; align-items: center; gap: 6px;
      padding: 8px 14px;
      background: var(--c-amber-lt); border-top: 1px solid var(--c-amber-md);
      font-size: 11px; color: var(--c-amber); flex-shrink: 0;
    }
    .webhook-warning code {
      font-family: monospace; background: rgba(255,81,0,.1);
      padding: 1px 4px; border-radius: 3px;
    }

    /* Input */
    /* ── Imagen adjunta ── */
    .img-preview-row {
      display: flex; align-items: center; gap: 10px;
      padding: 8px 12px 4px;
    }
    .img-preview-wrap { position: relative; display: inline-flex; }
    .img-preview-thumb {
      height: 60px; max-width: 120px; object-fit: cover;
      border-radius: 8px; border: 2px solid var(--c-blue-md);
    }
    .img-preview-remove {
      position: absolute; top: -6px; right: -6px;
      width: 18px; height: 18px; border-radius: 50%;
      background: var(--c-red); color: #fff;
      border: none; font-size: 10px; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
    }
    .img-preview-hint { font-size: 11px; color: var(--c-muted); }
    .attach-btn {
      background: transparent; border: none; cursor: pointer;
      color: var(--c-muted); padding: 6px 8px; border-radius: 6px;
      display: flex; align-items: center;
      transition: color .15s, background .15s; flex-shrink: 0;
    }
    .attach-btn:hover { color: var(--c-blue); background: var(--c-blue-lt); }
    .attach-btn:disabled { opacity: .4; cursor: default; }
    .bubble-img {
      display: block; max-width: 200px; max-height: 160px;
      border-radius: 8px; object-fit: cover;
      cursor: zoom-in; margin-bottom: 4px;
      border: 1px solid rgba(0,0,0,.1);
    }
    .dany-input-area--drag { border-color: var(--c-blue) !important; background: var(--c-blue-lt) !important; }
    .img-modal-backdrop {
      position: fixed; inset: 0; z-index: 9999;
      background: rgba(0,0,0,.85);
      display: flex; align-items: center; justify-content: center;
      cursor: zoom-out; animation: fadeIn .15s ease;
    }
    .img-modal-img { max-width: 90vw; max-height: 90vh; border-radius: 10px; cursor: default; box-shadow: 0 20px 60px rgba(0,0,0,.5); }
    .img-modal-close {
      position: fixed; top: 20px; right: 24px;
      background: rgba(255,255,255,.15); border: none; color: #fff;
      font-size: 20px; width: 36px; height: 36px; border-radius: 50%;
      cursor: pointer; display: flex; align-items: center; justify-content: center;
    }
    .img-modal-close:hover { background: rgba(255,255,255,.3); }
    @keyframes fadeIn { from { opacity:0; } to { opacity:1; } }
    /* ── Input area ── */
    .dany-input-area {
      position: relative;
      display: flex; align-items: flex-end; gap: 8px;
      padding: 10px 12px; border-top: 1px solid var(--c-blue-lt);
      background: var(--c-surface); flex-shrink: 0;
    }
    .dany-input {
      flex: 1; border: 1.5px solid var(--c-blue-md);
      border-radius: 10px; padding: 8px 12px;
      font-size: 13px; resize: none; outline: none;
      background: var(--c-bg); color: var(--c-text);
      transition: border-color .15s;
      font-family: inherit;
    }
    .dany-input:focus { border-color: var(--c-blue); }
    .dany-input::placeholder { color: var(--c-blue-md); }
    .dany-input:disabled { opacity: .6; }
    .send-btn {
      width: 38px; height: 38px; border-radius: 10px;
      background: var(--c-blue); color: white; border: none;
      display: flex; align-items: center; justify-content: center;
      cursor: pointer; flex-shrink: 0;
      transition: filter .12s, transform .1s;
    }
    .send-btn:hover:not(:disabled) { filter: brightness(0.88); transform: translateY(-1px); }
    .send-btn:disabled { background: var(--c-blue-md); cursor: default; }

    .dany-disclaimer {
      font-size: 10px; color: var(--c-blue-md); text-align: center;
      padding: 4px 12px 8px; flex-shrink: 0;
    }

    /* Post-ticket */
    .post-ticket-actions {
      display: flex; gap: 8px; padding: 10px 12px 14px;
      flex-shrink: 0; justify-content: flex-end;
    }
    .btn-outline {
      padding: 7px 14px; border: 1px solid var(--c-blue-md);
      border-radius: 8px; background: var(--c-surface); color: var(--c-blue);
      font-size: 12px; font-weight: 500; cursor: pointer;
    }
    .btn-outline:hover { background: var(--c-blue-lt); }
    .btn-primary-sm {
      padding: 7px 14px; border: none;
      border-radius: 8px; background: var(--c-blue); color: white;
      font-size: 12px; font-weight: 600; cursor: pointer;
    }
    .btn-primary-sm:hover { filter: brightness(0.88); }

    /* Animación */
    .slide-down { animation: slideDown .2s ease; }
    @keyframes slideDown {
      from { opacity: 0; transform: translateY(-6px); }
      to   { opacity: 1; transform: translateY(0); }
    }
  `],
})
export class DanyChatComponent implements AfterViewChecked, OnInit {
  @Output() openChange = new EventEmitter<boolean>();
  @ViewChild('messagesRef') private messagesRef?: ElementRef<HTMLDivElement>;

  private auth = inject(AuthService);
  private http = inject(HttpClient);
  private ticketSvc = inject(TicketService);
  private router = inject(Router);

  // ── Estado ────────────────────────────────────────────────────────────────
  isOpen = signal(false);
  thinking = signal(false);
  messages = signal<DanyMsg[]>([]);
  inputText = '';
  ticketCreado = signal<{ id: number; folio: string } | null>(null);
  esResueltoIA = signal(false);
  creatingTicket = signal(false);
  imagenAdjunta = signal<string | null>(null);
  dragging = signal(false);
  imagenModal = signal<string | null>(null);

  readonly quickChips = QUICK_CHIPS;
  private readonly proxyUrl = `${environment.apiUrl}/dany/chat`;
  demoMode = signal(false);

  /** ID único de sesión por conversación */
  private sesionId = this.newSesionId();
  private needsScroll = false;

  // ── Computed ──────────────────────────────────────────────────────────────
  tiendaId = () => this.auth.currentUser()?.tienda_id ?? null;
  tiendaNombre = () => (this.auth.currentUser() as any)?.tienda_nombre ?? null;

  // ── Ciclo de vida ─────────────────────────────────────────────────────────
  ngOnInit() {
    this.pushWelcome();
  }

  ngAfterViewChecked() {
    if (this.needsScroll) {
      this.scrollToBottom();
      this.needsScroll = false;
    }
  }

  // ── Abrir / Cerrar ────────────────────────────────────────────────────────
  open() {
    this.isOpen.set(true);
    this.openChange.emit(true);
    this.needsScroll = true;
  }

  close() {
    this.isOpen.set(false);
    this.openChange.emit(false);
  }

  openWithMessage(text: string) {
    this.open();
    setTimeout(() => this.send(text), 80);
  }

  // ── Envío de mensajes ─────────────────────────────────────────────────────
  sendMessage() {
    const text = this.inputText.trim();
    const img = this.imagenAdjunta();
    if ((!text && !img) || this.thinking()) return;
    this.inputText = '';
    this.imagenAdjunta.set(null);
    this.send(text, img ?? undefined);
  }

  sendQuick(text: string) {
    this.send(text);
  }

  onKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      this.sendMessage();
    }
  }

  private send(text: string, imagen?: string) {
    this.addMsg({ from: 'user', text, imagen });
    this.thinking.set(true);
    this.needsScroll = true;

    const payload: Record<string, unknown> = {
      mensaje: text || '(imagen adjunta)',
      tienda_id: this.tiendaId(),
      tienda_nombre: this.tiendaNombre(),
      sesion_id: this.sesionId,
    };
    if (imagen) payload['imagen_base64'] = imagen;

    this.http.post<DanyWebhookResponse>(this.proxyUrl, payload).pipe(
      catchError(err => {
        // 503 = DANY_WEBHOOK_URL no configurada en backend → modo demo
        if (err?.status === 503) {
          this.demoMode.set(true);
          setTimeout(() => this.handleDemoResponse(text), 800);
          return of(null);
        }
        return of({ respuesta: 'Hubo un problema al conectar con el asistente. Intenta de nuevo.', accion: 'continuar' } as DanyWebhookResponse);
      })
    ).subscribe(res => {
      if (res === null) return; // demo mode handles it async
      this.thinking.set(false);
      this.processResponse(res);
    });
  }

  // ── Procesamiento de respuesta ────────────────────────────────────────────
  private processResponse(res: DanyWebhookResponse) {
    const text = res.respuesta ?? res.output ?? 'No pude entender la respuesta del agente.';
    const accion = res.accion ?? 'continuar';
    const resumen = res.resumen;

    this.addMsg({ from: 'dany', text, accion: accion === 'continuar' ? null : accion, resumen });
    this.needsScroll = true;
  }

  /** Modo demo cuando no hay webhook configurado */
  private handleDemoResponse(userText: string) {
    this.thinking.set(false);

    const lower = userText.toLowerCase();
    let respuesta = '';
    let accion: 'continuar' | 'resuelto' | 'escalar' = 'continuar';
    let resumen = '';

    if (lower.includes('internet') || lower.includes('red') || lower.includes('antena')) {
      respuesta = 'Entendido. Voy a verificar el estado de la conexión de tu tienda. ¿Hay alguna luz roja o apagada en el router o antena?';
    } else if (lower.includes('caja') || lower.includes('bloqueada')) {
      respuesta = '¿La caja está bloqueada desde cuándo? ¿Intentaron reiniciarla? Si ya intentaron eso, necesitarás un agente de soporte.';
    } else if (lower.includes('precio') || lower.includes('promoción') || lower.includes('promocion')) {
      respuesta = 'Esto podría ser un desfase de sincronización. ¿Cuándo fue la última vez que se sincronizó el catálogo?';
    } else if (lower.includes('sí') || lower.includes('si') || lower.includes('ya') || lower.includes('funciona')) {
      respuesta = '¡Excelente! Me alegra que haya funcionado. ¿Quieres que registre esto como resuelto para que quede en el historial?';
      accion = 'resuelto';
      resumen = 'Incidencia resuelta en primera línea por Dany (IA). ' + userText;
    } else if (lower.includes('no') || lower.includes('sigue') || lower.includes('persiste') || lower.includes('ayuda')) {
      respuesta = 'Entiendo que el problema persiste. Lo mejor será que un agente especializado lo revise. Te creo un ticket ahora.';
      accion = 'escalar';
      resumen = userText;
    } else {
      respuesta = 'Cuéntame más detalles sobre el problema. ¿Cuándo empezó y qué has intentado para resolverlo?';
    }

    this.addMsg({ from: 'dany', text: respuesta, accion: accion === 'continuar' ? null : accion, resumen });
    this.needsScroll = true;
  }

  // ── Acciones sobre tickets ────────────────────────────────────────────────
  registrarResuelto(resumen: string) {
    if (this.creatingTicket()) return;
    const descripcion = this.buildDescription();
    const comentario = `Resuelto por Dany (IA). ${resumen}`.trim();

    this.creatingTicket.set(true);
    this.ticketSvc.create({
      descripcion: `[Dany IA] ${descripcion}`,
      tipificacion_id: undefined,
      ia_clasificacion_aceptada: false,
    }).subscribe({
      next: ticket => {
        // Intentar marcar como resuelto inmediatamente
        this.ticketSvc.update(ticket.id, {
          estatus: 'RESUELTO',
          comentario,
        }).subscribe({
          next: t => {
            this.ticketCreado.set({ id: t.id, folio: t.folio });
            this.esResueltoIA.set(true);
            this.creatingTicket.set(false);
          },
          error: () => {
            // Si el backend no permite RESUELTO directo, guardar igual con nota
            this.ticketCreado.set({ id: ticket.id, folio: ticket.folio });
            this.esResueltoIA.set(true);
            this.creatingTicket.set(false);
          },
        });
      },
      error: () => this.creatingTicket.set(false),
    });
  }

  crearTicket(resumen?: string) {
    if (this.creatingTicket()) return;
    const descripcion = this.buildDescription();
    const comentarioDany = resumen ? `Contexto de Dany: ${resumen}` : '';

    this.creatingTicket.set(true);
    this.ticketSvc.create({
      descripcion,
      tipificacion_id: undefined,
      ia_clasificacion_aceptada: false,
    }).subscribe({
      next: ticket => {
        // Agregar nota de contexto del chat si hay
        if (comentarioDany) {
          this.ticketSvc.update(ticket.id, {
            comentario: comentarioDany,
            tipo_comentario: 'PUBLICO',
          }).subscribe();
        }
        this.ticketCreado.set({ id: ticket.id, folio: ticket.folio });
        this.esResueltoIA.set(false);
        this.creatingTicket.set(false);
      },
      error: () => this.creatingTicket.set(false),
    });
  }

  irAlTicket() {
    const t = this.ticketCreado();
    if (t) this.router.navigate(['/tienda/ticket', t.id]);
  }

  // ── Utilidades ────────────────────────────────────────────────────────────
  resetChat() {
    this.messages.set([]);
    this.ticketCreado.set(null);
    this.esResueltoIA.set(false);
    this.sesionId = this.newSesionId();
    this.pushWelcome();
  }

  private pushWelcome() {
    this.addMsg({
      from: 'dany',
      text: '¡Hola! Soy Dany, tu asistente de soporte. ¿En qué te puedo ayudar hoy? Cuéntame qué está pasando en tu tienda.',
    });
  }

  // ── Imagen ────────────────────────────────────────────────────────────────
  private fileToBase64(file: File): Promise<string> {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result as string);
      r.onerror = rej;
      r.readAsDataURL(file);
    });
  }

  private async procesarImagen(file: File) {
    if (!file.type.startsWith('image/')) return;
    const MAX = 5 * 1024 * 1024; // 5MB
    if (file.size > MAX) {
      alert('La imagen no puede superar 5 MB');
      return;
    }
    const base64 = await this.fileToBase64(file);
    this.imagenAdjunta.set(base64);
  }

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) this.procesarImagen(file);
    input.value = '';
  }

  onPaste(event: ClipboardEvent) {
    const items = event.clipboardData?.items;
    if (!items) return;
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        event.preventDefault();
        const file = item.getAsFile();
        if (file) this.procesarImagen(file);
        return;
      }
    }
  }

  onDragOver(event: DragEvent) {
    event.preventDefault();
    this.dragging.set(true);
  }

  onDragLeave(event: DragEvent) {
    this.dragging.set(false);
  }

  onDrop(event: DragEvent) {
    event.preventDefault();
    this.dragging.set(false);
    const file = event.dataTransfer?.files[0];
    if (file) this.procesarImagen(file);
  }

  quitarImagen() {
    this.imagenAdjunta.set(null);
  }

  abrirImagen(src: string) {
    this.imagenModal.set(src);
  }

  private addMsg(partial: Omit<DanyMsg, 'id' | 'time'>) {
    const msg: DanyMsg = {
      id: Math.random().toString(36).slice(2),
      time: new Date(),
      ...partial,
    };
    this.messages.update(msgs => [...msgs, msg]);
  }

  private buildDescription(): string {
    const userMsgs = this.messages()
      .filter(m => m.from === 'user')
      .map(m => m.text)
      .join(' / ');
    return userMsgs || 'Consulta iniciada a través del asistente Dany';
  }

  private scrollToBottom() {
    const el = this.messagesRef?.nativeElement;
    if (el) el.scrollTop = el.scrollHeight;
  }

  private newSesionId(): string {
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }
}