import { Component, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { SupabaseService } from '../../core/services/supabase.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="login-page">

      <!-- Panel izquierdo: Branding -->
      <div class="login-panel login-panel--brand">
        <div class="brand-overlay"></div>
        <div class="brand-content">
          <div class="brand-logo">
            <img src="assets/logo-csn.png" alt="Centro de Soluciones Neto" style="height: 90px; width: auto; object-fit: contain;">
          </div>
          <h1 class="brand-title">Centro de<br><span>Soluciones</span><br>Neto</h1>
          <p class="brand-tagline">
            Gestión de tickets TI y servicios internos.<br>
            Tu plataforma de soporte, siempre disponible.
          </p>
          <div class="brand-dots">
            <span class="dot dot--active"></span>
            <span class="dot"></span>
            <span class="dot"></span>
          </div>
        </div>
        <!-- Decoración de fondo -->
        <div class="brand-circle brand-circle--1"></div>
        <div class="brand-circle brand-circle--2"></div>
        <div class="brand-circle brand-circle--3"></div>
      </div>

      <!-- Panel derecho: Formulario -->
      <div class="login-panel login-panel--form">

        <!-- Fondo animado -->
        <div class="bg-shapes" aria-hidden="true">
          <div class="bg-shape bg-shape--1"></div>
          <div class="bg-shape bg-shape--2"></div>
          <div class="bg-shape bg-shape--3"></div>
          <div class="bg-shape bg-shape--4"></div>
          <div class="bg-shape bg-shape--5"></div>
        </div>

        <div class="form-card fade-in-up">

          <!-- Cabecera de bienvenida -->
          <div class="welcome-header">
            <div class="welcome-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#FF5100" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>
                <polyline points="10 17 15 12 10 7"/>
                <line x1="15" y1="12" x2="3" y2="12"/>
              </svg>
            </div>
            <div>
              <h2 class="welcome-title">¡Bienvenido de regreso!</h2>
              <p class="welcome-sub">Usa tu cuenta de Slack corporativa para ingresar</p>
            </div>
          </div>

          <!-- Error -->
          @if (error()) {
            <div class="login-error slide-in">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              {{ error() }}
            </div>
          }

          <!-- Botón Slack (primario) -->
          <button
            type="button"
            class="btn-slack btn-slack--primary"
            (click)="loginWithSlack()"
            [disabled]="loading()"
          >
            @if (slackLoading()) {
              <span class="spinner spinner--dark"></span>
            } @else {
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52z" fill="#E01E5A"/>
                <path d="M6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313z" fill="#E01E5A"/>
                <path d="M8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834z" fill="#36C5F0"/>
                <path d="M8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312z" fill="#36C5F0"/>
                <path d="M18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834z" fill="#2EB67D"/>
                <path d="M17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312z" fill="#2EB67D"/>
                <path d="M15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52z" fill="#ECB22E"/>
                <path d="M15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z" fill="#ECB22E"/>
              </svg>
            }
            Entrar con Slack
          </button>

          <!-- Toggle correo/contraseña -->
          <button
            type="button"
            class="btn-email-toggle"
            (click)="showEmailForm.set(!showEmailForm())"
            [disabled]="loading()"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
              <polyline points="22,6 12,13 2,6"/>
            </svg>
            {{ showEmailForm() ? 'Ocultar' : 'Usar correo y contraseña' }}
            <svg class="chevron" [class.chevron--open]="showEmailForm()" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </button>

          <!-- Formulario email/password (colapsable) -->
          @if (showEmailForm()) {
            <div class="email-form-wrap slide-in">
              <div class="divider divider--sm"><span>correo corporativo</span></div>

              <form (ngSubmit)="submit()" class="login-form" novalidate>

                <div class="field">
                  <label class="field__label" for="email">Correo</label>
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
                      [attr.aria-label]="showPwd() ? 'Ocultar contraseña' : 'Mostrar contraseña'"
                    >
                      @if (showPwd()) {
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                          <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                          <line x1="1" y1="1" x2="23" y2="23"/>
                        </svg>
                      } @else {
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                          <circle cx="12" cy="12" r="3"/>
                        </svg>
                      }
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  id="btn-login"
                  class="btn-submit"
                  [class.btn-submit--loading]="loading()"
                  [disabled]="loading() || !email || !password"
                >
                  @if (loading() && !slackLoading()) {
                    <span class="spinner"></span>
                  } @else {
                    Iniciar sesión
                  }
                </button>

              </form>
            </div>
          }

          <!-- Footer -->
          <p class="form-footer">
            Acceso restringido · Solo personal autorizado de
            <strong>Tiendas Neto</strong>
          </p>

        </div>
      </div>

    </div>
  `,
  styles: [`
    /* ── Página completa ───────────────────────────────── */
    .login-page {
      min-height: 100vh;
      display: flex;
      flex-direction: row;
    }

    /* ── Panel izquierdo (Branding) ────────────────────── */
    .login-panel--brand {
      position: relative;
      flex: 0 0 420px;
      background: linear-gradient(145deg, #0E3B83 0%, #0a2a60 60%, #07204a 100%);
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      padding: 40px;
    }

    /* Círculos decorativos de fondo */
    .brand-circle {
      position: absolute;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.04);
      animation: float 8s ease-in-out infinite;
    }
    .brand-circle--1 { width: 320px; height: 320px; top: -80px; right: -100px; animation-delay: 0s; }
    .brand-circle--2 { width: 240px; height: 240px; bottom: -60px; left: -80px; animation-delay: 2s; background: rgba(255,81,0,0.07); }
    .brand-circle--3 { width: 180px; height: 180px; top: 45%; left: 10%; animation-delay: 4s; }

    @keyframes float {
      0%, 100% { transform: translateY(0) scale(1); }
      50%       { transform: translateY(-18px) scale(1.04); }
    }

    .brand-overlay {
      position: absolute;
      inset: 0;
      background: url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.02'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E");
    }

    .brand-content {
      position: relative;
      z-index: 1;
      color: white;
      text-align: center;
      animation: fadeInLeft .6s ease both;
    }

    @keyframes fadeInLeft {
      from { opacity: 0; transform: translateX(-24px); }
      to   { opacity: 1; transform: translateX(0); }
    }

    .brand-logo {
      margin-bottom: 28px;
      display: flex;
      justify-content: center;
    }

    .brand-title {
      font-family: 'Montserrat', sans-serif;
      font-size: 38px;
      font-weight: 700;
      line-height: 1.1;
      margin-bottom: 20px;
      letter-spacing: -0.5px;
    }
    .brand-title span {
      color: #FF5100;
    }

    .brand-tagline {
      font-size: 14px;
      font-weight: 400;
      color: rgba(255,255,255,0.7);
      line-height: 1.7;
      margin-bottom: 36px;
    }

    .brand-dots { display: flex; justify-content: center; gap: 8px; }
    .dot {
      width: 8px; height: 8px;
      border-radius: 50%;
      background: rgba(255,255,255,0.3);
      transition: all .4s ease;
    }
    .dot--active {
      width: 28px;
      border-radius: 4px;
      background: #FF5100;
    }

    /* ── Panel derecho (Formulario) ────────────────────── */
    .login-panel--form {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #FAFAFB;
      padding: 40px 24px;
    }

    .form-card {
      width: 100%;
      max-width: 440px;
      background: #FFFFFF;
      border: 1px solid #E0E0E0;
      border-radius: 20px;
      padding: 40px 36px;
      box-shadow: 0 20px 60px -10px rgba(14,59,131,0.12), 0 4px 16px rgba(0,0,0,0.06);
    }

    @keyframes fadeInUp {
      from { opacity: 0; transform: translateY(28px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    .fade-in-up { animation: fadeInUp .5s cubic-bezier(0.22, 1, 0.36, 1) both; }

    /* ── Cabecera de bienvenida ─────────────────────────── */
    .welcome-header {
      display: flex;
      align-items: flex-start;
      gap: 14px;
      margin-bottom: 28px;
    }

    .welcome-icon {
      width: 44px;
      height: 44px;
      border-radius: 12px;
      background: #FFF0E8;
      border: 1px solid #FFB494;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    .welcome-title {
      font-family: 'Montserrat', sans-serif;
      font-size: 20px;
      font-weight: 700;
      color: #343434;
      line-height: 1.2;
      margin-bottom: 4px;
    }

    .welcome-sub {
      font-size: 13px;
      color: #757575;
      line-height: 1.5;
    }

    /* ── Error ─────────────────────────────────────────── */
    .login-error {
      background: #FDEDEB;
      color: #E74C3C;
      border: 1px solid #F5B7B1;
      border-radius: 10px;
      padding: 12px 16px;
      font-size: 13px;
      margin-bottom: 20px;
      display: flex;
      align-items: center;
      gap: 10px;
      font-weight: 500;
    }

    @keyframes slideIn {
      from { opacity: 0; transform: translateY(-8px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    .slide-in { animation: slideIn .25s ease; }

    /* ── Formulario ─────────────────────────────────────── */
    .login-form { display: flex; flex-direction: column; gap: 18px; }

    .field { display: flex; flex-direction: column; gap: 8px; }

    .field__label {
      font-size: 13px;
      font-weight: 600;
      color: #343434;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .input {
      width: 100%;
      padding: 12px 16px;
      border: 1.5px solid #E0E0E0;
      border-radius: 10px;
      font-size: 14px;
      font-family: 'Montserrat', sans-serif;
      color: #343434;
      background: #FAFAFB;
      transition: border-color 200ms ease, box-shadow 200ms ease, background 200ms ease;
      outline: none;
    }
    .input:focus {
      border-color: #0E3B83;
      background: #FFFFFF;
      box-shadow: 0 0 0 4px rgba(14, 59, 131, 0.10);
    }
    .input:disabled {
      background: #F3F4F6;
      color: #9D9D9C;
      cursor: not-allowed;
    }
    .input::placeholder { color: #AAAAAA; }

    .password-wrap { position: relative; }
    .password-wrap .input { padding-right: 48px; }

    .pwd-toggle {
      position: absolute;
      right: 14px;
      top: 50%;
      transform: translateY(-50%);
      background: none;
      border: none;
      padding: 4px;
      display: flex;
      align-items: center;
      color: #9D9D9C;
      transition: color 200ms ease;
    }
    .pwd-toggle:hover { color: #0E3B83; }

    /* ── Botón de submit ────────────────────────────────── */
    .btn-submit {
      margin-top: 6px;
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      padding: 14px 24px;
      background: linear-gradient(135deg, #0E3B83, #1251b5);
      color: white;
      border: none;
      border-radius: 12px;
      font-family: 'Montserrat', sans-serif;
      font-size: 15px;
      font-weight: 700;
      letter-spacing: 0.3px;
      cursor: pointer;
      transition: all 250ms cubic-bezier(0.4, 0, 0.2, 1);
      position: relative;
      overflow: hidden;
    }
    .btn-submit::after {
      content: '';
      position: absolute;
      inset: 0;
      background: linear-gradient(135deg, #FF5100, #e04600);
      opacity: 0;
      transition: opacity 300ms ease;
      border-radius: inherit;
    }
    .btn-submit:not(:disabled):hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 24px rgba(14, 59, 131, 0.35);
    }
    .btn-submit:not(:disabled):hover::after {
      opacity: 0.12;
    }
    .btn-submit:not(:disabled):active {
      transform: translateY(0);
      box-shadow: none;
    }
    .btn-submit:disabled {
      opacity: 0.55;
      cursor: not-allowed;
      transform: none;
    }

    /* Spinner de carga */
    .spinner {
      width: 18px;
      height: 18px;
      border: 2px solid rgba(255,255,255,0.35);
      border-top-color: #ffffff;
      border-radius: 50%;
      animation: spin .7s linear infinite;
      flex-shrink: 0;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    .btn-submit--loading > * { position: relative; z-index: 1; }

    /* ── Divisor ────────────────────────────────────────── */
    .divider {
      display: flex;
      align-items: center;
      gap: 12px;
      margin: 20px 0 16px;
    }
    .divider--sm { margin: 16px 0 12px; }
    .divider::before, .divider::after {
      content: '';
      flex: 1;
      height: 1px;
      background: #E0E0E0;
    }
    .divider span {
      font-size: 12px;
      color: #AAAAAA;
      white-space: nowrap;
    }

    /* ── Botón Slack primario ────────────────────────────── */
    .btn-slack--primary {
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
      padding: 15px 24px;
      background: #fff;
      color: #1d1c1d;
      border: 1.5px solid #ddd;
      border-radius: 12px;
      font-family: 'Montserrat', sans-serif;
      font-size: 15px;
      font-weight: 700;
      cursor: pointer;
      transition: all 200ms ease;
      box-shadow: 0 2px 8px rgba(0,0,0,0.06);
      margin-bottom: 12px;
    }
    .btn-slack--primary:not(:disabled):hover {
      border-color: #4A154B;
      background: #fdf6ff;
      box-shadow: 0 6px 20px rgba(74,21,75,0.13);
      transform: translateY(-1px);
    }
    .btn-slack--primary:disabled { opacity: 0.55; cursor: not-allowed; }

    /* ── Botón toggle correo ─────────────────────────────── */
    .btn-email-toggle {
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 7px;
      padding: 10px 16px;
      background: transparent;
      color: #666;
      border: 1.5px solid #E0E0E0;
      border-radius: 10px;
      font-family: 'Montserrat', sans-serif;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      transition: all 200ms ease;
    }
    .btn-email-toggle:hover { color: #0E3B83; border-color: #A0BAE2; background: #f0f5ff; }
    .btn-email-toggle:disabled { opacity: 0.5; cursor: not-allowed; }

    .chevron { transition: transform 200ms ease; }
    .chevron--open { transform: rotate(180deg); }

    /* ── Formulario email/pass colapsable ────────────────── */
    .email-form-wrap { margin-top: 4px; }

    .spinner--dark {
      border-color: rgba(0,0,0,0.2);
      border-top-color: #333;
    }

    /* ── Footer ─────────────────────────────────────────── */
    .form-footer {
      margin-top: 24px;
      text-align: center;
      font-size: 12px;
      color: #AAAAAA;
      line-height: 1.5;
    }
    .form-footer strong {
      color: #0E3B83;
    }

    /* ── Fondo animado del panel formulario ──────────────── */
    .login-panel--form { position: relative; overflow: hidden; }

    .bg-shapes {
      position: absolute;
      inset: 0;
      pointer-events: none;
      z-index: 0;
    }

    .form-card { position: relative; z-index: 1; }

    .bg-shape {
      position: absolute;
      border-radius: 50%;
      /* Opacidad base que modificará la animación */
      opacity: 0.8;
      animation: bgFloat 12s ease-in-out infinite alternate;
    }

    /* Burbuja 1 — azul, arriba derecha */
    .bg-shape--1 {
      width: 340px;
      height: 340px;
      top: -100px;
      right: -80px;
      background: radial-gradient(circle, rgba(14,59,131,0.15) 0%, transparent 70%);
      animation-delay: 0s;
      animation-duration: 14s;
    }

    /* Burbuja 2 — naranja, abajo izquierda */
    .bg-shape--2 {
      width: 280px;
      height: 280px;
      bottom: -60px;
      left: -60px;
      background: radial-gradient(circle, rgba(255,81,0,0.12) 0%, transparent 70%);
      animation-delay: 2.5s;
      animation-duration: 16s;
    }

    /* Burbuja 3 — azul pequeño, centro izquierda */
    .bg-shape--3 {
      width: 180px;
      height: 180px;
      top: 40%;
      left: -40px;
      background: radial-gradient(circle, rgba(14,59,131,0.1) 0%, transparent 70%);
      animation-delay: 5s;
      animation-duration: 11s;
    }

    /* Burbuja 4 — naranja pequeño, arriba centro */
    .bg-shape--4 {
      width: 140px;
      height: 140px;
      top: 10%;
      left: 35%;
      background: radial-gradient(circle, rgba(255,81,0,0.08) 0%, transparent 70%);
      animation-delay: 1.5s;
      animation-duration: 18s;
    }

    /* Burbuja 5 — cyan acento, abajo derecha */
    .bg-shape--5 {
      width: 220px;
      height: 220px;
      bottom: 5%;
      right: -30px;
      background: radial-gradient(circle, rgba(26,188,156,0.1) 0%, transparent 70%);
      animation-delay: 4s;
      animation-duration: 13s;
    }

    @keyframes bgFloat {
      0%   { opacity: 0.6; transform: translate(0, 0) scale(1); }
      50%  { opacity: 1;   transform: translate(15px, -25px) scale(1.06); }
      100% { opacity: 0.7; transform: translate(-10px, 15px) scale(0.95); }
    }

    /* ── Responsividad ──────────────────────────────────── */
    @media (max-width: 900px) {
      .login-panel--brand { flex: 0 0 340px; }
      .brand-title { font-size: 30px; }
    }

    @media (max-width: 680px) {
      .login-page { flex-direction: column; }

      .login-panel--brand {
        flex: none;
        padding: 40px 24px 48px;
        min-height: 260px;
      }
      .brand-title { font-size: 28px; }
      .brand-tagline { font-size: 13px; }

      .login-panel--form {
        padding: 32px 16px 48px;
      }

      .form-card {
        padding: 28px 22px;
        border-radius: 16px;
        box-shadow: 0 8px 32px rgba(14,59,131,0.1);
      }

      .welcome-title { font-size: 18px; }
    }

    @media (max-width: 380px) {
      .form-card { padding: 24px 18px; }
    }
  `],
})
export class LoginComponent {
  email = '';
  password = '';
  loading = signal(false);
  slackLoading = signal(false);
  error = signal('');
  showPwd = signal(false);
  showEmailForm = signal(false);

  constructor(
    private auth: AuthService,
    private router: Router,
    private supabase: SupabaseService,
  ) {
    if (this.auth.isLoggedIn()) {
      this.auth['redirectByRole'](this.auth.rol()!);
    }
  }

  loginWithSlack() {
    this.slackLoading.set(true);
    this.loading.set(true);
    this.error.set('');
    const redirectTo = window.location.origin + '/auth/callback';
    this.supabase.signInWithSlack(redirectTo).catch(() => {
      this.slackLoading.set(false);
      this.loading.set(false);
      this.error.set('No se pudo iniciar sesión con Slack. Intenta de nuevo.');
    });
  }

  submit() {
    if (!this.email || !this.password || this.loading()) return;

    const dominio = this.email.trim().toLowerCase().split('@')[1] ?? '';
    if (!['soyneto.com', 'tiendasneto.com'].includes(dominio)) {
      this.error.set('Solo se permiten correos @soyneto.com o @tiendasneto.com');
      return;
    }

    this.loading.set(true);
    this.error.set('');

    this.auth.login({ email: this.email.trim().toLowerCase(), password: this.password }).subscribe({
      next: () => this.loading.set(false),
      error: (err: Error) => {
        this.loading.set(false);
        this.error.set(err.message);
      },
    });
  }
}