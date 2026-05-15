import {
  Component, OnInit, OnDestroy, AfterViewChecked,
  ElementRef, ViewChild, signal, computed, inject
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { RouterModule } from '@angular/router';
import { Subject, interval, of } from 'rxjs';
import { catchError, takeUntil } from 'rxjs/operators';
import { AuthService } from '../../core/services/auth.service';
import { NavbarComponent } from '../../shared/components/navbar.component';
import { SlaStatus, slaStatusColor } from '../../core/models';
import { environment } from '../../../environments/environment';

interface TicketCoord {
  id: number; folio: string; estatus: string; prioridad: string;
  descripcion: string; cat_nivel1: string | null; cat_nivel2: string | null;
  area_tecnica: string | null;
  tienda_id: number; tienda_nombre: string | null;
  zona_nombre: string | null; region_nombre: string | null;
  agente_nombre: string | null;
  fecha_apertura: string;
  sla_status: SlaStatus; sla_porcentaje: number | null;
}

interface DanyMsg { id: string; from: 'dany' | 'user'; text: string; time: Date; imagen?: string; mediaUrls?: string[]; }

const SLA_ORDER: Record<SlaStatus, number> = { ROJO: 0, AMARILLO: 1, VERDE: 2, SIN_SLA: 3 };
const AREA_LABELS: Record<string, string> = {
  SISTEMAS: 'Sistemas', MANTENIMIENTO: 'Mantenimiento', ABASTO: 'Abasto',
  FINANZAS: 'Finanzas', COMERCIAL: 'Comercial', RRHH: 'RR.HH.', OPERACIONES: 'Operaciones',
};
const AREA_COLORS: Record<string, string> = {
  SISTEMAS: '#1B3462', MANTENIMIENTO: '#E65100', ABASTO: '#00796B',
  FINANZAS: '#6A1B9A', COMERCIAL: '#C62828', RRHH: '#558B2F', OPERACIONES: '#0277BD',
};

@Component({
  selector: 'app-coordinador-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, NavbarComponent],
  template: `
    <div class="page">
      <app-navbar section="Dashboard" />

      <div class="workspace" [class.workspace--no-daniel]="!danielOpen()">

        <!-- ══ CENTRO: TICKETS ═══════════════════════════════════════════════ -->
        <main class="center-col">

          <!-- Header -->
          <div class="top-bar">
            <div>
              <h1 class="page-title">{{ auth.currentUser()?.nombre }}</h1>
              <p class="page-sub">Coordinador · Tickets de tu compañía</p>
            </div>
            <div style="display:flex;align-items:center;gap:10px">
              <button class="daniel-btn" (click)="danielOpen.set(!danielOpen())"
                      [class.daniel-btn--on]="danielOpen()">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4"/>
                  <circle cx="8" cy="16" r="1" fill="currentColor" stroke="none"/>
                  <circle cx="16" cy="16" r="1" fill="currentColor" stroke="none"/>
                </svg>
                {{ danielOpen() ? 'Cerrar' : 'Daniel' }}
              </button>
              <button class="btn btn--ghost btn--sm" (click)="load()">↻ Refrescar</button>
            </div>
          </div>

          <!-- KPI chips: flex:1 para ocupar todo el ancho -->
          <div class="kpi-chips">
            @for (chip of chips(); track chip.key) {
              <button class="kpi-chip"
                      [class.kpi-chip--active]="filtroSla() === chip.key"
                      [style.--chip-color]="chip.color"
                      (click)="filtroSla.set(filtroSla() === chip.key ? '' : chip.key)">
                <span class="kpi-chip-val">{{ chip.count }}</span>
                <span class="kpi-chip-lbl">{{ chip.label }}</span>
              </button>
            }
          </div>

          <!-- Filtro por área -->
          <div class="area-tabs">
            <button class="area-tab" [class.area-tab--active]="filtroArea() === ''"
                    (click)="filtroArea.set('')">Todos</button>
            @for (a of areasDisponibles(); track a) {
              <button class="area-tab" [class.area-tab--active]="filtroArea() === a"
                      [style.--at-color]="areaColor(a)"
                      (click)="filtroArea.set(filtroArea() === a ? '' : a)">
                {{ areaLabel(a) }}
                <span class="area-tab-count">{{ areaCount(a) }}</span>
              </button>
            }
          </div>

          <!-- Tabla tickets -->
          @if (loading()) {
            <div class="loading-row">Cargando tickets de tu compañía...</div>
          } @else if (lista().length === 0) {
            <div class="empty">
              <div class="empty__icon">✅</div>
              <p class="empty__title">Sin tickets activos</p>
            </div>
          } @else {
            <div class="ticket-table">
              <div class="ticket-thead">
                <span></span>
                <span>Folio</span>
                <span>Área · Categoría</span>
                <span>Zona · Tienda</span>
                <span>Agente</span>
                <span>Estado</span>
                <span>SLA</span>
              </div>
              @for (t of lista(); track t.id) {
                <div class="ticket-row"
                     [class.ticket-row--rojo]="t.sla_status === 'ROJO'"
                     [class.ticket-row--amarillo]="t.sla_status === 'AMARILLO'">
                  <span class="sla-dot" [style.background]="slaColor(t.sla_status)" [title]="t.sla_status"></span>
                  <span class="folio">{{ t.folio }}</span>
                  <span class="tip-cell">
                    @if (t.area_tecnica) {
                      <span class="area-chip"
                            [style.background]="areaColor(t.area_tecnica) + '18'"
                            [style.color]="areaColor(t.area_tecnica)">
                        {{ areaLabel(t.area_tecnica) }}
                      </span>
                    }
                    <span class="tip-l1">{{ t.cat_nivel1 || '—' }}</span>
                    @if (t.cat_nivel2) { <span class="tip-l2">{{ t.cat_nivel2 }}</span> }
                  </span>
                  <span class="location-cell">
                    @if (t.zona_nombre) { <span class="zona-lbl">{{ t.zona_nombre }}</span> }
                    <span class="tienda-lbl">{{ t.tienda_nombre || '#' + t.tienda_id }}</span>
                  </span>
                  <span class="text-sm text-muted">{{ t.agente_nombre || 'Sin asignar' }}</span>
                  <span class="estatus-badge estatus-badge--{{ t.estatus.toLowerCase() }}">
                    {{ estatusLabel(t.estatus) }}
                  </span>
                  <span class="text-sm">
                    @if (t.sla_porcentaje !== null) {
                      <span class="sla-badge sla-badge--{{ t.sla_status.toLowerCase() }}">
                        {{ t.sla_porcentaje | number:'1.0-0' }}%
                      </span>
                    } @else { — }
                  </span>
                </div>
              }
            </div>
            <p class="list-footer">{{ lista().length }} ticket{{ lista().length !== 1 ? 's' : '' }}</p>
          }
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
                    @if (msg.mediaUrls && msg.mediaUrls.length > 0) {
                      <div style="display:flex;flex-direction:column;gap:6px;margin-top:6px">
                        @for (url of msg.mediaUrls; track url) {
                          @if (isVideo(url)) {
                            <video controls [src]="toProxyUrl(url)" style="max-width:240px;border-radius:8px" preload="metadata"></video>
                          } @else {
                            <img [src]="toProxyUrl(url)" style="max-width:240px;border-radius:8px;cursor:zoom-in" (click)="imagenModal.set(toProxyUrl(url))">
                          }
                        }
                      </div>
                    }
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
              <button class="dchip" (click)="sendChatQuick('¿Cuántos tickets abiertos tiene mi compañía?')">📊 Resumen</button>
              <button class="dchip" (click)="sendChatQuick('¿Qué SLA están vencidos?')">⚠ SLA riesgo</button>
              <button class="dchip" (click)="sendChatQuick('¿Qué agente tiene más carga?')">👤 Carga agentes</button>
            </div>

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
              <input class="dany-input"
                     [(ngModel)]="chatInput"
                     placeholder="Pregunta a Daniel… (Ctrl+V para imagen)"
                     [disabled]="thinking()"
                     (keydown.enter)="sendChat()"
                     (paste)="onChatPaste($event)" />
              <button class="dany-send" [disabled]="(!chatInput.trim() && !chatImagen()) || thinking()" (click)="sendChat()">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
                </svg>
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
    /* ── Layout ──────────────────────────────────────────────────────────────── */
    .workspace {
      flex:1; display:grid; min-height:0; height:100vh; overflow:hidden;
      grid-template-columns: 1fr 360px; transition:grid-template-columns .2s;
    }
    .workspace--no-daniel { grid-template-columns: 1fr 0px; }

    .center-col {
      display:flex; flex-direction:column; overflow-y:auto;
      padding:20px; gap:14px; min-height:0; background:var(--c-bg);
    }
    .center-col::-webkit-scrollbar { width:4px; }
    .center-col::-webkit-scrollbar-thumb { background:var(--c-border); }

    /* ── Header ──────────────────────────────────────────────────────────────── */
    .top-bar { display:flex; justify-content:space-between; align-items:flex-start; }
    .page-title { font-size:20px; font-weight:700; margin:0; color:var(--c-text); }
    .page-sub { font-size:12px; color:var(--c-muted); margin:2px 0 0; }

    .daniel-btn {
      display:flex; align-items:center; gap:7px;
      padding:8px 14px; border-radius:20px;
      background:linear-gradient(135deg,#1B3462,#2563eb);
      color:white; border:none; cursor:pointer; font-size:12px; font-weight:500;
      box-shadow:0 3px 10px rgba(27,52,98,.3); transition:all .18s;
    }
    .daniel-btn:hover { transform:translateY(-1px); box-shadow:0 5px 16px rgba(27,52,98,.4); }
    .daniel-btn--on { background:linear-gradient(135deg,#0f1f42,#1B3462); }

    /* ── KPI chips: flex:1 para ocupar todo el espacio ──────────────────────── */
    .kpi-chips { display:flex; gap:8px; }
    .kpi-chip {
      flex:1;
      display:flex; flex-direction:column; align-items:center;
      padding:12px 8px; border-radius:var(--radius-md); cursor:pointer;
      border:2px solid transparent; background:var(--c-surface);
      box-shadow:0 1px 3px rgba(0,0,0,.06); transition:all .15s;
    }
    .kpi-chip:hover { border-color:var(--chip-color); }
    .kpi-chip--active {
      border-color:var(--chip-color);
      background:color-mix(in srgb, var(--chip-color) 10%, transparent);
    }
    .kpi-chip-val { font-size:28px; font-weight:800; line-height:1; color:var(--chip-color, var(--c-text)); }
    .kpi-chip-lbl { font-size:11px; color:var(--c-muted); margin-top:4px; white-space:nowrap; text-align:center; }

    /* ── Tabs de área ─────────────────────────────────────────────────────── */
    .area-tabs { display:flex; gap:6px; flex-wrap:wrap; }
    .area-tab {
      padding:4px 12px; border-radius:20px; font-size:12px; font-weight:500;
      border:1px solid var(--c-border); background:var(--c-surface); cursor:pointer;
      color:var(--c-muted); transition:all .15s; display:flex; align-items:center; gap:5px;
    }
    .area-tab:hover { border-color:var(--at-color, var(--c-blue)); color:var(--at-color, var(--c-blue)); }
    .area-tab--active { background:var(--at-color, var(--c-blue)); color:#fff; border-color:var(--at-color, var(--c-blue)); }
    .area-tab-count { background:rgba(255,255,255,.25); border-radius:10px; padding:0 5px; font-size:10px; }

    /* ── Tabla ────────────────────────────────────────────────────────────── */
    .ticket-table { background:var(--c-surface); border:1px solid var(--c-border); border-radius:var(--radius-lg); overflow:hidden; }
    .ticket-thead {
      display:grid; grid-template-columns:14px 100px 1fr 150px 120px 120px 65px;
      gap:8px; padding:9px 14px; background:var(--c-bg);
      border-bottom:1px solid var(--c-border);
      font-size:11px; font-weight:600; color:var(--c-muted); text-transform:uppercase; letter-spacing:.04em;
    }
    .ticket-row {
      display:grid; grid-template-columns:14px 100px 1fr 150px 120px 120px 65px;
      gap:8px; align-items:center; padding:9px 14px;
      border-bottom:1px solid var(--c-border); font-size:13px; transition:background .1s;
      border-left:3px solid transparent;
    }
    .ticket-row:last-child { border-bottom:none; }
    .ticket-row:hover { background:var(--c-bg); }
    .ticket-row--rojo { border-left-color:#EF4444; }
    .ticket-row--amarillo { border-left-color:#F59E0B; }

    .sla-dot { width:10px; height:10px; border-radius:50%; flex-shrink:0; display:inline-block; }
    .folio { font-family:monospace; font-weight:700; color:var(--c-blue); font-size:11px; }

    .tip-cell { display:flex; flex-direction:column; gap:2px; min-width:0; }
    .area-chip { display:inline-block; padding:1px 6px; border-radius:8px; font-size:10px; font-weight:600; width:fit-content; }
    .tip-l1 { font-size:12px; font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .tip-l2 { font-size:11px; color:var(--c-muted); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }

    .location-cell { display:flex; flex-direction:column; gap:1px; min-width:0; }
    .zona-lbl { font-size:10px; color:var(--c-muted); text-transform:uppercase; letter-spacing:.03em; }
    .tienda-lbl { font-size:12px; font-weight:500; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }

    .text-sm { font-size:12px; }
    .text-muted { color:var(--c-muted); }

    .estatus-badge { display:inline-block; padding:2px 8px; border-radius:20px; font-size:11px; font-weight:600; background:var(--c-blue-lt); color:var(--c-blue); white-space:nowrap; }
    .estatus-badge--nuevo        { background:#e8f4fd; color:#1565C0; }
    .estatus-badge--asignado     { background:#e3f2fd; color:#0277BD; }
    .estatus-badge--en_proceso   { background:#e8f5e9; color:#2E7D32; }
    .estatus-badge--resuelto     { background:#f3e5f5; color:#7B1FA2; }

    .sla-badge { padding:2px 6px; border-radius:10px; font-size:11px; font-weight:700; }
    .sla-badge--verde    { background:#e6faf3; color:#00A878; }
    .sla-badge--amarillo { background:#fff8e0; color:#D97706; }
    .sla-badge--rojo     { background:#fef2f2; color:#DC2626; }
    .sla-badge--sin_sla  { background:var(--c-bg); color:var(--c-muted); }

    .loading-row { text-align:center; padding:48px; color:var(--c-muted); }
    .list-footer  { text-align:right; font-size:12px; color:var(--c-muted); margin-top:4px; }

    .empty { text-align:center; padding:60px 20px; }
    .empty__icon { font-size:40px; }
    .empty__title { color:var(--c-muted); margin-top:8px; font-size:14px; }

    /* ── Panel Daniel (copiado de agente-dashboard) ──────────────────────── */
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

    :host-context(.dark-theme) {
      .estatus-badge--nuevo    { background:#1e3a5f; color:#90caf9; }
      .estatus-badge--asignado { background:#1a3a5c; color:#64b5f6; }
      .estatus-badge--en_proceso { background:#1b3a1e; color:#a5d6a7; }
    }
  `],
})
export class CoordinadorDashboardComponent implements OnInit, OnDestroy, AfterViewChecked {
  @ViewChild('chatRef') private chatRef?: ElementRef<HTMLDivElement>;

  auth = inject(AuthService);
  private http = inject(HttpClient);
  private destroy$ = new Subject<void>();

  // Tickets
  tickets = signal<TicketCoord[]>([]);
  loading = signal(true);
  filtroSla  = signal('');
  filtroArea = signal('');

  // Daniel
  danielOpen  = signal(true);
  chatMsgs    = signal<DanyMsg[]>([]);
  chatInput   = '';
  thinking    = signal(false);
  chatImagen  = signal<string | null>(null);
  chatDrag    = signal(false);
  imagenModal = signal<string | null>(null);
  private needsScroll = false;
  private readonly proxyUrl = `${environment.apiUrl}/dany/chat`;

  chips = computed(() => {
    const ts = this.tickets();
    const activos = ts.filter(t => !['RESUELTO', 'CERRADO', 'CANCELADO'].includes(t.estatus));
    return [
      { key: '__nuevo__',    label: 'Nuevos',      color: '#1565C0', count: ts.filter(t => t.estatus === 'NUEVO').length },
      { key: '__proceso__',  label: 'En proceso',  color: '#2E7D32', count: ts.filter(t => t.estatus === 'EN_PROCESO').length },
      { key: '__rojo__',     label: 'SLA Vencido', color: '#EF4444', count: activos.filter(t => t.sla_status === 'ROJO').length },
      { key: '__amarillo__', label: 'En riesgo',   color: '#F59E0B', count: activos.filter(t => t.sla_status === 'AMARILLO').length },
      { key: '__sinagente__',label: 'Sin agente',  color: '#6B7280', count: ts.filter(t => !t.agente_nombre).length },
    ];
  });

  areasDisponibles = computed(() => {
    const areas = new Set(this.tickets().map(t => t.area_tecnica).filter(Boolean) as string[]);
    return [...areas].sort();
  });

  lista = computed(() => {
    let ts = [...this.tickets()];
    const fs = this.filtroSla();
    const fa = this.filtroArea();
    if (fa) ts = ts.filter(t => t.area_tecnica === fa);
    if (fs === '__rojo__')      ts = ts.filter(t => t.sla_status === 'ROJO');
    else if (fs === '__amarillo__') ts = ts.filter(t => t.sla_status === 'AMARILLO');
    else if (fs === '__nuevo__')    ts = ts.filter(t => t.estatus === 'NUEVO');
    else if (fs === '__proceso__')  ts = ts.filter(t => t.estatus === 'EN_PROCESO');
    else if (fs === '__sinagente__') ts = ts.filter(t => !t.agente_nombre);
    return ts.sort((a, b) => (SLA_ORDER[a.sla_status] ?? 3) - (SLA_ORDER[b.sla_status] ?? 3));
  });

  ngOnInit() {
    this.load();
    interval(90_000).pipe(takeUntil(this.destroy$)).subscribe(() => this.load());
    this.pushWelcome();
    setTimeout(() => { const el = this.chatRef?.nativeElement; if (el) el.scrollTop = el.scrollHeight; }, 100);
  }

  ngOnDestroy() { this.destroy$.next(); this.destroy$.complete(); }

  ngAfterViewChecked() {
    if (this.needsScroll) {
      this.needsScroll = false;
      setTimeout(() => { const el = this.chatRef?.nativeElement; if (el) el.scrollTop = el.scrollHeight; }, 50);
    }
  }

  load() {
    this.loading.set(true);
    this.http.get<TicketCoord[]>('/api/v1/coordinador/tickets').subscribe({
      next: ts => { this.tickets.set(ts); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  // ── Daniel chat ───────────────────────────────────────────────────────────
  sendChat() {
    const text = this.chatInput.trim();
    const img  = this.chatImagen();
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
      sesion_id: 'coord-' + user?.id,
      usuario_id: user?.id ?? null,
      rol_usuario: user?.rol ?? 'COORDINADOR',
      jwt: this.auth.getToken() ?? '',
      historial: this.chatMsgs().slice(-6).map(m => ({ de: m.from, texto: m.text })),
    };
    if (img) payload['imagen'] = img;

    this.http.post<any>(this.proxyUrl, payload).pipe(
      takeUntil(this.destroy$),
      catchError(() => of({ respuesta: 'Lo siento, no pude conectarme a Daniel en este momento.' }))
    ).subscribe(res => {
      this.thinking.set(false);
      const mediaUrls: string[] = res?.multimedia_url
        ? res.multimedia_url.replace(/^=/, '').split(',').map((u: string) => u.trim()).filter((u: string) => u.length > 0)
        : [];
      this.addChatMsg({ from: 'dany', text: res?.respuesta ?? res?.output ?? 'Sin respuesta.', mediaUrls });
      this.needsScroll = true;
    });
  }

  sendChatQuick(text: string) { this.chatInput = text; this.sendChat(); }
  resetChat()  { this.chatMsgs.set([]); this.pushWelcome(); }

  private pushWelcome() {
    const nombre = (this.auth.currentUser()?.nombre ?? '').split(' ')[0];
    this.addChatMsg({
      from: 'dany',
      text: `Hola ${nombre}, soy Daniel. Puedo mostrarte el estado de tu compañía, alertas de SLA o carga de agentes. ¿En qué te ayudo?`,
    });
  }

  private addChatMsg(m: Omit<DanyMsg, 'id' | 'time'>) {
    this.chatMsgs.update(msgs => [...msgs, { ...m, id: crypto.randomUUID(), time: new Date() }]);
    this.needsScroll = true;
  }

  // ── Imagen helpers ────────────────────────────────────────────────────────
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
      if (item.type.startsWith('image/')) { const f = item.getAsFile(); if (f) this.procesarImg(f); e.preventDefault(); return; }
    }
  }
  onChatDrop(e: DragEvent) {
    e.preventDefault(); this.chatDrag.set(false);
    const f = e.dataTransfer?.files[0]; if (f) this.procesarImg(f);
  }

  // ── Helpers display ───────────────────────────────────────────────────────
  slaColor(s: SlaStatus) { return slaStatusColor(s); }
  areaLabel(a: string)   { return AREA_LABELS[a] ?? a; }
  areaColor(a: string)   { return AREA_COLORS[a] ?? '#6B7280'; }
  areaCount(a: string)   { return this.tickets().filter(t => t.area_tecnica === a).length; }
  isVideo(url: string)   { return /\.(mp4|mov|webm)/i.test(url); }
  toProxyUrl(url: string){ return `${environment.apiUrl}/media/proxy?url=${encodeURIComponent(url)}`; }

  estatusLabel(e: string): string {
    const map: Record<string, string> = {
      NUEVO: 'Nuevo', ASIGNADO: 'Asignado', EN_PROCESO: 'En proceso',
      ESPERANDO_TIENDA: 'Esp. tienda', ESPERANDO_AGENTE: 'Esp. agente',
      PROGRAMADO_VISITA: 'Prog. visita', EN_VISITA: 'En visita',
      ESPERANDO_PIEZA: 'Esp. pieza', RESUELTO: 'Resuelto', RECHAZADO: 'Re-abierto',
    };
    return map[e] ?? e;
  }
}
