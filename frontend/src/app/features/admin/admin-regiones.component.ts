import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminService, RegionAdmin } from '../../core/services/admin.service';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-admin-regiones',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="reg-page">

      <!-- ── Header ── -->
      <div class="page-header">
        <div class="header-left">
          <div class="title-row">
            <h2 class="page-title">Regiones</h2>
            <button class="tip-btn tip-btn--down"
              data-tooltip="Las Regiones agrupan geográficamente las zonas del país. Cada Zona pertenece a una Región. Los reportes y filtros de la Torre de Control se organizan por Región.">?</button>
            <span class="total-chip">{{ regiones().length }} regiones · {{ totalActivas() }} activas</span>
          </div>
          <div class="toggle-group">
            <button class="toggle-btn" [class.toggle-btn--active]="filtroActivo() === null"  (click)="filtroActivo.set(null)">Todas</button>
            <button class="toggle-btn" [class.toggle-btn--active]="filtroActivo() === true"  (click)="filtroActivo.set(true)">Activas</button>
            <button class="toggle-btn" [class.toggle-btn--active]="filtroActivo() === false" (click)="filtroActivo.set(false)">Inactivas</button>
          </div>
        </div>
        @if (esSuperAdmin()) {
          <button class="btn-primary" (click)="openNew()">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Nueva región
          </button>
        }
      </div>

      <!-- ── Skeleton ── -->
      @if (loading()) {
        <div class="list-card">
          @for (i of [1,2,3,4,5]; track i) {
            <div class="sk-row">
              <div class="sk sk--name"></div>
              <div class="sk sk--badge"></div>
            </div>
          }
        </div>

      } @else if (regionesFiltradas().length === 0) {
        <div class="empty-state">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
          </svg>
          <p>No hay regiones con el filtro seleccionado</p>
        </div>

      } @else {
        <div class="list-card">
          @for (r of regionesFiltradas(); track r.id) {
            <div class="list-row" [class.list-row--inactive]="!r.activo">
              <div class="row-icon" [class.icon--active]="r.activo" [class.icon--inactive]="!r.activo">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
              </div>
              <span class="row-name">{{ r.nombre }}</span>
              <span class="status-chip" [class]="r.activo ? 'chip--on' : 'chip--off'">
                {{ r.activo ? 'Activa' : 'Inactiva' }}
              </span>
              @if (esSuperAdmin()) {
                <div class="row-actions">
                  <button class="act-btn" (click)="openEdit(r)">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    Editar
                  </button>
                  <button class="act-btn" [class.act-btn--danger]="r.activo" (click)="toggleActivo(r)">
                    {{ r.activo ? 'Desactivar' : 'Activar' }}
                  </button>
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
              <h3 class="modal-title">{{ editId() ? 'Editar región' : 'Nueva región' }}</h3>
              <button class="modal-close" (click)="closeModal()">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div class="modal-body">
              <div class="mfield">
                <label class="mfield-label">
                  Nombre de la región
                  <button class="tip-btn tip-btn--xs"
                    data-tooltip="Nombre geográfico de la región. Ejemplos: NORTE, SUR, OCCIDENTE, CENTRO. Se guardará en mayúsculas.">?</button>
                </label>
                <input class="minput" [(ngModel)]="form.nombre" placeholder="Ej: NORTE" style="text-transform:uppercase" />
                <span class="mfield-hint">Se guardará en mayúsculas automáticamente</span>
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
                @if (saving()) { <span class="spinner"></span> Guardando… } @else { {{ editId() ? 'Guardar' : 'Crear región' }} }
              </button>
            </div>
          </div>
        </div>
      }

    </div>
  `,
  styles: [`
    .reg-page { display: flex; flex-direction: column; gap: 20px; }
    .page-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
    .header-left { display: flex; flex-direction: column; gap: 10px; }
    .title-row { display: flex; align-items: center; gap: 10px; }
    .page-title { font-size: 22px; font-weight: 700; color: var(--c-text); margin: 0; }
    .total-chip { font-size: 12px; color: var(--c-muted); background: var(--c-bg); border: 1px solid var(--c-border); border-radius: 12px; padding: 3px 10px; }
    .toggle-group { display: flex; background: var(--c-bg); border: 1px solid var(--c-border); border-radius: 8px; padding: 3px; gap: 2px; width: fit-content; }
    .toggle-btn { padding: 4px 12px; border-radius: 6px; border: none; background: transparent; color: var(--c-muted); font-size: 13px; cursor: pointer; transition: all .15s; }
    .toggle-btn--active { background: var(--c-surface); color: var(--c-text); font-weight: 500; box-shadow: 0 1px 3px rgba(0,0,0,.08); }
    .btn-primary { display: flex; align-items: center; gap: 6px; padding: 9px 16px; background: var(--c-blue); color: #fff; border: none; border-radius: var(--radius-sm); font-size: 13px; font-weight: 500; cursor: pointer; transition: opacity .15s; }
    .btn-primary:hover { opacity: .88; }
    .btn-primary:disabled { opacity: .5; cursor: not-allowed; }
    .btn-secondary { padding: 9px 16px; background: var(--c-surface); color: var(--c-text); border: 1px solid var(--c-border); border-radius: var(--radius-sm); font-size: 13px; font-weight: 500; cursor: pointer; }
    .btn-secondary:hover { background: var(--c-bg); }

    /* List */
    .list-card { background: var(--c-surface); border: 1px solid var(--c-border); border-radius: var(--radius-lg); overflow: hidden; max-width: 700px; }
    .sk-row { display: flex; align-items: center; gap: 12px; padding: 14px 20px; border-bottom: 1px solid var(--c-border); }
    .sk { background: var(--c-border); border-radius: 6px; animation: pulse 1.4s ease-in-out infinite; }
    .sk--name { height: 14px; flex: 1; max-width: 200px; }
    .sk--badge { height: 20px; width: 60px; border-radius: 10px; }
    @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.45} }
    .empty-state { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 60px 20px; color: var(--c-muted); text-align: center; }
    .empty-state svg { opacity: .4; }
    .empty-state p { margin: 0; font-size: 14px; }
    .list-row { display: flex; align-items: center; gap: 12px; padding: 14px 20px; border-bottom: 1px solid var(--c-border); transition: background .12s; }
    .list-row:last-child { border-bottom: none; }
    .list-row:hover { background: var(--c-bg); }
    .list-row--inactive { opacity: .65; }
    .row-icon { width: 32px; height: 32px; border-radius: 8px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
    .icon--active { background: var(--c-green-lt); color: var(--c-green); }
    .icon--inactive { background: var(--c-bg); color: var(--c-muted); border: 1px solid var(--c-border); }
    .row-name { font-size: 14px; font-weight: 600; color: var(--c-text); flex: 1; }
    .status-chip { font-size: 11px; font-weight: 600; padding: 3px 9px; border-radius: 10px; }
    .chip--on { background: var(--c-green-lt); color: var(--c-green); }
    .chip--off { background: var(--c-bg); color: var(--c-muted); border: 1px solid var(--c-border); }
    .row-actions { display: flex; gap: 6px; }
    .act-btn { display: flex; align-items: center; gap: 4px; padding: 5px 10px; border-radius: 6px; font-size: 12px; border: 1px solid var(--c-border); background: var(--c-surface); color: var(--c-muted); cursor: pointer; transition: all .12s; }
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
    .modal-box { background: var(--c-surface); border: 1px solid var(--c-border); border-radius: var(--radius-lg); width: 100%; max-width: 420px; display: flex; flex-direction: column; box-shadow: 0 24px 60px rgba(0,0,0,.25); animation: spring-in .22s cubic-bezier(.34,1.56,.64,1) both; }
    @keyframes spring-in { from{opacity:0;transform:scale(.94)} to{opacity:1;transform:scale(1)} }
    .modal-header { display: flex; align-items: center; justify-content: space-between; padding: 20px 24px 16px; border-bottom: 1px solid var(--c-border); }
    .modal-title { font-size: 16px; font-weight: 600; color: var(--c-text); margin: 0; }
    .modal-close { width: 28px; height: 28px; border-radius: 6px; border: none; background: transparent; color: var(--c-muted); cursor: pointer; display: flex; align-items: center; justify-content: center; }
    .modal-close:hover { background: var(--c-bg); color: var(--c-text); }
    .modal-body { padding: 20px 24px; display: flex; flex-direction: column; gap: 16px; }
    .modal-footer { padding: 16px 24px; border-top: 1px solid var(--c-border); display: flex; justify-content: flex-end; gap: 8px; }
    .mfield { display: flex; flex-direction: column; gap: 6px; }
    .mfield-label { font-size: 13px; font-weight: 500; color: var(--c-text); display: flex; align-items: center; gap: 6px; }
    .mfield-hint { font-size: 11px; color: var(--c-muted); }
    .minput { padding: 9px 12px; border: 1px solid var(--c-border); border-radius: var(--radius-sm); background: var(--c-bg); color: var(--c-text); font-size: 13px; width: 100%; box-sizing: border-box; }
    .minput:focus { outline: none; border-color: var(--c-blue); box-shadow: 0 0 0 3px var(--c-blue-lt); }
    .form-error-bar { display: flex; align-items: center; gap: 8px; background: var(--c-red-lt); color: var(--c-red); border: 1px solid var(--c-red-md); border-radius: var(--radius-sm); padding: 10px 14px; font-size: 13px; }
    .spinner { width: 14px; height: 14px; border: 2px solid rgba(255,255,255,.3); border-top-color: #fff; border-radius: 50%; animation: spin .7s linear infinite; display: inline-block; }
    @keyframes spin { to{transform:rotate(360deg)} }
  `],
})
export class AdminRegionesComponent implements OnInit {
  regiones    = signal<RegionAdmin[]>([]);
  loading     = signal(true);
  showModal   = signal(false);
  saving      = signal(false);
  formError   = signal('');
  editId      = signal<number | null>(null);
  filtroActivo = signal<boolean | null>(null);
  form = { nombre: '' };

  esSuperAdmin = () => this.auth.currentUser()?.rol === 'ADMIN';

  regionesFiltradas = computed(() => {
    const activo = this.filtroActivo();
    if (activo === null) return this.regiones();
    return this.regiones().filter(r => r.activo === activo);
  });

  totalActivas = computed(() => this.regiones().filter(r => r.activo).length);

  constructor(private admin: AdminService, private auth: AuthService) {}

  ngOnInit() { this.load(); }

  load() {
    this.loading.set(true);
    this.admin.getRegiones().subscribe({ next: rs => { this.regiones.set(rs); this.loading.set(false); }, error: () => this.loading.set(false) });
  }

  openNew() { this.form = { nombre: '' }; this.editId.set(null); this.formError.set(''); this.showModal.set(true); }
  openEdit(r: RegionAdmin) { this.form = { nombre: r.nombre }; this.editId.set(r.id); this.formError.set(''); this.showModal.set(true); }
  closeModal() { this.showModal.set(false); }

  save() {
    if (!this.form.nombre.trim()) { this.formError.set('El nombre es obligatorio'); return; }
    this.saving.set(true);
    const req = this.editId()
      ? this.admin.updateRegion(this.editId()!, { nombre: this.form.nombre })
      : this.admin.createRegion({ nombre: this.form.nombre });
    req.subscribe({
      next: r => {
        if (this.editId()) { this.regiones.update(list => list.map(x => x.id === r.id ? r : x)); }
        else { this.regiones.update(list => [...list, r]); }
        this.saving.set(false); this.closeModal();
      },
      error: err => { this.saving.set(false); this.formError.set(err.error?.detail ?? 'Error'); },
    });
  }

  toggleActivo(r: RegionAdmin) {
    this.admin.updateRegion(r.id, { activo: !r.activo }).subscribe({
      next: updated => this.regiones.update(list => list.map(x => x.id === updated.id ? updated : x)),
    });
  }
}
