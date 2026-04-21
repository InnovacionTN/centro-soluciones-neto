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
    <div class="admin-section">
      <div class="section-bar">
        <div class="section-bar-left">
          <h2 class="section-title">Zonas</h2>
          <span class="total-badge">{{ zonasFiltradas().length }} de {{ zonas().length }}</span>
        </div>
        @if (esSuperAdmin()) {
          <button class="btn btn--primary btn--sm" (click)="openForm()">+ Nueva zona</button>
        }
      </div>

      <!-- Filtros -->
      <div class="filter-row">
        <button class="filter-btn" [class.filter-btn--active]="filtroRegion() === ''" (click)="filtroRegion.set('')">
          Todas las regiones <span class="filter-count">{{ zonas().length }}</span>
        </button>
        @for (r of regiones(); track r.id) {
          <button class="filter-btn" [class.filter-btn--active]="filtroRegion() === r.id" (click)="filtroRegion.set(r.id)">
            {{ r.nombre }} <span class="filter-count">{{ contarRegion(r.id) }}</span>
          </button>
        }
      </div>
      <div class="filter-row">
        <button class="filter-btn" [class.filter-btn--active]="filtroActivo() === null"  (click)="filtroActivo.set(null)">Todas</button>
        <button class="filter-btn" [class.filter-btn--active]="filtroActivo() === true"  (click)="filtroActivo.set(true)">Solo activas</button>
        <button class="filter-btn" [class.filter-btn--active]="filtroActivo() === false" (click)="filtroActivo.set(false)">Solo inactivas</button>
      </div>

      @if (showForm()) {
        <div class="form-card slide-down">
          <h3 class="form-title">{{ editId() ? 'Editar zona' : 'Nueva zona' }}</h3>
          <div class="form-grid">
            <div class="field">
              <label class="field__label field__label--required">Nombre de la zona</label>
              <input class="input" [(ngModel)]="form.nombre" placeholder="Ej: ZONA METROPOLITANA" />
            </div>
            <div class="field">
              <label class="field__label field__label--required">Región</label>
              <select class="input" [(ngModel)]="form.region_id">
                <option [ngValue]="null">Selecciona región...</option>
                @for (r of regiones(); track r.id) {
                  <option [ngValue]="r.id">{{ r.nombre }}</option>
                }
              </select>
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
        <div class="loading-msg">Cargando zonas...</div>
      } @else if (zonasFiltradas().length === 0) {
        <div class="empty-msg">No hay zonas con los filtros seleccionados.</div>
      } @else {
        <div class="tabla-wrapper">
          <div class="admin-table">
            <div class="table-head-g">
              <span>Zona</span><span>Región</span><span>Estado</span><span>Acciones</span>
            </div>
            @for (z of zonasFiltradas(); track z.id) {
              <div class="table-row-g">
                <span class="font-medium">{{ z.nombre }}</span>
                <span class="text-sm text-muted">{{ nombreRegion(z.region_id) }}</span>
                <span><span class="badge" [class]="z.activo ? 'badge--green' : 'badge--gray'">{{ z.activo ? 'Activa' : 'Inactiva' }}</span></span>
                <span class="row-actions">
                  @if (esSuperAdmin()) {
                    <button class="btn btn--ghost btn--sm" (click)="openEdit(z)">Editar</button>
                    <button class="btn btn--ghost btn--sm" (click)="toggleActivo(z)">{{ z.activo ? 'Desactivar' : 'Activar' }}</button>
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
    .form-error { background: var(--c-red-lt); color: var(--c-red); border: 1px solid var(--c-red-md); border-radius: var(--radius-sm); padding: 8px 12px; font-size: 13px; margin-bottom: 12px; }
    .form-actions { display: flex; gap: 10px; justify-content: flex-end; }
    .loading-msg, .empty-msg { padding: 40px; text-align: center; color: var(--c-muted); }
    .tabla-wrapper { overflow-x: auto; max-height: 65vh; overflow-y: auto; border-radius: var(--radius-lg); }
    .admin-table { background: var(--c-surface); border: 1px solid var(--c-border); min-width: 500px; }
    .table-head-g { display: grid; grid-template-columns: 1fr 140px 100px 160px; gap: 10px; padding: 10px 16px; background: var(--c-bg); border-bottom: 1px solid var(--c-border); font-size: 11px; font-weight: 600; color: var(--c-muted); text-transform: uppercase; }
    .table-row-g { display: grid; grid-template-columns: 1fr 140px 100px 160px; gap: 10px; align-items: center; padding: 12px 16px; border-bottom: 1px solid var(--c-border); font-size: 13px; }
    .table-row-g:last-child { border-bottom: none; }
    .table-row-g:hover { background: var(--c-bg); }
    .row-actions { display: flex; gap: 6px; }
  `],
})
export class AdminZonasComponent implements OnInit {
  zonas = signal<ZonaAdmin[]>([]);
  regiones = signal<RegionAdmin[]>([]);
  loading = signal(true);
  showForm = signal(false);
  saving = signal(false);
  formError = signal('');
  editId = signal<number | null>(null);
  filtroRegion = signal<number | ''>('');
  filtroActivo = signal<boolean | null>(null);

  form = this.emptyForm();

  esSuperAdmin = () => this.auth.currentUser()?.rol === 'ADMIN';

  zonasFiltradas = computed(() => {
    let list = this.zonas();
    const region = this.filtroRegion();
    const activo = this.filtroActivo();
    if (region) list = list.filter(z => z.region_id === Number(region));
    if (activo !== null) list = list.filter(z => z.activo === activo);
    return list;
  });

  contarRegion(id: number): number {
    return this.zonas().filter(z => z.region_id === id).length;
  }

  constructor(private admin: AdminService, private auth: AuthService) { }

  ngOnInit() {
    this.load();
    this.admin.getRegiones().subscribe({ next: rs => this.regiones.set(rs), error: () => {} });
  }

  load() {
    this.loading.set(true);
    this.admin.getZonas().subscribe({
      next: zs => { this.zonas.set(zs); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  emptyForm() { return { nombre: '', region_id: null as number | null }; }
  openForm() { this.form = this.emptyForm(); this.editId.set(null); this.formError.set(''); this.showForm.set(true); }
  closeForm() { this.showForm.set(false); }

  openEdit(z: ZonaAdmin) {
    this.form = { nombre: z.nombre, region_id: z.region_id };
    this.editId.set(z.id); this.formError.set(''); this.showForm.set(true);
  }

  nombreRegion(id: number): string {
    return this.regiones().find(r => r.id === id)?.nombre ?? `#${id}`;
  }

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
        else { this.zonas.update(list => [...list, z]); }
        this.saving.set(false); this.closeForm();
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
