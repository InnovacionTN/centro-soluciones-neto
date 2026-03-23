import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <nav class="navbar">
      <div class="navbar__inner">
        <div class="navbar__brand">
          <svg width="22" height="22" viewBox="0 0 28 28" fill="none">
            <rect width="28" height="28" rx="7" fill="#2563EB"/>
            <path d="M14 11v6M11 14h6" stroke="white" stroke-width="2.2"
                  stroke-linecap="round"/>
          </svg>
          <span class="navbar__name">Centro de Soluciones</span>
          @if (section) {
            <span class="navbar__sep">/</span>
            <span class="navbar__section">{{ section }}</span>
          }
        </div>
        @if (auth.isAdmin()) {
          <a routerLink="/admin" class="btn btn--ghost btn--sm" style="margin-left:16px;font-size:12px">
            ⚙ Admin
          </a>
        }

        <div class="navbar__actions">
          <div class="navbar__user">
            <div class="avatar">{{ initial() }}</div>
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
    }
    .navbar__brand {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .navbar__name {
      font-size: 15px;
      font-weight: 600;
      color: var(--c-text);
    }
    .navbar__sep, .navbar__section {
      color: var(--c-muted);
      font-size: 14px;
    }
    .navbar__actions { display: flex; align-items: center; gap: 16px; }
    .navbar__user    { display: flex; align-items: center; gap: 10px; }
    .avatar {
      width: 34px; height: 34px;
      border-radius: 50%;
      background: var(--c-blue-lt);
      color: var(--c-blue);
      font-size: 14px;
      font-weight: 600;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .navbar__userinfo { display: flex; flex-direction: column; }
    .navbar__username { font-size: 13px; font-weight: 500; line-height: 1.3; }
    .navbar__role     { font-size: 11px; color: var(--c-muted); }
    @media (max-width: 600px) {
      .navbar__userinfo { display: none; }
    }
  `],
})
export class NavbarComponent {
  @Input() section = '';

  constructor(public auth: AuthService) {}

  initial() {
    return this.auth.currentUser()?.nombre?.charAt(0)?.toUpperCase() ?? '?';
  }

  roleLabel() {
    const map: Record<string, string> = {
      TIENDA: 'Tienda',
      AGENTE: 'Agente Call Center',
      ADMIN:  'Administrador',
    };
    return map[this.auth.rol() ?? ''] ?? '';
  }
}
