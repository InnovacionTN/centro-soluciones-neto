import { Component, Input, OnInit, OnDestroy, signal } from '@angular/core';
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
    <nav class="navbar">
      <div class="navbar__inner">

        <!-- Logo + sección actual -->
        <div class="navbar__brand">
          <svg width="22" height="22" viewBox="0 0 28 28" fill="none">
            <rect width="28" height="28" rx="7" fill="#2563EB"/>
            <path d="M14 11v6M11 14h6" stroke="white" stroke-width="2.2" stroke-linecap="round"/>
          </svg>
          <span class="navbar__name">Centro de Soluciones</span>
          @if (section) {
            <span class="navbar__sep">/</span>
            <span class="navbar__section">{{ section }}</span>
          }
        </div>

        <!-- Navegación central (solo agente y admin) -->
        @if (auth.isAgente() || auth.isAdmin()) {
          <div class="navbar__nav">
            <a routerLink="/agente" routerLinkActive="nav-link--active" class="nav-link">
              Dashboard
            </a>
            <a routerLink="/agente/cola" routerLinkActive="nav-link--active" class="nav-link">
              Cola
              @if (badgePendientes() > 0) {
                <span class="nav-badge">{{ badgePendientes() }}</span>
              }
            </a>
            @if (auth.isAdmin()) {
              <a routerLink="/admin" routerLinkActive="nav-link--active" class="nav-link nav-link--admin">
                ⚙ Configuración
              </a>
            }
          </div>
        }

        <!-- Acciones: notificaciones + usuario + salir -->
        <div class="navbar__actions">

          <!-- Badges de alertas -->
          @if (notif()) {
            <div class="notif-pills">
              @if (slaVencidos() > 0) {
                <span class="notif-pill notif-pill--red" title="SLA vencidos">
                  ⚠ {{ slaVencidos() }}
                </span>
              }
              @if (esperandoRespuesta() > 0) {
                <span class="notif-pill notif-pill--amber" title="Esperando tu respuesta">
                  ⏳ {{ esperandoRespuesta() }}
                </span>
              }
              @if (sinAsignar() > 0) {
                <span class="notif-pill notif-pill--blue" title="Sin asignar">
                  📥 {{ sinAsignar() }}
                </span>
              }
            </div>
          }

          <!-- Usuario -->
          <div class="navbar__user">
            <div class="avatar" [class]="avatarClass()">{{ initial() }}</div>
            <div class="navbar__userinfo">
              <span class="navbar__username">{{ auth.currentUser()?.nombre }}</span>
              <span class="navbar__role">{{ roleLabel() }}</span>
            </div>
          </div>

          <button class="btn btn--ghost btn--sm" (click)="auth.logout()">
            Salir
          </button>
        </div>

      </div>
    </nav>
  `,
  styles: [`
    .navbar {
      background: var(--c-surface);
      border-bottom: 1px solid var(--c-border);
      position: sticky;
      top: 0;
      z-index: 100;
    }
    .navbar__inner {
      max-width: 1440px;
      margin: 0 auto;
      padding: 0 24px;
      height: 56px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
    }
    .navbar__brand { display: flex; align-items: center; gap: 10px; flex-shrink: 0; }
    .navbar__name  { font-size: 15px; font-weight: 600; color: var(--c-text); }
    .navbar__sep, .navbar__section { color: var(--c-muted); font-size: 14px; }

    /* Nav central */
    .navbar__nav { display: flex; align-items: center; gap: 4px; }
    .nav-link {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      border-radius: 6px;
      font-size: 13px;
      font-weight: 500;
      color: var(--c-muted);
      text-decoration: none;
      transition: background .15s, color .15s;
      white-space: nowrap;
    }
    .nav-link:hover { background: var(--c-bg); color: var(--c-text); }
    .nav-link--active { background: var(--c-blue-lt); color: var(--c-blue); }
    .nav-link--admin {
      border: 1px solid var(--c-border);
      margin-left: 8px;
    }
    .nav-link--admin.nav-link--active {
      background: var(--c-purple-lt);
      color: var(--c-purple);
      border-color: var(--c-purple-md);
    }
    .nav-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 18px;
      height: 18px;
      padding: 0 5px;
      background: var(--c-blue);
      color: white;
      border-radius: 9px;
      font-size: 10px;
      font-weight: 700;
    }

    /* Pills de notificación */
    .notif-pills { display: flex; gap: 6px; align-items: center; }
    .notif-pill {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 3px 8px;
      border-radius: 10px;
      font-size: 11px;
      font-weight: 600;
      cursor: default;
    }
    .notif-pill--red   { background: var(--c-red-lt);   color: var(--c-red); }
    .notif-pill--amber { background: var(--c-amber-lt);  color: var(--c-amber); }
    .notif-pill--blue  { background: var(--c-blue-lt);   color: var(--c-blue); }

    /* Usuario */
    .navbar__actions  { display: flex; align-items: center; gap: 12px; flex-shrink: 0; }
    .navbar__user     { display: flex; align-items: center; gap: 10px; }
    .avatar {
      width: 34px; height: 34px;
      border-radius: 50%;
      font-size: 14px; font-weight: 600;
      display: flex; align-items: center; justify-content: center;
    }
    .avatar--tienda { background: var(--c-teal-lt); color: var(--c-teal); }
    .avatar--agente { background: var(--c-purple-lt); color: var(--c-purple); }
    .avatar--admin  { background: var(--c-amber-lt); color: var(--c-amber); }
    .navbar__userinfo { display: flex; flex-direction: column; }
    .navbar__username { font-size: 13px; font-weight: 500; line-height: 1.3; }
    .navbar__role     { font-size: 11px; color: var(--c-muted); }
    @media (max-width: 640px) {
      .navbar__userinfo { display: none; }
      .navbar__nav { display: none; }
      .notif-pills { display: none; }
    }
  `],
})
export class NavbarComponent implements OnInit, OnDestroy {
  @Input() section = '';

  notif = signal<Notificaciones | null>(null);
  private pollInterval?: ReturnType<typeof setInterval>;
  private readonly api = environment.apiUrl;

  constructor(public auth: AuthService, private http: HttpClient) { }

  ngOnInit() {
    this.fetchNotif();
    // Polling cada 30 segundos
    this.pollInterval = setInterval(() => this.fetchNotif(), 30_000);
  }

  ngOnDestroy() {
    if (this.pollInterval) clearInterval(this.pollInterval);
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
      ADMIN: 'avatar--admin',
    };
    return map[this.auth.rol() ?? ''] ?? '';
  }

  roleLabel() {
    const map: Record<string, string> = {
      TIENDA: 'Tienda',
      AGENTE: 'Agente Call Center',
      ADMIN: 'Administrador',
    };
    return map[this.auth.rol() ?? ''] ?? '';
  }
}