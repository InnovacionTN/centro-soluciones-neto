import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminService, TipAdmin } from '../../core/services/admin.service';

@Component({
  selector: 'app-admin-tipificaciones',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="tip-page">

      <!-- ── Header ── -->
      <div class="page-header">
        <div class="header-left">
          <div class="title-row">
            <h2 class="page-title">Tipificaciones</h2>
            <button class="tip-btn tip-btn--down"
              data-tooltip="Las Tipificaciones definen cada tipo de problema que puede reportar una tienda. Determinan el área responsable, el SLA de atención y la urgencia base del ticket.">?</button>
            <span class="total-chip">{{ tipificaciones().length }} total · {{ tipFiltradas().length }} visibles</span>
          </div>
          <div class="filter-row">
            <div class="filter-pills">
              <button class="pill" [class.pill--active]="filtroArea() === ''" (click)="filtroArea.set('')">
                Todas <span class="pill-count">{{ tipificaciones().length }}</span>
              </button>
              @for (a of areas; track a) {
                <button class="pill" [class.pill--active]="filtroArea() === a" (click)="filtroArea.set(a)">
                  <span class="pill-dot" [class]="dotClass(a)"></span>{{ a }}
                  <span class="pill-count">{{ contarArea(a) }}</span>
                </button>
              }
            </div>
            <div class="toggle-group">
              <button class="toggle-btn" [class.toggle-btn--active]="filtroActivo() === null" (click)="filtroActivo.set(null)">Todas</button>
              <button class="toggle-btn" [class.toggle-btn--active]="filtroActivo() === true"  (click)="filtroActivo.set(true)">Activas</button>
              <button class="toggle-btn" [class.toggle-btn--active]="filtroActivo() === false" (click)="filtroActivo.set(false)">Inactivas</button>
            </div>
          </div>
        </div>
        <button class="btn-primary" (click)="openModal()">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Nueva tipificación
        </button>
      </div>

      <!-- ── Skeleton ── -->
      @if (loading()) {
        <div class="skeleton-list">
          @for (i of [1,2,3]; track i) {
            <div class="skeleton-card">
              <div class="sk sk--icon"></div>
              <div class="sk-content">
                <div class="sk sk--title"></div>
                <div class="sk sk--sub"></div>
              </div>
            </div>
          }
        </div>

      } @else if (areasConTips().length === 0) {
        <div class="empty-state">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/>
          </svg>
          <p>No hay tipificaciones con los filtros seleccionados</p>
        </div>

      } @else {
        <div class="sections-list">
          @for (area of areasConTips(); track area) {
            <div class="area-section" [class.area-section--open]="isAreaOpen(area)">

              <!-- Cabecera de área -->
              <div class="area-head" (click)="toggleArea(area)">
                <div class="area-icon" [class]="iconClass(area)">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                  </svg>
                </div>
                <div class="area-info">
                  <span class="area-nombre">{{ area }}</span>
                  <span class="area-meta">{{ tipsDe(area).length }} tipificación{{ tipsDe(area).length !== 1 ? 'es' : '' }}</span>
                </div>
                <div class="area-badges">
                  @for (urg of urgenciasEnArea(area); track urg.label) {
                    <span class="urg-mini" [class]="urg.cls">{{ urg.count }} {{ urg.label }}</span>
                  }
                </div>
                <svg class="chevron" [class.chevron--open]="isAreaOpen(area)"
                     width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
              </div>

              <!-- Tabla de tipificaciones -->
              @if (isAreaOpen(area)) {
                <div class="area-body">
                  <div class="tip-table-head">
                    <span>Categoría</span>
                    <span>Problema</span>
                    <span>SLA</span>
                    <span>Urgencia</span>
                    <span>Flags</span>
                    <span>Estado</span>
                    <span></span>
                  </div>
                  @for (t of tipsDe(area); track t.id) {
                    <div class="tip-row" [class.tip-row--inactive]="!t.activo">
                      <span class="cat-cell">{{ t.categoria }}</span>
                      <span class="prob-cell">
                        <span class="prob-name">{{ t.problema }}</span>
                        @if (t.palabras_clave) {
                          <span class="kw-cell">{{ t.palabras_clave }}</span>
                        }
                      </span>
                      <span>
                        <span class="sla-pill">{{ t.sla_horas }}h</span>
                      </span>
                      <span>
                        <span class="urg-badge" [class]="urgClass(t.urgencia)">{{ t.urgencia }}</span>
                      </span>
                      <span class="flags-cell">
                        @if (t.requiere_foto) {
                          <span class="flag-icon" title="Requiere foto">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
                          </span>
                        }
                      </span>
                      <span>
                        <span class="estado-dot" [class.estado-dot--on]="t.activo" [title]="t.activo ? 'Activa' : 'Inactiva'"></span>
                      </span>
                      <span class="row-actions">
                        <button class="icon-btn" title="Editar" (click)="openModal(t)">
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        </button>
                        <button class="icon-btn" [class.icon-btn--danger]="t.activo" [title]="t.activo ? 'Desactivar' : 'Activar'" (click)="toggleActivo(t)">
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                            @if (t.activo) {
                              <path d="M18.36 6.64a9 9 0 1 1-12.73 0"/><line x1="12" y1="2" x2="12" y2="12"/>
                            } @else {
                              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                            }
                          </svg>
                        </button>
                      </span>
                    </div>
                  }
                </div>
              }
            </div>
          }
        </div>
      }
    </div>

    <!-- ── Modal ── -->
    @if (showModal()) {
      <div class="modal-backdrop" (click)="closeModal()">
        <div class="modal" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <div>
              <h3 class="modal-title">{{ editId() ? 'Editar tipificación' : 'Nueva tipificación' }}</h3>
              <p class="modal-sub">{{ editId() ? 'Actualiza los parámetros de clasificación' : 'Define cómo se clasifica y atiende este tipo de problema' }}</p>
            </div>
            <button class="modal-close" (click)="closeModal()">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <div class="modal-body">

            <div class="fields-2col">
              <div class="field">
                <div class="field-lbl-row">
                  <label class="field-lbl">Área técnica <span class="req">*</span></label>
                  <button class="tip-btn tip-btn--xs" data-tooltip="Define qué dirección atiende este tipo de problema y qué grupos pueden recibirlo.">?</button>
                </div>
                <select class="field-inp" [(ngModel)]="form.area_tecnica">
                  <option value="">Selecciona...</option>
                  @for (a of areas; track a) { <option [value]="a">{{ a }}</option> }
                </select>
              </div>
              <div class="field">
                <div class="field-lbl-row">
                  <label class="field-lbl">Categoría <span class="req">*</span></label>
                  <button class="tip-btn tip-btn--xs" data-tooltip="Agrupa problemas del mismo tipo. Ej: 'Conectividad', 'Hardware', 'Refrigeración'.">?</button>
                </div>
                <input class="field-inp" [(ngModel)]="form.categoria" placeholder="Ej: Conectividad" />
              </div>
            </div>

            <div class="field">
              <div class="field-lbl-row">
                <label class="field-lbl">Nombre del problema <span class="req">*</span></label>
                <button class="tip-btn tip-btn--xs" data-tooltip="Descripción específica del fallo. Debe ser clara para los agentes y las tiendas. Ej: 'Sin internet o antena sin señal'.">?</button>
              </div>
              <input class="field-inp" [(ngModel)]="form.problema" placeholder="Ej: Sin internet o antena sin señal" />
            </div>

            <div class="fields-2col">
              <div class="field">
                <div class="field-lbl-row">
                  <label class="field-lbl">SLA (horas) <span class="req">*</span></label>
                  <button class="tip-btn tip-btn--xs" data-tooltip="Tiempo máximo de resolución comprometido. El sistema alertará cuando se acerque o supere este límite.">?</button>
                </div>
                <input class="field-inp" type="number" [(ngModel)]="form.sla_horas" min="1" />
              </div>
              <div class="field">
                <div class="field-lbl-row">
                  <label class="field-lbl">Urgencia base <span class="req">*</span></label>
                  <button class="tip-btn tip-btn--xs" data-tooltip="Prioridad inicial del ticket. El agente puede escalarla. CRÍTICA = impacta operación de la tienda.">?</button>
                </div>
                <select class="field-inp" [(ngModel)]="form.urgencia">
                  <option value="CRITICA">🔴 Crítica — Impacto inmediato en operación</option>
                  <option value="ALTA">🟠 Alta — Afecta funciones importantes</option>
                  <option value="MEDIA">🔵 Media — Operación parcialmente afectada</option>
                  <option value="BAJA">⚪ Baja — Sin impacto operativo inmediato</option>
                </select>
              </div>
            </div>

            <div class="field">
              <div class="field-lbl-row">
                <label class="field-lbl">Palabras clave</label>
                <button class="tip-btn tip-btn--xs" data-tooltip="Palabras que usa el sistema de clasificación automática (Dany) cuando no puede determinar el tipo por contexto. Separadas por espacio.">?</button>
              </div>
              <input class="field-inp" [(ngModel)]="form.palabras_clave" placeholder="internet antena red wifi señal" />
              <span class="field-hint">Separadas por espacio. Usa el idioma que la tienda emplearía al reportar.</span>
            </div>

            <div class="field-check">
              <label class="check-label">
                <input type="checkbox" class="check-inp" [(ngModel)]="form.requiere_foto" />
                <span class="check-box"></span>
                <span class="check-text">
                  Requiere foto de evidencia
                  <span class="check-hint">El agente deberá solicitar al reportante una foto del problema</span>
                </span>
              </label>
            </div>

            @if (formError()) {
              <div class="form-err">{{ formError() }}</div>
            }
          </div>
          <div class="modal-footer">
            <button class="btn-ghost" (click)="closeModal()">Cancelar</button>
            <button class="btn-primary" [disabled]="saving()" (click)="save()">
              @if (saving()) { <span class="spinner"></span> } @else { {{ editId() ? 'Guardar cambios' : 'Crear tipificación' }} }
            </button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    /* ── Layout ── */
    .tip-page { display: flex; flex-direction: column; gap: 20px; }

    /* ── Header ── */
    .page-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
    .header-left { display: flex; flex-direction: column; gap: 10px; }
    .title-row { display: flex; align-items: center; gap: 8px; }
    .page-title { font-size: 20px; font-weight: 700; color: var(--c-text); margin: 0; }
    .total-chip {
      font-size: 12px; color: var(--c-muted);
      background: var(--c-bg); border: 1px solid var(--c-border);
      border-radius: 20px; padding: 3px 10px;
    }

    /* ── Tooltip ── */
    .tip-btn {
      width: 18px; height: 18px; border-radius: 50%;
      border: 1.5px solid var(--c-border); background: var(--c-bg);
      color: var(--c-muted); font-size: 10px; font-weight: 700;
      cursor: pointer; display: inline-flex; align-items: center; justify-content: center;
      position: relative; flex-shrink: 0;
      transition: border-color .15s, color .15s, background .15s;
    }
    .tip-btn:hover { border-color: var(--c-blue); color: var(--c-blue); background: var(--c-blue-lt); }
    .tip-btn--xs { width: 15px; height: 15px; font-size: 9px; }
    .tip-btn::after {
      content: attr(data-tooltip);
      position: absolute;
      background: #1a2c42; color: #dde8f4;
      padding: 9px 13px; border-radius: 9px;
      font-size: 12px; font-weight: 400; line-height: 1.55;
      white-space: pre-wrap; text-align: left;
      box-shadow: 0 6px 24px rgba(0,0,0,.3);
      opacity: 0; pointer-events: none;
      transition: opacity .15s; z-index: 9999;
      bottom: calc(100% + 8px); left: 50%; transform: translateX(-50%);
      width: 260px;
    }
    .tip-btn--xs::after {
      bottom: auto; left: calc(100% + 8px);
      top: 50%; transform: translateY(-50%); width: 220px;
    }
    .tip-btn--down::after {
      bottom: auto; top: calc(100% + 8px); left: 0; transform: none; width: 280px;
    }
    .tip-btn:hover::after { opacity: 1; }

    /* ── Filters ── */
    .filter-row { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
    .filter-pills { display: flex; gap: 6px; flex-wrap: wrap; }
    .pill {
      display: flex; align-items: center; gap: 5px;
      padding: 5px 12px; border-radius: 20px; font-size: 12px; font-weight: 500;
      border: 1px solid var(--c-border); background: var(--c-surface);
      color: var(--c-muted); cursor: pointer; transition: all .15s;
    }
    .pill:hover { border-color: var(--c-blue-md); color: var(--c-blue); }
    .pill--active { background: var(--c-blue-lt); border-color: var(--c-blue-md); color: var(--c-blue); font-weight: 600; }
    .pill-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
    .dot--sistemas { background: var(--c-blue); }
    .dot--abasto   { background: var(--c-green); }
    .dot--mant     { background: var(--c-amber); }
    .dot--finanzas { background: var(--c-teal); }
    .dot--default  { background: var(--c-purple); }
    .pill-count {
      font-size: 10px; font-weight: 700; padding: 0 5px; border-radius: 8px;
      background: var(--c-border); color: var(--c-muted); min-width: 18px; text-align: center;
    }
    .pill--active .pill-count { background: var(--c-blue-md); color: white; }

    .toggle-group { display: flex; border: 1px solid var(--c-border); border-radius: 8px; overflow: hidden; }
    .toggle-btn {
      padding: 5px 13px; font-size: 12px; font-weight: 500;
      background: var(--c-surface); color: var(--c-muted); border: none;
      cursor: pointer; transition: all .15s;
      border-right: 1px solid var(--c-border);
    }
    .toggle-btn:last-child { border-right: none; }
    .toggle-btn:hover { background: var(--c-bg); color: var(--c-text); }
    .toggle-btn--active { background: var(--c-blue-lt); color: var(--c-blue); font-weight: 600; }

    /* ── Buttons ── */
    .btn-primary {
      display: flex; align-items: center; gap: 7px;
      padding: 9px 18px; border-radius: 8px; font-size: 13px; font-weight: 600;
      background: var(--c-blue); color: white; border: none; cursor: pointer;
      transition: all .15s; box-shadow: 0 2px 8px rgba(14,59,131,.25); white-space: nowrap;
    }
    .btn-primary:hover { background: #0c3270; transform: translateY(-1px); box-shadow: 0 4px 12px rgba(14,59,131,.35); }
    .btn-primary:disabled { opacity: .6; cursor: not-allowed; transform: none; }
    .btn-ghost {
      padding: 9px 18px; border-radius: 8px; font-size: 13px; font-weight: 500;
      background: transparent; color: var(--c-muted); border: 1px solid var(--c-border);
      cursor: pointer; transition: all .15s;
    }
    .btn-ghost:hover { background: var(--c-bg); color: var(--c-text); }
    .icon-btn {
      width: 28px; height: 28px; border-radius: 6px;
      display: flex; align-items: center; justify-content: center;
      background: transparent; border: 1px solid var(--c-border);
      color: var(--c-muted); cursor: pointer; transition: all .15s;
    }
    .icon-btn:hover { background: var(--c-bg); color: var(--c-text); border-color: var(--c-border-md); }
    .icon-btn--danger:hover { background: var(--c-red-lt); color: var(--c-red); border-color: var(--c-red-md); }

    /* ── Skeleton ── */
    .skeleton-list { display: flex; flex-direction: column; gap: 10px; }
    .skeleton-card {
      background: var(--c-surface); border: 1px solid var(--c-border);
      border-radius: 12px; padding: 18px 20px;
      display: flex; align-items: center; gap: 14px;
    }
    .sk-content { flex: 1; display: flex; flex-direction: column; gap: 8px; }
    .sk {
      border-radius: 6px;
      background: linear-gradient(90deg, var(--c-border) 25%, var(--c-subtle) 50%, var(--c-border) 75%);
      background-size: 200% 100%; animation: shimmer 1.4s infinite;
    }
    .sk--icon  { width: 36px; height: 36px; border-radius: 9px; flex-shrink: 0; }
    .sk--title { height: 14px; width: 40%; }
    .sk--sub   { height: 11px; width: 20%; }
    @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }

    /* ── Empty ── */
    .empty-state {
      display: flex; flex-direction: column; align-items: center; gap: 10px;
      padding: 48px 20px; color: var(--c-muted); text-align: center;
    }
    .empty-state svg { opacity: .35; }
    .empty-state p { font-size: 14px; margin: 0; }

    /* ── Area sections ── */
    .sections-list { display: flex; flex-direction: column; gap: 10px; }
    .area-section {
      background: var(--c-surface); border: 1px solid var(--c-border);
      border-radius: 12px; transition: box-shadow .2s, border-color .2s;
    }
    .area-section:hover { box-shadow: 0 4px 20px rgba(0,0,0,.06); }
    .area-section--open { border-color: var(--c-blue-md); box-shadow: 0 4px 20px rgba(14,59,131,.07); }

    .area-head {
      display: flex; align-items: center; gap: 12px;
      padding: 14px 18px; cursor: pointer; user-select: none;
      transition: background .15s; border-radius: 12px;
    }
    .area-section--open .area-head { border-radius: 12px 12px 0 0; }
    .area-head:hover { background: var(--c-bg); }

    .area-icon {
      width: 36px; height: 36px; border-radius: 9px; flex-shrink: 0;
      display: flex; align-items: center; justify-content: center;
    }
    .icon--sistemas { background: var(--c-blue-lt);   color: var(--c-blue); }
    .icon--abasto   { background: var(--c-green-lt);  color: var(--c-green); }
    .icon--mant     { background: var(--c-amber-lt);  color: var(--c-amber); }
    .icon--finanzas { background: var(--c-teal-lt);   color: var(--c-teal); }
    .icon--default  { background: var(--c-purple-lt); color: var(--c-purple); }

    .area-info { flex: 1; min-width: 0; }
    .area-nombre { font-size: 14px; font-weight: 700; color: var(--c-text); display: block; }
    .area-meta   { font-size: 12px; color: var(--c-muted); }

    .area-badges { display: flex; gap: 5px; flex-wrap: wrap; }
    .urg-mini {
      font-size: 10px; font-weight: 700; padding: 2px 7px; border-radius: 8px;
      text-transform: uppercase; letter-spacing: .04em;
    }
    .urg-mini--crit { background: var(--c-red-lt);    color: var(--c-red); }
    .urg-mini--alta { background: var(--c-amber-lt);  color: var(--c-amber); }
    .urg-mini--med  { background: var(--c-blue-lt);   color: var(--c-blue); }
    .urg-mini--baja { background: var(--c-border);    color: var(--c-muted); }

    .chevron { color: var(--c-muted); transition: transform .25s cubic-bezier(.4,0,.2,1); flex-shrink: 0; }
    .chevron--open { transform: rotate(180deg); color: var(--c-blue); }

    /* ── Tabla interna ── */
    .area-body {
      border-top: 1px solid var(--c-border);
      background: var(--c-bg);
      border-radius: 0 0 12px 12px;
      animation: body-in .18s ease;
      overflow: hidden;
    }
    @keyframes body-in { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }

    .tip-table-head {
      display: grid;
      grid-template-columns: 130px 1fr 55px 90px 36px 54px 72px;
      gap: 8px; padding: 8px 18px;
      font-size: 10px; font-weight: 700; color: var(--c-muted);
      text-transform: uppercase; letter-spacing: .06em;
      border-bottom: 1px solid var(--c-border);
    }
    .tip-row {
      display: grid;
      grid-template-columns: 130px 1fr 55px 90px 36px 54px 72px;
      gap: 8px; align-items: center;
      padding: 10px 18px;
      border-bottom: 1px solid var(--c-border);
      font-size: 13px; transition: background .12s;
    }
    .tip-row:last-child { border-bottom: none; }
    .tip-row:hover { background: var(--c-surface); }
    .tip-row--inactive { opacity: .5; }

    .cat-cell { font-size: 12px; font-weight: 600; color: var(--c-text); }
    .prob-cell { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
    .prob-name { font-size: 13px; font-weight: 500; color: var(--c-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .kw-cell   { font-size: 11px; color: var(--c-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-style: italic; }

    .sla-pill {
      display: inline-block; padding: 2px 8px; border-radius: 8px;
      font-size: 11px; font-weight: 700;
      background: var(--c-blue-lt); color: var(--c-blue);
    }

    .urg-badge {
      display: inline-block; padding: 2px 8px; border-radius: 8px;
      font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .03em;
    }
    .urg--critica { background: var(--c-red-lt);    color: var(--c-red); }
    .urg--alta    { background: var(--c-amber-lt);  color: var(--c-amber); }
    .urg--media   { background: var(--c-blue-lt);   color: var(--c-blue); }
    .urg--baja    { background: var(--c-border);    color: var(--c-muted); }

    .flags-cell { display: flex; gap: 4px; }
    .flag-icon {
      width: 24px; height: 24px; border-radius: 6px;
      display: flex; align-items: center; justify-content: center;
      background: var(--c-amber-lt); color: var(--c-amber);
    }

    .estado-dot {
      width: 10px; height: 10px; border-radius: 50%; display: inline-block;
      background: var(--c-border);
    }
    .estado-dot--on { background: var(--c-green); box-shadow: 0 0 0 3px var(--c-green-lt); }

    .row-actions { display: flex; gap: 5px; opacity: 0; transition: opacity .15s; }
    .tip-row:hover .row-actions { opacity: 1; }

    /* ── Modal ── */
    .modal-backdrop {
      position: fixed; inset: 0; z-index: 1000;
      background: rgba(6,20,27,.45); backdrop-filter: blur(3px);
      display: flex; align-items: center; justify-content: center;
      padding: 20px; animation: bd-in .15s ease;
    }
    @keyframes bd-in { from { opacity: 0; } to { opacity: 1; } }
    .modal {
      background: var(--c-surface); border-radius: 16px;
      box-shadow: 0 24px 64px rgba(0,0,0,.22);
      width: 100%; max-width: 560px; max-height: 90vh; overflow-y: auto;
      animation: modal-in .2s cubic-bezier(.34,1.56,.64,1);
    }
    @keyframes modal-in { from { opacity: 0; transform: scale(.92) translateY(8px); } to { opacity: 1; transform: none; } }
    .modal-header {
      display: flex; align-items: flex-start; justify-content: space-between;
      padding: 20px 24px 16px; border-bottom: 1px solid var(--c-border);
      position: sticky; top: 0; background: var(--c-surface); z-index: 1;
    }
    .modal-title { font-size: 16px; font-weight: 700; color: var(--c-text); margin: 0; }
    .modal-sub   { font-size: 12px; color: var(--c-muted); margin: 3px 0 0; }
    .modal-close {
      width: 30px; height: 30px; border-radius: 8px; border: none;
      background: transparent; color: var(--c-muted); cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      transition: background .15s, color .15s; flex-shrink: 0;
    }
    .modal-close:hover { background: var(--c-red-lt); color: var(--c-red); }
    .modal-body { padding: 20px 24px; display: flex; flex-direction: column; gap: 14px; }
    .modal-footer {
      display: flex; justify-content: flex-end; gap: 10px;
      padding: 16px 24px 20px; border-top: 1px solid var(--c-border);
      position: sticky; bottom: 0; background: var(--c-surface);
    }

    /* ── Form fields ── */
    .field { display: flex; flex-direction: column; gap: 5px; }
    .fields-2col { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .field-lbl-row { display: flex; align-items: center; gap: 5px; }
    .field-lbl { font-size: 12px; font-weight: 600; color: var(--c-text); }
    .req { color: var(--c-red); }
    .field-inp {
      padding: 9px 12px; border-radius: 8px; font-size: 13px;
      border: 1.5px solid var(--c-border); background: var(--c-bg);
      color: var(--c-text); transition: border-color .15s, box-shadow .15s; width: 100%;
    }
    .field-inp:focus { outline: none; border-color: var(--c-blue); box-shadow: 0 0 0 3px rgba(14,59,131,.12); }
    .field-hint { font-size: 11px; color: var(--c-muted); margin-top: 2px; }
    .form-err {
      padding: 10px 14px; border-radius: 8px;
      background: var(--c-red-lt); color: var(--c-red);
      font-size: 13px; border: 1px solid var(--c-red-md);
    }

    /* Checkbox custom */
    .field-check { padding: 2px 0; }
    .check-label { display: flex; align-items: flex-start; gap: 10px; cursor: pointer; }
    .check-inp { display: none; }
    .check-box {
      width: 18px; height: 18px; border-radius: 5px; flex-shrink: 0; margin-top: 1px;
      border: 2px solid var(--c-border); background: var(--c-bg);
      transition: all .15s; position: relative;
    }
    .check-inp:checked + .check-box {
      background: var(--c-blue); border-color: var(--c-blue);
    }
    .check-inp:checked + .check-box::after {
      content: ''; position: absolute;
      left: 4px; top: 1px; width: 5px; height: 9px;
      border: 2px solid white; border-top: none; border-left: none;
      transform: rotate(45deg);
    }
    .check-text { font-size: 13px; color: var(--c-text); font-weight: 500; }
    .check-hint { display: block; font-size: 11px; color: var(--c-muted); font-weight: 400; margin-top: 2px; }

    .spinner {
      width: 14px; height: 14px; border-radius: 50%;
      border: 2px solid rgba(255,255,255,.3); border-top-color: white;
      animation: spin .6s linear infinite; display: inline-block;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
  `],
})
export class AdminTipificacionesComponent implements OnInit {
  tipificaciones = signal<TipAdmin[]>([]);
  loading   = signal(true);
  showModal = signal(false);
  saving    = signal(false);
  formError = signal('');
  editId    = signal<number | null>(null);
  filtroArea   = signal('');
  filtroActivo = signal<boolean | null>(null);
  openAreas    = signal<Set<string>>(new Set());

  areas = ['SISTEMAS', 'ABASTO', 'MANTENIMIENTO', 'FINANZAS', 'COMERCIAL', 'RRHH', 'OPERACIONES'];
  form  = this.emptyForm();

  tipFiltradas = computed(() => {
    let list = this.tipificaciones();
    const area   = this.filtroArea();
    const activo = this.filtroActivo();
    if (area) list = list.filter(t => t.area_tecnica === area);
    if (activo !== null) list = list.filter(t => t.activo === activo);
    return list;
  });

  areasConTips = computed(() =>
    [...new Set(this.tipFiltradas().map(t => t.area_tecnica))].sort()
  );

  tipsDe(area: string): TipAdmin[] {
    return this.tipFiltradas().filter(t => t.area_tecnica === area);
  }

  contarArea(area: string) { return this.tipificaciones().filter(t => t.area_tecnica === area).length; }

  isAreaOpen(area: string) { return this.openAreas().has(area); }
  toggleArea(area: string) {
    this.openAreas.update(s => { const n = new Set(s); n.has(area) ? n.delete(area) : n.add(area); return n; });
  }

  urgenciasEnArea(area: string) {
    const tips = this.tipsDe(area);
    const result = [];
    const crit = tips.filter(t => t.urgencia === 'CRITICA').length;
    const alta = tips.filter(t => t.urgencia === 'ALTA').length;
    if (crit) result.push({ label: 'Crítica', count: crit, cls: 'urg-mini urg-mini--crit' });
    if (alta) result.push({ label: 'Alta',    count: alta, cls: 'urg-mini urg-mini--alta' });
    return result;
  }

  iconClass(area: string) {
    const m: Record<string,string> = { SISTEMAS:'area-icon icon--sistemas', ABASTO:'area-icon icon--abasto', MANTENIMIENTO:'area-icon icon--mant', FINANZAS:'area-icon icon--finanzas' };
    return m[area] ?? 'area-icon icon--default';
  }

  dotClass(area: string) {
    const m: Record<string,string> = { SISTEMAS:'dot--sistemas', ABASTO:'dot--abasto', MANTENIMIENTO:'dot--mant', FINANZAS:'dot--finanzas' };
    return 'pill-dot ' + (m[area] ?? 'dot--default');
  }

  urgClass(u: string) {
    return 'urg-badge ' + ({ CRITICA:'urg--critica', ALTA:'urg--alta', MEDIA:'urg--media', BAJA:'urg--baja' }[u] ?? 'urg--baja');
  }

  constructor(private admin: AdminService) {}
  ngOnInit() { this.load(); }

  load() {
    this.loading.set(true);
    this.admin.getTipificaciones().subscribe({
      next: ts => {
        this.tipificaciones.set(ts);
        this.loading.set(false);
        // Abrir la primera área por defecto
        if (ts.length > 0) {
          const primera = ts[0].area_tecnica;
          this.openAreas.set(new Set([primera]));
        }
      },
      error: () => this.loading.set(false),
    });
  }

  emptyForm() {
    return { area_tecnica: '', categoria: '', problema: '', sla_horas: 24, urgencia: 'MEDIA', palabras_clave: '', requiere_foto: false };
  }

  openModal(t?: TipAdmin) {
    this.form = t
      ? { area_tecnica: t.area_tecnica, categoria: t.categoria, problema: t.problema, sla_horas: t.sla_horas, urgencia: t.urgencia, palabras_clave: t.palabras_clave ?? '', requiere_foto: t.requiere_foto }
      : this.emptyForm();
    this.editId.set(t?.id ?? null);
    this.formError.set('');
    this.showModal.set(true);
  }
  closeModal() { this.showModal.set(false); }

  save() {
    if (!this.form.area_tecnica || !this.form.categoria || !this.form.problema) {
      this.formError.set('Área, categoría y nombre del problema son obligatorios');
      return;
    }
    this.saving.set(true);
    const req = this.editId()
      ? this.admin.updateTipificacion(this.editId()!, this.form)
      : this.admin.createTipificacion(this.form);
    req.subscribe({
      next: t => {
        if (this.editId()) {
          this.tipificaciones.update(list => list.map(x => x.id === t.id ? t : x));
        } else {
          this.tipificaciones.update(list => [...list, t]);
          // Abrir el área del nuevo item
          this.openAreas.update(s => new Set([...s, t.area_tecnica]));
        }
        this.saving.set(false);
        this.closeModal();
      },
      error: err => { this.saving.set(false); this.formError.set(err.error?.detail ?? 'Error al guardar'); },
    });
  }

  toggleActivo(t: TipAdmin) {
    this.admin.updateTipificacion(t.id, { activo: !t.activo }).subscribe({
      next: updated => this.tipificaciones.update(list => list.map(x => x.id === updated.id ? updated : x)),
    });
  }
}
