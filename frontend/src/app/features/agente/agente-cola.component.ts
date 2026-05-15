import { Component, OnInit, OnDestroy, signal, computed, ViewChild, ElementRef, AfterViewChecked, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, ActivatedRoute } from '@angular/router';
import { interval, Subscription, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { TicketService } from '../../core/services/ticket.service';
import { AuthService } from '../../core/services/auth.service';
import { NavbarComponent } from '../../shared/components/navbar.component';
import { StatusBadgeComponent } from '../../shared/components/status-badge.component';
import { TicketListItem, SlaStatus, slaStatusColor, origenIcon } from '../../core/models';

interface DanielMsg { id: string; from: 'daniel' | 'user'; text: string; time: Date; }

const PRIORIDAD_ORDER: Record<string, number> = {
  CRITICA: 0, ALTA: 1, MEDIA: 2, BAJA: 3,
};

@Component({
  selector: 'app-agente-cola',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, NavbarComponent, StatusBadgeComponent],
  template: `
    <div class="page">
      <app-navbar section="Call Center" />

      <!-- workspace: [content] + [daniel] al mismo nivel que navbar -->
      <div class="cola-workspace" [class.cola-workspace--daniel]="danielOpen()">

        <!-- Columna principal -->
        <div class="cola-main">

          <!-- Top bar -->
          <div class="top-bar">
            <div>
              <h1 class="page-title">Cola de tickets</h1>
              <p class="page-sub">
                {{ auth.currentUser()?.nombre }} · {{ grupoNombre() }}
              </p>
            </div>
            <div class="top-bar-actions">
              <span class="refresh-txt">Actualiza en {{ countdown() }}s</span>
              <button class="btn btn--ghost btn--sm" (click)="load()">↻ Refrescar</button>
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

          <div class="cola-content">
        <!-- KPIs: cada card es un filtro clickeable -->
        <div class="kpi-row">

          <button class="kpi-card kpi-card--clickable"
            [class.kpi-card--active]="filtroEstatus() === '__sin_asignar__'"
            title="Tickets del grupo que nadie ha tomado aún. Clic para filtrar."
            (click)="toggleFiltroEstatus('__sin_asignar__')">
            <span class="kpi-val kpi-val--blue">{{ counts().sin_asignar }}</span>
            <span class="kpi-label">Sin tomar</span>
          </button>

          <button class="kpi-card kpi-card--clickable"
            [class.kpi-card--active]="filtroEstatus() === '__mis_asignados__'"
            title="Tickets asignados a ti que están activos. Clic para filtrar."
            (click)="toggleFiltroEstatus('__mis_asignados__')">
            <span class="kpi-val">{{ counts().mis_tickets }}</span>
            <span class="kpi-label">Mis asignados</span>
          </button>

          <button class="kpi-card kpi-card--clickable kpi-card--amber"
            [class.kpi-card--active]="filtroEstatus() === 'ESPERANDO_TIENDA'"
            title="Solución enviada, esperando confirmación de la tienda. Clic para filtrar."
            (click)="toggleFiltroEstatus('ESPERANDO_TIENDA')">
            <span class="kpi-val kpi-val--amber">{{ counts().confirmar }}</span>
            <span class="kpi-label">Esp. tienda</span>
          </button>

          <button class="kpi-card kpi-card--clickable kpi-card--red"
            [class.kpi-card--active]="filtroSla === 'ROJO'"
            title="SLA vencido. Atención inmediata. Clic para filtrar."
            (click)="toggleFiltroSla('ROJO')">
            <span class="kpi-val kpi-val--red">{{ counts().vencidos }}</span>
            <span class="kpi-label">🔴 SLA Vencido</span>
          </button>

          <button class="kpi-card kpi-card--clickable kpi-card--amber"
            [class.kpi-card--active]="filtroSla === 'AMARILLO'"
            title="Más del 75% del tiempo SLA consumido. Clic para filtrar."
            (click)="toggleFiltroSla('AMARILLO')">
            <span class="kpi-val kpi-val--amber">{{ counts().amarillo }}</span>
            <span class="kpi-label">🟡 SLA En riesgo</span>
          </button>

          @if (counts().rechazados > 0) {
            <button class="kpi-card kpi-card--clickable kpi-card--red"
              [class.kpi-card--active]="filtroEstatus() === 'RECHAZADO'"
              title="La tienda rechazó la solución. Requieren re-atención urgente. Clic para filtrar."
              (click)="toggleFiltroEstatus('RECHAZADO')">
              <span class="kpi-val kpi-val--red">{{ counts().rechazados }}</span>
              <span class="kpi-label">⚠ Re-abiertos</span>
            </button>
          }

          <button class="kpi-card kpi-card--clickable kpi-card--green"
            [class.kpi-card--active]="filtroEstatus() === '__cerrados_hoy__'"
            title="Cerrados o resueltos hoy en el grupo. Clic para filtrar."
            (click)="toggleFiltroEstatus('__cerrados_hoy__')">
            <span class="kpi-val kpi-val--green">{{ counts().cerrados_hoy }}</span>
            <span class="kpi-label">Cerrados hoy</span>
          </button>

        </div>

        <!-- Buscador -->
        <div class="search-bar">
          <span class="search-icon">🔍</span>
          <input
            class="search-input"
            type="text"
            placeholder="Buscar por folio, descripción, tienda, categoría..."
            [(ngModel)]="busqueda"
          />
          @if (busqueda) {
            <button class="search-clear" (click)="busqueda = ''">✕</button>
          }
        </div>

        <div class="filter-row">
          <div class="filter-group">
            <select class="input filter-select" [(ngModel)]="filtroSla" (change)="applyFilters()">
              <option value="">Todos los SLA</option>
              <option value="ROJO">🔴 Vencido</option>
              <option value="AMARILLO">🟡 En riesgo</option>
              <option value="VERDE">🟢 En tiempo</option>
            </select>
            <select class="input filter-select" [(ngModel)]="filtroPrioridad" (change)="applyFilters()">
              <option value="">Todas las prioridades</option>
              <option value="CRITICA">Crítica</option>
              <option value="ALTA">Alta</option>
              <option value="MEDIA">Media</option>
              <option value="BAJA">Baja</option>
            </select>
            @if (filtroEstatus() || filtroSla || filtroPrioridad) {
              <button class="filter-btn filter-btn--clear" (click)="clearFilters()">✕ Limpiar</button>
            }
          </div>
        </div>

        <!-- Ticket table -->
        @if (loading()) {
          <div class="ticket-table">
            @for (i of [1,2,3,4,5]; track i) {
              <div class="ticket-row skeleton-row">
                <div class="skeleton" style="height:13px;width:100px;border-radius:4px"></div>
                <div class="skeleton" style="height:13px;width:55%;border-radius:4px"></div>
                <div class="skeleton" style="height:13px;width:80px;border-radius:4px"></div>
              </div>
            }
          </div>
        } @else if (ticketsMostrados().length === 0) {
          <div class="empty">
            <div class="empty__icon">🎉</div>
            <p class="empty__title">Cola vacía</p>
            <p class="empty__desc">No hay tickets con los filtros actuales.</p>
          </div>
        } @else {
          <div class="ticket-table">
            <!-- NUEVO Sprint 1: columna SLA semáforo + tipificación 3 niveles -->
            <div class="ticket-thead">
              <span></span><!-- semáforo -->
              <span>Folio</span>
              <span>Tipificación</span>
              <span>Tienda</span>
              <span>Prioridad</span>
              <span>Estado</span>
              <span>SLA límite</span>
              <span>Origen</span>
              <span>Fecha</span>
            </div>

            @for (t of ticketsMostrados(); track t.id) {
              <a
                class="ticket-row"
                [class.ticket-row--critica]="t.prioridad === 'CRITICA'"
                [class.ticket-row--rojo]="t.sla_status === 'ROJO'"
                [class.ticket-row--amarillo]="t.sla_status === 'AMARILLO'"
                [routerLink]="['/agente/ticket', t.id]"
              >
                <!-- NUEVO Sprint 1: barra de semáforo SLA -->
                <span class="sla-dot" [style.background]="slaColor(t.sla_status)" [title]="t.sla_status"></span>

                <span class="folio">{{ t.folio }}</span>

                <!-- NUEVO Sprint 1: 3 niveles de tipificación -->
                <span class="tip-cell">
                  @if (t.cat_nivel1) {
                    <span class="tip-l1">{{ t.cat_nivel1 }}</span>
                    @if (t.cat_nivel2) {
                      <span class="tip-l2">{{ t.cat_nivel2 }}</span>
                    }
                    @if (t.cat_nivel3) {
                      <span class="tip-l3">{{ t.cat_nivel3 }}</span>
                    }
                  } @else {
                    <span class="tip-l3 text-muted">{{ t.descripcion | slice:0:60 }}…</span>
                  }
                </span>

                <span class="text-sm">#{{ t.tienda_id }}</span>

                <span class="prio" [class]="'prio--' + t.prioridad">{{ t.prioridad }}</span>

                <app-status-badge [status]="t.estatus" />

                <!-- NUEVO Sprint 1: SLA con semáforo visual -->
                <span class="sla-cell">
                  @if (t.sla_limite) {
                    <span [class]="'sla-badge sla-badge--' + t.sla_status.toLowerCase()">
                      {{ t.sla_limite | date:'dd/MM HH:mm' }}
                    </span>
                  } @else {
                    <span class="sla-badge sla-badge--sin_sla">Sin SLA</span>
                  }
                </span>

                <!-- NUEVO Sprint 1: origen del ticket -->
                <span class="text-sm" [title]="t.origen">
                  {{ origenEmoji(t.origen) }}
                </span>

                <span class="text-sm text-muted">
                  {{ t.fecha_apertura | date:'dd/MM HH:mm' }}
                </span>
              </a>
            }
          </div>
        }
          </div><!-- /cola-content -->
        </div><!-- /cola-main -->

        <!-- Daniel panel — al nivel del workspace, full height -->
        @if (danielOpen()) {
          <div class="daniel-col">
            <div class="daniel-head">
              <div class="daniel-orb" [class.daniel-orb--pulse]="danielThinking()"></div>
              <div>
                <span class="daniel-head-name">Daniel</span>
                <span class="daniel-head-sub">{{ danielThinking() ? 'Analizando…' : 'En línea' }}</span>
              </div>
              <button class="daniel-head-close" (click)="danielOpen.set(false)">✕</button>
            </div>
            <div class="daniel-msgs" #danielRef>
              @for (m of danielMsgs(); track m.id) {
                <div class="dmsg" [class.dmsg--daniel]="m.from==='daniel'" [class.dmsg--user]="m.from==='user'">
                  @if (m.from === 'daniel') { <div class="daniel-orb daniel-orb--xs"></div> }
                  <div class="dbubble" [class.dbubble--daniel]="m.from==='daniel'" [class.dbubble--user]="m.from==='user'">{{ m.text }}</div>
                </div>
              }
              @if (danielThinking()) {
                <div class="dmsg dmsg--daniel">
                  <div class="daniel-orb daniel-orb--xs"></div>
                  <div class="typing"><span></span><span></span><span></span></div>
                </div>
              }
            </div>
            <div class="daniel-chips">
              <button class="dchip" (click)="danielQuick('¿Cuántos tickets tengo pendientes?')">📊 Pendientes</button>
              <button class="dchip" (click)="danielQuick('¿Qué SLA están en riesgo?')">⚠ SLA riesgo</button>
              <button class="dchip" (click)="danielQuick('¿Qué debo atender primero?')">🎯 Prioridad</button>
            </div>
            <div class="daniel-input-row">
              <input class="daniel-input" [(ngModel)]="danielInput"
                     placeholder="Pregunta a Daniel…"
                     [disabled]="danielThinking()"
                     (keydown.enter)="danielSend()" />
              <button class="daniel-send" [disabled]="!danielInput.trim() || danielThinking()" (click)="danielSend()">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
              </button>
            </div>
          </div>
        }
      </div><!-- /cola-workspace -->
    </div><!-- /page -->

  `,
  styles: [`
    .top-bar {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      padding: 20px 32px 16px;
      flex-shrink: 0;
      margin-bottom: 0;
    }
    .page-title { font-size: 22px; font-weight: 600; }
    .page-sub   { font-size: 13px; color: var(--c-muted); margin-top: 2px; }

    /* SPRINT 1: 7 KPIs en lugar de 5 */
    .kpi-row {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin-bottom: 20px;
    }
    .kpi-row > * { flex: 1; min-width: 110px; }

    .kpi-card {
      background: var(--c-surface);
      border: 1px solid var(--c-border);
      border-radius: var(--radius-md);
      padding: 12px 14px;
    }
    .kpi-card--amber  { border-top: 3px solid var(--c-amber); }
    .kpi-card--red    { border-top: 3px solid var(--c-red);   }
    .kpi-card--green  { border-top: 3px solid var(--c-green); }
    .kpi-card--gray   { border-top: 3px solid var(--c-muted); }
    button.kpi-card   { cursor:pointer; border:1px solid var(--c-border); text-align:left; font-family:inherit; width:100%; }
    .kpi-card--clickable { transition:transform .15s, box-shadow .15s; }
    .kpi-card--clickable:hover { transform:translateY(-2px); box-shadow:0 4px 12px rgba(0,0,0,.07); }
    .kpi-card--active { box-shadow:0 0 0 2px var(--c-blue) !important; border-color:var(--c-blue) !important; }
    .kpi-card--active .kpi-label { color:var(--c-blue); font-weight:600; }
    .filter-btn--clear { color:var(--c-red); border-color:var(--c-red); }
    .filter-btn--clear:hover { background:#fef2f2; }
    .kpi-val   { display: block; font-size: 24px; font-weight: 700; line-height: 1.2; }
    .kpi-val--red   { color: var(--c-red);   }
    .kpi-val--amber { color: var(--c-amber); }
    .kpi-val--green { color: var(--c-green); }
    .kpi-val--gray  { color: var(--c-muted); }
    .kpi-label { font-size: 11px; color: var(--c-muted); }

    .search-bar {
      display: flex;
      align-items: center;
      gap: 8px;
      background: var(--c-surface);
      border: 1.5px solid var(--c-border);
      border-radius: 8px;
      padding: 0 12px;
      margin-bottom: 12px;
    }
    .search-bar:focus-within { border-color: var(--c-blue); }
    .search-icon { font-size: 14px; opacity: .5; }
    .search-input {
      flex: 1; border: none; outline: none; background: transparent;
      font-size: 13px; padding: 10px 0; color: var(--c-text);
    }
    .search-clear { background: none; border: none; cursor: pointer; color: var(--c-muted); font-size: 13px; }

    .filter-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      margin-bottom: 16px;
      flex-wrap: wrap;
    }
    .filter-group { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
    .filter-btn {
      display: inline-flex; align-items: center; gap: 5px;
      padding: 5px 13px; border-radius: 20px; font-size: 13px;
      border: 1px solid var(--c-border); background: var(--c-surface); color: var(--c-muted);
    }
    .filter-btn:hover { border-color: var(--c-blue); color: var(--c-blue); }
    .filter-btn--active {
      background: var(--c-blue-lt); border-color: var(--c-blue-md);
      color: var(--c-blue); font-weight: 500;
    }
    .filter-count {
      background: var(--c-red); color: white; font-size: 10px; font-weight: 700;
      min-width: 16px; height: 16px; border-radius: 8px;
      display: inline-flex; align-items: center; justify-content: center; padding: 0 4px;
    }
    .filter-select { padding: 5px 10px; border-radius: 20px; font-size: 13px; width: auto; }

    /* SPRINT 1: 9 columnas (agrega semáforo + origen, divide tipificación) */
    .ticket-table {
      background: var(--c-surface);
      border: 1px solid var(--c-border);
      border-radius: var(--radius-lg);
      overflow: hidden;
    }
    .ticket-thead {
      display: grid;
      grid-template-columns: 28px 110px 1fr 70px 80px 130px 120px 36px 90px;
      gap: 10px;
      padding: 10px 16px;
      background: var(--c-bg);
      border-bottom: 1px solid var(--c-border);
      font-size: 11px; font-weight: 600; color: var(--c-muted);
      text-transform: uppercase; letter-spacing: .04em;
    }
    .ticket-row {
      display: grid;
      grid-template-columns: 28px 110px 1fr 70px 80px 130px 120px 36px 90px;
      gap: 10px;
      align-items: center;
      padding: 11px 16px;
      border-bottom: 1px solid var(--c-border);
      color: inherit; text-decoration: none; font-size: 13px;
      transition: background var(--transition);
    }
    .ticket-row:last-child { border-bottom: none; }
    .ticket-row:hover      { background: var(--c-bg); }
    .ticket-row--critica   { border-left: 3px solid var(--c-red); }
    .ticket-row--rojo      { background: var(--c-red-lt); }
    .ticket-row--rojo:hover{ background: var(--c-red-lt); filter: brightness(.96); }
    .ticket-row--amarillo  { background: var(--c-amber-lt); }

    .skeleton-row { display: flex; align-items: center; gap: 20px; padding: 16px; border-bottom: 1px solid var(--c-border); }

    /* SPRINT 1: semáforo SLA */
    .sla-dot {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      width: 22px;
      height: 22px;
      border-radius: 50%;
      font-size: 8px;
      color: white;
      font-weight: 700;
      flex-shrink: 0;
    }

    /* SPRINT 1: tipificación 3 niveles */
    .tip-cell { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
    .tip-l1 { font-size: 12px; font-weight: 600; color: var(--c-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .tip-l2 { font-size: 11px; color: var(--c-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .tip-l3 { font-size: 10px; color: var(--c-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-style: italic; }

    /* SPRINT 1: badges de SLA */
    .sla-cell { display: flex; align-items: center; }
    .sla-badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 500;
      white-space: nowrap;
    }
    .sla-badge--verde    { background: var(--c-green-lt);  color: var(--c-green);  border: 1px solid var(--c-green-md); }
    .sla-badge--amarillo { background: var(--c-amber-lt);  color: var(--c-amber);  border: 1px solid var(--c-amber-md); }
    .sla-badge--rojo     { background: var(--c-red-lt);    color: var(--c-red);    border: 1px solid var(--c-red-md); font-weight: 700; }
    .sla-badge--sin_sla  { background: var(--c-bg); color: var(--c-muted); border: 1px solid var(--c-border); }

    .folio { font-family: monospace; font-weight: 700; color: var(--c-blue); }

    @media (max-width: 1200px) {
      .ticket-thead, .ticket-row { grid-template-columns: 28px 100px 1fr 100px 120px 100px; }
      .ticket-thead span:nth-child(4),
      .ticket-thead span:nth-child(8),
      .ticket-thead span:nth-child(9),
      .ticket-row > span:nth-child(4),
      .ticket-row > span:nth-child(8),
      .ticket-row > span:nth-child(9) { display: none; }
    }

    /* ── Layout workspace ──────────────────────────────────────────────── */
    .cola-workspace {
      flex:1; display:grid; min-height:0; height:100vh; overflow:hidden;
      grid-template-columns: 1fr;
    }
    .cola-workspace--daniel { grid-template-columns: 1fr 320px; }
    .cola-main {
      display:flex; flex-direction:column; overflow:hidden; min-height:0;
    }
    .cola-content {
      flex:1; overflow-y:auto; padding:0 32px 32px;
    }
    .cola-content::-webkit-scrollbar { width:4px; }
    .cola-content::-webkit-scrollbar-thumb { background:var(--c-border); }
    /* ── FAB Daniel ─────────────────────────────────────────────────────── */
    .daniel-btn {
      display:flex; align-items:center; gap:7px;
      padding:9px 16px; border-radius:22px;
      background:linear-gradient(135deg,#1B3462,#2563eb);
      color:white; border:none; cursor:pointer; font-size:13px; font-weight:500;
      box-shadow:0 4px 14px rgba(27,52,98,.3); transition:all .18s;
    }
    .daniel-btn:hover { transform:translateY(-1px); box-shadow:0 6px 18px rgba(27,52,98,.4); }
    .daniel-btn--on { background:linear-gradient(135deg,#0f1f42,#1B3462); box-shadow:0 2px 8px rgba(27,52,98,.25); }
    /* ── Daniel Panel ──────────────────────────────────────────────────── */
    .top-bar-actions { display:flex; align-items:center; gap:10px; }
    .refresh-txt { font-size:12px; color:var(--c-muted); }



    .daniel-col {
      width:320px; flex-shrink:0; display:flex; flex-direction:column;
      border-left:1px solid var(--c-border); background:var(--c-surface);
      height:calc(100vh - 56px); overflow:hidden;
    }
    .daniel-head {
      display:flex; align-items:center; gap:10px; padding:12px 14px;
      border-bottom:1px solid rgba(255,255,255,.1); flex-shrink:0;
      background:linear-gradient(135deg,#0f1f42,#1B3462);
    }
    .daniel-orb {
      width:30px; height:30px; border-radius:50%; flex-shrink:0;
      background:radial-gradient(circle at 32% 32%,#6ba3ff,#1B3462);
      box-shadow:0 0 10px rgba(79,138,255,.4);
    }
    .daniel-orb--xs { width:20px; height:20px; }
    .daniel-orb--pulse { animation:orb-p 1.5s ease-in-out infinite; }
    @keyframes orb-p { 0%,100%{box-shadow:0 0 8px rgba(79,138,255,.4);}50%{box-shadow:0 0 18px rgba(79,138,255,.8);} }
    .daniel-head-name { font-size:13px; font-weight:700; color:white; display:block; }
    .daniel-head-sub  { font-size:11px; color:rgba(255,255,255,.55); display:block; }
    .daniel-head-close {
      margin-left:auto; background:rgba(255,255,255,.1); border:none;
      color:white; width:24px; height:24px; border-radius:50%;
      cursor:pointer; font-size:12px; transition:background .15s;
    }
    .daniel-head-close:hover { background:rgba(255,255,255,.25); }

    .daniel-msgs {
      flex:1; overflow-y:auto; padding:12px; height:0;
      display:flex; flex-direction:column; gap:10px;
    }
    .daniel-msgs::-webkit-scrollbar { width:3px; }
    .daniel-msgs::-webkit-scrollbar-thumb { background:var(--c-border); }

    .dmsg { display:flex; align-items:flex-end; gap:6px; max-width:92%; }
    .dmsg--daniel { align-self:flex-start; }
    .dmsg--user   { align-self:flex-end; flex-direction:row-reverse; }
    .dbubble {
      padding:8px 12px; border-radius:14px; font-size:12.5px;
      line-height:1.45; white-space:pre-wrap; word-break:break-word;
      animation:bin .18s ease;
    }
    @keyframes bin { from{opacity:0;transform:translateY(4px);}to{opacity:1;transform:translateY(0);} }
    .dbubble--daniel { background:var(--c-bg); border:1px solid var(--c-border); border-bottom-left-radius:3px; }
    .dbubble--user   { background:linear-gradient(135deg,#1B3462,#2563eb); color:white; border-bottom-right-radius:3px; }

    .typing { display:flex; gap:4px; padding:9px 13px; background:var(--c-bg); border:1px solid var(--c-border); border-radius:14px; border-bottom-left-radius:3px; }
    .typing span { width:6px; height:6px; background:var(--c-blue); border-radius:50%; animation:b 1.2s ease-in-out infinite; }
    .typing span:nth-child(2){animation-delay:.2s;} .typing span:nth-child(3){animation-delay:.4s;}
    @keyframes b { 0%,80%,100%{transform:translateY(0);opacity:.4;}40%{transform:translateY(-5px);opacity:1;} }

    .daniel-chips { display:flex; gap:5px; flex-wrap:wrap; padding:8px 12px; border-top:1px solid var(--c-border); flex-shrink:0; }
    .dchip {
      padding:4px 9px; border-radius:20px; font-size:11px;
      border:1px solid var(--c-blue-md); background:var(--c-surface);
      color:var(--c-blue); cursor:pointer; transition:all .15s;
    }
    .dchip:hover { background:var(--c-blue-lt); }
    .daniel-input-row {
      display:flex; align-items:center; gap:8px; padding:10px 12px;
      border-top:1px solid var(--c-border); flex-shrink:0;
    }
    .daniel-input {
      flex:1; border-radius:20px; border:1.5px solid var(--c-border);
      padding:8px 14px; font-size:12.5px; font-family:inherit; background:var(--c-bg);
    }
    .daniel-input:focus { outline:none; border-color:var(--c-blue); }
    .daniel-send {
      width:34px; height:34px; border-radius:50%; background:var(--c-blue);
      color:white; border:none; cursor:pointer; display:flex; align-items:center; justify-content:center; transition:all .15s;
    }
    .daniel-send:disabled { opacity:.4; cursor:not-allowed; }
  `],
})
export class AgenteColaComponent implements OnInit, OnDestroy, AfterViewChecked {
  tickets = signal<TicketListItem[]>([]);
  loading = signal(true);
  filtroEstatus = signal('');
  soloMios = signal(false);
  filtroPrioridad = '';
  filtroSla = '';            // ← NUEVO Sprint 1
  busqueda = '';
  countdown = signal(30);

  private refreshSub?: Subscription;

  counts = computed(() => {
    const ts = this.tickets();
    const userId = this.auth.currentUser()?.id;
    const hoy = new Date().toDateString();
    const activos = ts.filter(t => !['CERRADO', 'RESUELTO', 'CANCELADO'].includes(t.estatus));
    return {
      sin_asignar: ts.filter(t => ['NUEVO', 'ASIGNADO'].includes(t.estatus) && !t.agente_id).length,
      mis_tickets: ts.filter(t => t.agente_id === userId && !['CERRADO', 'RESUELTO', 'CANCELADO'].includes(t.estatus)).length,
      en_proceso: ts.filter(t => ['EN_PROCESO', 'ESPERANDO_AGENTE'].includes(t.estatus)).length,
      confirmar: ts.filter(t => t.estatus === 'ESPERANDO_TIENDA').length,
      // NUEVO Sprint 1: semáforos
      vencidos: activos.filter(t => t.sla_status === 'ROJO').length,
      amarillo: activos.filter(t => t.sla_status === 'AMARILLO').length,
      sin_sla: activos.filter(t => t.sla_status === 'SIN_SLA').length,
      rechazados: ts.filter(t => t.estatus === 'RECHAZADO').length,
      cerrados_hoy: ts.filter(t =>
        ['CERRADO', 'RESUELTO'].includes(t.estatus) &&
        t.fecha_cierre && new Date(t.fecha_cierre).toDateString() === hoy
      ).length,
    };
  });

  ticketsMostrados = computed(() => {
    let ts = [...this.tickets()];
    const f = this.filtroEstatus();
    const userId = this.auth.currentUser()?.id;

    if (f === '__sin_asignar__') {
      ts = ts.filter(t => ['NUEVO', 'ASIGNADO'].includes(t.estatus) && !t.agente_id);
    } else if (f === '__mis_asignados__') {
      ts = ts.filter(t => t.agente_id === userId && !['CERRADO', 'RESUELTO', 'CANCELADO'].includes(t.estatus));
    } else if (f === '__cerrados_hoy__') {
      const hoy = new Date().toDateString();
      ts = ts.filter(t =>
        ['CERRADO', 'RESUELTO'].includes(t.estatus) &&
        !!t.fecha_cierre &&
        new Date(t.fecha_cierre).toDateString() === hoy
      );
    } else if (f === '__vencidos__') {
      ts = ts.filter(t => t.sla_status === 'ROJO' && !['CERRADO', 'RESUELTO', 'CANCELADO'].includes(t.estatus));
    } else if (f === 'EN_PROCESO') {
      ts = ts.filter(t => ['EN_PROCESO', 'ESPERANDO_AGENTE'].includes(t.estatus));
    } else if (f) {
      ts = ts.filter(t => t.estatus === f);
    }

    if (this.soloMios()) ts = ts.filter(t => t.agente_id === userId);
    if (this.filtroPrioridad) ts = ts.filter(t => t.prioridad === this.filtroPrioridad);
    // NUEVO Sprint 1: filtro semáforo SLA
    if (this.filtroSla) ts = ts.filter(t => t.sla_status === this.filtroSla);

    if (this.filtroGrupo) {
      ts = ts.filter(t => (t as any).grupo_nombre === this.filtroGrupo);
    }
    if (this.busqueda.trim()) {
      const q = this.busqueda.trim().toLowerCase();
      ts = ts.filter(t =>
        t.folio.toLowerCase().includes(q) ||
        t.descripcion.toLowerCase().includes(q) ||
        String(t.tienda_id).includes(q) ||
        (t.cat_nivel1 ?? '').toLowerCase().includes(q) ||
        (t.cat_nivel2 ?? '').toLowerCase().includes(q) ||
        (t.cat_nivel3 ?? '').toLowerCase().includes(q) ||
        (t.tipificacion?.area_tecnica ?? '').toLowerCase().includes(q)
      );
    }

    // NUEVO Sprint 1: ordenar por semáforo primero (ROJO > AMARILLO > VERDE/SIN_SLA),
    // luego por prioridad
    const slaOrder: Record<SlaStatus, number> = { ROJO: 0, AMARILLO: 1, VERDE: 2, SIN_SLA: 3 };
    return ts.sort((a, b) => {
      const slaA = slaOrder[a.sla_status] ?? 3;
      const slaB = slaOrder[b.sla_status] ?? 3;
      if (slaA !== slaB) return slaA - slaB;
      return (PRIORIDAD_ORDER[a.prioridad] ?? 9) - (PRIORIDAD_ORDER[b.prioridad] ?? 9);
    });
  });

  grupoNombre = computed(() => {
    const user = this.auth.currentUser();
    return (user as any)?.grupo_nombre ?? (user?.grupo_id ? `Grupo #${user.grupo_id}` : 'Sin grupo');
  });

  statusFilters = [
    { label: 'Todos', value: '', count: (c: any) => 0 },
    { label: 'Sin tomar', value: '__sin_asignar__', count: (c: any) => c.sin_asignar },
    { label: 'En proceso', value: 'EN_PROCESO', count: (c: any) => c.en_proceso },
    { label: 'Esp. tienda', value: 'ESPERANDO_TIENDA', count: (c: any) => c.confirmar },
    { label: '🔴 Vencidos', value: '__vencidos__', count: (c: any) => c.vencidos },
  ];

  constructor(
    private ticketSvc: TicketService,
    public auth: AuthService,
    private http: HttpClient,
    private route: ActivatedRoute,
  ) {
    // Mostrar bienvenida cuando se abre el panel por primera vez
    effect(() => {
      if (this.danielOpen() && this.danielMsgs().length === 0) {
        setTimeout(() => this.danielWelcome(), 0);
      }
    });
  }

  // ── Daniel ────────────────────────────────────────────────────────────────
  @ViewChild('danielRef') private danielRef?: ElementRef<HTMLDivElement>;
  danielOpen = signal(false);
  danielMsgs = signal<DanielMsg[]>([]);
  danielInput = '';
  danielThinking = signal(false);
  private danielNeedsScroll = false;
  private readonly proxyUrl = `${environment.apiUrl}/dany/chat`;

  ngAfterViewChecked() {
    if (this.danielNeedsScroll) {
      this.danielNeedsScroll = false;
      setTimeout(() => {
        const el = this.danielRef?.nativeElement;
        if (el) el.scrollTop = el.scrollHeight;
      }, 50);
    }
  }

  private danielWelcome() {
    const nombre = this.auth.currentUser()?.nombre?.split(' ')[0] ?? '';
    this.danielAddMsg({ from: 'daniel', text: `Hola${nombre ? ` ${nombre}` : ''} 👋 Soy Daniel, parte del equipo CSN. Pregúntame sobre tu cola, prioridades o un ticket específico.` });
  }

  danielSend() {
    const text = this.danielInput.trim();
    if (!text || this.danielThinking()) return;
    this.danielInput = '';
    if (this.danielMsgs().length === 0) this.danielWelcome();
    this.danielAddMsg({ from: 'user', text });
    this.danielThinking.set(true);

    const user = this.auth.currentUser();
    this.http.post<any>(this.proxyUrl, {
      mensaje: text,
      sesion_id: 'agente-' + user?.id,
      usuario_id: user?.id ?? null,
      rol_usuario: user?.rol ?? 'AGENTE',
    }).subscribe({
      next: res => {
        this.danielThinking.set(false);
        this.danielAddMsg({ from: 'daniel', text: res?.respuesta ?? res?.output ?? 'No pude obtener respuesta.' });
      },
      error: () => {
        this.danielThinking.set(false);
        this.danielAddMsg({ from: 'daniel', text: 'No pude conectar en este momento. Intenta de nuevo.' });
      }
    });
  }

  danielQuick(text: string) {
    if (this.danielMsgs().length === 0) this.danielWelcome();
    this.danielInput = text;
    this.danielSend();
  }

  private danielAddMsg(p: Omit<DanielMsg, 'id' | 'time'>) {
    this.danielMsgs.update(m => [...m, { id: Math.random().toString(36).slice(2), time: new Date(), ...p }]);
    this.danielNeedsScroll = true;
    setTimeout(() => {
      const el = this.danielRef?.nativeElement;
      if (el) el.scrollTop = el.scrollHeight;
    }, 50);
  }

  ngOnInit() {
    this.load();
    this.initFromQueryParams();
    this.refreshSub = interval(1000).subscribe(() => {
      const c = this.countdown() - 1;
      if (c <= 0) { this.load(); this.countdown.set(30); }
      else this.countdown.set(c);
    });
  }

  ngOnDestroy() { this.refreshSub?.unsubscribe(); }

  filtroGrupo = '';

  initFromQueryParams() {
    this.route.queryParams.subscribe((params: Record<string, string>) => {
      if (params['f']) this.filtroEstatus.set(params['f']);
      if (params['sla']) { this.filtroSla = params['sla']; this.applyFilters(); }
      if (params['p']) { this.filtroPrioridad = params['p']; this.applyFilters(); }
      if (params['grupo']) { this.filtroGrupo = params['grupo']; }
    });
  }

  toggleFiltroEstatus(valor: string) {
    this.filtroEstatus.set(this.filtroEstatus() === valor ? '' : valor);
    this.filtroSla = '';
  }

  toggleFiltroSla(valor: string) {
    this.filtroSla = this.filtroSla === valor ? '' : valor;
    this.filtroEstatus.set('');
    this.applyFilters();
  }

  clearFilters() {
    this.filtroEstatus.set('');
    this.filtroSla = '';
    this.filtroPrioridad = '';
    this.applyFilters();
  }

  load() {
    this.loading.set(true);
    const user = this.auth.currentUser();
    const areaFilter = user?.rol === 'ADMIN_AREA' && user?.area_restriccion
      ? { area: user.area_restriccion, limit: 200 } : { limit: 200 };
    this.ticketSvc.list(areaFilter).subscribe({
      next: ts => { this.tickets.set(ts); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  applyFilters() { /* reactive via computed signals */ }

  // NUEVO Sprint 1: color del semáforo
  slaColor(status: SlaStatus): string {
    return slaStatusColor(status);
  }

  // NUEVO Sprint 1: emoji de origen
  origenEmoji(origen: string): string {
    return origenIcon(origen as any);
  }
}