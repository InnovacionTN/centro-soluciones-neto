import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminService, UsuarioAdmin } from '../../core/services/admin.service';

@Component({
  selector: 'app-admin-usuarios',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="usr-page">

      <!-- ── Header ── -->
      <div class="page-header">
        <div class="header-left">
          <div class="title-row">
            <h2 class="page-title">Usuarios</h2>
            <button class="tip-btn tip-btn--down"
              data-tooltip="Administra todos los usuarios del sistema: administradores, agentes del Call Center y cuentas de tienda. Cada rol tiene acceso diferente a las funciones de la plataforma.">?</button>
            <span class="total-chip">{{ usuarios().length }} usuarios · {{ activosCount() }} activos</span>
          </div>
          <div class="filter-row">
            <div class="search-wrap">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input class="search-input" [(ngModel)]="busqueda" placeholder="Buscar por nombre o email…" />
              @if (busqueda) {
                <button class="search-clear" (click)="busqueda = ''">✕</button>
              }
            </div>
            <div class="filter-pills">
              @for (r of roles; track r.value) {
                <button class="pill" [class.pill--active]="filtroRol() === r.value" (click)="filtroRol.set(r.value)">
                  <span [class]="r.dotClass"></span>{{ r.label }}
                  <span class="pill-count">{{ contarRol(r.value) }}</span>
                </button>
              }
            </div>
            <div class="toggle-group">
              <button class="toggle-btn" [class.toggle-btn--active]="filtroActivo() === null"  (click)="filtroActivo.set(null)">Todos</button>
              <button class="toggle-btn" [class.toggle-btn--active]="filtroActivo() === true"  (click)="filtroActivo.set(true)">Activos</button>
              <button class="toggle-btn" [class.toggle-btn--active]="filtroActivo() === false" (click)="filtroActivo.set(false)">Inactivos</button>
            </div>
          </div>
        </div>
        <button class="btn-primary" (click)="openNew()">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Nuevo usuario
        </button>
      </div>

      <!-- ── Skeleton ── -->
      @if (loading()) {
        <div class="user-grid">
          @for (i of [1,2,3,4,5,6]; track i) {
            <div class="user-card sk-card">
              <div class="sk sk--avatar"></div>
              <div class="sk-info">
                <div class="sk sk--name"></div>
                <div class="sk sk--email"></div>
              </div>
            </div>
          }
        </div>

      } @else if (usuariosFiltrados().length === 0) {
        <div class="empty-state">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
          </svg>
          <p>No se encontraron usuarios</p>
        </div>

      } @else {
        <div class="user-grid">
          @for (u of usuariosFiltrados(); track u.id) {
            <div class="user-card" [class.user-card--inactive]="!u.activo">
              <div class="card-top">
                <div [class]="avatarClass(u.rol)">{{ initials(u.nombre) }}</div>
                <div class="user-info">
                  <span class="user-name">{{ u.nombre }}</span>
                  <span class="user-email">{{ u.email }}</span>
                </div>
                <div class="status-dot" [class]="u.activo ? 'dot--on' : 'dot--off'"
                  [title]="u.activo ? 'Activo' : 'Inactivo'"></div>
              </div>
              <div class="card-mid">
                <span [class]="rolBadge(u.rol)">{{ rolLabel(u.rol) }}</span>
                @if ((u.rol === 'ADMIN_AREA' || u.rol === 'COORDINADOR') && u.area_restriccion) {
                  <span class="area-chip">{{ u.area_restriccion }}</span>
                }
                @if (u.grupo_id) {
                  <span class="assign-chip">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
                    {{ nombreGrupo(u.grupo_id) }}
                  </span>
                }
                @if (u.tienda_id) {
                  <span class="assign-chip">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>
                    Tienda #{{ u.tienda_id }}
                  </span>
                }
              </div>
              <div class="card-actions">
                <button class="act-btn" (click)="openEdit(u)">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                  Editar
                </button>
                <button class="act-btn" [class.act-btn--danger]="u.activo" (click)="toggleActivo(u)">
                  {{ u.activo ? 'Desactivar' : 'Activar' }}
                </button>
              </div>
            </div>
          }
        </div>
      }

      <!-- ── Modal ── -->
      @if (showModal()) {
        <div class="modal-backdrop" (click)="closeModal()">
          <div class="modal-box" (click)="$event.stopPropagation()">
            <div class="modal-header">
              <h3 class="modal-title">{{ editId() ? 'Editar usuario' : 'Nuevo usuario' }}</h3>
              <button class="modal-close" (click)="closeModal()">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div class="modal-body">

              <div class="mrow-2">
                <div class="mfield">
                  <label class="mfield-label">
                    Nombre completo
                    <button class="tip-btn tip-btn--xs"
                      data-tooltip="Nombre real del usuario. Aparecerá en tickets, reportes y en el historial de actividad.">?</button>
                  </label>
                  <input class="minput" [(ngModel)]="form.nombre" placeholder="Ej. María González" />
                </div>
                <div class="mfield">
                  <label class="mfield-label">
                    Email corporativo
                    <button class="tip-btn tip-btn--xs"
                      data-tooltip="Correo con dominio @soyneto.com. Se usará como nombre de usuario para iniciar sesión.">?</button>
                  </label>
                  <input class="minput" type="email" [(ngModel)]="form.email" placeholder="usuario@soyneto.com" />
                </div>
              </div>

              <div class="mfield">
                <label class="mfield-label">
                  Contraseña {{ editId() ? '(vacío = sin cambios)' : '' }}
                  <button class="tip-btn tip-btn--xs"
                    data-tooltip="Mínimo 8 caracteres. Para usuarios existentes, deja el campo vacío si no quieres cambiar la contraseña.">?</button>
                </label>
                <input class="minput" type="password" [(ngModel)]="form.password"
                  [placeholder]="editId() ? 'Dejar vacío para no cambiar' : 'Mínimo 8 caracteres'" />
              </div>

              <div class="mrow-2">
                <div class="mfield">
                  <label class="mfield-label">
                    Rol
                    <button class="tip-btn tip-btn--xs"
                      data-tooltip="Define qué puede hacer el usuario: ADMIN tiene acceso total, ADMIN_AREA gestiona una dirección, COORDINADOR supervisa su área, AGENTE atiende tickets, TIENDA solo abre tickets.">?</button>
                  </label>
                  <select class="minput" [(ngModel)]="form.rol">
                    <option value="">Selecciona un rol…</option>
                    <option value="ADMIN">Administrador</option>
                    <option value="ADMIN_AREA">Admin de Área</option>
                    <option value="COORDINADOR">Coordinador</option>
                    <option value="AGENTE">Agente Call Center</option>
                    <option value="TIENDA">Tienda</option>
                  </select>
                </div>
                @if (form.rol === 'ADMIN_AREA' || form.rol === 'COORDINADOR') {
                  <div class="mfield">
                    <label class="mfield-label">
                      Área que administra
                      <button class="tip-btn tip-btn--xs"
                        data-tooltip="Limita la visibilidad del usuario a esta dirección. Solo verá grupos, tipificaciones y tickets de su área asignada.">?</button>
                    </label>
                    <select class="minput" [(ngModel)]="form.area_restriccion">
                      <option value="">Sin restricción (todas)</option>
                      @for (a of areas; track a) { <option [value]="a">{{ a }}</option> }
                    </select>
                  </div>
                } @else {
                  <div></div>
                }
              </div>

              @if (form.rol === 'AGENTE') {
                <div class="mfield">
                  <label class="mfield-label">
                    Grupo del Call Center
                    <button class="tip-btn tip-btn--xs"
                      data-tooltip="El grupo al que pertenece el agente. Los tickets ruteados a ese grupo pueden ser asignados al agente.">?</button>
                  </label>
                  <select class="minput" [(ngModel)]="form.grupo_id">
                    <option [value]="null">Sin grupo asignado</option>
                    @for (g of grupos(); track g.id) {
                      <option [value]="g.id">{{ g.area_tecnica }} — {{ g.nombre }}</option>
                    }
                  </select>
                </div>
              }

              @if (form.rol === 'TIENDA') {
                <div class="mfield">
                  <label class="mfield-label">
                    Tienda
                    <button class="tip-btn tip-btn--xs"
                      data-tooltip="La tienda que representará este usuario. Solo podrá ver y crear tickets de esa tienda.">?</button>
                  </label>
                  <select class="minput" [(ngModel)]="form.tienda_id">
                    <option [value]="null">Selecciona una tienda…</option>
                    @for (t of tiendas(); track t.id) {
                      <option [value]="t.id">#{{ t.id }} — {{ t.nombre }}</option>
                    }
                  </select>
                </div>
              }

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
                  {{ editId() ? 'Guardar cambios' : 'Crear usuario' }}
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
    .usr-page { display: flex; flex-direction: column; gap: 20px; }

    /* ── Header ─────────────────────────────── */
    .page-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
    .header-left { display: flex; flex-direction: column; gap: 10px; flex: 1; }
    .title-row { display: flex; align-items: center; gap: 10px; }
    .page-title { font-size: 22px; font-weight: 700; color: var(--c-text); margin: 0; }
    .total-chip { font-size: 12px; color: var(--c-muted); background: var(--c-bg); border: 1px solid var(--c-border); border-radius: 12px; padding: 3px 10px; }
    .filter-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    .filter-pills { display: flex; gap: 6px; flex-wrap: wrap; }
    .pill { display: flex; align-items: center; gap: 5px; padding: 5px 12px; border-radius: 16px; font-size: 13px; border: 1px solid var(--c-border); background: var(--c-surface); color: var(--c-muted); cursor: pointer; transition: all .15s; }
    .pill--active { background: var(--c-blue-lt); border-color: var(--c-blue-md); color: var(--c-blue); font-weight: 500; }
    .pill-count { font-size: 11px; background: var(--c-border); border-radius: 8px; padding: 0 5px; min-width: 18px; text-align: center; }
    .pill--active .pill-count { background: var(--c-blue-md); color: #fff; }
    .pill-dot { width: 7px; height: 7px; border-radius: 50%; display: inline-block; flex-shrink: 0; }
    .dot-admin  { background: #F59E0B; }
    .dot-area   { background: #8B5CF6; }
    .dot-coord  { background: #3B82F6; }
    .dot-agente { background: #10B981; }
    .dot-tienda { background: #6B7280; }
    .dot-todos  { background: var(--c-muted); }

    /* ── Search ──────────────────────────────── */
    .search-wrap { position: relative; display: flex; align-items: center; }
    .search-wrap svg { position: absolute; left: 10px; color: var(--c-muted); pointer-events: none; }
    .search-input { padding: 7px 32px 7px 32px; border: 1px solid var(--c-border); border-radius: var(--radius-sm); background: var(--c-surface); color: var(--c-text); font-size: 13px; width: 240px; }
    .search-input:focus { outline: none; border-color: var(--c-blue); box-shadow: 0 0 0 3px var(--c-blue-lt); }
    .search-clear { position: absolute; right: 8px; background: none; border: none; color: var(--c-muted); cursor: pointer; font-size: 12px; padding: 2px 4px; }
    .search-clear:hover { color: var(--c-text); }

    /* ── Toggle ──────────────────────────────── */
    .toggle-group { display: flex; background: var(--c-bg); border: 1px solid var(--c-border); border-radius: 8px; padding: 3px; gap: 2px; }
    .toggle-btn { padding: 4px 10px; border-radius: 6px; border: none; background: transparent; color: var(--c-muted); font-size: 12px; cursor: pointer; transition: all .15s; white-space: nowrap; }
    .toggle-btn--active { background: var(--c-surface); color: var(--c-text); font-weight: 500; box-shadow: 0 1px 3px rgba(0,0,0,.08); }

    /* ── Buttons ─────────────────────────────── */
    .btn-primary { display: flex; align-items: center; gap: 6px; padding: 9px 16px; background: var(--c-blue); color: #fff; border: none; border-radius: var(--radius-sm); font-size: 13px; font-weight: 500; cursor: pointer; white-space: nowrap; transition: opacity .15s; }
    .btn-primary:hover { opacity: .88; }
    .btn-primary:disabled { opacity: .5; cursor: not-allowed; }
    .btn-secondary { padding: 9px 16px; background: var(--c-surface); color: var(--c-text); border: 1px solid var(--c-border); border-radius: var(--radius-sm); font-size: 13px; font-weight: 500; cursor: pointer; }
    .btn-secondary:hover { background: var(--c-bg); }

    /* ── Skeleton ────────────────────────────── */
    .user-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 12px; }
    .sk-card { display: flex; align-items: center; gap: 12px; padding: 16px 18px; }
    .sk { background: var(--c-border); border-radius: 6px; animation: pulse 1.4s ease-in-out infinite; }
    .sk--avatar { width: 42px; height: 42px; border-radius: 50%; flex-shrink: 0; }
    .sk-info { flex: 1; display: flex; flex-direction: column; gap: 8px; }
    .sk--name { height: 13px; width: 140px; }
    .sk--email { height: 11px; width: 180px; }
    @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.45} }

    /* ── Empty ───────────────────────────────── */
    .empty-state { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 60px 20px; color: var(--c-muted); text-align: center; }
    .empty-state svg { opacity: .4; }
    .empty-state p { margin: 0; font-size: 14px; }

    /* ── User cards ──────────────────────────── */
    .user-card { display: flex; flex-direction: column; gap: 10px; padding: 16px 18px; background: var(--c-surface); border: 1px solid var(--c-border); border-radius: var(--radius-lg); transition: box-shadow .15s; }
    .user-card:hover { box-shadow: 0 2px 12px rgba(0,0,0,.07); }
    .user-card--inactive { opacity: .6; }
    .card-top { display: flex; align-items: center; gap: 10px; }
    .avatar { width: 42px; height: 42px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 700; flex-shrink: 0; }
    .av--admin  { background: #FEF3C7; color: #92400E; }
    .av--area   { background: #EDE9FE; color: #5B21B6; }
    .av--coord  { background: #DBEAFE; color: #1E40AF; }
    .av--agente { background: #D1FAE5; color: #065F46; }
    .av--tienda { background: var(--c-bg); color: var(--c-muted); border: 1px solid var(--c-border); }
    :host-context(.dark-theme) .av--admin  { background: #451A03; color: #FCD34D; }
    :host-context(.dark-theme) .av--area   { background: #2E1065; color: #A78BFA; }
    :host-context(.dark-theme) .av--coord  { background: #0D2845; color: #60A5FA; }
    :host-context(.dark-theme) .av--agente { background: #052E16; color: #4ADE80; }
    .user-info { flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
    .user-name { font-size: 14px; font-weight: 600; color: var(--c-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .user-email { font-size: 12px; color: var(--c-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .status-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
    .dot--on { background: var(--c-green); box-shadow: 0 0 0 2px var(--c-green-lt); }
    .dot--off { background: var(--c-muted); }

    /* ── Card mid ────────────────────────────── */
    .card-mid { display: flex; gap: 5px; flex-wrap: wrap; align-items: center; }
    .rol-badge { font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 10px; }
    .rol--admin  { background: #FEF3C7; color: #92400E; }
    .rol--area   { background: #EDE9FE; color: #5B21B6; }
    .rol--coord  { background: #DBEAFE; color: #1E40AF; }
    .rol--agente { background: #D1FAE5; color: #065F46; }
    .rol--tienda { background: var(--c-bg); color: var(--c-muted); border: 1px solid var(--c-border); }
    :host-context(.dark-theme) .rol--admin  { background: #451A03; color: #FCD34D; }
    :host-context(.dark-theme) .rol--area   { background: #2E1065; color: #A78BFA; }
    :host-context(.dark-theme) .rol--coord  { background: #0D2845; color: #60A5FA; }
    :host-context(.dark-theme) .rol--agente { background: #052E16; color: #4ADE80; }
    .area-chip { font-size: 11px; padding: 2px 8px; background: var(--c-border); color: var(--c-muted); border-radius: 10px; }
    .assign-chip { display: flex; align-items: center; gap: 4px; font-size: 11px; padding: 2px 8px; background: var(--c-bg); color: var(--c-muted); border: 1px solid var(--c-border); border-radius: 10px; }

    /* ── Card actions ────────────────────────── */
    .card-actions { display: flex; gap: 6px; padding-top: 6px; border-top: 1px solid var(--c-border); }
    .act-btn { display: flex; align-items: center; gap: 4px; padding: 5px 10px; border-radius: 6px; font-size: 12px; border: 1px solid var(--c-border); background: var(--c-surface); color: var(--c-muted); cursor: pointer; transition: all .12s; }
    .act-btn:hover { background: var(--c-bg); color: var(--c-text); }
    .act-btn--danger { color: var(--c-red); border-color: var(--c-red-md); }
    .act-btn--danger:hover { background: var(--c-red-lt); }

    /* ── Tooltip system ──────────────────────── */
    .tip-btn { position: relative; width: 18px; height: 18px; border-radius: 50%; border: 1.5px solid var(--c-blue-md); background: var(--c-blue-lt); color: var(--c-blue); font-size: 11px; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; }
    .tip-btn::after { content: attr(data-tooltip); display: none; position: absolute; z-index: 999; background: #1a2535; color: #e8f0fa; font-size: 12px; line-height: 1.5; font-weight: 400; border-radius: 8px; padding: 10px 14px; pointer-events: none; box-shadow: 0 4px 20px rgba(0,0,0,.3); }
    .tip-btn:hover::after { display: block; }
    .tip-btn::after { bottom: calc(100% + 8px); left: 50%; transform: translateX(-50%); width: 260px; }
    .tip-btn--xs::after { bottom: auto; left: calc(100% + 8px); top: 50%; transform: translateY(-50%); width: 240px; }
    .tip-btn--down::after { bottom: auto; top: calc(100% + 8px); left: 0; transform: none; width: 300px; }

    /* ── Modal ───────────────────────────────── */
    .modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,.45); backdrop-filter: blur(4px); z-index: 200; display: flex; align-items: center; justify-content: center; padding: 20px; }
    .modal-box { background: var(--c-surface); border: 1px solid var(--c-border); border-radius: var(--radius-lg); width: 100%; max-width: 540px; max-height: 90vh; display: flex; flex-direction: column; box-shadow: 0 24px 60px rgba(0,0,0,.25); animation: spring-in .22s cubic-bezier(.34,1.56,.64,1) both; }
    @keyframes spring-in { from{opacity:0;transform:scale(.94)} to{opacity:1;transform:scale(1)} }
    .modal-header { display: flex; align-items: center; justify-content: space-between; padding: 20px 24px 16px; border-bottom: 1px solid var(--c-border); }
    .modal-title { font-size: 16px; font-weight: 600; color: var(--c-text); margin: 0; }
    .modal-close { width: 28px; height: 28px; border-radius: 6px; border: none; background: transparent; color: var(--c-muted); cursor: pointer; display: flex; align-items: center; justify-content: center; }
    .modal-close:hover { background: var(--c-bg); color: var(--c-text); }
    .modal-body { padding: 20px 24px; display: flex; flex-direction: column; gap: 16px; overflow-y: auto; }
    .modal-footer { padding: 16px 24px; border-top: 1px solid var(--c-border); display: flex; justify-content: flex-end; gap: 8px; }

    /* ── Form fields ─────────────────────────── */
    .mfield { display: flex; flex-direction: column; gap: 6px; }
    .mfield-label { font-size: 13px; font-weight: 500; color: var(--c-text); display: flex; align-items: center; gap: 6px; }
    .minput { padding: 9px 12px; border: 1px solid var(--c-border); border-radius: var(--radius-sm); background: var(--c-bg); color: var(--c-text); font-size: 13px; width: 100%; box-sizing: border-box; }
    .minput:focus { outline: none; border-color: var(--c-blue); box-shadow: 0 0 0 3px var(--c-blue-lt); }
    .mrow-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
    .form-error-bar { display: flex; align-items: center; gap: 8px; background: var(--c-red-lt); color: var(--c-red); border: 1px solid var(--c-red-md); border-radius: var(--radius-sm); padding: 10px 14px; font-size: 13px; }

    /* ── Spinner ─────────────────────────────── */
    .spinner { width: 14px; height: 14px; border: 2px solid rgba(255,255,255,.3); border-top-color: #fff; border-radius: 50%; animation: spin .7s linear infinite; display: inline-block; }
    @keyframes spin { to{transform:rotate(360deg)} }
  `],
})
export class AdminUsuariosComponent implements OnInit {
  usuarios  = signal<UsuarioAdmin[]>([]);
  grupos    = signal<any[]>([]);
  tiendas   = signal<any[]>([]);
  loading   = signal(true);
  showModal = signal(false);
  saving    = signal(false);
  formError = signal('');
  editId    = signal<number | null>(null);
  filtroRol    = signal('');
  filtroActivo = signal<boolean | null>(null);
  busqueda = '';

  areas = ['ABASTO', 'SISTEMAS', 'MANTENIMIENTO', 'FINANZAS', 'COMERCIAL', 'RRHH', 'OPERACIONES'];
  roles = [
    { label: 'Todos',       value: '',            dotClass: 'pill-dot dot-todos'  },
    { label: 'Admin',       value: 'ADMIN',       dotClass: 'pill-dot dot-admin'  },
    { label: 'Admin Área',  value: 'ADMIN_AREA',  dotClass: 'pill-dot dot-area'   },
    { label: 'Coordinador', value: 'COORDINADOR', dotClass: 'pill-dot dot-coord'  },
    { label: 'Agentes',     value: 'AGENTE',      dotClass: 'pill-dot dot-agente' },
    { label: 'Tiendas',     value: 'TIENDA',      dotClass: 'pill-dot dot-tienda' },
  ];

  form = this.emptyForm();

  activosCount = computed(() => this.usuarios().filter(u => u.activo).length);

  usuariosFiltrados = computed(() => {
    const rol    = this.filtroRol();
    const activo = this.filtroActivo();
    const q      = this.busqueda.toLowerCase().trim();
    return this.usuarios().filter(u => {
      if (rol && u.rol !== rol) return false;
      if (activo !== null && u.activo !== activo) return false;
      if (q && !u.nombre.toLowerCase().includes(q) && !u.email.toLowerCase().includes(q)) return false;
      return true;
    });
  });

  contarRol(valor: string): number {
    return valor ? this.usuarios().filter(u => u.rol === valor).length : this.usuarios().length;
  }

  nombreGrupo(id: number): string {
    return this.grupos().find(x => x.id === id)?.nombre ?? `Grupo #${id}`;
  }

  initials(nombre: string): string {
    return nombre.split(' ').slice(0, 2).map(p => p[0] ?? '').join('').toUpperCase();
  }

  avatarClass(rol: string): string {
    const m: Record<string, string> = {
      ADMIN: 'avatar av--admin', ADMIN_AREA: 'avatar av--area',
      COORDINADOR: 'avatar av--coord', AGENTE: 'avatar av--agente', TIENDA: 'avatar av--tienda',
    };
    return m[rol] ?? 'avatar av--tienda';
  }

  rolBadge(rol: string): string {
    const m: Record<string, string> = {
      ADMIN: 'rol-badge rol--admin', ADMIN_AREA: 'rol-badge rol--area',
      COORDINADOR: 'rol-badge rol--coord', AGENTE: 'rol-badge rol--agente', TIENDA: 'rol-badge rol--tienda',
    };
    return m[rol] ?? 'rol-badge rol--tienda';
  }

  rolLabel(rol: string): string {
    const m: Record<string, string> = {
      ADMIN: 'Administrador', ADMIN_AREA: 'Admin Área',
      COORDINADOR: 'Coordinador', AGENTE: 'Agente', TIENDA: 'Tienda',
    };
    return m[rol] ?? rol;
  }

  emptyForm() {
    return { nombre: '', email: '', password: '', rol: '', grupo_id: null as number | null, tienda_id: null as number | null, area_restriccion: '' };
  }

  constructor(private admin: AdminService) {}

  ngOnInit() { this.load(); }

  load() {
    this.loading.set(true);
    this.admin.getUsuarios().subscribe({ next: us => { this.usuarios.set(us); this.loading.set(false); }, error: () => this.loading.set(false) });
    this.admin.getGrupos().subscribe({ next: gs => this.grupos.set(gs), error: () => {} });
    this.admin.getTiendas().subscribe({ next: ts => this.tiendas.set(ts), error: () => {} });
  }

  openNew() {
    this.form = this.emptyForm();
    this.editId.set(null);
    this.formError.set('');
    this.showModal.set(true);
  }

  openEdit(u: UsuarioAdmin) {
    this.form = { nombre: u.nombre, email: u.email, password: '', rol: u.rol, grupo_id: u.grupo_id, tienda_id: u.tienda_id, area_restriccion: u.area_restriccion ?? '' };
    this.editId.set(u.id);
    this.formError.set('');
    this.showModal.set(true);
  }

  closeModal() { this.showModal.set(false); }

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
    const body: any = { ...this.form };
    if (!body.password) delete body.password;
    if (!body.area_restriccion) delete body.area_restriccion;

    const req = this.editId() ? this.admin.updateUsuario(this.editId()!, body) : this.admin.createUsuario(body);
    req.subscribe({
      next: u => {
        if (this.editId()) { this.usuarios.update(list => list.map(x => x.id === u.id ? u : x)); }
        else { this.usuarios.update(list => [u, ...list]); }
        this.saving.set(false);
        this.closeModal();
      },
      error: err => { this.saving.set(false); this.formError.set(err.error?.detail ?? 'Error al guardar'); },
    });
  }

  toggleActivo(u: UsuarioAdmin) {
    this.admin.updateUsuario(u.id, { activo: !u.activo }).subscribe({
      next: updated => this.usuarios.update(list => list.map(x => x.id === updated.id ? updated : x)),
    });
  }
}
