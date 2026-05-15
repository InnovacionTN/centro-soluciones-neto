import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminService, ReglaRuteo, TipAdmin } from '../../core/services/admin.service';

@Component({
  selector: 'app-admin-ruteo',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="rut-page">

      <!-- ── Header ── -->
      <div class="page-header">
        <div class="header-left">
          <div class="title-row">
            <h2 class="page-title">Ruteo</h2>
            <button class="tip-btn tip-btn--down"
              data-tooltip="La Matriz de Ruteo define qué grupo del Call Center atiende cada tipo de problema. Cuando llega un ticket, el sistema busca la regla con mayor prioridad (número más bajo) que coincida con la tipificación y zona de la tienda.">?</button>
            <span class="total-chip">{{ reglas().length }} reglas · {{ areasConReglas().length }} áreas</span>
          </div>
          <div class="filter-row">
            <div class="filter-pills">
              <button class="pill" [class.pill--active]="filtroArea() === ''" (click)="filtroArea.set('')">
                Todas <span class="pill-count">{{ reglas().length }}</span>
              </button>
              @for (a of areasDisponibles; track a) {
                @if (contarArea(a) > 0) {
                  <button class="pill" [class.pill--active]="filtroArea() === a" (click)="filtroArea.set(a)">
                    <span [class]="dotClass(a)"></span>{{ a }}
                    <span class="pill-count">{{ contarArea(a) }}</span>
                  </button>
                }
              }
            </div>
          </div>
        </div>
        <button class="btn-primary" (click)="openModal()">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Nueva regla
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

      } @else if (areasConReglas().length === 0) {
        <div class="empty-state">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
          </svg>
          <p>No hay reglas de ruteo configuradas</p>
          <button class="btn-primary" style="margin-top:12px" (click)="openModal()">Crear primera regla</button>
        </div>

      } @else {
        <div class="sections-list">
          @for (area of areasConReglas(); track area) {
            <div class="area-section" [class.area-section--open]="isAreaOpen(area)">

              <!-- Cabecera de área -->
              <div class="area-head" (click)="toggleArea(area)">
                <div [class]="iconClass(area)">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round">
                    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
                  </svg>
                </div>
                <span class="area-name">{{ area }}</span>
                <span class="area-count">{{ reglasDe(area).length }} reglas</span>
                <div class="area-badges">
                  @for (g of gruposEnArea(area); track g.nombre) {
                    <span class="grupo-mini">{{ g.nombre }}</span>
                  }
                </div>
                <svg class="area-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
              </div>

              <!-- Tabla de reglas -->
              @if (isAreaOpen(area)) {
                <div class="area-body">
                  <div class="reglas-table">
                    <div class="rt-head">
                      <span>Problema</span>
                      <span>Grupo destino</span>
                      <span>Zona</span>
                      <span class="col-center">Prioridad</span>
                      <span></span>
                    </div>
                    @for (r of reglasDe(area); track r.id) {
                      <div class="rt-row" [class.rt-row--deleting]="deletingId() === r.id">
                        <div class="rt-cell">
                          <span class="problema-text">{{ r.tipificacion?.problema ?? '—' }}</span>
                          @if (r.tipificacion?.categoria) {
                            <span class="cat-tag">{{ r.tipificacion!.categoria }}</span>
                          }
                        </div>
                        <div class="rt-cell">
                          <span class="grupo-tag">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                            {{ r.grupo?.nombre ?? '#' + r.grupo_id }}
                          </span>
                        </div>
                        <div class="rt-cell">
                          <span class="zona-text">{{ r.zona_id ? 'Zona #' + r.zona_id : 'Todas las zonas' }}</span>
                        </div>
                        <div class="rt-cell col-center">
                          <span [class]="prioBadge(r.prioridad)">{{ r.prioridad }}</span>
                        </div>
                        <div class="rt-cell rt-actions">
                          @if (deletingId() === r.id) {
                            <span class="confirm-text">¿Eliminar?</span>
                            <button class="act-btn act-btn--danger" (click)="confirmDelete(r)">Sí</button>
                            <button class="act-btn" (click)="deletingId.set(0)">No</button>
                          } @else {
                            <button class="act-btn act-btn--ghost" (click)="deletingId.set(r.id)">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                              Eliminar
                            </button>
                          }
                        </div>
                      </div>
                    }
                  </div>
                </div>
              }
            </div>
          }
        </div>
      }

      <!-- ── Modal ── -->
      @if (showModal()) {
        <div class="modal-backdrop" (click)="closeModal()">
          <div class="modal-box" (click)="$event.stopPropagation()">
            <div class="modal-header">
              <h3 class="modal-title">Nueva regla de ruteo</h3>
              <button class="modal-close" (click)="closeModal()">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div class="modal-body">

              <div class="mfield">
                <label class="mfield-label">
                  Tipificación
                  <button class="tip-btn tip-btn--xs"
                    data-tooltip="El tipo de problema que activa esta regla. Cada tipificación pertenece a un área técnica — la regla sólo aplica a tickets de ese tipo.">?</button>
                </label>
                <select class="minput" [(ngModel)]="form.tipificacion_id">
                  <option [value]="0">Selecciona una tipificación…</option>
                  @for (area of tipsAgrupadasAreas(); track area) {
                    <optgroup [label]="area">
                      @for (t of tipsDeArea(area); track t.id) {
                        <option [value]="t.id">{{ t.problema }}</option>
                      }
                    </optgroup>
                  }
                </select>
              </div>

              <div class="mfield">
                <label class="mfield-label">
                  Grupo destino
                  <button class="tip-btn tip-btn--xs"
                    data-tooltip="El grupo del Call Center que recibirá los tickets que coincidan con esta regla. El grupo debe existir en la misma área técnica que la tipificación seleccionada.">?</button>
                </label>
                <select class="minput" [(ngModel)]="form.grupo_id">
                  <option [value]="0">Selecciona un grupo…</option>
                  @for (g of grupos(); track g.id) {
                    <option [value]="g.id">{{ g.area_tecnica }} — {{ g.nombre }}</option>
                  }
                </select>
              </div>

              <div class="mrow-2">
                <div class="mfield">
                  <label class="mfield-label">
                    Prioridad
                    <button class="tip-btn tip-btn--xs"
                      data-tooltip="Número del 1 al 99. Cuando varias reglas coinciden con un ticket, se aplica la de prioridad más baja (1 = máxima prioridad).">?</button>
                  </label>
                  <input class="minput" type="number" [(ngModel)]="form.prioridad" min="1" max="99" />
                  <span class="mfield-hint">1 = máxima prioridad</span>
                </div>
                <div class="mfield">
                  <label class="mfield-label">
                    Zona (opcional)
                    <button class="tip-btn tip-btn--xs"
                      data-tooltip="Deja vacío para que la regla aplique a todas las zonas del país. Si especificas una zona, sólo los tickets de tiendas en esa zona usarán esta regla.">?</button>
                  </label>
                  <input class="minput" type="number" [(ngModel)]="form.zona_id" placeholder="Vacío = todas" />
                </div>
              </div>

              @if (formError()) {
                <div class="form-error-bar">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                  {{ formError() }}
                </div>
              }
            </div>
            <div class="modal-footer">
              <button class="btn-secondary" (click)="closeModal()">Cancelar</button>
              <button class="btn-primary" [disabled]="saving()" (click)="save()">
                @if (saving()) {
                  <span class="spinner"></span> Guardando…
                } @else {
                  Agregar regla
                }
              </button>
            </div>
          </div>
        </div>
      }

    </div>
  `,
  styles: [`
    /* ── Layout ─────────────────────────────── */
    .rut-page { display: flex; flex-direction: column; gap: 20px; }

    /* ── Header ─────────────────────────────── */
    .page-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
    .header-left { display: flex; flex-direction: column; gap: 10px; }
    .title-row { display: flex; align-items: center; gap: 10px; }
    .page-title { font-size: 22px; font-weight: 700; color: var(--c-text); margin: 0; }
    .total-chip { font-size: 12px; color: var(--c-muted); background: var(--c-bg); border: 1px solid var(--c-border); border-radius: 12px; padding: 3px 10px; }
    .filter-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    .filter-pills { display: flex; gap: 6px; flex-wrap: wrap; }
    .pill { display: flex; align-items: center; gap: 5px; padding: 5px 12px; border-radius: 16px; font-size: 13px; border: 1px solid var(--c-border); background: var(--c-surface); color: var(--c-muted); cursor: pointer; transition: all .15s; }
    .pill--active { background: var(--c-blue-lt); border-color: var(--c-blue-md); color: var(--c-blue); font-weight: 500; }
    .pill-count { font-size: 11px; background: var(--c-border); border-radius: 8px; padding: 0 5px; min-width: 18px; text-align: center; }
    .pill--active .pill-count { background: var(--c-blue-md); color: #fff; }

    /* area dots */
    .dot-sistemas { width:8px; height:8px; border-radius:50%; background:#3B82F6; flex-shrink:0; display:inline-block; }
    .dot-abasto   { width:8px; height:8px; border-radius:50%; background:#10B981; flex-shrink:0; display:inline-block; }
    .dot-mant     { width:8px; height:8px; border-radius:50%; background:#F59E0B; flex-shrink:0; display:inline-block; }
    .dot-finanzas { width:8px; height:8px; border-radius:50%; background:#8B5CF6; flex-shrink:0; display:inline-block; }
    .dot-default  { width:8px; height:8px; border-radius:50%; background:#6B7280; flex-shrink:0; display:inline-block; }

    /* ── Buttons ─────────────────────────────── */
    .btn-primary { display:flex; align-items:center; gap:6px; padding:9px 16px; background:var(--c-blue); color:#fff; border:none; border-radius:var(--radius-sm); font-size:13px; font-weight:500; cursor:pointer; white-space:nowrap; transition: opacity .15s; }
    .btn-primary:hover { opacity:.88; }
    .btn-primary:disabled { opacity:.5; cursor:not-allowed; }
    .btn-secondary { padding:9px 16px; background:var(--c-surface); color:var(--c-text); border:1px solid var(--c-border); border-radius:var(--radius-sm); font-size:13px; font-weight:500; cursor:pointer; }
    .btn-secondary:hover { background:var(--c-bg); }

    /* ── Skeleton ────────────────────────────── */
    .skeleton-list { display:flex; flex-direction:column; gap:10px; }
    .skeleton-card { display:flex; align-items:center; gap:12px; background:var(--c-surface); border:1px solid var(--c-border); border-radius:var(--radius-lg); padding:18px 20px; }
    .sk { background:var(--c-border); border-radius:6px; animation: pulse 1.4s ease-in-out infinite; }
    .sk--icon { width:36px; height:36px; border-radius:8px; flex-shrink:0; }
    .sk-content { flex:1; display:flex; flex-direction:column; gap:8px; }
    .sk--title { height:14px; width:200px; }
    .sk--sub { height:11px; width:120px; }
    @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.45} }

    /* ── Empty ───────────────────────────────── */
    .empty-state { display:flex; flex-direction:column; align-items:center; gap:12px; padding:60px 20px; color:var(--c-muted); text-align:center; }
    .empty-state svg { opacity:.4; }
    .empty-state p { margin:0; font-size:14px; }

    /* ── Area sections ───────────────────────── */
    .sections-list { display:flex; flex-direction:column; gap:10px; }
    .area-section { background:var(--c-surface); border:1px solid var(--c-border); border-radius:var(--radius-lg); }
    .area-head { display:flex; align-items:center; gap:10px; padding:16px 20px; cursor:pointer; user-select:none; transition:background .15s; border-radius:var(--radius-lg); }
    .area-section--open .area-head { border-radius:var(--radius-lg) var(--radius-lg) 0 0; background:var(--c-bg); border-bottom:1px solid var(--c-border); }
    .area-head:hover { background:var(--c-bg); }
    .area-icon { width:36px; height:36px; border-radius:8px; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
    .icon--sistemas   { background:#EFF6FF; color:#2563EB; }
    .icon--abasto     { background:#ECFDF5; color:#059669; }
    .icon--mant       { background:#FFFBEB; color:#D97706; }
    .icon--finanzas   { background:#F5F3FF; color:#7C3AED; }
    .icon--default    { background:var(--c-bg); color:var(--c-muted); }
    :host-context(.dark-theme) .icon--sistemas  { background:#0D2845; color:#60A5FA; }
    :host-context(.dark-theme) .icon--abasto    { background:#052E16; color:#34D399; }
    :host-context(.dark-theme) .icon--mant      { background:#451A03; color:#FCD34D; }
    :host-context(.dark-theme) .icon--finanzas  { background:#2E1065; color:#A78BFA; }
    .area-name { font-size:15px; font-weight:600; color:var(--c-text); flex:0 0 auto; }
    .area-count { font-size:12px; color:var(--c-muted); background:var(--c-border); border-radius:10px; padding:2px 8px; flex:0 0 auto; }
    .area-badges { display:flex; gap:5px; flex-wrap:wrap; flex:1; }
    .grupo-mini { font-size:11px; padding:2px 8px; background:var(--c-blue-lt); color:var(--c-blue); border:1px solid var(--c-blue-md); border-radius:10px; }
    .area-chevron { color:var(--c-muted); margin-left:auto; transition:transform .2s; flex-shrink:0; }
    .area-section--open .area-chevron { transform:rotate(180deg); }

    /* ── Reglas table ────────────────────────── */
    .area-body { }
    .reglas-table { width:100%; }
    .rt-head { display:grid; grid-template-columns:1fr 1fr 130px 80px 110px; padding:9px 20px; background:var(--c-bg); border-bottom:1px solid var(--c-border); font-size:11px; font-weight:600; color:var(--c-muted); text-transform:uppercase; letter-spacing:.04em; }
    .rt-row { display:grid; grid-template-columns:1fr 1fr 130px 80px 110px; align-items:center; padding:12px 20px; border-bottom:1px solid var(--c-border); transition:background .12s; }
    .rt-row:last-child { border-bottom:none; border-radius:0 0 var(--radius-lg) var(--radius-lg); }
    .rt-row:hover { background:var(--c-bg); }
    .rt-row--deleting { background:var(--c-red-lt) !important; }
    .rt-cell { display:flex; align-items:center; gap:6px; font-size:13px; }
    .col-center { justify-content:center; }
    .problema-text { font-weight:500; color:var(--c-text); }
    .cat-tag { font-size:10px; background:var(--c-border); color:var(--c-muted); border-radius:6px; padding:1px 6px; }
    .grupo-tag { display:flex; align-items:center; gap:5px; color:var(--c-text); font-size:13px; }
    .zona-text { font-size:12px; color:var(--c-muted); }
    .prio-badge { min-width:28px; height:22px; display:flex; align-items:center; justify-content:center; border-radius:6px; font-size:12px; font-weight:700; }
    .prio--1   { background:#DCFCE7; color:#166534; }
    .prio--2   { background:#DBEAFE; color:#1D4ED8; }
    .prio--low { background:var(--c-bg); color:var(--c-muted); border:1px solid var(--c-border); }
    :host-context(.dark-theme) .prio--1 { background:#052E16; color:#4ADE80; }
    :host-context(.dark-theme) .prio--2 { background:#0D2845; color:#60A5FA; }
    .rt-actions { display:flex; align-items:center; gap:6px; justify-content:flex-end; }
    .confirm-text { font-size:12px; color:var(--c-red); font-weight:500; }
    .act-btn { display:flex; align-items:center; gap:4px; padding:5px 10px; border-radius:6px; font-size:12px; border:1px solid var(--c-border); background:var(--c-surface); color:var(--c-muted); cursor:pointer; transition:all .12s; }
    .act-btn:hover { background:var(--c-bg); color:var(--c-text); }
    .act-btn--ghost { opacity:0; }
    .rt-row:hover .act-btn--ghost { opacity:1; }
    .act-btn--danger { background:var(--c-red-lt); color:var(--c-red); border-color:var(--c-red-md); }
    .act-btn--danger:hover { background:var(--c-red); color:#fff; }

    /* ── Tooltip system ──────────────────────── */
    .tip-btn { position:relative; width:18px; height:18px; border-radius:50%; border:1.5px solid var(--c-blue-md); background:var(--c-blue-lt); color:var(--c-blue); font-size:11px; font-weight:700; cursor:pointer; display:inline-flex; align-items:center; justify-content:center; flex-shrink:0; }
    .tip-btn::after { content:attr(data-tooltip); display:none; position:absolute; z-index:999; background:#1a2535; color:#e8f0fa; font-size:12px; line-height:1.5; font-weight:400; border-radius:8px; padding:10px 14px; pointer-events:none; box-shadow:0 4px 20px rgba(0,0,0,.3); }
    .tip-btn:hover::after { display:block; }
    .tip-btn::after { bottom:calc(100% + 8px); left:50%; transform:translateX(-50%); width:260px; }
    .tip-btn--xs::after { bottom:auto; left:calc(100% + 8px); top:50%; transform:translateY(-50%); width:240px; }
    .tip-btn--down::after { bottom:auto; top:calc(100% + 8px); left:0; transform:none; width:300px; }

    /* ── Modal ───────────────────────────────── */
    .modal-backdrop { position:fixed; inset:0; background:rgba(0,0,0,.45); backdrop-filter:blur(4px); z-index:200; display:flex; align-items:center; justify-content:center; padding:20px; }
    .modal-box { background:var(--c-surface); border:1px solid var(--c-border); border-radius:var(--radius-lg); width:100%; max-width:520px; display:flex; flex-direction:column; box-shadow:0 24px 60px rgba(0,0,0,.25); animation:spring-in .22s cubic-bezier(.34,1.56,.64,1) both; }
    @keyframes spring-in { from{opacity:0;transform:scale(.94)} to{opacity:1;transform:scale(1)} }
    .modal-header { display:flex; align-items:center; justify-content:space-between; padding:20px 24px 16px; border-bottom:1px solid var(--c-border); }
    .modal-title { font-size:16px; font-weight:600; color:var(--c-text); margin:0; }
    .modal-close { width:28px; height:28px; border-radius:6px; border:none; background:transparent; color:var(--c-muted); cursor:pointer; display:flex; align-items:center; justify-content:center; }
    .modal-close:hover { background:var(--c-bg); color:var(--c-text); }
    .modal-body { padding:20px 24px; display:flex; flex-direction:column; gap:16px; overflow-y:auto; }
    .modal-footer { padding:16px 24px; border-top:1px solid var(--c-border); display:flex; justify-content:flex-end; gap:8px; }

    /* ── Form fields ─────────────────────────── */
    .mfield { display:flex; flex-direction:column; gap:6px; }
    .mfield-label { font-size:13px; font-weight:500; color:var(--c-text); display:flex; align-items:center; gap:6px; }
    .mfield-hint { font-size:11px; color:var(--c-muted); }
    .minput { padding:9px 12px; border:1px solid var(--c-border); border-radius:var(--radius-sm); background:var(--c-bg); color:var(--c-text); font-size:13px; width:100%; box-sizing:border-box; }
    .minput:focus { outline:none; border-color:var(--c-blue); box-shadow:0 0 0 3px var(--c-blue-lt); }
    .mrow-2 { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
    .form-error-bar { display:flex; align-items:center; gap:8px; background:var(--c-red-lt); color:var(--c-red); border:1px solid var(--c-red-md); border-radius:var(--radius-sm); padding:10px 14px; font-size:13px; }

    /* ── Spinner ─────────────────────────────── */
    .spinner { width:14px; height:14px; border:2px solid rgba(255,255,255,.3); border-top-color:#fff; border-radius:50%; animation:spin .7s linear infinite; display:inline-block; }
    @keyframes spin { to{transform:rotate(360deg)} }
  `],
})
export class AdminRuteoComponent implements OnInit {
  reglas    = signal<ReglaRuteo[]>([]);
  tips      = signal<TipAdmin[]>([]);
  grupos    = signal<any[]>([]);
  loading   = signal(true);
  showModal = signal(false);
  saving    = signal(false);
  formError = signal('');
  filtroArea  = signal('');
  deletingId  = signal(0);
  openAreas   = signal<Set<string>>(new Set());

  areasDisponibles = ['ABASTO', 'SISTEMAS', 'MANTENIMIENTO', 'FINANZAS', 'COMERCIAL', 'RRHH', 'OPERACIONES'];
  form = { tipificacion_id: 0, grupo_id: 0, zona_id: null as number | null, prioridad: 1 };

  reglasFiltradas = computed(() => {
    const area = this.filtroArea();
    if (!area) return this.reglas();
    return this.reglas().filter(r => r.tipificacion?.area_tecnica === area);
  });

  areasConReglas = computed(() =>
    [...new Set(this.reglasFiltradas().map(r => r.tipificacion?.area_tecnica ?? 'SIN ÁREA'))].sort()
  );

  tipsAgrupadasAreas = computed(() =>
    [...new Set(this.tips().map(t => t.area_tecnica))].sort()
  );

  reglasDe(area: string): ReglaRuteo[] {
    return this.reglasFiltradas().filter(r => (r.tipificacion?.area_tecnica ?? 'SIN ÁREA') === area);
  }

  gruposEnArea(area: string): { nombre: string }[] {
    const nombres = new Set(this.reglasDe(area).map(r => r.grupo?.nombre ?? '#' + r.grupo_id));
    return [...nombres].map(n => ({ nombre: n }));
  }

  tipsDeArea(area: string): TipAdmin[] {
    return this.tips().filter(t => t.area_tecnica === area);
  }

  contarArea(area: string): number {
    return this.reglas().filter(r => r.tipificacion?.area_tecnica === area).length;
  }

  isAreaOpen(area: string) { return this.openAreas().has(area); }
  toggleArea(area: string) {
    this.openAreas.update(s => { const n = new Set(s); n.has(area) ? n.delete(area) : n.add(area); return n; });
  }

  iconClass(area: string) {
    const m: Record<string, string> = {
      SISTEMAS: 'area-icon icon--sistemas', ABASTO: 'area-icon icon--abasto',
      MANTENIMIENTO: 'area-icon icon--mant', FINANZAS: 'area-icon icon--finanzas',
    };
    return m[area] ?? 'area-icon icon--default';
  }

  dotClass(area: string): string {
    const m: Record<string, string> = {
      SISTEMAS: 'dot-sistemas', ABASTO: 'dot-abasto',
      MANTENIMIENTO: 'dot-mant', FINANZAS: 'dot-finanzas',
    };
    return m[area] ?? 'dot-default';
  }

  prioBadge(p: number): string {
    if (p === 1) return 'prio-badge prio--1';
    if (p === 2) return 'prio-badge prio--2';
    return 'prio-badge prio--low';
  }

  constructor(private admin: AdminService) {}

  ngOnInit() {
    this.admin.getRuteo().subscribe({
      next: rs => {
        this.reglas.set(rs);
        this.loading.set(false);
        const areas = [...new Set(rs.map(r => r.tipificacion?.area_tecnica ?? 'SIN ÁREA'))].sort();
        if (areas.length) this.openAreas.set(new Set([areas[0]]));
      },
      error: () => this.loading.set(false),
    });
    this.admin.getTipificaciones(true).subscribe({ next: ts => this.tips.set(ts) });
    this.admin.getGrupos().subscribe({ next: gs => this.grupos.set(gs) });
  }

  openModal() {
    this.form = { tipificacion_id: 0, grupo_id: 0, zona_id: null, prioridad: 1 };
    this.formError.set('');
    this.showModal.set(true);
  }

  closeModal() { this.showModal.set(false); }

  save() {
    if (!this.form.tipificacion_id || !this.form.grupo_id) {
      this.formError.set('Tipificación y grupo destino son obligatorios');
      return;
    }
    this.saving.set(true);
    this.admin.createRegla(this.form).subscribe({
      next: r => {
        this.reglas.update(list => [...list, r]);
        const area = r.tipificacion?.area_tecnica ?? 'SIN ÁREA';
        this.openAreas.update(s => { const n = new Set(s); n.add(area); return n; });
        this.saving.set(false);
        this.showModal.set(false);
      },
      error: err => {
        this.saving.set(false);
        this.formError.set(err.error?.detail ?? 'Error al guardar');
      },
    });
  }

  confirmDelete(r: ReglaRuteo) {
    this.admin.deleteRegla(r.id).subscribe({
      next: () => {
        this.reglas.update(list => list.filter(x => x.id !== r.id));
        this.deletingId.set(0);
      },
    });
  }
}
