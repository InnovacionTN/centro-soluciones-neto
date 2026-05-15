import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminService, ZonaAdmin, RegionAdmin } from '../../core/services/admin.service';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-admin-zonas',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="zon-page">

      <!-- ── Header ── -->
      <div class="page-header">
        <div class="header-left">
          <div class="title-row">
            <h2 class="page-title">Zonas</h2>
            <button class="tip-btn tip-btn--down"
              data-tooltip="Las Zonas dividen el territorio dentro de cada Región. Cada tienda pertenece a una Zona, y el ruteo puede configurarse a nivel de Zona para ajustar qué grupo atiende cada área del país.">?</button>
            <span class="total-chip">{{ zonas().length }} zonas · {{ regionesList().length }} regiones</span>
          </div>
          <div class="filter-row">
            <div class="toggle-group">
              <button class="toggle-btn" [class.toggle-btn--active]="filtroActivo() === null"  (click)="filtroActivo.set(null)">Todas</button>
              <button class="toggle-btn" [class.toggle-btn--active]="filtroActivo() === true"  (click)="filtroActivo.set(true)">Activas</button>
              <button class="toggle-btn" [class.toggle-btn--active]="filtroActivo() === false" (click)="filtroActivo.set(false)">Inactivas</button>
            </div>
          </div>
        </div>
        @if (esSuperAdmin()) {
          <button class="btn-primary" (click)="openNew()">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Nueva zona
          </button>
        }
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

      } @else if (regionesList().length === 0) {
        <div class="empty-state">
          <p>No hay regiones disponibles. Crea regiones primero.</p>
        </div>

      } @else {
        <div class="sections-list">
          @for (reg of regionesList(); track reg.id) {
            @if (zonasDe(reg.id).length > 0 || filtroActivo() === null) {
              <div class="region-section" [class.region-section--open]="isOpen(reg.id)">

                <div class="region-head" (click)="toggle(reg.id)">
                  <div class="reg-icon">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                  </div>
                  <span class="region-name">{{ reg.nombre }}</span>
                  <span class="zone-count">{{ zonasDe(reg.id).length }} zonas</span>
                  <svg class="chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="6 9 12 15 18 9"/></svg>
                </div>

                @if (isOpen(reg.id)) {
                  <div class="region-body">
                    @if (zonasDe(reg.id).length === 0) {
                      <div class="zone-empty">No hay zonas con el filtro seleccionado en esta región</div>
                    } @else {
                      @for (z of zonasDe(reg.id); track z.id) {
                        <div class="zone-row" [class.zone-row--inactive]="!z.activo">
                          <div class="zone-dot" [class]="z.activo ? 'zdot--on' : 'zdot--off'"></div>
                          <span class="zone-name">{{ z.nombre }}</span>
                          <span class="status-chip" [class]="z.activo ? 'chip--on' : 'chip--off'">
                            {{ z.activo ? 'Activa' : 'Inactiva' }}
                          </span>
                          @if (esSuperAdmin()) {
                            <div class="zone-actions">
                              <button class="act-btn" (click)="openEdit(z)">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                                Editar
                              </button>
                              <button class="act-btn" [class.act-btn--danger]="z.activo" (click)="toggleActivo(z)">
                                {{ z.activo ? 'Desactivar' : 'Activar' }}
                              </button>
                            </div>
                          }
                        </div>
                      }
                    }
                  </div>
                }
              </div>
            }
          }
        </div>
      }

      <!-- ── Modal ── -->
      @if (showModal()) {
        <div class="modal-backdrop" (click)="closeModal()">
          <div class="modal-box" (click)="$event.stopPropagation()">
            <div class="modal-header">
              <h3 class="modal-title">{{ editId() ? 'Editar zona' : 'Nueva zona' }}</h3>
              <button class="modal-close" (click)="closeModal()">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div class="modal-body">
              <div class="mfield">
                <label class="mfield-label">
                  Nombre de la zona
                  <button class="tip-btn tip-btn--xs"
                    data-tooltip="Nombre identificador de la zona dentro de su región. Ejemplos: ZONA METROPOLITANA, ZONA BAJÍO. Se guardará en mayúsculas.">?</button>
                </label>
                <input class="minput" [(ngModel)]="form.nombre" placeholder="Ej: ZONA METROPOLITANA" style="text-transform:uppercase" />
              </div>
              <div class="mfield">
                <label class="mfield-label">
                  Región
                  <button class="tip-btn tip-btn--xs"
                    data-tooltip="La región geográfica a la que pertenece esta zona. Agrupa varias zonas bajo un mismo territorio.">?</button>
                </label>
                <select class="minput" [(ngModel)]="form.region_id">
                  <option [ngValue]="null">Selecciona una región…</option>
                  @for (r of regionesList(); track r.id) {
                    <option [ngValue]="r.id">{{ r.nombre }}</option>
                  }
                </select>
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
                @if (saving()) { <span class="spinner"></span> Guardando… } @else { {{ editId() ? 'Guardar' : 'Crear zona' }} }
              </button>
            </div>
          </div>
        </div>
      }

    </div>
  `,
  styles: [`
    .zon-page { display: flex; flex-direction: column; gap: 20px; }
    .page-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
    .header-left { display: flex; flex-direction: column; gap: 10px; }
    .title-row { display: flex; align-items: center; gap: 10px; }
    .page-title { font-size: 22px; font-weight: 700; color: var(--c-text); margin: 0; }
    .total-chip { font-size: 12px; color: var(--c-muted); background: var(--c-bg); border: 1px solid var(--c-border); border-radius: 12px; padding: 3px 10px; }
    .filter-row { display: flex; align-items: center; gap: 10px; }
    .toggle-group { display: flex; background: var(--c-bg); border: 1px solid var(--c-border); border-radius: 8px; padding: 3px; gap: 2px; width: fit-content; }
    .toggle-btn { padding: 4px 12px; border-radius: 6px; border: none; background: transparent; color: var(--c-muted); font-size: 13px; cursor: pointer; transition: all .15s; }
    .toggle-btn--active { background: var(--c-surface); color: var(--c-text); font-weight: 500; box-shadow: 0 1px 3px rgba(0,0,0,.08); }
    .btn-primary { display: flex; align-items: center; gap: 6px; padding: 9px 16px; background: var(--c-blue); color: #fff; border: none; border-radius: var(--radius-sm); font-size: 13px; font-weight: 500; cursor: pointer; transition: opacity .15s; }
    .btn-primary:hover { opacity: .88; }
    .btn-primary:disabled { opacity: .5; cursor: not-allowed; }
    .btn-secondary { padding: 9px 16px; background: var(--c-surface); color: var(--c-text); border: 1px solid var(--c-border); border-radius: var(--radius-sm); font-size: 13px; font-weight: 500; cursor: pointer; }
    .btn-secondary:hover { background: var(--c-bg); }

    /* Skeleton */
    .skeleton-list { display: flex; flex-direction: column; gap: 10px; }
    .skeleton-card { display: flex; align-items: center; gap: 12px; background: var(--c-surface); border: 1px solid var(--c-border); border-radius: var(--radius-lg); padding: 18px 20px; }
    .sk { background: var(--c-border); border-radius: 6px; animation: pulse 1.4s ease-in-out infinite; }
    .sk--icon { width: 32px; height: 32px; border-radius: 8px; flex-shrink: 0; }
    .sk-content { flex: 1; display: flex; flex-direction: column; gap: 8px; }
    .sk--title { height: 14px; width: 160px; }
    .sk--sub { height: 11px; width: 80px; }
    @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.45} }
    .empty-state { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 60px 20px; color: var(--c-muted); text-align: center; }

    /* Region sections */
    .sections-list { display: flex; flex-direction: column; gap: 10px; }
    .region-section { background: var(--c-surface); border: 1px solid var(--c-border); border-radius: var(--radius-lg); }
    .region-head { display: flex; align-items: center; gap: 10px; padding: 14px 20px; cursor: pointer; user-select: none; border-radius: var(--radius-lg); transition: background .15s; }
    .region-section--open .region-head { border-radius: var(--radius-lg) var(--radius-lg) 0 0; background: var(--c-bg); border-bottom: 1px solid var(--c-border); }
    .region-head:hover { background: var(--c-bg); }
    .reg-icon { width: 30px; height: 30px; border-radius: 8px; background: var(--c-blue-lt); color: var(--c-blue); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
    .region-name { font-size: 14px; font-weight: 600; color: var(--c-text); flex: 1; }
    .zone-count { font-size: 12px; color: var(--c-muted); background: var(--c-border); border-radius: 10px; padding: 2px 8px; }
    .chevron { color: var(--c-muted); transition: transform .2s; flex-shrink: 0; }
    .region-section--open .chevron { transform: rotate(180deg); }

    /* Zone rows */
    .region-body { }
    .zone-empty { padding: 16px 20px; font-size: 13px; color: var(--c-muted); text-align: center; }
    .zone-row { display: flex; align-items: center; gap: 10px; padding: 11px 20px; border-bottom: 1px solid var(--c-border); transition: background .12s; }
    .zone-row:last-child { border-bottom: none; border-radius: 0 0 var(--radius-lg) var(--radius-lg); }
    .zone-row:hover { background: var(--c-bg); }
    .zone-row--inactive { opacity: .65; }
    .zone-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
    .zdot--on { background: var(--c-green); }
    .zdot--off { background: var(--c-muted); }
    .zone-name { font-size: 13px; font-weight: 500; color: var(--c-text); flex: 1; }
    .status-chip { font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 10px; }
    .chip--on { background: var(--c-green-lt); color: var(--c-green); }
    .chip--off { background: var(--c-bg); color: var(--c-muted); border: 1px solid var(--c-border); }
    .zone-actions { display: flex; gap: 6px; }
    .act-btn { display: flex; align-items: center; gap: 4px; padding: 4px 9px; border-radius: 6px; font-size: 12px; border: 1px solid var(--c-border); background: var(--c-surface); color: var(--c-muted); cursor: pointer; transition: all .12s; }
    .act-btn:hover { background: var(--c-bg); color: var(--c-text); }
    .act-btn--danger { color: var(--c-red); border-color: var(--c-red-md); }
    .act-btn--danger:hover { background: var(--c-red-lt); }

    /* Tooltip */
    .tip-btn { position: relative; width: 18px; height: 18px; border-radius: 50%; border: 1.5px solid var(--c-blue-md); background: var(--c-blue-lt); color: var(--c-blue); font-size: 11px; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; }
    .tip-btn::after { content: attr(data-tooltip); display: none; position: absolute; z-index: 999; background: #1a2535; color: #e8f0fa; font-size: 12px; line-height: 1.5; font-weight: 400; border-radius: 8px; padding: 10px 14px; pointer-events: none; box-shadow: 0 4px 20px rgba(0,0,0,.3); }
    .tip-btn:hover::after { display: block; }
    .tip-btn::after { bottom: calc(100% + 8px); left: 50%; transform: translateX(-50%); width: 260px; }
    .tip-btn--xs::after { bottom: auto; left: calc(100% + 8px); top: 50%; transform: translateY(-50%); width: 240px; }
    .tip-btn--down::after { bottom: auto; top: calc(100% + 8px); left: 0; transform: none; width: 300px; }

    /* Modal */
    .modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,.45); backdrop-filter: blur(4px); z-index: 200; display: flex; align-items: center; justify-content: center; padding: 20px; }
    .modal-box { background: var(--c-surface); border: 1px solid var(--c-border); border-radius: var(--radius-lg); width: 100%; max-width: 440px; display: flex; flex-direction: column; box-shadow: 0 24px 60px rgba(0,0,0,.25); animation: spring-in .22s cubic-bezier(.34,1.56,.64,1) both; }
    @keyframes spring-in { from{opacity:0;transform:scale(.94)} to{opacity:1;transform:scale(1)} }
    .modal-header { display: flex; align-items: center; justify-content: space-between; padding: 20px 24px 16px; border-bottom: 1px solid var(--c-border); }
    .modal-title { font-size: 16px; font-weight: 600; color: var(--c-text); margin: 0; }
    .modal-close { width: 28px; height: 28px; border-radius: 6px; border: none; background: transparent; color: var(--c-muted); cursor: pointer; display: flex; align-items: center; justify-content: center; }
    .modal-close:hover { background: var(--c-bg); color: var(--c-text); }
    .modal-body { padding: 20px 24px; display: flex; flex-direction: column; gap: 16px; }
    .modal-footer { padding: 16px 24px; border-top: 1px solid var(--c-border); display: flex; justify-content: flex-end; gap: 8px; }
    .mfield { display: flex; flex-direction: column; gap: 6px; }
    .mfield-label { font-size: 13px; font-weight: 500; color: var(--c-text); display: flex; align-items: center; gap: 6px; }
    .minput { padding: 9px 12px; border: 1px solid var(--c-border); border-radius: var(--radius-sm); background: var(--c-bg); color: var(--c-text); font-size: 13px; width: 100%; box-sizing: border-box; }
    .minput:focus { outline: none; border-color: var(--c-blue); box-shadow: 0 0 0 3px var(--c-blue-lt); }
    .form-error-bar { display: flex; align-items: center; gap: 8px; background: var(--c-red-lt); color: var(--c-red); border: 1px solid var(--c-red-md); border-radius: var(--radius-sm); padding: 10px 14px; font-size: 13px; }
    .spinner { width: 14px; height: 14px; border: 2px solid rgba(255,255,255,.3); border-top-color: #fff; border-radius: 50%; animation: spin .7s linear infinite; display: inline-block; }
    @keyframes spin { to{transform:rotate(360deg)} }
  `],
})
export class AdminZonasComponent implements OnInit {
  zonas      = signal<ZonaAdmin[]>([]);
  regiones   = signal<RegionAdmin[]>([]);
  loading    = signal(true);
  showModal  = signal(false);
  saving     = signal(false);
  formError  = signal('');
  editId     = signal<number | null>(null);
  filtroActivo = signal<boolean | null>(null);
  openRegiones = signal<Set<number>>(new Set());

  form = this.emptyForm();

  esSuperAdmin = () => this.auth.currentUser()?.rol === 'ADMIN';

  regionesList = computed(() => this.regiones());

  zonasFiltradas = computed(() => {
    const activo = this.filtroActivo();
    if (activo === null) return this.zonas();
    return this.zonas().filter(z => z.activo === activo);
  });

  zonasDe(regionId: number): ZonaAdmin[] {
    return this.zonasFiltradas().filter(z => z.region_id === regionId);
  }

  isOpen(id: number) { return this.openRegiones().has(id); }
  toggle(id: number) {
    this.openRegiones.update(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  constructor(private admin: AdminService, private auth: AuthService) {}

  ngOnInit() {
    this.loading.set(true);
    this.admin.getZonas().subscribe({
      next: zs => { this.zonas.set(zs); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
    this.admin.getRegiones().subscribe({
      next: rs => {
        this.regiones.set(rs);
        if (rs.length) this.openRegiones.set(new Set([rs[0].id]));
      },
      error: () => {},
    });
  }

  emptyForm() { return { nombre: '', region_id: null as number | null }; }

  openNew() { this.form = this.emptyForm(); this.editId.set(null); this.formError.set(''); this.showModal.set(true); }
  openEdit(z: ZonaAdmin) { this.form = { nombre: z.nombre, region_id: z.region_id }; this.editId.set(z.id); this.formError.set(''); this.showModal.set(true); }
  closeModal() { this.showModal.set(false); }

  save() {
    if (!this.form.nombre.trim()) { this.formError.set('El nombre es obligatorio'); return; }
    if (!this.form.region_id) { this.formError.set('La región es obligatoria'); return; }
    this.saving.set(true);
    const req = this.editId()
      ? this.admin.updateZona(this.editId()!, { nombre: this.form.nombre })
      : this.admin.createZona(this.form);
    req.subscribe({
      next: z => {
        if (this.editId()) { this.zonas.update(list => list.map(x => x.id === z.id ? z : x)); }
        else {
          this.zonas.update(list => [...list, z]);
          this.openRegiones.update(s => { const n = new Set(s); n.add(z.region_id); return n; });
        }
        this.saving.set(false); this.closeModal();
      },
      error: err => { this.saving.set(false); this.formError.set(err.error?.detail ?? 'Error'); },
    });
  }

  toggleActivo(z: ZonaAdmin) {
    this.admin.updateZona(z.id, { activo: !z.activo }).subscribe({
      next: updated => this.zonas.update(list => list.map(x => x.id === updated.id ? updated : x)),
    });
  }
}
