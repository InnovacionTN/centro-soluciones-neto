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
              @if (section) { <span class="sb-brand-sec">{{ section }}</span> }
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

        <!-- TIENDA -->
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

        <!-- AGENTE / ADMIN / ADMIN_AREA: Dashboard + Cola -->
        @if (auth.isAgente() || auth.isAdmin() || auth.isAdminArea()) {
          <a routerLink="/agente" routerLinkActive="sb-item--active" [routerLinkActiveOptions]="{exact:true}"
             class="sb-item" [attr.data-tooltip]="collapsed() ? 'Dashboard' : null">
            <svg class="sb-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
            </svg>
            <span class="sb-label">Dashboard</span>
          </a>
          <a routerLink="/agente/cola" routerLinkActive="sb-item--active"
             class="sb-item" [attr.data-tooltip]="collapsed() ? 'Cola' : null">
            <svg class="sb-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
              <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
              <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
            </svg>
            <span class="sb-label">Cola de tickets</span>
          </a>
        }

        <!-- COORDINADOR: Dashboard -->
        @if (auth.isCoordinador()) {
          <a routerLink="/coordinador" routerLinkActive="sb-item--active" [routerLinkActiveOptions]="{exact:true}"
             class="sb-item" [attr.data-tooltip]="collapsed() ? 'Dashboard' : null">
            <svg class="sb-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
            </svg>
            <span class="sb-label">Dashboard</span>
          </a>
        }

        <!-- ── ADMIN ── -->
        @if (auth.isAdmin()) {
          @if (!collapsed()) {
            <span class="sb-sec-label" style="margin-top:18px">Administración</span>
          } @else {
            <div class="sb-divider"></div>
          }

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

          <!-- Configuración ADMIN -->
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
                <a routerLink="/admin/grupos" routerLinkActive="sb-sub--active" class="sb-sub">
                  <span class="sb-sub-dot"></span>Grupos
                </a>
                <a routerLink="/admin/tipificaciones" routerLinkActive="sb-sub--active" class="sb-sub">
                  <span class="sb-sub-dot"></span>Tipificaciones
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
            <a routerLink="/admin/grupos" routerLinkActive="sb-item--active"
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
                <a routerLink="/admin/grupos" routerLinkActive="sb-sub--active" class="sb-sub">
                  <span class="sb-sub-dot"></span>Grupos
                </a>
                <a routerLink="/admin/tipificaciones" routerLinkActive="sb-sub--active" class="sb-sub">
                  <span class="sb-sub-dot"></span>Tipificaciones
                </a>
                <a routerLink="/admin/ruteo" routerLinkActive="sb-sub--active" class="sb-sub">
                  <span class="sb-sub-dot"></span>Ruteo
                </a>
              </div>
            }
          } @else {
            <a routerLink="/admin/grupos" routerLinkActive="sb-item--active"
               class="sb-item" data-tooltip="Configuración">
              <svg class="sb-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="3"/>
                <path d="M12 1v3M12 20v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M1 12h3M20 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12"/>
              </svg>
            </a>
          }
        }

        <!-- ── COORDINADOR: Administración + Configuración ── -->
        @if (auth.isCoordinador()) {
          @if (!collapsed()) {
            <span class="sb-sec-label" style="margin-top:18px">Administración</span>
          } @else {
            <div class="sb-divider"></div>
          }

          <a routerLink="/admin/kpis" routerLinkActive="sb-item--active"
             class="sb-item" [attr.data-tooltip]="collapsed() ? 'KPIs' : null">
            <svg class="sb-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
            </svg>
            <span class="sb-label">KPIs</span>
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
                <a routerLink="/admin/grupos" routerLinkActive="sb-sub--active" class="sb-sub">
                  <span class="sb-sub-dot"></span>Grupos
                </a>
                <a routerLink="/admin/tipificaciones" routerLinkActive="sb-sub--active" class="sb-sub">
                  <span class="sb-sub-dot"></span>Tipificaciones
                </a>
                <a routerLink="/admin/ruteo" routerLinkActive="sb-sub--active" class="sb-sub">
                  <span class="sb-sub-dot"></span>Ruteo
                </a>
              </div>
            }
          } @else {
            <a routerLink="/admin/grupos" routerLinkActive="sb-item--active"
               class="sb-item" data-tooltip="Configuración">
              <svg class="sb-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="3"/>
                <path d="M12 1v3M12 20v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M1 12h3M20 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12"/>
              </svg>
            </a>
          }
        }
      </nav>

      <div class="sb-spacer"></div>

      <!-- ── Footer / Usuario ── -->
      <div class="sb-footer">
        <div class="sb-user" (click)="toggleUserMenu()">
          <div class="sb-avatar" [class]="avatarClass()">{{ initial() }}</div>
          @if (!collapsed()) {
            <div class="sb-user-info">
              <span class="sb-user-name">{{ auth.currentUser()?.nombre }}</span>
              <span class="sb-user-role">{{ roleLabel() }}</span>
            </div>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                 [style.transform]="userMenuOpen() ? 'rotate(180deg)' : ''"
                 style="margin-left:auto;opacity:.35;flex-shrink:0;transition:transform .2s">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          }
        </div>

        <!-- Submenú de usuario (fuera del sb-user para posicionamiento correcto) -->
        @if (userMenuOpen()) {
          <div class="sb-user-menu" (click)="$event.stopPropagation()">
            <!-- Header del menú -->
            <div class="um-header">
              <div class="um-avatar" [class]="avatarClass()">{{ initial() }}</div>
              <div class="um-info">
                <span class="um-name">{{ auth.currentUser()?.nombre }}</span>
                <span class="um-role">{{ roleLabel() }}</span>
              </div>
            </div>
            <div class="um-divider"></div>

            <!-- Cambiar tema -->
            <button class="um-item" (click)="toggleTheme()">
              <span class="um-item-icon">
                @if (isDark()) {
                  <!-- Sol -->
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                    <circle cx="12" cy="12" r="5"/>
                    <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
                    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
                    <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
                    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
                  </svg>
                } @else {
                  <!-- Luna -->
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                  </svg>
                }
              </span>
              <span class="um-item-label">{{ isDark() ? 'Tema claro' : 'Tema oscuro' }}</span>
              <span class="um-toggle" [class.um-toggle--on]="isDark()">
                <span class="um-toggle-knob"></span>
              </span>
            </button>

            <!-- Cambiar contraseña (deshabilitado hasta integración Slack) -->
            <button class="um-item um-item--disabled" disabled title="Próximamente disponible">
              <span class="um-item-icon">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
              </span>
              <span class="um-item-label">Cambiar contraseña</span>
              <span class="um-item-badge">Slack</span>
            </button>

            <div class="um-divider"></div>

            <!-- Cerrar sesión -->
            <button class="um-item um-item--danger" (click)="auth.logout()">
              <span class="um-item-icon">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                  <polyline points="16 17 21 12 16 7"/>
                  <line x1="21" y1="12" x2="9" y2="12"/>
                </svg>
              </span>
              <span class="um-item-label">Cerrar sesión</span>
            </button>

            <!-- Versión (marcador de build) -->
            <div class="um-version">CSN · {{ appVersion }}</div>
          </div>
        }
      </div>
    </aside>

    <!-- ── Modal: Cambiar contraseña vía Slack ── -->
    @if (showPwdModal()) {
      <div class="pwd-backdrop" (click)="closePwdModal()">
        <div class="pwd-modal" (click)="$event.stopPropagation()">
          <div class="pwd-modal-icon">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
              <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
          </div>
          @if (pwdDone()) {
            <h3 class="pwd-modal-title">¡Solicitud enviada!</h3>
            <p class="pwd-modal-desc">Recibirás un mensaje en <strong>Slack</strong> con el enlace para cambiar tu contraseña. Si no lo ves en 5 minutos, revisa el canal <strong>#csn-soporte</strong>.</p>
            <button class="pwd-modal-btn pwd-modal-btn--primary" (click)="closePwdModal()">Entendido</button>
          } @else {
            <h3 class="pwd-modal-title">Cambiar contraseña</h3>
            <p class="pwd-modal-desc">Te enviaremos un enlace de restablecimiento a través de <strong>Slack</strong>. Asegúrate de tener acceso al canal <strong>#csn-soporte</strong>.</p>
            @if (pwdError()) {
              <div class="pwd-modal-error">{{ pwdError() }}</div>
            }
            <div class="pwd-modal-actions">
              <button class="pwd-modal-btn" (click)="closePwdModal()">Cancelar</button>
              <button class="pwd-modal-btn pwd-modal-btn--primary" [disabled]="pwdSending()" (click)="requestPasswordChange()">
                @if (pwdSending()) { <span class="pwd-spinner"></span> Enviando… } @else { Enviar solicitud }
              </button>
            </div>
          }
        </div>
      </div>
    }
  `,
  styles: [`
    /* ── Sidebar base ── */
    .sidebar {
      width: 200px; height: 100vh;
      background: var(--c-surface); border-right: 1px solid var(--c-border);
      display: flex; flex-direction: column;
      position: sticky; top: 0; flex-shrink: 0; z-index: 100;
      transition: width 0.22s ease;
      overflow-y: auto; overflow-x: visible;
      box-shadow: 1px 0 8px rgba(0,0,0,.04);
    }
    .sidebar--collapsed { width: 54px; }

    /* ── Brand ── */
    .sb-brand {
      display: flex; align-items: center; gap: 8px;
      padding: 10px 10px 10px 14px; border-bottom: 1px solid var(--c-border);
      min-height: 46px; flex-shrink: 0;
    }
    .sb-brand-left { display: flex; align-items: center; gap: 9px; flex: 1; overflow: hidden; min-width: 0; }
    .sb-logo { height: 24px; width: auto; object-fit: contain; flex-shrink: 0; }
    .sb-brand-text { display: flex; flex-direction: column; line-height: 1.25; overflow: hidden; min-width: 0; }
    .sb-brand-name { font-size: 12px; font-weight: 700; color: var(--c-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .sb-brand-sec  { font-size: 10px; color: var(--c-blue); text-transform: uppercase; letter-spacing: .07em; font-weight: 600; }
    .sb-toggle {
      flex-shrink: 0; width: 26px; height: 26px; border: none; background: transparent;
      border-radius: 6px; color: var(--c-muted);
      display: flex; align-items: center; justify-content: center;
      cursor: pointer; transition: background .15s, color .15s;
    }
    .sb-toggle:hover { background: var(--c-blue-lt); color: var(--c-blue); }
    .sidebar--collapsed .sb-brand { padding: 10px 0; justify-content: center; }
    .sidebar--collapsed .sb-brand-left { flex: 0; min-width: 0; }

    /* ── Nav ── */
    .sb-nav { padding: 10px 7px; display: flex; flex-direction: column; gap: 2px; flex: 1; }
    .sb-sec-label {
      font-size: 10px; font-weight: 700; color: var(--c-muted);
      text-transform: uppercase; letter-spacing: .08em;
      padding: 0 8px; margin: 6px 0 3px; display: block;
    }
    .sb-divider { height: 1px; background: var(--c-border); margin: 8px 5px; }
    .sb-spacer { flex: 0; min-height: 12px; }

    .sb-item {
      display: flex; align-items: center; gap: 9px; padding: 8px 10px;
      border-radius: 7px; color: var(--c-muted); font-size: 13px; font-weight: 500;
      text-decoration: none; transition: background .15s, color .15s;
      white-space: nowrap; overflow: hidden; position: relative; width: 100%;
    }
    .sb-item:hover { background: var(--c-bg); color: var(--c-text); }
    .sb-item--active { background: var(--c-blue-lt); color: var(--c-blue); font-weight: 600; }
    .sb-item--active::before {
      content: ''; position: absolute; left: 0; top: 7px; bottom: 7px;
      width: 3px; background: var(--c-blue); border-radius: 0 3px 3px 0;
    }
    .sb-item--toggle { background: transparent; border: none; cursor: pointer; font-family: inherit; text-align: left; }
    .sb-item--toggle.sb-item--active { background: var(--c-blue-lt); color: var(--c-blue); }

    .sb-chevron { margin-left: auto; flex-shrink: 0; opacity: .5; transition: transform .2s ease; }
    .sb-chevron--open { transform: rotate(180deg); opacity: .8; }

    .sb-submenu {
      display: flex; flex-direction: column; gap: 1px;
      padding: 2px 0 4px 24px;
      animation: subOpen .15s ease;
    }
    @keyframes subOpen { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }

    .sb-sub {
      display: flex; align-items: center; gap: 8px;
      padding: 6px 10px; border-radius: 6px;
      font-size: 12px; color: var(--c-muted); text-decoration: none;
      transition: background .12s, color .12s; white-space: nowrap;
    }
    .sb-sub:hover { background: var(--c-bg); color: var(--c-text); }
    .sb-sub--active { color: var(--c-blue); font-weight: 600; }
    .sb-sub-dot { width: 5px; height: 5px; border-radius: 50%; background: var(--c-border); flex-shrink: 0; }
    .sb-sub--active .sb-sub-dot { background: var(--c-blue); }

    .sb-icon { width: 16px; height: 16px; flex-shrink: 0; }
    .sb-label { overflow: hidden; text-overflow: ellipsis; flex: 1; }

    /* ── Collapsed ── */
    .sidebar--collapsed .sb-nav { padding: 10px 5px; align-items: center; }
    .sidebar--collapsed .sb-sec-label { display: none; }
    .sidebar--collapsed .sb-item { justify-content: center; padding: 9px; width: 42px; }
    .sidebar--collapsed .sb-label, .sidebar--collapsed .sb-chevron { display: none; }
    .sidebar--collapsed .sb-submenu { display: none; }
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

    /* ── Footer / Usuario ── */
    .sb-footer { padding: 8px 7px 12px; border-top: 1px solid var(--c-border); flex-shrink: 0; position: relative; }
    .sb-user {
      display: flex; align-items: center; gap: 8px;
      padding: 8px 10px; border-radius: 7px; cursor: pointer; transition: background .15s;
    }
    .sb-user:hover { background: var(--c-bg); }
    .sidebar--collapsed .sb-user { padding: 8px 0; justify-content: center; }

    .sb-avatar {
      width: 30px; height: 30px; border-radius: 50%;
      font-size: 12px; font-weight: 700;
      display: flex; align-items: center; justify-content: center; flex-shrink: 0;
    }
    .avatar--tienda { background: var(--c-teal-lt);   color: var(--c-teal);   border: 1px solid var(--c-teal-md); }
    .avatar--agente { background: var(--c-purple-lt); color: var(--c-purple); border: 1px solid var(--c-purple-md); }
    .avatar--admin  { background: var(--c-amber-lt);  color: var(--c-amber);  border: 1px solid var(--c-amber-md); }

    .sb-user-info { display: flex; flex-direction: column; overflow: hidden; flex: 1; min-width: 0; }
    .sb-user-name { font-size: 12px; font-weight: 600; color: var(--c-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .sb-user-role { font-size: 11px; color: var(--c-muted); white-space: nowrap; }

    /* ── User menu dropdown ── */
    .sb-user-menu {
      position: absolute; bottom: calc(100% + 4px); left: 7px; right: 7px;
      background: var(--c-surface); border: 1px solid var(--c-border);
      border-radius: 12px; z-index: 400;
      box-shadow: 0 -8px 32px rgba(0,0,0,.12), 0 2px 8px rgba(0,0,0,.06);
      animation: slideUp .18s ease; overflow: hidden;
    }
    .sidebar--collapsed .sb-user-menu { left: calc(100% + 8px); bottom: 0; right: auto; min-width: 220px; }
    @keyframes slideUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }

    /* Header del menú */
    .um-header {
      display: flex; align-items: center; gap: 10px;
      padding: 14px 14px 12px;
    }
    .um-avatar {
      width: 36px; height: 36px; border-radius: 50%; flex-shrink: 0;
      font-size: 14px; font-weight: 700;
      display: flex; align-items: center; justify-content: center;
    }
    .um-info { display: flex; flex-direction: column; overflow: hidden; flex: 1; min-width: 0; }
    .um-name { font-size: 13px; font-weight: 700; color: var(--c-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .um-role { font-size: 11px; color: var(--c-muted); }

    .um-divider { height: 1px; background: var(--c-border); margin: 0 10px; }

    /* Items del menú */
    .um-item {
      width: 100%; display: flex; align-items: center; gap: 10px;
      padding: 10px 14px; border: none; background: transparent;
      font-family: inherit; font-size: 13px; font-weight: 500;
      color: var(--c-text); cursor: pointer; text-align: left;
      transition: background .12s; margin: 2px 0;
    }
    .um-item:hover { background: var(--c-bg); }
    .um-item--danger { color: var(--c-red); }
    .um-item--danger:hover { background: var(--c-red-lt); }
    .um-item--disabled { opacity: .45; cursor: not-allowed; pointer-events: none; }
    .um-item--disabled:hover { background: transparent; }

    .um-item-icon {
      width: 28px; height: 28px; border-radius: 7px;
      display: flex; align-items: center; justify-content: center;
      background: var(--c-bg); color: var(--c-muted); flex-shrink: 0;
    }
    .um-item--danger .um-item-icon { background: var(--c-red-lt); color: var(--c-red); }
    .um-item-label { flex: 1; }
    .um-version {
      text-align: center; font-size: 10px; color: var(--c-muted);
      padding: 8px 0 4px; border-top: 1px solid var(--c-border); margin-top: 4px;
      letter-spacing: .04em;
    }

    .um-item-badge {
      font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 6px;
      background: #4A154B; color: white;
    }

    /* Toggle switch */
    .um-toggle {
      width: 34px; height: 19px; border-radius: 10px;
      background: var(--c-border); position: relative;
      transition: background .2s; flex-shrink: 0;
    }
    .um-toggle--on { background: var(--c-blue); }
    .um-toggle-knob {
      position: absolute; top: 3px; left: 3px;
      width: 13px; height: 13px; border-radius: 50%;
      background: white; transition: left .2s;
      box-shadow: 0 1px 3px rgba(0,0,0,.2);
    }
    .um-toggle--on .um-toggle-knob { left: 18px; }

    /* ── Responsive ── */
    @media (max-width: 900px) {
      .sidebar { width: 54px; }
      .sb-brand-text, .sb-sec-label, .sb-label, .sb-user-info, .sb-submenu { display: none; }
      .sb-brand { padding: 10px 0; justify-content: center; }
      .sb-nav { padding: 10px 5px; align-items: center; }
      .sb-item { justify-content: center; padding: 9px; width: 42px; }
      .sb-footer { padding: 8px 5px 12px; }
      .sb-user { padding: 8px 0; justify-content: center; }
    }

    /* ── Modal contraseña ── */
    .pwd-backdrop {
      position: fixed; inset: 0; z-index: 2000;
      background: rgba(6,20,27,.5); backdrop-filter: blur(4px);
      display: flex; align-items: center; justify-content: center;
      padding: 20px; animation: bd-in .15s ease;
    }
    @keyframes bd-in { from { opacity: 0; } to { opacity: 1; } }
    .pwd-modal {
      background: var(--c-surface); border-radius: 16px;
      box-shadow: 0 24px 64px rgba(0,0,0,.25);
      width: 100%; max-width: 400px;
      padding: 32px 28px; text-align: center;
      animation: modal-in .2s cubic-bezier(.34,1.56,.64,1);
    }
    @keyframes modal-in { from { opacity: 0; transform: scale(.92) translateY(10px); } to { opacity: 1; transform: none; } }
    .pwd-modal-icon {
      width: 60px; height: 60px; border-radius: 16px;
      background: var(--c-blue-lt); color: var(--c-blue);
      display: flex; align-items: center; justify-content: center;
      margin: 0 auto 16px;
    }
    .pwd-modal-title { font-size: 18px; font-weight: 700; color: var(--c-text); margin: 0 0 10px; }
    .pwd-modal-desc { font-size: 13px; color: var(--c-muted); line-height: 1.6; margin: 0 0 20px; }
    .pwd-modal-error {
      background: var(--c-red-lt); color: var(--c-red);
      border: 1px solid var(--c-red-md); border-radius: 8px;
      font-size: 13px; padding: 9px 13px; margin-bottom: 16px; text-align: left;
    }
    .pwd-modal-actions { display: flex; gap: 10px; justify-content: center; }
    .pwd-modal-btn {
      padding: 9px 20px; border-radius: 8px; font-size: 13px; font-weight: 600;
      border: 1px solid var(--c-border); background: transparent;
      color: var(--c-muted); cursor: pointer; transition: all .15s;
      display: flex; align-items: center; gap: 8px;
    }
    .pwd-modal-btn:hover { background: var(--c-bg); color: var(--c-text); }
    .pwd-modal-btn--primary {
      background: var(--c-blue); color: white; border-color: var(--c-blue);
      box-shadow: 0 2px 8px rgba(14,59,131,.3);
    }
    .pwd-modal-btn--primary:hover { background: #0c3270; border-color: #0c3270; }
    .pwd-modal-btn--primary:disabled { opacity: .6; cursor: not-allowed; }
    .pwd-spinner {
      width: 13px; height: 13px; border-radius: 50%;
      border: 2px solid rgba(255,255,255,.35); border-top-color: white;
      animation: spin .6s linear infinite; display: inline-block;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
  `],
})
export class NavbarComponent implements OnInit, OnDestroy {
  @Input() section = '';
  readonly appVersion = 'v0.4.2';
  collapsed    = signal(false);
  userMenuOpen = signal(false);
  configOpen   = signal(false);
  isDark       = signal(false);

  showPwdModal = signal(false);
  pwdSending   = signal(false);
  pwdDone      = signal(false);
  pwdError     = signal('');

  notif = signal<Notificaciones | null>(null);
  private pollInterval?: ReturnType<typeof setInterval>;
  private readonly api = environment.apiUrl;

  constructor(public auth: AuthService, private http: HttpClient) {}

  ngOnInit() {
    // Restore theme preference
    const saved = localStorage.getItem('csn_theme');
    if (saved === 'dark') { this.isDark.set(true); document.body.classList.add('dark-theme'); }
    this.fetchNotif();
    this.pollInterval = setInterval(() => this.fetchNotif(), 30_000);
  }

  ngOnDestroy() {
    if (this.pollInterval) clearInterval(this.pollInterval);
  }

  toggleTheme() {
    const dark = !this.isDark();
    this.isDark.set(dark);
    localStorage.setItem('csn_theme', dark ? 'dark' : 'light');
    document.body.classList.toggle('dark-theme', dark);
  }

  toggleUserMenu() {
    if (this.collapsed()) {
      this.collapsed.set(false);
      this.userMenuOpen.set(true);
    } else {
      this.userMenuOpen.set(!this.userMenuOpen());
    }
  }

  openPwdModal() {
    this.userMenuOpen.set(false);
    this.pwdDone.set(false);
    this.pwdError.set('');
    this.showPwdModal.set(true);
  }
  closePwdModal() { this.showPwdModal.set(false); }

  requestPasswordChange() {
    this.pwdSending.set(true);
    this.pwdError.set('');
    this.http.post(`${this.api}/auth/request-password-change`, {}).subscribe({
      next: () => { this.pwdSending.set(false); this.pwdDone.set(true); },
      error: (e) => {
        this.pwdSending.set(false);
        this.pwdError.set(e.error?.detail ?? 'Error al enviar la solicitud. Intenta de nuevo.');
      },
    });
  }

  fetchNotif() {
    this.http.get<Notificaciones>(`${this.api}/notificaciones`).subscribe({
      next: n => this.notif.set(n),
      error: () => {},
    });
  }

  badgePendientes()    { const n = this.notif(); return n ? (n.pendientes_tomar ?? 0) + (n.sin_asignar ?? 0) : 0; }
  slaVencidos()        { return this.notif()?.sla_vencidos ?? 0; }
  esperandoRespuesta() { return this.notif()?.esperando_respuesta ?? 0; }
  sinAsignar()         { return this.notif()?.sin_asignar ?? 0; }

  initial() { return this.auth.currentUser()?.nombre?.charAt(0)?.toUpperCase() ?? '?'; }

  avatarClass() {
    const map: Record<string, string> = {
      TIENDA: 'avatar--tienda sb-avatar',
      AGENTE: 'avatar--agente sb-avatar',
      COORDINADOR: 'avatar--agente sb-avatar',
      ADMIN: 'avatar--admin sb-avatar',
      ADMIN_AREA: 'avatar--admin sb-avatar',
    };
    return map[this.auth.rol() ?? ''] ?? 'sb-avatar';
  }

  roleLabel() {
    const map: Record<string, string> = {
      TIENDA: 'Tienda',
      AGENTE: 'Agente Call Center',
      COORDINADOR: 'Coordinador de Área',
      ADMIN: 'Administrador',
      ADMIN_AREA: 'Admin de Área',
    };
    return map[this.auth.rol() ?? ''] ?? '';
  }
}
