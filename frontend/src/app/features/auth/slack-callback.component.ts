import { Component, OnInit, signal } from '@angular/core';
import { AuthService } from '../../core/services/auth.service';
import { SupabaseService } from '../../core/services/supabase.service';

@Component({
  selector: 'app-slack-callback',
  standalone: true,
  template: `
    <div class="cb-page">
      @if (error()) {
        <div class="cb-card">
          <div class="cb-icon cb-icon--err">✕</div>
          <p class="cb-msg">{{ error() }}</p>
          <a class="cb-link" href="/login">Volver al inicio de sesión</a>
        </div>
      } @else {
        <div class="cb-card cb-card--loading">
          <div class="cb-spinner"></div>
          <p class="cb-msg">Verificando tu cuenta de Slack...</p>
        </div>
      }
    </div>
  `,
  styles: [`
    .cb-page { min-height:100vh;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#0E3B83,#07204a) }
    .cb-card { background:#fff;border-radius:16px;padding:40px 48px;text-align:center;max-width:360px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,.25) }
    .cb-card--loading { background:rgba(255,255,255,.1);box-shadow:none }
    .cb-spinner { width:48px;height:48px;border:3px solid rgba(255,255,255,.3);border-top-color:#fff;border-radius:50%;animation:spin .8s linear infinite;margin:0 auto 20px }
    .cb-card--loading .cb-msg { color:rgba(255,255,255,.85) }
    .cb-icon { width:52px;height:52px;border-radius:50%;background:#FDEDEB;color:#E74C3C;font-size:1.4rem;font-weight:700;display:flex;align-items:center;justify-content:center;margin:0 auto 16px }
    .cb-msg { font-size:.95rem;color:#444;line-height:1.5;margin-bottom:20px }
    .cb-link { color:#0E3B83;font-weight:600;font-size:.88rem;text-decoration:none }
    .cb-link:hover { text-decoration:underline }
    @keyframes spin { to { transform:rotate(360deg) } }
  `],
})
export class SlackCallbackComponent implements OnInit {
  error = signal('');

  constructor(private supabase: SupabaseService, private auth: AuthService) {}

  async ngOnInit() {
    // Supabase PKCE flow: the callback URL has ?code=... which the SDK exchanges
    // for tokens asynchronously. We listen to onAuthStateChange to catch SIGNED_IN.
    const { data: { subscription } } = this.supabase.client.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'SIGNED_IN' && session) {
          subscription.unsubscribe();
          try {
            await this.auth.loginWithSlack(session.access_token);
          } catch (e: unknown) {
            this.error.set((e as Error).message ?? 'Error al autenticar con Slack');
          }
        } else if (event === 'INITIAL_SESSION' && !session) {
          // No session after processing URL — auth failed or user cancelled
          subscription.unsubscribe();
          this.error.set('No se pudo obtener la sesión de Slack. Intenta de nuevo.');
        }
      }
    );
  }
}
