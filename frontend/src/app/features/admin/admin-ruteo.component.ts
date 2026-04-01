import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminService, ReglaRuteo, TipAdmin } from '../../core/services/admin.service';

@Component({
  selector: 'app-admin-ruteo',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="admin-section">
      <div class="section-bar">
        <h2 class="section-title">Matriz de ruteo</h2>
        <button class="btn btn--primary btn--sm" (click)="showForm.set(!showForm())">
          {{ showForm() ? 'Cancelar' : '+ Nueva regla' }}
        </button>
      </div>
      <p class="section-desc text-sm text-muted">
        Define qué grupo del Call Center atiende cada tipo de problema por zona.
        Zona vacía = aplica a todas las zonas.
      </p>

      @if (showForm()) {
        <div class="form-card slide-down">
          <div class="form-grid-3">
            <div class="field">
              <label class="field__label field__label--required">Tipificación</label>
              <select class="input" [(ngModel)]="form.tipificacion_id">
                <option [value]="0">Selecciona...</option>
                @for (t of tips(); track t.id) {
                  <option [value]="t.id">{{ t.area_tecnica }} / {{ t.problema }}</option>
                }
              </select>
            </div>
            <div class="field">
              <label class="field__label field__label--required">Grupo destino</label>
              <select class="input" [(ngModel)]="form.grupo_id">
                <option [value]="0">Selecciona...</option>
                @for (g of grupos(); track g.id) {
                  <option [value]="g.id">{{ g.area_tecnica }} — {{ g.nombre }}</option>
                }
              </select>
            </div>
            <div class="field">
              <label class="field__label">Prioridad</label>
              <input class="input" type="number" [(ngModel)]="form.prioridad" min="1" />
              <span class="field__hint">1 = mayor prioridad</span>
            </div>
          </div>
          @if (formError()) { <div class="form-error">⚠ {{ formError() }}</div> }
          <div class="form-actions">
            <button class="btn btn--primary btn--sm" [class.btn--loading]="saving()" [disabled]="saving()" (click)="save()">
              {{ saving() ? '' : 'Agregar regla' }}
            </button>
          </div>
        </div>
      }

      @if (loading()) {
        <div class="loading-msg">Cargando matriz de ruteo...</div>
      } @else {
        <div class="tabla-wrapper">
        <div class="admin-table">
          <div class="table-head-ruteo">
            <span>Tipificación</span><span>Área</span><span>Grupo destino</span><span>Zona</span><span>Prioridad</span><span></span>
          </div>
          @for (r of reglas(); track r.id) {
            <div class="table-row-ruteo">
              <span class="text-sm font-medium">{{ r.tipificacion?.problema ?? '#' + r.tipificacion_id }}</span>
              <span><span class="badge badge--blue">{{ r.tipificacion?.area_tecnica ?? '?' }}</span></span>
              <span class="text-sm">{{ r.grupo?.nombre ?? '#' + r.grupo_id }}</span>
              <span class="text-sm text-muted">{{ r.zona_id ? '#' + r.zona_id : 'Todas' }}</span>
              <span class="text-sm">{{ r.prioridad }}</span>
              <span>
                <button class="btn btn--ghost btn--sm" style="color:var(--c-red)" (click)="deleteRegla(r)">Eliminar</button>
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
    .section-title { font-size: 17px; font-weight: 600; }
    .section-desc { margin-top: -8px; }
    .form-card { background: var(--c-bg); border: 1px solid var(--c-border); border-radius: var(--radius-lg); padding: 20px; }
    .form-grid-3 { display: grid; grid-template-columns: 1fr 1fr 120px; gap: 14px; margin-bottom: 14px; }
    @media (max-width: 640px) { .form-grid-3 { grid-template-columns: 1fr; } }
    .form-error { background: var(--c-red-lt); color: var(--c-red); border: 1px solid var(--c-red-md); border-radius: var(--radius-sm); padding: 8px 12px; font-size: 13px; margin-bottom: 10px; }
    .form-actions { display: flex; justify-content: flex-end; }
    .loading-msg { padding: 40px; text-align: center; color: var(--c-muted); }
        .tabla-wrapper { overflow-x: auto; max-height: 65vh; overflow-y: auto; border-radius: var(--radius-lg); }
    .admin-table { background: var(--c-surface); border: 1px solid var(--c-border); min-width: 700px; }
    .table-head-ruteo { display: grid; grid-template-columns: 1fr 110px 1fr 80px 80px 90px; gap: 10px; padding: 10px 16px; background: var(--c-bg); border-bottom: 1px solid var(--c-border); font-size: 11px; font-weight: 600; color: var(--c-muted); text-transform: uppercase; }
    .table-row-ruteo { display: grid; grid-template-columns: 1fr 110px 1fr 80px 80px 90px; gap: 10px; align-items: center; padding: 12px 16px; border-bottom: 1px solid var(--c-border); font-size: 13px; }
    .table-row-ruteo:last-child { border-bottom: none; }
    .table-row-ruteo:hover { background: var(--c-bg); }
  `],
})
export class AdminRuteoComponent implements OnInit {
  reglas = signal<ReglaRuteo[]>([]);
  tips = signal<TipAdmin[]>([]);
  grupos = signal<any[]>([]);
  loading = signal(true);
  showForm = signal(false);
  saving = signal(false);
  formError = signal('');
  form = { tipificacion_id: 0, grupo_id: 0, zona_id: null as number | null, prioridad: 1 };

  constructor(private admin: AdminService) { }
  ngOnInit() {
    this.admin.getRuteo().subscribe({ next: rs => { this.reglas.set(rs); this.loading.set(false); }, error: () => this.loading.set(false) });
    this.admin.getTipificaciones(true).subscribe({ next: ts => this.tips.set(ts) });
    this.admin.getGrupos().subscribe({ next: gs => this.grupos.set(gs) });
  }

  save() {
    if (!this.form.tipificacion_id || !this.form.grupo_id) { this.formError.set('Tipificación y grupo son obligatorios'); return; }
    this.saving.set(true);
    this.admin.createRegla(this.form).subscribe({
      next: r => { this.reglas.update(list => [...list, r]); this.saving.set(false); this.showForm.set(false); this.form = { tipificacion_id: 0, grupo_id: 0, zona_id: null, prioridad: 1 }; },
      error: err => { this.saving.set(false); this.formError.set(err.error?.detail ?? 'Error'); },
    });
  }

  deleteRegla(r: ReglaRuteo) {
    if (!confirm(`¿Eliminar la regla para "${r.tipificacion?.problema}"?`)) return;
    this.admin.deleteRegla(r.id).subscribe({ next: () => this.reglas.update(list => list.filter(x => x.id !== r.id)) });
  }
}