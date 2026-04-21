import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminService, GrupoAdmin, RegionAdmin } from '../../core/services/admin.service';

@Component({
  selector: 'app-admin-grupos',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="admin-section">
      <div class="section-bar">
        <div class="section-bar-left">
          <h2 class="section-title">Grupos del Call Center</h2>
          <span class="total-badge">{{ gruposFiltrados().length }} de {{ grupos().length }}</span>
        </div>
        <button class="btn btn--primary btn--sm" (click)="openForm()">+ Nuevo grupo</button>
      </div>

      <!-- Filtro área -->
      <div class="filter-row">
        <button class="filter-btn" [class.filter-btn--active]="filtroArea() === ''" (click)="filtroArea.set('')">
          Todas <span class="filter-count">{{ grupos().length }}</span>
        </button>
        @for (a of areas; track a) {
          <button class="filter-btn" [class.filter-btn--active]="filtroArea() === a" (click)="filtroArea.set(a)">
            {{ a }} <span class="filter-count">{{ contarArea(a) }}</span>
          </button>
        }
      </div>

      <!-- Filtro región -->
      <div class="filter-region">
        <label class="field__label">Región:</label>
        <select class="input input--sm" [ngModel]="filtroRegion()" (ngModelChange)="filtroRegion.set($event)">
          <option value="">Todas las regiones</option>
          @for (r of regiones(); track r.id) {
            <option [value]="r.id">{{ r.nombre }}</option>
          }
        </select>
      </div>

      @if (showForm()) {
        <div class="form-card slide-down">
          <h3 class="form-title">{{ editId() ? 'Editar grupo' : 'Nuevo grupo' }}</h3>
          <div class="form-grid">
            <div class="field">
              <label class="field__label field__label--required">Nombre del grupo</label>
              <input class="input" [(ngModel)]="form.nombre" placeholder="Ej: Sistemas SION" />
            </div>
            <div class="field">
              <label class="field__label field__label--required">Área técnica</label>
              <select class="input" [(ngModel)]="form.area_tecnica">
                <option value="">Selecciona...</option>
                @for (a of areas; track a) { <option [value]="a">{{ a }}</option> }
              </select>
            </div>
            <div class="field">
              <label class="field__label">Región</label>
              <select class="input" [(ngModel)]="form.region_id">
                <option [ngValue]="null">Sin región</option>
                @for (r of regiones(); track r.id) {
                  <option [ngValue]="r.id">{{ r.nombre }}</option>
                }
              </select>
            </div>
            <div class="field">
              <label class="field__label">Canal de Slack</label>
              <input class="input" [(ngModel)]="form.slack_canal" placeholder="#cc-sistemas" />
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
        <div class="loading-msg">Cargando grupos...</div>
      } @else if (gruposFiltrados().length === 0) {
        <div class="empty-msg">No hay grupos con los filtros seleccionados.</div>
      } @else {
        <div class="tabla-wrapper">
          <div class="admin-table">
            <div class="table-head-g">
              <span>Nombre</span><span>Área</span><span>Región</span><span>Slack</span><span>Estado</span><span>Acciones</span>
            </div>
            @for (g of gruposFiltrados(); track g.id) {
              <div class="table-row-g">
                <span class="font-medium">{{ g.nombre }}</span>
                <span><span class="badge badge--purple">{{ g.area_tecnica }}</span></span>
                <span class="text-sm text-muted">{{ nombreRegion(g.region_id) }}</span>
                <span class="text-sm text-muted">{{ g.slack_canal ?? '—' }}</span>
                <span><span class="badge" [class]="g.activo ? 'badge--green' : 'badge--gray'">{{ g.activo ? 'Activo' : 'Inactivo' }}</span></span>
                <span class="row-actions">
                  <button class="btn btn--ghost btn--sm" (click)="openEdit(g)">Editar</button>
                  <button class="btn btn--ghost btn--sm" (click)="toggleActivo(g)">{{ g.activo ? 'Desactivar' : 'Activar' }}</button>
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
    .filter-region { display: flex; align-items: center; gap: 10px; }
    .filter-region .field__label { white-space: nowrap; font-size: 13px; color: var(--c-muted); }
    .input--sm { padding: 4px 8px; font-size: 13px; width: 200px; }
    .form-card { background: var(--c-bg); border: 1px solid var(--c-border); border-radius: var(--radius-lg); padding: 20px; }
    .form-title { font-size: 15px; font-weight: 600; margin-bottom: 16px; }
    .form-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px; margin-bottom: 14px; }
    .form-error { background: var(--c-red-lt); color: var(--c-red); border: 1px solid var(--c-red-md); border-radius: var(--radius-sm); padding: 8px 12px; font-size: 13px; margin-bottom: 12px; }
    .form-actions { display: flex; gap: 10px; justify-content: flex-end; }
    .loading-msg, .empty-msg { padding: 40px; text-align: center; color: var(--c-muted); }
    .tabla-wrapper { overflow-x: auto; max-height: 65vh; overflow-y: auto; border-radius: var(--radius-lg); }
    .admin-table { background: var(--c-surface); border: 1px solid var(--c-border); min-width: 800px; }
    .table-head-g { display: grid; grid-template-columns: 1.5fr 120px 120px 1fr 90px 160px; gap: 10px; padding: 10px 16px; background: var(--c-bg); border-bottom: 1px solid var(--c-border); font-size: 11px; font-weight: 600; color: var(--c-muted); text-transform: uppercase; }
    .table-row-g { display: grid; grid-template-columns: 1.5fr 120px 120px 1fr 90px 160px; gap: 10px; align-items: center; padding: 12px 16px; border-bottom: 1px solid var(--c-border); font-size: 13px; }
    .table-row-g:last-child { border-bottom: none; }
    .table-row-g:hover { background: var(--c-bg); }
    .row-actions { display: flex; gap: 6px; }
  `],
})
export class AdminGruposComponent implements OnInit {
  grupos = signal<GrupoAdmin[]>([]);
  regiones = signal<RegionAdmin[]>([]);
  loading = signal(true);
  showForm = signal(false);
  saving = signal(false);
  formError = signal('');
  editId = signal<number | null>(null);
  filtroArea = signal('');
  filtroRegion = signal<number | ''>('');

  areas = ['ABASTO', 'SISTEMAS', 'MANTENIMIENTO', 'FINANZAS', 'COMERCIAL', 'RRHH', 'OPERACIONES'];
  form = this.emptyForm();

  gruposFiltrados = computed(() => {
    let list = this.grupos();
    const area = this.filtroArea();
    const region = this.filtroRegion();
    if (area) list = list.filter(g => g.area_tecnica === area);
    if (region) list = list.filter(g => g.region_id === Number(region));
    return list;
  });

  contarArea(area: string): number {
    return this.grupos().filter(g => g.area_tecnica === area).length;
  }

  constructor(private admin: AdminService) { }

  ngOnInit() {
    this.load();
    this.admin.getRegiones().subscribe({ next: rs => this.regiones.set(rs), error: () => {} });
  }

  load() {
    this.loading.set(true);
    this.admin.getGrupos().subscribe({
      next: gs => { this.grupos.set(gs); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  emptyForm() { return { nombre: '', area_tecnica: '', region_id: null as number | null, slack_canal: '' }; }

  openForm() { this.form = this.emptyForm(); this.editId.set(null); this.formError.set(''); this.showForm.set(true); }
  closeForm() { this.showForm.set(false); }

  openEdit(g: GrupoAdmin) {
    this.form = { nombre: g.nombre, area_tecnica: g.area_tecnica, region_id: g.region_id, slack_canal: g.slack_canal ?? '' };
    this.editId.set(g.id); this.formError.set(''); this.showForm.set(true);
  }

  nombreRegion(id: number | null): string {
    if (!id) return '—';
    return this.regiones().find(r => r.id === id)?.nombre ?? `#${id}`;
  }

  save() {
    if (!this.form.nombre || !this.form.area_tecnica) { this.formError.set('Nombre y área son obligatorios'); return; }
    this.saving.set(true);
    const req = this.editId() ? this.admin.updateGrupo(this.editId()!, this.form) : this.admin.createGrupo(this.form);
    req.subscribe({
      next: g => {
        if (this.editId()) { this.grupos.update(list => list.map(x => x.id === g.id ? g : x)); }
        else { this.grupos.update(list => [...list, g]); }
        this.saving.set(false); this.closeForm();
      },
      error: err => { this.saving.set(false); this.formError.set(err.error?.detail ?? 'Error'); },
    });
  }

  toggleActivo(g: GrupoAdmin) {
    this.admin.updateGrupo(g.id, { activo: !g.activo }).subscribe({
      next: updated => this.grupos.update(list => list.map(x => x.id === updated.id ? updated : x)),
    });
  }
}
