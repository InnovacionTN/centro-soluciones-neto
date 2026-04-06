import { __decorate } from "tslib";
import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
let AdminTipificacionesComponent = class AdminTipificacionesComponent {
    constructor(admin) {
        this.admin = admin;
        this.tipificaciones = signal([]);
        this.loading = signal(true);
        this.showForm = signal(false);
        this.saving = signal(false);
        this.formError = signal('');
        this.editId = signal(null);
        this.areas = ['ABASTO', 'SISTEMAS', 'MANTENIMIENTO', 'FINANZAS', 'COMERCIAL', 'RRHH'];
        this.form = this.emptyForm();
    }
    ngOnInit() { this.load(); }
    load() {
        this.loading.set(true);
        this.admin.getTipificaciones().subscribe({ next: ts => { this.tipificaciones.set(ts); this.loading.set(false); }, error: () => this.loading.set(false) });
    }
    emptyForm() { return { area_tecnica: '', categoria: '', problema: '', sla_horas: 24, urgencia: 'MEDIA', palabras_clave: '', requiere_foto: false }; }
    openForm() { this.form = this.emptyForm(); this.editId.set(null); this.formError.set(''); this.showForm.set(true); }
    closeForm() { this.showForm.set(false); }
    openEdit(t) {
        this.form = { area_tecnica: t.area_tecnica, categoria: t.categoria, problema: t.problema, sla_horas: t.sla_horas, urgencia: t.urgencia, palabras_clave: t.palabras_clave ?? '', requiere_foto: t.requiere_foto };
        this.editId.set(t.id);
        this.formError.set('');
        this.showForm.set(true);
    }
    save() {
        if (!this.form.area_tecnica || !this.form.categoria || !this.form.problema) {
            this.formError.set('Área, categoría y problema son obligatorios');
            return;
        }
        this.saving.set(true);
        const req = this.editId() ? this.admin.updateTipificacion(this.editId(), this.form) : this.admin.createTipificacion(this.form);
        req.subscribe({
            next: t => {
                if (this.editId()) {
                    this.tipificaciones.update(list => list.map(x => x.id === t.id ? t : x));
                }
                else {
                    this.tipificaciones.update(list => [...list, t]);
                }
                this.saving.set(false);
                this.closeForm();
            },
            error: err => { this.saving.set(false); this.formError.set(err.error?.detail ?? 'Error'); },
        });
    }
    toggleActivo(t) {
        this.admin.updateTipificacion(t.id, { activo: !t.activo }).subscribe({ next: updated => this.tipificaciones.update(list => list.map(x => x.id === updated.id ? updated : x)) });
    }
    urgBadge(u) { return { CRITICA: 'badge--red', ALTA: 'badge--amber', MEDIA: 'badge--blue', BAJA: 'badge--gray' }[u] ?? 'badge--gray'; }
};
AdminTipificacionesComponent = __decorate([
    Component({
        selector: 'app-admin-tipificaciones',
        standalone: true,
        imports: [CommonModule, FormsModule],
        template: `
    <div class="admin-section">
      <div class="section-bar">
        <h2 class="section-title">Tipificaciones</h2>
        <button class="btn btn--primary btn--sm" (click)="openForm()">+ Nueva tipificación</button>
      </div>

      @if (showForm()) {
        <div class="form-card slide-down">
          <h3 class="form-title">{{ editId() ? 'Editar tipificación' : 'Nueva tipificación' }}</h3>
          <div class="form-grid">
            <div class="field">
              <label class="field__label field__label--required">Área técnica</label>
              <select class="input" [(ngModel)]="form.area_tecnica">
                <option value="">Selecciona...</option>
                @for (a of areas; track a) { <option [value]="a">{{ a }}</option> }
              </select>
            </div>
            <div class="field">
              <label class="field__label field__label--required">Categoría</label>
              <input class="input" [(ngModel)]="form.categoria" placeholder="Ej: Conectividad" />
            </div>
            <div class="field" style="grid-column: span 2">
              <label class="field__label field__label--required">Nombre del problema</label>
              <input class="input" [(ngModel)]="form.problema" placeholder="Ej: Sin internet o antena sin señal" />
            </div>
            <div class="field">
              <label class="field__label field__label--required">SLA (horas)</label>
              <input class="input" type="number" [(ngModel)]="form.sla_horas" min="1" />
            </div>
            <div class="field">
              <label class="field__label field__label--required">Urgencia base</label>
              <select class="input" [(ngModel)]="form.urgencia">
                <option value="CRITICA">Crítica</option>
                <option value="ALTA">Alta</option>
                <option value="MEDIA">Media</option>
                <option value="BAJA">Baja</option>
              </select>
            </div>
            <div class="field" style="grid-column: span 2">
              <label class="field__label">Palabras clave (para clasificación IA fallback)</label>
              <input class="input" [(ngModel)]="form.palabras_clave" placeholder="internet antena red wifi señal (separadas por espacio)" />
              <span class="field__hint">Palabras que ayudan al fallback cuando no hay API key de Gemini</span>
            </div>
            <div class="field">
              <label class="field__label">¿Requiere foto?</label>
              <label style="display:flex;align-items:center;gap:8px;margin-top:8px;font-size:13px">
                <input type="checkbox" [(ngModel)]="form.requiere_foto" />
                Sí, el agente debe pedir evidencia fotográfica
              </label>
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
        <div class="loading-msg">Cargando tipificaciones...</div>
      } @else {
        <div class="tabla-wrapper">
        <div class="admin-table">
          <div class="table-head-tip">
            <span>Área</span><span>Categoría</span><span>Problema</span>
            <span>SLA</span><span>Urgencia</span><span>Estado</span><span>Acciones</span>
          </div>
          @for (t of tipificaciones(); track t.id) {
            <div class="table-row-tip" [class.row-inactivo]="!t.activo">
              <span><span class="badge badge--blue">{{ t.area_tecnica }}</span></span>
              <span class="text-sm">{{ t.categoria }}</span>
              <span class="text-sm font-medium">{{ t.problema }}</span>
              <span class="text-sm">{{ t.sla_horas }}h</span>
              <span><span class="badge" [class]="urgBadge(t.urgencia)">{{ t.urgencia }}</span></span>
              <span>
                <span class="badge" [class]="t.activo ? 'badge--green' : 'badge--gray'">
                  {{ t.activo ? 'Activa' : 'Inactiva' }}
                </span>
              </span>
              <span class="row-actions">
                <button class="btn btn--ghost btn--sm" (click)="openEdit(t)">Editar</button>
                <button class="btn btn--ghost btn--sm" (click)="toggleActivo(t)">
                  {{ t.activo ? 'Desactivar' : 'Activar' }}
                </button>
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
    .form-card { background: var(--c-bg); border: 1px solid var(--c-border); border-radius: var(--radius-lg); padding: 20px; }
    .form-title { font-size: 15px; font-weight: 600; margin-bottom: 16px; }
    .form-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px; margin-bottom: 14px; }
    @media (max-width: 640px) { .form-grid { grid-template-columns: 1fr; } }
    .form-error { background: var(--c-red-lt); color: var(--c-red); border: 1px solid var(--c-red-md); border-radius: var(--radius-sm); padding: 8px 12px; font-size: 13px; margin-bottom: 12px; }
    .form-actions { display: flex; gap: 10px; justify-content: flex-end; }
    .loading-msg { padding: 40px; text-align: center; color: var(--c-muted); font-size: 14px; }
        .tabla-wrapper { overflow-x: auto; max-height: 65vh; overflow-y: auto; border-radius: var(--radius-lg); }
    .admin-table { background: var(--c-surface); border: 1px solid var(--c-border); min-width: 700px; }
    .table-head-tip { display: grid; grid-template-columns: 110px 120px 1fr 60px 90px 80px 130px; gap: 10px; padding: 10px 16px; background: var(--c-bg); border-bottom: 1px solid var(--c-border); font-size: 11px; font-weight: 600; color: var(--c-muted); text-transform: uppercase; }
    .table-row-tip { display: grid; grid-template-columns: 110px 120px 1fr 60px 90px 80px 130px; gap: 10px; align-items: center; padding: 12px 16px; border-bottom: 1px solid var(--c-border); font-size: 13px; }
    .table-row-tip:last-child { border-bottom: none; }
    .table-row-tip:hover { background: var(--c-bg); }
    .row-inactivo { opacity: .6; }
    .row-actions { display: flex; gap: 6px; }
  `],
    })
], AdminTipificacionesComponent);
export { AdminTipificacionesComponent };
//# sourceMappingURL=admin-tipificaciones.component.js.map