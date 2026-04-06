import { __decorate } from "tslib";
import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
let AdminUsuariosComponent = class AdminUsuariosComponent {
    constructor(admin) {
        this.admin = admin;
        this.usuarios = signal([]);
        this.grupos = signal([]);
        this.tiendas = signal([]);
        this.loading = signal(true);
        this.showForm = signal(false);
        this.saving = signal(false);
        this.formError = signal('');
        this.editId = signal(null);
        this.filtroRol = '';
        this.form = this.emptyForm();
        this.roles = [
            { label: 'Todos', value: '' },
            { label: 'Admin', value: 'ADMIN' },
            { label: 'Agentes', value: 'AGENTE' },
            { label: 'Tiendas', value: 'TIENDA' },
        ];
        this.usuariosFiltrados = () => this.filtroRol ? this.usuarios().filter(u => u.rol === this.filtroRol) : this.usuarios();
    }
    ngOnInit() { this.load(); }
    load() {
        this.loading.set(true);
        this.admin.getUsuarios().subscribe({ next: us => { this.usuarios.set(us); this.loading.set(false); }, error: () => this.loading.set(false) });
        this.admin.getGrupos().subscribe({ next: gs => this.grupos.set(gs), error: () => { } });
        this.admin.getTiendas().subscribe({ next: ts => this.tiendas.set(ts), error: () => { } });
    }
    nombreGrupo(id) {
        const g = this.grupos().find((x) => x.id === id);
        return g?.nombre ?? `Grupo #${id}`;
    }
    emptyForm() { return { nombre: '', email: '', password: '', rol: '', grupo_id: null, tienda_id: null }; }
    openForm() { this.form = this.emptyForm(); this.editId.set(null); this.formError.set(''); this.showForm.set(true); }
    closeForm() { this.showForm.set(false); }
    openEdit(u) {
        this.form = { nombre: u.nombre, email: u.email, password: '', rol: u.rol, grupo_id: u.grupo_id, tienda_id: u.tienda_id };
        this.editId.set(u.id);
        this.formError.set('');
        this.showForm.set(true);
    }
    save() {
        if (!this.form.nombre || !this.form.email || !this.form.rol) {
            this.formError.set('Nombre, email y rol son obligatorios');
            return;
        }
        if (!this.editId() && !this.form.password) {
            this.formError.set('La contraseña es obligatoria para usuarios nuevos');
            return;
        }
        this.saving.set(true);
        this.formError.set('');
        const body = { ...this.form };
        if (!body.password)
            delete body.password;
        const req = this.editId()
            ? this.admin.updateUsuario(this.editId(), body)
            : this.admin.createUsuario(body);
        req.subscribe({
            next: u => {
                if (this.editId()) {
                    this.usuarios.update(list => list.map(x => x.id === u.id ? u : x));
                }
                else {
                    this.usuarios.update(list => [u, ...list]);
                }
                this.saving.set(false);
                this.closeForm();
            },
            error: err => { this.saving.set(false); this.formError.set(err.error?.detail ?? 'Error al guardar'); },
        });
    }
    toggleActivo(u) {
        this.admin.updateUsuario(u.id, { activo: !u.activo }).subscribe({
            next: updated => this.usuarios.update(list => list.map(x => x.id === updated.id ? updated : x)),
        });
    }
    setRol(rol) { this.filtroRol = rol; }
    rolBadge(rol) {
        return { ADMIN: 'badge--amber', AGENTE: 'badge--purple', TIENDA: 'badge--blue' }[rol] ?? 'badge--gray';
    }
};
AdminUsuariosComponent = __decorate([
    Component({
        selector: 'app-admin-usuarios',
        standalone: true,
        imports: [CommonModule, FormsModule],
        template: `
    <div class="admin-section">
      <div class="section-bar">
        <h2 class="section-title">Usuarios del sistema</h2>
        <button class="btn btn--primary btn--sm" (click)="openForm()">+ Nuevo usuario</button>
      </div>

      <!-- Filtros -->
      <div class="filter-row">
        @for (r of roles; track r.value) {
          <button class="filter-btn" [class.filter-btn--active]="filtroRol === r.value" (click)="setRol(r.value)">
            {{ r.label }}
          </button>
        }
      </div>

      <!-- Formulario -->
      @if (showForm()) {
        <div class="form-card slide-down">
          <h3 class="form-title">{{ editId() ? 'Editar usuario' : 'Nuevo usuario' }}</h3>
          <div class="form-grid">
            <div class="field">
              <label class="field__label field__label--required">Nombre</label>
              <input class="input" [(ngModel)]="form.nombre" placeholder="Nombre completo" />
            </div>
            <div class="field">
              <label class="field__label field__label--required">Email corporativo</label>
              <input class="input" type="email" [(ngModel)]="form.email" placeholder="usuario@soyneto.com" />
            </div>
            <div class="field">
              <label class="field__label" [class.field__label--required]="!editId()">
                Contraseña {{ editId() ? '(dejar vacío para no cambiar)' : '' }}
              </label>
              <input class="input" type="password" [(ngModel)]="form.password" placeholder="Mínimo 8 caracteres" />
            </div>
            <div class="field">
              <label class="field__label field__label--required">Rol</label>
              <select class="input" [(ngModel)]="form.rol">
                <option value="">Selecciona...</option>
                <option value="ADMIN">Administrador</option>
                <option value="AGENTE">Agente Call Center</option>
                <option value="TIENDA">Tienda</option>
              </select>
            </div>
            @if (form.rol === 'AGENTE') {
              <div class="field">
                <label class="field__label field__label--required">Grupo CC</label>
                <select class="input" [(ngModel)]="form.grupo_id">
                  <option [value]="null">Selecciona grupo...</option>
                  @for (g of grupos(); track g.id) {
                    <option [value]="g.id">{{ g.area_tecnica }} — {{ g.nombre }}</option>
                  }
                </select>
              </div>
            }
            @if (form.rol === 'TIENDA') {
              <div class="field">
                <label class="field__label field__label--required">Tienda</label>
                <select class="input" [(ngModel)]="form.tienda_id">
                  <option [value]="null">Selecciona tienda...</option>
                  @for (t of tiendas(); track t.id) {
                    <option [value]="t.id">#{{ t.id }} — {{ t.nombre }}</option>
                  }
                </select>
              </div>
            }
          </div>
          @if (formError()) { <div class="form-error">⚠ {{ formError() }}</div> }
          <div class="form-actions">
            <button class="btn btn--ghost" (click)="closeForm()">Cancelar</button>
            <button class="btn btn--primary" [class.btn--loading]="saving()" [disabled]="saving()" (click)="save()">
              {{ saving() ? '' : (editId() ? 'Guardar cambios' : 'Crear usuario') }}
            </button>
          </div>
        </div>
      }

      <!-- Tabla -->
      @if (loading()) {
        <div class="loading-msg">Cargando usuarios...</div>
      } @else {
        <div class="tabla-wrapper">
        <div class="admin-table">
          <div class="table-head">
            <span>Nombre</span><span>Email</span><span>Rol</span><span>Asignación</span><span>Estado</span><span>Acciones</span>
          </div>
          @for (u of usuariosFiltrados(); track u.id) {
            <div class="table-row">
              <span class="font-medium">{{ u.nombre }}</span>
              <span class="text-sm text-muted">{{ u.email }}</span>
              <span><span class="badge" [class]="rolBadge(u.rol)">{{ u.rol }}</span></span>
              <span class="text-sm">
                @if (u.grupo_id) {
                  {{ nombreGrupo(u.grupo_id) }}
                } @else if (u.tienda_id) {
                  Tienda #{{ u.tienda_id }}
                } @else {
                  —
                }
              </span>
              <span>
                <span class="badge" [class]="u.activo ? 'badge--green' : 'badge--gray'">
                  {{ u.activo ? 'Activo' : 'Inactivo' }}
                </span>
              </span>
              <span class="row-actions">
                <button class="btn btn--ghost btn--sm" (click)="openEdit(u)">Editar</button>
                <button class="btn btn--ghost btn--sm" [class.btn--danger]="u.activo" (click)="toggleActivo(u)">
                  {{ u.activo ? 'Desactivar' : 'Activar' }}
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
    .filter-row { display: flex; gap: 6px; flex-wrap: wrap; }
    .filter-btn { padding: 4px 12px; border-radius: 16px; font-size: 13px; border: 1px solid var(--c-border); background: var(--c-surface); color: var(--c-muted); cursor: pointer; }
    .filter-btn--active { background: var(--c-blue-lt); border-color: var(--c-blue-md); color: var(--c-blue); font-weight: 500; }
    .form-card { background: var(--c-bg); border: 1px solid var(--c-border); border-radius: var(--radius-lg); padding: 20px; }
    .form-title { font-size: 15px; font-weight: 600; margin-bottom: 16px; }
    .form-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px; margin-bottom: 14px; }
    @media (max-width: 640px) { .form-grid { grid-template-columns: 1fr; } }
    .form-error { background: var(--c-red-lt); color: var(--c-red); border: 1px solid var(--c-red-md); border-radius: var(--radius-sm); padding: 8px 12px; font-size: 13px; margin-bottom: 12px; }
    .form-actions { display: flex; gap: 10px; justify-content: flex-end; }
    .loading-msg { padding: 40px; text-align: center; color: var(--c-muted); font-size: 14px; }
    .tabla-wrapper { overflow-x: auto; max-height: 65vh; overflow-y: auto; border-radius: var(--radius-lg); }
    .admin-table { background: var(--c-surface); border: 1px solid var(--c-border); min-width: 700px; }
    .table-head { display: grid; grid-template-columns: 1fr 1.5fr 100px 120px 90px 140px; gap: 12px; padding: 10px 16px; background: var(--c-bg); border-bottom: 1px solid var(--c-border); font-size: 11px; font-weight: 600; color: var(--c-muted); text-transform: uppercase; letter-spacing: .04em; }
    .table-row { display: grid; grid-template-columns: 1fr 1.5fr 100px 120px 90px 140px; gap: 12px; align-items: center; padding: 12px 16px; border-bottom: 1px solid var(--c-border); font-size: 13px; }
    .table-row:last-child { border-bottom: none; }
    .table-row:hover { background: var(--c-bg); }
    .row-actions { display: flex; gap: 6px; }
    .btn--danger { color: var(--c-red) !important; border-color: var(--c-red-md) !important; }
  `],
    })
], AdminUsuariosComponent);
export { AdminUsuariosComponent };
//# sourceMappingURL=admin-usuarios.component.js.map