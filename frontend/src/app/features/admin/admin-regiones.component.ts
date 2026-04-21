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
    <div class="admin-section">
      <div class="section-bar">
        <div class="section-bar-left">
          <h2 class="section-title">Regiones</h2>
          <span class="total-badge">{{ regionesFiltradas().length }} de {{ regiones().length }}</span>
        </div>
        @if (esSuperAdmin()) {
          <button class="btn btn--primary btn--sm" (click)="openForm()">+ Nueva región</button>
        }
      </div>

      <!-- Filtro estado -->
      <div class="filter-row">
        <button class="filter-btn" [class.filter-btn--active]="filtroActivo() === null" (click)="filtroActivo.set(null)">
          Todas <span class="filter-count">{{ regiones().length }}</span>
        </button>
        <button class="filter-btn" [class.filter-btn--active]="filtroActivo() === true" (click)="filtroActivo.set(true)">
          Activas <span class="filter-count">{{ totalActivas() }}</span>
        </button>
        <button class="filter-btn" [class.filter-btn--active]="filtroActivo() === false" (click)="filtroActivo.set(false)">
          Inactivas <span class="filter-count">{{ totalInactivas() }}</span>
        </button>
      </div>

      @if (showForm()) {
        <div class="form-card slide-down">
          <h3 class="form-title">{{ editId() ? 'Editar región' : 'Nueva región' }}</h3>
          <div class="form-grid">
            <div class="field">
              <label class="field__label field__label--required">Nombre de la región</label>
              <input class="input" [(ngModel)]="form.nombre" placeholder="Ej: NORTE" />
              <span class="field__hint">Se guardará en mayúsculas</span>
            </div>
          </div>
          @if (formError()) { <div class="form-error">⚠ {{ formError() }}</div> }
          <div class="form-actions">
            <button class="btn btn--ghost" (click)="closeForm()">Cancelar</button>
            <button class="btn btn--primary" [class.btn--loading]="saving()" [disabled]="saving()" (click)="save()">
              {{ saving() ? '' : (editId() ? 'Guardar' : 'Crear') }}
            </button>
          </div>
        </div>
      }

      @if (loading()) {
        <div class="loading-msg">Cargando regiones...</div>
      } @else if (regionesFiltradas().length === 0) {
        <div class="empty-msg">No hay regiones con el filtro seleccionado.</div>
      } @else {
        <div class="tabla-wrapper">
          <div class="admin-table">
            <div class="table-head-g">
              <span>Nombre</span><span>Estado</span><span>Acciones</span>
            </div>
            @for (r of regionesFiltradas(); track r.id) {
              <div class="table-row-g">
                <span class="font-medium">{{ r.nombre }}</span>
                <span><span class="badge" [class]="r.activo ? 'badge--green' : 'badge--gray'">{{ r.activo ? 'Activa' : 'Inactiva' }}</span></span>
                <span class="row-actions">
                  @if (esSuperAdmin()) {
                    <button class="btn btn--ghost btn--sm" (click)="openEdit(r)">Editar</button>
                    <button class="btn btn--ghost btn--sm" (click)="toggleActivo(r)">{{ r.activo ? 'Desactivar' : 'Activar' }}</button>
                  }
                </span>
              </div>
            }
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .admin-section { display: flex; flex-direction: column; gap: 16px; }
    .section-bar { display: flex; justify-content: space-between; align-items: center; }
    .section-bar-left { display: flex; align-items: center; gap: 10px; }
    .section-title { font-size: 17px; font-weight: 600; }
    .total-badge { font-size: 12px; color: var(--c-muted); background: var(--c-bg); border: 1px solid var(--c-border); border-radius: 10px; padding: 2px 8px; }
    .filter-row { display: flex; gap: 6px; flex-wrap: wrap; }
    .filter-btn { display: flex; align-items: center; gap: 5px; padding: 4px 12px; border-radius: 16px; font-size: 13px; border: 1px solid var(--c-border); background: var(--c-surface); color: var(--c-muted); cursor: pointer; }
    .filter-btn--active { background: var(--c-blue-lt); border-color: var(--c-blue-md); color: var(--c-blue); font-weight: 500; }
    .filter-count { font-size: 11px; background: var(--c-border); border-radius: 8px; padding: 0 5px; min-width: 18px; text-align: center; }
    .filter-btn--active .filter-count { background: var(--c-blue-md); color: white; }
    .form-card { background: var(--c-bg); border: 1px solid var(--c-border); border-radius: var(--radius-lg); padding: 20px; }
    .form-title { font-size: 15px; font-weight: 600; margin-bottom: 16px; }
    .form-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px; margin-bottom: 14px; }
    .field__hint { font-size: 11px; color: var(--c-muted); margin-top: 4px; display: block; }
    .form-error { background: var(--c-red-lt); color: var(--c-red); border: 1px solid var(--c-red-md); border-radius: var(--radius-sm); padding: 8px 12px; font-size: 13px; margin-bottom: 12px; }
    .form-actions { display: flex; gap: 10px; justify-content: flex-end; }
    .loading-msg, .empty-msg { padding: 40px; text-align: center; color: var(--c-muted); }
    .tabla-wrapper { overflow-x: auto; max-height: 65vh; overflow-y: auto; border-radius: var(--radius-lg); }
    .admin-table { background: var(--c-surface); border: 1px solid var(--c-border); min-width: 400px; }
    .table-head-g { display: grid; grid-template-columns: 1fr 100px 160px; gap: 10px; padding: 10px 16px; background: var(--c-bg); border-bottom: 1px solid var(--c-border); font-size: 11px; font-weight: 600; color: var(--c-muted); text-transform: uppercase; }
    .table-row-g { display: grid; grid-template-columns: 1fr 100px 160px; gap: 10px; align-items: center; padding: 12px 16px; border-bottom: 1px solid var(--c-border); font-size: 13px; }
    .table-row-g:last-child { border-bottom: none; }
    .table-row-g:hover { background: var(--c-bg); }
    .row-actions { display: flex; gap: 6px; }
  `],
})
export class AdminRegionesComponent implements OnInit {
  regiones = signal<RegionAdmin[]>([]);
  loading = signal(true);
  showForm = signal(false);
  saving = signal(false);
  formError = signal('');
  editId = signal<number | null>(null);
  filtroActivo = signal<boolean | null>(null);
  form = { nombre: '' };

  esSuperAdmin = () => this.auth.currentUser()?.rol === 'ADMIN';

  regionesFiltradas = computed(() => {
    const activo = this.filtroActivo();
    if (activo === null) return this.regiones();
    return this.regiones().filter(r => r.activo === activo);
  });

  totalActivas   = computed(() => this.regiones().filter(r =>  r.activo).length);
  totalInactivas = computed(() => this.regiones().filter(r => !r.activo).length);

  constructor(private admin: AdminService, private auth: AuthService) { }

  ngOnInit() { this.load(); }

  load() {
    this.loading.set(true);
    this.admin.getRegiones().subscribe({
      next: rs => { this.regiones.set(rs); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  openForm() { this.form = { nombre: '' }; this.editId.set(null); this.formError.set(''); this.showForm.set(true); }
  closeForm() { this.showForm.set(false); }

  openEdit(r: RegionAdmin) {
    this.form = { nombre: r.nombre };
    this.editId.set(r.id); this.formError.set(''); this.showForm.set(true);
  }

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
        this.saving.set(false); this.closeForm();
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
