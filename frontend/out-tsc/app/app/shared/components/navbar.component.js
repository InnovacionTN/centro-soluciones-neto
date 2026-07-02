import { __decorate } from "tslib";
import { Component, Input, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { environment } from '../../../environments/environment';
let NavbarComponent = class NavbarComponent {
    constructor(auth, http) {
        this.auth = auth;
        this.http = http;
        this.section = '';
        this.collapsed = signal(false);
        this.notif = signal(null);
        this.api = environment.apiUrl;
    }
    ngOnInit() {
        this.fetchNotif();
        // Polling cada 30 segundos
        this.pollInterval = setInterval(() => this.fetchNotif(), 30_000);
    }
    ngOnDestroy() {
        if (this.pollInterval)
            clearInterval(this.pollInterval);
    }
    fetchNotif() {
        this.http.get(`${this.api}/notificaciones`).subscribe({
            next: n => this.notif.set(n),
            error: () => { },
        });
    }
    badgePendientes() {
        const n = this.notif();
        if (!n)
            return 0;
        return (n.pendientes_tomar ?? 0) + (n.sin_asignar ?? 0);
    }
    slaVencidos() { return this.notif()?.sla_vencidos ?? 0; }
    esperandoRespuesta() { return this.notif()?.esperando_respuesta ?? 0; }
    sinAsignar() { return this.notif()?.sin_asignar ?? 0; }
    initial() { return this.auth.currentUser()?.nombre?.charAt(0)?.toUpperCase() ?? '?'; }
    avatarClass() {
        const map = {
            TIENDA: 'avatar--tienda',
            AGENTE: 'avatar--agente',
            ADMIN: 'avatar--admin',
            COORDINADOR: 'avatar--agente',
        };
        return map[this.auth.rol() ?? ''] ?? '';
    }
    roleLabel() {
        const map = {
            TIENDA: 'Tienda',
            AGENTE: 'Agente Call Center',
            ADMIN: 'Administrador',
            COORDINADOR: 'Coordinador de Zona',
        };
        return map[this.auth.rol() ?? ''] ?? '';
    }
};
__decorate([
    Input()
], NavbarComponent.prototype, "section", void 0);
NavbarComponent = __decorate([
    Component({
        selector: 'app-navbar',
        standalone: true,
        imports: [CommonModule, RouterModule],
        template: `
    <aside class="sidebar" [class.sidebar--collapsed]="collapsed()">
      <!-- Marca / Logo -->
      <div class="sidebar__brand">
        <div class="brand-left">
          <div class="brand-logo-csn">
            <span class="csn-text">CSN</span>
            <svg class="csn-arrow" viewBox="0 0 24 24" fill="none">
              <path d="M5 12h14m-6-6l6 6-6 6" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>
          <div class="brand-text">
            <span class="brand-title">Centro Soluciones</span>
            <span class="brand-subtitle">Neto</span>
            @if (section) {
              <span class="brand-section">{{ section }}</span>
            }
          </div>
        </div>
        <button class="sidebar-toggle" (click)="collapsed.set(!collapsed())" [title]="collapsed() ? 'Expandir menú' : 'Colapsar menú'">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="3" y1="6" x2="21" y2="6"/>
            <line x1="3" y1="12" x2="21" y2="12"/>
            <line x1="3" y1="18" x2="21" y2="18"/>
          </svg>
        </button>
      </div>

      <!-- Navegación -->
      <div class="sidebar__nav">
        <div class="nav-section-title">MENÚ PRINCIPAL</div>

        @if (auth.isTienda()) {
          <a routerLink="/tienda" routerLinkActive="nav-item--active" [routerLinkActiveOptions]="{exact: true}"
             class="nav-item" data-tooltip="Mis Tickets">
            <span class="nav-icon">📊</span>
            <span>Mis Tickets</span>
          </a>
        }

        @if (auth.isAgente() || auth.isAdmin()) {
          <a routerLink="/agente" routerLinkActive="nav-item--active" [routerLinkActiveOptions]="{exact: true}"
             class="nav-item" data-tooltip="Dashboard">
            <span class="nav-icon">📈</span>
            <span>Dashboard</span>
          </a>
        }

        @if (auth.rol() === 'COORDINADOR') {
          <a routerLink="/coordinador" routerLinkActive="nav-item--active" [routerLinkActiveOptions]="{exact: true}"
             class="nav-item" data-tooltip="Vista Coordinador">
            <span class="nav-icon">🔧</span>
            <span>Mi Zona</span>
          </a>
        }

        @if (auth.isAdmin()) {
          <div class="nav-section-title" style="margin-top: 32px">ADMINISTRACIÓN</div>
          <a routerLink="/admin" routerLinkActive="nav-item--active"
             class="nav-item" data-tooltip="Configuración">
            <span class="nav-icon">⚙️</span>
            <span>Configuración</span>
          </a>
          <a routerLink="/admin/kpis" routerLinkActive="nav-item--active"
             class="nav-item" data-tooltip="KPIs ejecutivos">
            <span class="nav-icon">📊</span>
            <span>KPIs ejecutivos</span>
          </a>
          <a routerLink="/admin/dany" routerLinkActive="nav-item--active"
             class="nav-item" data-tooltip="Métricas Dany">
            <span class="nav-icon">🤖</span>
            <span>Dany</span>
          </a>
        }
      </div>

      <div class="sidebar__spacer"></div>

      <!-- Alertas & Usuario en la parte inferior -->
      <div class="sidebar__footer">
        @if (notif() && (auth.isAgente() || auth.isAdmin())) {
          <div class="sidebar-alerts">
            @if (slaVencidos() > 0) {
              <div class="alert-item alert-item--red">
                <span>SLA Vencidos</span>
                <strong>{{ slaVencidos() }}</strong>
              </div>
            }
            @if (esperandoRespuesta() > 0) {
              <div class="alert-item alert-item--amber">
                <span>Esperando Resp.</span>
                <strong>{{ esperandoRespuesta() }}</strong>
              </div>
            }
          </div>
        }

        <div class="user-card">
          <div class="avatar" [class]="avatarClass()">{{ initial() }}</div>
          <div class="user-info">
            <div class="user-name">{{ auth.currentUser()?.nombre }}</div>
            <div class="user-role">{{ roleLabel() }}</div>
          </div>
        </div>
        
        <button class="btn-logout" (click)="auth.logout()" data-tooltip="Salir del sistema">
          <span class="nav-icon">🚪</span> Salir del sistema
        </button>
      </div>
    </aside>
  `,
        styles: [`
    .sidebar {
      width: 220px;
      height: 100vh;
      background: var(--c-surface);
      border-right: 1px solid var(--c-border);
      display: flex;
      flex-direction: column;
      position: sticky;
      top: 0;
      flex-shrink: 0;
      z-index: 100;
      box-shadow: 2px 0 10px rgba(0,0,0,0.02);
      transition: width 0.25s ease;
      overflow: hidden;
    }
    .sidebar--collapsed { width: 64px; }

    .sidebar__brand {
      padding: 16px 12px 16px 20px;
      display: flex;
      flex-direction: row;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      border-bottom: 1px solid var(--c-border);
      flex-shrink: 0;
      min-height: 56px;
    }
    .brand-left {
      display: flex;
      flex-direction: column;
      gap: 8px;
      overflow: hidden;
      min-width: 0;
      flex: 1;
    }
    .sidebar-toggle {
      flex-shrink: 0;
      width: 32px; height: 32px;
      border: none; background: transparent;
      border-radius: var(--radius-md);
      color: var(--c-muted);
      display: flex; align-items: center; justify-content: center;
      cursor: pointer;
      transition: background .15s, color .15s;
    }
    .sidebar-toggle:hover { background: var(--c-blue-lt); color: var(--c-blue); }

    .sidebar--collapsed .sidebar__brand {
      justify-content: center;
      padding: 10px 0;
      border-bottom: 1px solid var(--c-border);
    }
    .sidebar--collapsed .brand-left { display: none; }
    .sidebar--collapsed .sidebar__nav { padding: 16px 8px; align-items: center; }
    .sidebar--collapsed .sidebar__footer { padding: 16px 8px; align-items: center; }
    .brand-logo-csn {
      display: flex;
      align-items: center;
      position: relative;
    }
    .csn-text {
      font-size: 32px;
      font-weight: 800;
      color: var(--c-blue);
      letter-spacing: -1px;
      line-height: 1;
    }
    .csn-arrow {
      width: 24px;
      height: 24px;
      color: var(--c-amber);
      margin-left: -6px;
      margin-top: -12px;
    }
    .brand-text { display: flex; flex-direction: column; line-height: 1.2; }
    .brand-title { font-size: 15px; font-weight: 700; color: var(--c-text); }
    .brand-subtitle { font-size: 14px; font-weight: 500; color: var(--c-muted); }
    .brand-section { font-size: 12px; color: var(--c-blue); font-weight: 600; margin-top: 4px; text-transform: uppercase; letter-spacing: 0.05em; }

    .sidebar__nav {
      padding: 24px 16px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .nav-section-title {
      font-size: 11px;
      font-weight: 700;
      color: var(--c-muted);
      text-transform: uppercase;
      letter-spacing: 0.08em;
      margin-left: 10px;
      margin-bottom: 6px;
    }
    .nav-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 14px;
      border-radius: var(--radius-md);
      color: var(--c-muted);
      font-size: 15px;
      font-weight: 500;
      text-decoration: none;
      transition: all 0.2s ease;
    }
    .nav-item:hover {
      background: var(--c-bg);
      color: var(--c-text);
      transform: translateX(2px);
    }
    .nav-item--active {
      background: var(--c-blue-lt);
      color: var(--c-blue);
      font-weight: 600;
    }
    .nav-item--active:hover { transform: none; }
    .nav-icon { font-size: 18px; display: flex; align-items: center; justify-content: center; width: 22px; }
    
    .nav-badge {
      background: var(--c-blue);
      color: white;
      font-size: 12px;
      font-weight: 700;
      padding: 2px 8px;
      border-radius: 12px;
      min-width: 24px;
      text-align: center;
    }

    .sidebar__spacer { flex: 1; min-height: 24px; }

    .sidebar__footer {
      padding: 20px 16px;
      border-top: 1px solid var(--c-border);
      background: var(--c-surface);
    }

    .sidebar-alerts {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-bottom: 20px;
    }
    .alert-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 10px 14px;
      border-radius: var(--radius-md);
      font-size: 13px;
    }
    .alert-item span { font-weight: 500; }
    .alert-item strong { font-size: 14px; }
    .alert-item--red { background: var(--c-red-lt); color: var(--c-red); border: 1px solid var(--c-red-md); }
    .alert-item--amber { background: var(--c-amber-lt); color: var(--c-amber); border: 1px solid var(--c-amber-md); }

    .user-card {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 14px;
      background: var(--c-bg);
      border-radius: var(--radius-md);
      margin-bottom: 12px;
    }
    .user-info { display: flex; flex-direction: column; overflow: hidden; }
    .user-name { font-size: 14px; font-weight: 600; color: var(--c-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .user-role { font-size: 12px; color: var(--c-muted); }

    .btn-logout {
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 10px;
      background: transparent;
      border: 1px solid var(--c-border);
      border-radius: var(--radius-md);
      color: var(--c-muted);
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s ease;
    }
    .btn-logout:hover {
      background: var(--c-red-lt);
      color: var(--c-red);
      border-color: var(--c-red-md);
    }
    .btn-logout .nav-icon { font-size: 16px; }

    /* Estilos del avatar */
    .avatar {
      width: 40px; height: 40px;
      border-radius: 50%;
      font-size: 16px; font-weight: 600;
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0;
    }
    .avatar--tienda { background: var(--c-teal-lt); color: var(--c-teal); border: 1px solid var(--c-teal-md); }
    .avatar--agente { background: var(--c-purple-lt); color: var(--c-purple); border: 1px solid var(--c-purple-md); }
    .avatar--admin  { background: var(--c-amber-lt); color: var(--c-amber); border: 1px solid var(--c-amber-md); }

    /* ── Collapsed state ── */
    .sidebar--collapsed .nav-section-title,
    .sidebar--collapsed .nav-item span:not(.nav-icon),
    .sidebar--collapsed .nav-badge,
    .sidebar--collapsed .sidebar-alerts,
    .sidebar--collapsed .user-info,
    .sidebar--collapsed .btn-logout span:not(.nav-icon) {
      display: none;
    }
    .sidebar--collapsed .nav-item { justify-content: center; padding: 12px; }
    .sidebar--collapsed .btn-logout { border: none; padding: 12px; }
    .sidebar--collapsed .btn-logout:hover { background: var(--c-bg); color: var(--c-text); }
    .sidebar--collapsed .user-card { padding: 0; background: transparent; margin-bottom: 24px; }

    /* ── Tooltip popover (visible when sidebar is collapsed) ── */
    .nav-item[data-tooltip],
    .btn-logout[data-tooltip] {
      position: relative;
    }
    .sidebar--collapsed .nav-item[data-tooltip]:hover::after,
    .sidebar--collapsed .btn-logout[data-tooltip]:hover::after {
      content: attr(data-tooltip);
      position: absolute;
      left: calc(100% + 12px);
      top: 50%;
      transform: translateY(-50%);
      background: var(--c-text);
      color: var(--c-surface);
      font-size: 12px;
      font-weight: 500;
      padding: 6px 10px;
      border-radius: 6px;
      white-space: nowrap;
      z-index: 200;
      pointer-events: none;
      box-shadow: 0 2px 8px rgba(0,0,0,.15);
    }
    .sidebar--collapsed .nav-item[data-tooltip]:hover::before,
    .sidebar--collapsed .btn-logout[data-tooltip]:hover::before {
      content: '';
      position: absolute;
      left: calc(100% + 6px);
      top: 50%;
      transform: translateY(-50%);
      border: 5px solid transparent;
      border-right-color: var(--c-text);
      z-index: 200;
      pointer-events: none;
    }

    @media (max-width: 900px) {
      .sidebar { width: 64px; }
      .brand-left, .nav-section-title, .nav-item span:not(.nav-icon), .nav-badge,
      .sidebar-alerts, .user-info, .btn-logout span:not(.nav-icon) {
        display: none;
      }
      .sidebar__brand { justify-content: center; padding: 20px 8px; border-bottom: none; }
      .sidebar-toggle { display: flex; }
      .nav-item { justify-content: center; padding: 12px; }
      .btn-logout { border: none; padding: 12px; }
      .btn-logout:hover { background: var(--c-bg); color: var(--c-text); }
      .user-card { padding: 0; background: transparent; margin-bottom: 24px; }
      .nav-item[data-tooltip]:hover::after,
      .btn-logout[data-tooltip]:hover::after {
        content: attr(data-tooltip);
        position: absolute;
        left: calc(100% + 12px);
        top: 50%;
        transform: translateY(-50%);
        background: var(--c-text);
        color: var(--c-surface);
        font-size: 12px;
        font-weight: 500;
        padding: 6px 10px;
        border-radius: 6px;
        white-space: nowrap;
        z-index: 200;
        pointer-events: none;
        box-shadow: 0 2px 8px rgba(0,0,0,.15);
      }
      .nav-item[data-tooltip]:hover::before,
      .btn-logout[data-tooltip]:hover::before {
        content: '';
        position: absolute;
        left: calc(100% + 6px);
        top: 50%;
        transform: translateY(-50%);
        border: 5px solid transparent;
        border-right-color: var(--c-text);
        z-index: 200;
        pointer-events: none;
      }
    }
  `],
    })
], NavbarComponent);
export { NavbarComponent };
//# sourceMappingURL=navbar.component.js.map