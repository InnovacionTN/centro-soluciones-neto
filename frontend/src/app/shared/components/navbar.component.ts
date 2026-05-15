import { Component, Input, OnInit, OnDestroy, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../../core/services/auth.service';
import { environment } from '../../../environments/environment';

interface Notificaciones {
  esperando_respuesta?: number;
  total_activos?: number;
  pendientes_tomar?: number;
  mis_activos?: number;
  sla_vencidos?: number;
  sin_asignar?: number;
  criticos?: number;
}

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <aside class="sidebar" [class.sidebar--collapsed]="collapsed()">

      <!-- Marca -->
      <div class="sb-brand">
        <div class="sb-brand-left">
          <img src="assets/logo-csn.png" alt="CSN" class="sb-logo">
          @if (!collapsed()) {
            <div class="sb-brand-text">
              <span class="sb-brand-name">Centro Soluciones</span>
              @if (section) {
                <span class="sb-brand-sec">{{ section }}</span>
              }
            </div>
          }
        </div>
        <button class="sb-toggle" (click)="collapsed.set(!collapsed())" [title]="collapsed() ? 'Expandir menú' : 'Colapsar menú'">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
            <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
          </svg>
        </button>
      </div>

      <!-- Navegación -->
      <nav class="sb-nav">
        @if (!collapsed()) { <span class="sb-sec-label">Menú</span> }

        @if (auth.isTienda()) {
          <a routerLink="/tienda" routerLinkActive="sb-item--active" [routerLinkActiveOptions]="{exact:true}"
             class="sb-item" [attr.data-tooltip]="collapsed() ? 'Mis Tickets' : null">
            <svg class="sb-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
              <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
            </svg>
            <span class="sb-label">Mis Tickets</span>
          </a>
        }

        @if (auth.isAgente() || auth.isAdmin() || auth.isAdminArea()) {
          <a routerLink="/agente" routerLinkActive="sb-item--active" [routerLinkActiveOptions]="{exact:true}"
             class="sb-item" [attr.data-tooltip]="collapsed() ? 'Dashboard' : null">
            <svg class="sb-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
            </svg>
            <span class="sb-label">Dashboard</span>
          </a>
        }

        @if (auth.isAgente() || auth.isAdmin() || auth.isAdminArea()) {
          <a routerLink="/agente/cola" routerLinkActive="sb-item--active"
             class="sb-item" [attr.data-tooltip]="collapsed() ? 'Cola' : null">
            <svg class="sb-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
              <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
              <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
            </svg>
            <span class="sb-label">Cola de tickets</span>
          </a>
        }

        @if (auth.rol() === 'COORDINADOR') {
          <a routerLink="/coordinador" routerLinkActive="sb-item--active" [routerLinkActiveOptions]="{exact:true}"
             class="sb-item" [attr.data-tooltip]="collapsed() ? 'Mi Zona' : null">
            <svg class="sb-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
              <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/>
              <line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/>
            </svg>
            <span class="sb-label">Mi Zona</span>
          </a>
        }

        <!-- ── ADMIN ── -->
        @if (auth.isAdmin()) {
          @if (!collapsed()) {
            <span class="sb-sec-label" style="margin-top:18px">Administración</span>
          } @else {
            <div class="sb-divider"></div>
          }

          <!-- KPIs y Dany: links directos -->
          <a routerLink="/admin/kpis" routerLinkActive="sb-item--active"
             class="sb-item" [attr.data-tooltip]="collapsed() ? 'KPIs ejecutivos' : null">
            <svg class="sb-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
            </svg>
            <span class="sb-label">KPIs ejecutivos</span>
          </a>

          <a routerLink="/admin/dany" routerLinkActive="sb-item--active"
             class="sb-item" [attr.data-tooltip]="collapsed() ? 'Dany' : null">
            <svg class="sb-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="11" width="18" height="10" rx="2"/>
              <circle cx="12" cy="5" r="2"/><path d="M12 7v4"/>
              <circle cx="8" cy="16" r="1" fill="currentColor" stroke="none"/>
              <circle cx="16" cy="16" r="1" fill="currentColor" stroke="none"/>
            </svg>
            <span class="sb-label">Dany</span>
          </a>

          <!-- Configuración: toggle que despliega submenú -->
          @if (!collapsed()) {
            <button class="sb-item sb-item--toggle" (click)="configOpen.set(!configOpen())"
                    [class.sb-item--active]="configOpen()">
              <svg class="sb-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="3"/>
                <path d="M12 1v3M12 20v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M1 12h3M20 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12"/>
              </svg>
              <span class="sb-label">Configuración</span>
              <svg class="sb-chevron" [class.sb-chevron--open]="configOpen()"
                   width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </button>

            @if (configOpen()) {
              <div class="sb-submenu">
                <a routerLink="/admin/torre" routerLinkActive="sb-sub--active" class="sb-sub">
                  <span class="sb-sub-dot"></span>Torre de control
                </a>
                <a routerLink="/admin/incidentes" routerLinkActive="sb-sub--active" class="sb-sub">
                  <span class="sb-sub-dot"></span>Incidentes masivos
                </a>
                <a routerLink="/admin/tipificaciones" routerLinkActive="sb-sub--active" class="sb-sub">
                  <span class="sb-sub-dot"></span>Tipificaciones
                </a>
                <a routerLink="/admin/grupos" routerLinkActive="sb-sub--active" class="sb-sub">
                  <span class="sb-sub-dot"></span>Grupos
                </a>
                <a routerLink="/admin/ruteo" routerLinkActive="sb-sub--active" class="sb-sub">
                  <span class="sb-sub-dot"></span>Ruteo
                </a>
                <a routerLink="/admin/usuarios" routerLinkActive="sb-sub--active" class="sb-sub">
                  <span class="sb-sub-dot"></span>Usuarios
                </a>
                <a routerLink="/admin/regiones" routerLinkActive="sb-sub--active" class="sb-sub">
                  <span class="sb-sub-dot"></span>Regiones
                </a>
                <a routerLink="/admin/zonas" routerLinkActive="sb-sub--active" class="sb-sub">
                  <span class="sb-sub-dot"></span>Zonas
                </a>
              </div>
            }
          } @else {
            <!-- Colapsado: icono de configuración directo a torre -->
            <a routerLink="/admin/torre" routerLinkActive="sb-item--active"
               class="sb-item" data-tooltip="Configuración">
              <svg class="sb-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="3"/>
                <path d="M12 1v3M12 20v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M1 12h3M20 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12"/>
              </svg>
            </a>
          }
        }

        <!-- ── ADMIN_AREA ── -->
        @if (auth.isAdminArea()) {
          @if (!collapsed()) {
            <span class="sb-sec-label" style="margin-top:18px">Mi Área — {{ auth.currentUser()?.area_restriccion }}</span>
          } @else {
            <div class="sb-divider"></div>
          }

          <a routerLink="/admin/kpis" routerLinkActive="sb-item--active"
             class="sb-item" [attr.data-tooltip]="collapsed() ? 'KPIs de mi área' : null">
            <svg class="sb-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
            </svg>
            <span class="sb-label">KPIs de mi área</span>
          </a>

          <a routerLink="/admin/dany" routerLinkActive="sb-item--active"
             class="sb-item" [attr.data-tooltip]="collapsed() ? 'Dany' : null">
            <svg class="sb-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="11" width="18" height="10" rx="2"/>
              <circle cx="12" cy="5" r="2"/><path d="M12 7v4"/>
              <circle cx="8" cy="16" r="1" fill="currentColor" stroke="none"/>
              <circle cx="16" cy="16" r="1" fill="currentColor" stroke="none"/>
            </svg>
            <span class="sb-label">Dany</span>
          </a>

          <!-- Configuración para ADMIN_AREA: solo Grupos y Tipificaciones -->
          @if (!collapsed()) {
            <button class="sb-item sb-item--toggle" (click)="configOpen.set(!configOpen())"
                    [class.sb-item--active]="configOpen()">
              <svg class="sb-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="3"/>
                <path d="M12 1v3M12 20v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M1 12h3M20 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12"/>
              </svg>
              <span class="sb-label">Configuración</span>
              <svg class="sb-chevron" [class.sb-chevron--open]="configOpen()"
                   width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </button>

            @if (configOpen()) {
              <div class="sb-submenu">
                <a routerLink="/admin/tipificaciones" routerLinkActive="sb-sub--active" class="sb-sub">
                  <span class="sb-sub-dot"></span>Tipificaciones
                </a>
                <a routerLink="/admin/grupos" routerLinkActive="sb-sub--active" class="sb-sub">
                  <span class="sb-sub-dot"></span>Grupos
                </a>
              </div>
            }
          }
        }
      </nav>

      <div class="sb-spacer"></div>

      <!-- Usuario -->
      <div class="sb-footer">
        <div class="sb-user" (click)="toggleUserMenu()">
          <div class="sb-avatar" [class]="avatarClass()">{{ initial() }}</div>
          @if (!collapsed()) {
            <div class="sb-user-info">
              <span class="sb-user-name">{{ auth.currentUser()?.nombre }}</span>
              <span class="sb-user-role">{{ roleLabel() }}</span>
            </div>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-left:auto;opacity:.35;flex-shrink:0">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          }
          @if (userMenuOpen()) {
            <div class="sb-user-menu">
              <button class="sb-logout" (click)="auth.logout()">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                  <polyline points="16 17 21 12 16 7"/>
                  <line x1="21" y1="12" x2="9" y2="12"/>
                </svg>
                Cerrar sesión
              </button>
            </div>
          }
        </div>
      </div>
    </aside>
  `,
  styles: [`
    /* ── Sidebar base ── */
    .sidebar {
      width: 200px;
      height: 100vh;
      background: var(--c-surface);
      border-right: 1px solid var(--c-border);
      display: flex;
      flex-direction: column;
      position: sticky;
      top: 0;
      flex-shrink: 0;
      z-index: 100;
      transition: width 0.22s ease;
      overflow-y: auto;
      overflow-x: visible;
      box-shadow: 1px 0 8px rgba(0,0,0,.04);
    }
    .sidebar--collapsed { width: 54px; }

    /* ── Brand bar ── */
    .sb-brand {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 10px 10px 14px;
      border-bottom: 1px solid var(--c-border);
      min-height: 46px;
      flex-shrink: 0;
    }
    .sb-brand-left {
      display: flex;
      align-items: center;
      gap: 9px;
      flex: 1;
      overflow: hidden;
      min-width: 0;
    }
    .sb-logo { height: 24px; width: auto; object-fit: contain; flex-shrink: 0; }
    .sb-brand-text { display: flex; flex-direction: column; line-height: 1.25; overflow: hidden; min-width: 0; }
    .sb-brand-name { font-size: 12px; font-weight: 700; color: var(--c-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .sb-brand-sec { font-size: 10px; color: var(--c-blue); text-transform: uppercase; letter-spacing: .07em; font-weight: 600; }
    .sb-toggle {
      flex-shrink: 0; width: 26px; height: 26px; border: none; background: transparent;
      border-radius: 6px; color: var(--c-muted); display: flex; align-items: center;
      justify-content: center; cursor: pointer; transition: background .15s, color .15s;
    }
    .sb-toggle:hover { background: var(--c-blue-lt); color: var(--c-blue); }
    .sidebar--collapsed .sb-brand { padding: 10px 0; justify-content: center; }
    .sidebar--collapsed .sb-brand-left { flex: 0; min-width: 0; }

    /* ── Navigation ── */
    .sb-nav { padding: 10px 7px; display: flex; flex-direction: column; gap: 2px; flex: 1; }
    .sb-sec-label {
      font-size: 10px; font-weight: 700; color: var(--c-muted);
      text-transform: uppercase; letter-spacing: .08em;
      padding: 0 8px; margin: 6px 0 3px; display: block;
    }
    .sb-divider { height: 1px; background: var(--c-border); margin: 8px 5px; }

    .sb-item {
      display: flex; align-items: center; gap: 9px; padding: 8px 10px;
      border-radius: 7px; color: var(--c-muted); font-size: 13px; font-weight: 500;
      text-decoration: none; transition: background .15s, color .15s;
      white-space: nowrap; overflow: hidden; position: relative;
      width: 100%;
    }
    .sb-item:hover { background: var(--c-bg); color: var(--c-text); }
    .sb-item--active {
      background: var(--c-blue-lt); color: var(--c-blue); font-weight: 600;
    }
    .sb-item--active::before {
      content: ''; position: absolute; left: 0; top: 7px; bottom: 7px;
      width: 3px; background: var(--c-blue); border-radius: 0 3px 3px 0;
    }

    /* Toggle button (Configuración) */
    .sb-item--toggle {
      background: transparent; border: none; cursor: pointer; font-family: inherit;
      text-align: left;
    }
    .sb-item--toggle.sb-item--active { background: var(--c-blue-lt); color: var(--c-blue); }

    /* Chevron animado */
    .sb-chevron {
      margin-left: auto; flex-shrink: 0; opacity: .5;
      transition: transform .2s ease;
    }
    .sb-chevron--open { transform: rotate(180deg); opacity: .8; }

    /* Submenú desplegable */
    .sb-submenu {
      display: flex; flex-direction: column; gap: 1px;
      padding: 2px 0 4px 24px;
      animation: subOpen .15s ease;
    }
    @keyframes subOpen {
      from { opacity: 0; transform: translateY(-4px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    .sb-sub {
      display: flex; align-items: center; gap: 8px;
      padding: 6px 10px; border-radius: 6px;
      font-size: 12px; color: var(--c-muted); text-decoration: none;
      transition: background .12s, color .12s; white-space: nowrap;
    }
    .sb-sub:hover { background: var(--c-bg); color: var(--c-text); }
    .sb-sub--active { color: var(--c-blue); font-weight: 600; }
    .sb-sub-dot {
      width: 5px; height: 5px; border-radius: 50%;
      background: var(--c-border); flex-shrink: 0;
    }
    .sb-sub--active .sb-sub-dot { background: var(--c-blue); }

    .sb-icon { width: 16px; height: 16px; flex-shrink: 0; }
    .sb-label { overflow: hidden; text-overflow: ellipsis; flex: 1; }

    /* ── Collapsed nav ── */
    .sidebar--collapsed .sb-nav { padding: 10px 5px; align-items: center; }
    .sidebar--collapsed .sb-sec-label { display: none; }
    .sidebar--collapsed .sb-item { justify-content: center; padding: 9px; width: 42px; }
    .sidebar--collapsed .sb-label,
    .sidebar--collapsed .sb-chevron { display: none; }
    .sidebar--collapsed .sb-submenu { display: none; }

    /* ── Tooltips (collapsed) ── */
    .sidebar--collapsed .sb-item[data-tooltip]:hover::after {
      content: attr(data-tooltip);
      position: absolute; left: calc(100% + 10px); top: 50%; transform: translateY(-50%);
      background: var(--c-text); color: var(--c-surface);
      font-size: 12px; font-weight: 500; padding: 5px 10px;
      border-radius: 6px; white-space: nowrap; z-index: 200;
      pointer-events: none; box-shadow: 0 4px 12px rgba(0,0,0,.15);
    }
    .sidebar--collapsed .sb-item[data-tooltip]:hover::before {
      content: ''; position: absolute; left: calc(100% + 4px); top: 50%; transform: translateY(-50%);
      border: 5px solid transparent; border-right-color: var(--c-text); z-index: 200; pointer-events: none;
    }

    .sb-spacer { flex: 0; min-height: 12px; }

    /* ── Footer / User ── */
    .sb-footer { padding: 8px 7px 12px; border-top: 1px solid var(--c-border); flex-shrink: 0; }
    .sb-user {
      position: relative; display: flex; align-items: center; gap: 8px;
      padding: 8px 10px; border-radius: 7px; cursor: pointer; transition: background .15s;
    }
    .sb-user:hover { background: var(--c-bg); }
    .sidebar--collapsed .sb-user { padding: 8px 0; justify-content: center; }

    .sb-avatar {
      width: 30px; height: 30px; border-radius: 50%;
      font-size: 12px; font-weight: 600;
      display: flex; align-items: center; justify-content: center; flex-shrink: 0;
    }
    .avatar--tienda { background: var(--c-teal-lt);   color: var(--c-teal);   border: 1px solid var(--c-teal-md); }
    .avatar--agente { background: var(--c-purple-lt); color: var(--c-purple); border: 1px solid var(--c-purple-md); }
    .avatar--admin  { background: var(--c-amber-lt);  color: var(--c-amber);  border: 1px solid var(--c-amber-md); }

    .sb-user-info { display: flex; flex-direction: column; overflow: hidden; flex: 1; min-width: 0; }
    .sb-user-name { font-size: 12px; font-weight: 600; color: var(--c-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .sb-user-role { font-size: 11px; color: var(--c-muted); white-space: nowrap; }

    .sb-user-menu {
      position: absolute; bottom: calc(100% + 6px); left: 7px; right: 7px;
      background: var(--c-surface); border: 1px solid var(--c-border);
      border-radius: 8px; padding: 4px; z-index: 300;
      box-shadow: var(--shadow-lg); animation: slideUp .18s ease;
    }
    .sidebar--collapsed .sb-user-menu { left: calc(100% + 8px); bottom: 0; right: auto; min-width: 160px; }
    .sb-logout {
      width: 100%; display: flex; align-items: center; gap: 8px;
      padding: 8px 12px; background: transparent; border: none;
      border-radius: 6px; color: var(--c-muted); font-size: 12px; font-weight: 500;
      cursor: pointer; transition: all .15s; font-family: inherit;
    }
    .sb-logout:hover { background: var(--c-red-lt); color: var(--c-red); }

    @keyframes slideUp {
      from { opacity: 0; transform: translateY(6px); }
      to   { opacity: 1; transform: translateY(0); }
    }

    /* ── Responsive ── */
    @media (max-width: 900px) {
      .sidebar { width: 54px; }
      .sb-brand-text, .sb-sec-label, .sb-label, .sb-user-info, .sb-submenu { display: none; }
      .sb-brand { padding: 10px 0; justify-content: center; }
      .sb-nav { padding: 10px 5px; align-items: center; }
      .sb-item { justify-content: center; padding: 9px; width: 42px; }
      .sb-footer { padding: 8px 5px 12px; }
      .sb-user { padding: 8px 0; justify-content: center; }
      .sb-item[data-tooltip]:hover::after {
        content: attr(data-tooltip); position: absolute; left: calc(100% + 10px); top: 50%; transform: translateY(-50%);
        background: var(--c-text); color: var(--c-surface); font-size: 12px;
        padding: 5px 10px; border-radius: 6px; white-space: nowrap; z-index: 200;
        pointer-events: none; box-shadow: 0 4px 12px rgba(0,0,0,.15);
      }
      .sb-item[data-tooltip]:hover::before {
        content: ''; position: absolute; left: calc(100% + 4px); top: 50%; transform: translateY(-50%);
        border: 5px solid transparent; border-right-color: var(--c-text); z-index: 200; pointer-events: none;
      }
    }
  `],
})
export class NavbarComponent implements OnInit, OnDestroy {
  @Input() section = '';
  collapsed = signal(false);
  userMenuOpen = signal(false);
  configOpen = signal(false);

  notif = signal<Notificaciones | null>(null);
  private pollInterval?: ReturnType<typeof setInterval>;
  private readonly api = environment.apiUrl;

  constructor(public auth: AuthService, private http: HttpClient) { }

  ngOnInit() {
    this.fetchNotif();
    this.pollInterval = setInterval(() => this.fetchNotif(), 30_000);
  }

  ngOnDestroy() {
    if (this.pollInterval) clearInterval(this.pollInterval);
  }

  toggleUserMenu() {
    if (this.collapsed()) {
      this.collapsed.set(false);
      this.userMenuOpen.set(true);
    } else {
      this.userMenuOpen.set(!this.userMenuOpen());
    }
  }

  fetchNotif() {
    this.http.get<Notificaciones>(`${this.api}/notificaciones`).subscribe({
      next: n => this.notif.set(n),
      error: () => { },
    });
  }

  badgePendientes() {
    const n = this.notif();
    if (!n) return 0;
    return (n.pendientes_tomar ?? 0) + (n.sin_asignar ?? 0);
  }
  slaVencidos() { return this.notif()?.sla_vencidos ?? 0; }
  esperandoRespuesta() { return this.notif()?.esperando_respuesta ?? 0; }
  sinAsignar() { return this.notif()?.sin_asignar ?? 0; }

  initial() { return this.auth.currentUser()?.nombre?.charAt(0)?.toUpperCase() ?? '?'; }

  avatarClass() {
    const map: Record<string, string> = {
      TIENDA: 'avatar--tienda',
      AGENTE: 'avatar--agente',
      COORDINADOR: 'avatar--agente',
      ADMIN: 'avatar--admin',
      ADMIN_AREA: 'avatar--admin',
    };
    return map[this.auth.rol() ?? ''] ?? '';
  }

  roleLabel() {
    const map: Record<string, string> = {
      TIENDA: 'Tienda',
      AGENTE: 'Agente Call Center',
      COORDINADOR: 'Coordinador de Zona',
      ADMIN: 'Administrador',
      ADMIN_AREA: 'Admin Área',
    };
    return map[this.auth.rol() ?? ''] ?? '';
  }
}