import {
  Component, signal, inject, Input,
  ViewChild, ElementRef, AfterViewChecked, OnInit, computed
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router, NavigationEnd } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map, startWith } from 'rxjs/operators';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { catchError, of } from 'rxjs';
import { NavbarComponent } from '../../shared/components/navbar.component';
import { AuthService } from '../../core/services/auth.service';
import { environment } from '../../../environments/environment';

// ─── Daniel Panel (declarado antes del Shell) ─────────────────────────────────

interface DanielMsg { id: string; from: 'daniel' | 'user'; text: string; time: Date; }

@Component({
  selector: 'app-admin-daniel-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="daniel-wrap">
      <div class="daniel-head">
        <div class="daniel-orb" [class.daniel-orb--pulse]="thinking()"></div>
        <div class="daniel-head-txt">
          <span class="daniel-head-name">Daniel</span>
          <span class="daniel-head-sub">
            @if (loading()) { Cargando datos… }
            @else if (thinking()) { Analizando… }
            @else { Equipo CSN }
          </span>
        </div>
        @if (msgs().length > 1) {
          <button class="daniel-reset" (click)="reset()">↺</button>
        }
      </div>

      <div class="daniel-msgs" #chatRef>
        @for (m of msgs(); track m.id) {
          <div class="dmsg" [class.dmsg--daniel]="m.from==='daniel'" [class.dmsg--user]="m.from==='user'">
            @if (m.from === 'daniel') { <div class="daniel-orb daniel-orb--xs"></div> }
            <div class="dbubble" [class.dbubble--daniel]="m.from==='daniel'" [class.dbubble--user]="m.from==='user'">
              {{ m.text }}
            </div>
          </div>
        }
        @if (thinking()) {
          <div class="dmsg dmsg--daniel">
            <div class="daniel-orb daniel-orb--xs"></div>
            <div class="typing"><span></span><span></span><span></span></div>
          </div>
        }
      </div>

      <div class="daniel-chips">
        <button class="dchip" [disabled]="loading()" (click)="quick('¿Cómo va el sistema hoy?')">📊 Estado</button>
        <button class="dchip" [disabled]="loading()" (click)="quick('¿Cuántos tickets tienen SLA vencido?')">⚠ Vencidos</button>
        <button class="dchip" [disabled]="loading()" (click)="quick('¿Hay tickets sin agente asignado?')">🔍 Sin agente</button>
      </div>

      @if (chatImagen()) {
        <div style="padding:4px 8px 0;display:inline-flex;position:relative">
          <img [src]="chatImagen()!" style="height:44px;border-radius:6px;border:2px solid var(--c-blue-md)">
          <button (click)="chatImagen.set(null)" style="position:absolute;top:-4px;right:-4px;width:15px;height:15px;border-radius:50%;background:var(--c-red);color:#fff;border:none;font-size:8px;cursor:pointer;display:flex;align-items:center;justify-content:center">✕</button>
        </div>
      }
      <div class="daniel-input-row"
           (dragover)="$event.preventDefault()"
           (drop)="onDanielDrop($event)">
        <button class="daniel-attach" (click)="danielFileInput.click()" title="Adjuntar imagen" [disabled]="thinking()">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
          </svg>
        </button>
        <input #danielFileInput type="file" accept="image/*" style="display:none" (change)="onDanielFile($event)">
        <input class="daniel-input" [(ngModel)]="chatInput"
               placeholder="Pregunta a Daniel… (Ctrl+V para pegar imagen)"
               [disabled]="thinking() || loading()"
               (keydown.enter)="send()"
               (paste)="onDanielPaste($event)" />
        <button class="daniel-send" [disabled]="(!chatInput.trim() && !chatImagen()) || thinking() || loading()" (click)="send()">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
          </svg>
        </button>
      </div>
    </div>
  `,
  styles: [`
    :host { display:flex; flex-direction:column; height:100%; }
    .daniel-wrap { display:flex; flex-direction:column; height:100%; overflow:hidden; }

    .daniel-head {
      display:flex; align-items:center; gap:10px; padding:14px 16px;
      border-bottom:1px solid rgba(255,255,255,.1); flex-shrink:0;
      background:linear-gradient(135deg,#0f1f42,#1B3462);
    }
    .daniel-orb {
      width:30px; height:30px; border-radius:50%; flex-shrink:0;
      background:radial-gradient(circle at 32% 32%,#6ba3ff,#1B3462);
      box-shadow:0 0 10px rgba(79,138,255,.4);
    }
    .daniel-orb--xs { width:20px; height:20px; }
    .daniel-orb--pulse { animation:orb-p 1.5s ease-in-out infinite; }
    @keyframes orb-p { 0%,100%{box-shadow:0 0 8px rgba(79,138,255,.4);}50%{box-shadow:0 0 20px rgba(79,138,255,.8);} }
    .daniel-head-name { font-size:13px; font-weight:700; color:white; display:block; }
    .daniel-head-sub  { font-size:11px; color:rgba(255,255,255,.55); display:block; }
    .daniel-reset {
      margin-left:auto; background:rgba(255,255,255,.1); border:none;
      color:white; width:26px; height:26px; border-radius:50%;
      cursor:pointer; font-size:13px; transition:background .15s;
    }
    .daniel-reset:hover { background:rgba(255,255,255,.22); }

    .daniel-msgs {
      flex:1; overflow-y:auto; padding:12px; height:0;
      display:flex; flex-direction:column; gap:10px;
    }
    .daniel-msgs::-webkit-scrollbar { width:3px; }
    .daniel-msgs::-webkit-scrollbar-thumb { background:var(--c-border); }

    .dmsg { display:flex; align-items:flex-end; gap:6px; max-width:92%; }
    .dmsg--daniel { align-self:flex-start; }
    .dmsg--user   { align-self:flex-end; flex-direction:row-reverse; }

    .dbubble {
      padding:8px 12px; border-radius:14px; font-size:12.5px;
      line-height:1.5; white-space:pre-wrap; word-break:break-word;
      animation:bin .18s ease;
    }
    @keyframes bin { from{opacity:0;transform:translateY(4px);}to{opacity:1;transform:translateY(0);} }
    .dbubble--daniel { background:var(--c-bg); border:1px solid var(--c-border); border-bottom-left-radius:3px; }
    .dbubble--user   { background:linear-gradient(135deg,#1B3462,#2563eb); color:white; border-bottom-right-radius:3px; }

    .typing { display:flex; gap:4px; padding:9px 13px; background:var(--c-bg); border:1px solid var(--c-border); border-radius:14px; border-bottom-left-radius:3px; }
    .typing span { width:6px; height:6px; background:var(--c-blue); border-radius:50%; animation:b 1.2s ease-in-out infinite; }
    .typing span:nth-child(2){animation-delay:.2s;} .typing span:nth-child(3){animation-delay:.4s;}
    @keyframes b { 0%,80%,100%{transform:translateY(0);opacity:.4;}40%{transform:translateY(-5px);opacity:1;} }

    .daniel-chips { display:flex; gap:5px; flex-wrap:wrap; padding:8px 12px; border-top:1px solid var(--c-border); flex-shrink:0; }
    .dchip {
      padding:4px 9px; border-radius:20px; font-size:11px;
      border:1px solid var(--c-blue-md); background:var(--c-surface);
      color:var(--c-blue); cursor:pointer; transition:all .15s;
    }
    .dchip:hover:not(:disabled) { background:var(--c-blue-lt); }
    .dchip:disabled { opacity:.5; cursor:not-allowed; }

    .daniel-input-row {
      display:flex; align-items:center; gap:8px; padding:10px 12px;
      border-top:1px solid var(--c-border); flex-shrink:0;
    }
    .daniel-attach { background:transparent; border:none; cursor:pointer; color:var(--c-muted); padding:4px 6px; border-radius:4px; display:flex; align-items:center; flex-shrink:0; }
    .daniel-attach:hover { color:var(--c-blue); }
    .daniel-input {
      flex:1; border-radius:20px; border:1.5px solid var(--c-border);
      padding:8px 14px; font-size:12.5px; font-family:inherit; background:var(--c-bg);
    }
    .daniel-input:focus { outline:none; border-color:var(--c-blue); }
    .daniel-send {
      width:34px; height:34px; border-radius:50%; background:var(--c-blue);
      color:white; border:none; cursor:pointer;
      display:flex; align-items:center; justify-content:center; transition:all .15s;
    }
    .daniel-send:disabled { opacity:.4; cursor:not-allowed; }
  `],
})
export class AdminDanielPanelComponent implements OnInit, AfterViewChecked {
  @ViewChild('chatRef') private chatRef?: ElementRef<HTMLDivElement>;
  @Input() jwt = '';
  @Input() userId: number | null = null;

  private http = inject(HttpClient);

  msgs = signal<DanielMsg[]>([]);
  chatInput = '';
  chatImagen = signal<string | null>(null);
  thinking = signal(false);
  loading = signal(true);

  private kpisData = '';
  private torreData = '';
  private needsScroll = false;
  private readonly proxyUrl = `${environment.apiUrl}/dany/chat`;

  ngOnInit() {
    this.addMsg({ from: 'daniel', text: 'Cargando datos del sistema…' });

    Promise.all([
      fetch(`${environment.apiUrl}/admin/kpis/ejecutivo`, {
        headers: { Authorization: `Bearer ${this.jwt}` }
      }).then(r => r.ok ? r.json() : null).catch(() => null),
      fetch(`${environment.apiUrl}/admin/torre`, {
        headers: { Authorization: `Bearer ${this.jwt}` }
      }).then(r => r.ok ? r.json() : null).catch(() => null),
    ]).then(([kpis, torre]) => {
      this.loading.set(false);
      this.kpisData = kpis ? JSON.stringify(kpis) : '';
      this.torreData = torre ? JSON.stringify((torre as any[]).slice(0, 10)) : '';
      const alertas = torre ? (torre as any[]).length : 0;
      this.msgs.set([]);
      this.addMsg({
        from: 'daniel',
        text: `Hola 👋 Soy Daniel, del equipo CSN. Datos listos.\n` +
          (kpis ? `📊 ${kpis.total_abiertos ?? '?'} tickets abiertos · ${kpis.total_vencidos ?? '?'} vencidos` : '') +
          (alertas > 0 ? `\n⚠ ${alertas} alerta(s) en Torre de Control` : '\n✅ Sin alertas críticas') +
          `\n\n¿En qué te puedo ayudar?`
      });
    });
  }

  ngAfterViewChecked() {
    if (this.needsScroll) {
      this.needsScroll = false;
      setTimeout(() => {
        const el = this.chatRef?.nativeElement;
        if (el) el.scrollTop = el.scrollHeight;
      }, 50);
    }
  }

  send() {
    const text = this.chatInput.trim();
    const img = this.chatImagen();
    if ((!text && !img) || this.thinking()) return;
    this.chatInput = '';
    this.chatImagen.set(null);
    this.addMsg({ from: 'user', text });
    this.thinking.set(true);

    const payload = {
      mensaje: text,
      sesion_id: `admin-${this.userId ?? 'x'}`,
      usuario_id: this.userId,
      rol_usuario: 'ADMIN',
      kpis_data: this.kpisData,
      torre_data: this.torreData,
      historial: this.msgs().slice(-6).map(m => ({ de: m.from, texto: m.text })),
    };

    this.http.post<any>(this.proxyUrl, payload).pipe(
      catchError(() => of({ respuesta: 'No pude conectar. Verifica que n8n esté activo.' }))
    ).subscribe(res => {
      this.thinking.set(false);
      this.addMsg({ from: 'daniel', text: res?.respuesta ?? res?.output ?? 'Sin respuesta.' });
    });
  }

  quick(text: string) { this.chatInput = text; this.send(); }

  private async toBase64(f: File): Promise<string> { return new Promise((r, j) => { const rd = new FileReader(); rd.onload = () => r(rd.result as string); rd.onerror = j; rd.readAsDataURL(f); }); }
  private async loadImg(f: File) { if (!f.type.startsWith('image/') || f.size > 5 * 1024 * 1024) return; this.chatImagen.set(await this.toBase64(f)); }
  onDanielFile(e: Event) { const f = (e.target as HTMLInputElement).files?.[0]; if (f) this.loadImg(f); (e.target as HTMLInputElement).value = ''; }
  onDanielPaste(e: ClipboardEvent) { for (const i of Array.from(e.clipboardData?.items ?? [])) if (i.type.startsWith('image/')) { e.preventDefault(); const f = i.getAsFile(); if (f) this.loadImg(f); return; } }
  onDanielDrop(e: DragEvent) { e.preventDefault(); const f = e.dataTransfer?.files[0]; if (f) this.loadImg(f); }

  reset() {
    this.msgs.set([]);
    this.addMsg({ from: 'daniel', text: '¿En qué te puedo ayudar?' });
  }

  private addMsg(p: Omit<DanielMsg, 'id' | 'time'>) {
    this.msgs.update(m => [...m, { id: Math.random().toString(36).slice(2), time: new Date(), ...p }]);
    this.needsScroll = true;
    setTimeout(() => {
      const el = this.chatRef?.nativeElement;
      if (el) el.scrollTop = el.scrollHeight;
    }, 50);
  }
}

// ─── AdminShellComponent ──────────────────────────────────────────────────────

@Component({
  selector: 'app-admin-shell',
  standalone: true,
  imports: [CommonModule, RouterModule, NavbarComponent, AdminDanielPanelComponent],
  template: `
    <div class="page">
      <app-navbar section="Administración" />

      <div class="admin-workspace">

        <!-- Centro: router-outlet renderiza la sección activa -->
        <main class="admin-main">
          <!-- Barra superior con botón Daniel -->
          @if (showDaniel()) {
          <div class="admin-topbar">
            <button class="daniel-btn" (click)="danielOpen.set(!danielOpen())"
                    [class.daniel-btn--on]="danielOpen()">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="11" width="18" height="10" rx="2"/>
                <circle cx="12" cy="5" r="2"/><path d="M12 7v4"/>
                <circle cx="8" cy="16" r="1" fill="currentColor" stroke="none"/>
                <circle cx="16" cy="16" r="1" fill="currentColor" stroke="none"/>
              </svg>
              @if (!danielOpen()) { Daniel } @else { Cerrar Daniel }
            </button>
          </div>
          }
          <router-outlet />
        </main>

        <!-- Daniel panel derecho -->
        @if (danielOpen() && showDaniel()) {
          <aside class="daniel-col">
            <app-admin-daniel-panel
              [jwt]="auth.getToken() ?? ''"
              [userId]="auth.currentUser()?.id ?? null"
            />
          </aside>
        }

      </div>
    </div>
  `,
  styles: [`
    .page { display:flex; flex-direction:row; height:100vh; overflow:hidden; }

    .admin-workspace {
      flex:1; display:flex; flex-direction:row;
      min-height:0; overflow:hidden;
    }



    .admin-main {
      flex:1; overflow-y:auto; min-height:0;
      padding:24px 28px;
    }
    .admin-main::-webkit-scrollbar { width:4px; }
    .admin-main::-webkit-scrollbar-thumb { background:var(--c-border); }

    .daniel-col {
      width:300px; flex-shrink:0;
      border-left:1px solid var(--c-border);
      background:var(--c-surface);
      height:100vh; overflow:hidden;
      animation:slide-in .2s ease;
    }
    @keyframes slide-in { from{transform:translateX(300px);}to{transform:translateX(0);} }

    /* Topbar + botón Daniel */
    .admin-topbar {
      display:flex; justify-content:flex-end;
      padding:12px 0 0; margin-bottom:-8px;
    }
    .daniel-btn {
      display:flex; align-items:center; gap:7px;
      padding:9px 16px; border-radius:22px;
      background:linear-gradient(135deg,#1B3462,#2563eb);
      color:white; border:none; cursor:pointer; font-size:13px; font-weight:500;
      box-shadow:0 4px 14px rgba(27,52,98,.3);
      transition:all .18s;
    }
    .daniel-btn:hover { transform:translateY(-1px); box-shadow:0 6px 18px rgba(27,52,98,.4); }
    .daniel-btn--on {
      background:linear-gradient(135deg,#0f1f42,#1B3462);
      box-shadow:0 2px 8px rgba(27,52,98,.25);
    }
  `],
})
export class AdminShellComponent {
  danielOpen = signal(false);

  private currentUrl = toSignal(
    this.router.events.pipe(
      filter(e => e instanceof NavigationEnd),
      map((e: any) => e.urlAfterRedirects as string),
      startWith(this.router.url)
    ),
    { initialValue: this.router.url }
  );

  // Daniel NUNCA aparece en admin-shell — el admin lo tiene en /admin/dany
  showDaniel = computed(() => false);

  constructor(public auth: AuthService, private router: Router) { }
}