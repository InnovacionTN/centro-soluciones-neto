import { __decorate } from "tslib";
import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
let LoginComponent = class LoginComponent {
    constructor(auth, router) {
        this.auth = auth;
        this.router = router;
        this.email = '';
        this.password = '';
        this.loading = signal(false);
        this.error = signal('');
        this.showPwd = signal(false);
        this.testAccounts = [
            { rol: 'ADMIN', label: 'Administrador Sistema', email: 'admin@soyneto.com', password: 'Neto2024!' },
            { rol: 'TIENDA', label: 'Tienda 749 — PANZACOLA', email: 't749@soyneto.com', password: 'Neto2024!' },
            { rol: 'AGENTE', label: 'Sistemas — Christian', email: 'christian.gutierrez@soyneto.com', password: 'Neto2024!' },
            { rol: 'AGENTE', label: 'Mantto — Everardo', email: 'everardo.mtz@soyneto.com', password: 'Neto2024!' },
            { rol: 'AGENTE', label: 'Abasto — Alejandra', email: 'alejandra.sanchez@soyneto.com', password: 'Neto2024!' },
            { rol: 'AGENTE', label: 'Finanzas — Brenda', email: 'brenda.alvarez@soyneto.com', password: 'Neto2024!' },
        ];
        // Si ya está logueado, redirigir
        if (this.auth.isLoggedIn()) {
            this.auth['redirectByRole'](this.auth.rol());
        }
    }
    fillAccount(acc) {
        this.email = acc.email;
        this.password = acc.password;
        this.error.set('');
    }
    submit() {
        if (!this.email || !this.password || this.loading())
            return;
        // Validar dominio permitido
        const dominio = this.email.trim().toLowerCase().split('@')[1] ?? '';
        if (!['soyneto.com', 'tiendasneto.com'].includes(dominio)) {
            this.error.set('Solo se permiten correos @soyneto.com o @tiendasneto.com');
            return;
        }
        this.loading.set(true);
        this.error.set('');
        this.auth.login({ email: this.email.trim().toLowerCase(), password: this.password }).subscribe({
            next: () => this.loading.set(false),
            error: (err) => {
                this.loading.set(false);
                this.error.set(err.message);
            },
        });
    }
};
LoginComponent = __decorate([
    Component({
        selector: 'app-login',
        standalone: true,
        imports: [CommonModule, FormsModule],
        template: `
    <div class="login-page">
      <div class="login-card fade-in">

        <!-- Logo / Marca -->
        <div class="login-brand">
          <div class="login-logo">
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
              <rect width="28" height="28" rx="8" fill="#2563EB"/>
              <path d="M8 14C8 10.686 10.686 8 14 8s6 2.686 6 6-2.686 6-6 6-6-2.686-6-6z"
                    fill="white" fill-opacity=".25"/>
              <path d="M14 11v6M11 14h6" stroke="white" stroke-width="2"
                    stroke-linecap="round"/>
            </svg>
          </div>
          <div>
            <h1 class="login-title">Centro de Soluciones</h1>
            <p class="login-sub">Plataforma de soporte · Soluciones Neto</p>
          </div>
        </div>

        <div class="divider"></div>

        <!-- Error -->
        @if (error()) {
          <div class="login-error slide-down">
            <span>⚠</span> {{ error() }}
          </div>
        }

        <!-- Formulario -->
        <form (ngSubmit)="submit()" class="login-form">
          <div class="field">
            <label class="field__label" for="email">Correo corporativo</label>
            <input
              id="email"
              class="input"
              type="email"
              placeholder="usuario@soyneto.com"
              [(ngModel)]="email"
              name="email"
              autocomplete="username"
              [disabled]="loading()"
              required
            />
          </div>

          <div class="field">
            <label class="field__label" for="password">Contraseña</label>
            <div class="password-wrap">
              <input
                id="password"
                class="input"
                [type]="showPwd() ? 'text' : 'password'"
                placeholder="••••••••"
                [(ngModel)]="password"
                name="password"
                autocomplete="current-password"
                [disabled]="loading()"
                required
              />
              <button
                type="button"
                class="pwd-toggle"
                (click)="showPwd.set(!showPwd())"
                tabindex="-1"
              >
                {{ showPwd() ? '🙈' : '👁' }}
              </button>
            </div>
          </div>

          <button
            type="submit"
            class="btn btn--primary btn--full btn--lg mt-4"
            [class.btn--loading]="loading()"
            [disabled]="loading() || !email || !password"
          >
            {{ loading() ? '' : 'Entrar' }}
          </button>
        </form>

        <!-- Cuentas de prueba -->
        <div class="login-hint">
          <div class="hint-header">
            <span class="hint-title">Cuentas de prueba</span>
          </div>
          <div class="hint-grid">
            @for (acc of testAccounts; track acc.email) {
              <button class="hint-chip" (click)="fillAccount(acc)">
                <span class="hint-role" [class]="'hint-role--' + acc.rol">
                  {{ acc.rol === 'ADMIN' ? '⚙' : acc.rol === 'TIENDA' ? '🏪' : '🎧' }}
                </span>
                <span class="hint-label">{{ acc.label }}</span>
              </button>
            }
          </div>
        </div>

      </div>
    </div>
  `,
        styles: [`
    .login-page {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--c-bg);
      padding: 24px;
    }
    .login-card {
      width: 100%;
      max-width: 420px;
      background: var(--c-surface);
      border: 1px solid var(--c-border);
      border-radius: var(--radius-xl);
      padding: 32px;
      box-shadow: var(--shadow-lg);
    }
    .login-brand {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 24px;
    }
    .login-logo {
      flex-shrink: 0;
    }
    .login-title {
      font-size: 18px;
      font-weight: 600;
      color: var(--c-text);
    }
    .login-sub {
      font-size: 13px;
      color: var(--c-muted);
    }
    .login-error {
      background: var(--c-red-lt);
      color: var(--c-red);
      border: 1px solid var(--c-red-md);
      border-radius: var(--radius-md);
      padding: 10px 14px;
      font-size: 14px;
      margin-bottom: 16px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .login-form { display: flex; flex-direction: column; gap: 16px; }
    .password-wrap { position: relative; }
    .password-wrap .input { padding-right: 42px; }
    .pwd-toggle {
      position: absolute;
      right: 12px;
      top: 50%;
      transform: translateY(-50%);
      background: none;
      border: none;
      font-size: 16px;
      line-height: 1;
      padding: 2px;
      opacity: .7;
    }
    .pwd-toggle:hover { opacity: 1; }
    .login-hint {
      margin-top: 28px;
      padding-top: 20px;
      border-top: 1px solid var(--c-border);
    }
    .login-hint {
      margin-top: 20px;
      border-top: 1px solid var(--c-border);
      padding-top: 16px;
    }
    .hint-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 10px;
    }
    .hint-title {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: .06em;
      color: var(--c-muted);
    }
    .hint-pwd {
      font-size: 11px;
      color: var(--c-muted);
    }
    .hint-pwd strong { color: var(--c-text); }
    .hint-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6px;
    }
    .hint-label { font-size: 11px; truncate: ellipsis; overflow: hidden; white-space: nowrap; }
    .hint-chip {
      display: flex;
      align-items: center;
      gap: 8px;
      width: 100%;
      padding: 7px 10px;
      border: 1px solid var(--c-border);
      border-radius: var(--radius-md);
      background: transparent;
      font-size: 13px;
      color: var(--c-text);
      margin-bottom: 6px;
      transition: background var(--transition);
      text-align: left;
    }
    .hint-chip:hover { background: var(--c-bg); }
    .hint-role {
      font-size: 11px;
      font-weight: 600;
      padding: 1px 7px;
      border-radius: 10px;
      text-transform: uppercase;
      letter-spacing: .04em;
    }
    .hint-role--TIENDA { background: var(--c-blue-lt); color: var(--c-blue); }
    .hint-role--AGENTE { background: var(--c-purple-lt); color: var(--c-purple); }
    .hint-role--ADMIN  { background: var(--c-amber-lt); color: var(--c-amber); }
  `],
    })
], LoginComponent);
export { LoginComponent };
//# sourceMappingURL=login.component.js.map