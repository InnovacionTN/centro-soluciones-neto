import { Injectable, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { tap, catchError, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { LoginRequest, TokenResponse, CurrentUser, Rol } from '../models';

const TOKEN_KEY = 'cs_token';
const USER_KEY = 'cs_user';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly api = environment.apiUrl;

  readonly currentUser = signal<CurrentUser | null>(this.loadUser());
  readonly isLoggedIn = computed(() => !!this.currentUser());
  readonly rol = computed(() => this.currentUser()?.rol ?? null);
  readonly isTienda = computed(() => this.rol() === 'TIENDA');
  readonly isAgente = computed(() => this.rol() === 'AGENTE');
  readonly isAdmin = computed(() => this.rol() === 'ADMIN');
  readonly isAdminArea = computed(() => this.rol() === 'ADMIN_AREA');
  readonly isCoordinador = computed(() => this.rol() === 'COORDINADOR');

  // Exponer token como signal para componentes que lo necesiten
  readonly token = computed(() => localStorage.getItem(TOKEN_KEY) ?? '');

  constructor(private http: HttpClient, private router: Router) { }

  login(creds: LoginRequest) {
    return this.http.post<TokenResponse>(`${this.api}/auth/login`, creds).pipe(
      tap(res => {
        localStorage.setItem(TOKEN_KEY, res.access_token);
        this.loadProfile();
      }),
      catchError(err => {
        const msg = err.error?.detail ?? 'Error al iniciar sesión';
        return throwError(() => new Error(msg));
      })
    );
  }

  loadProfile() {
    this.http.get<CurrentUser>(`${this.api}/auth/me`).subscribe({
      next: user => {
        localStorage.setItem(USER_KEY, JSON.stringify(user));
        this.currentUser.set(user);
        this.redirectByRole(user.rol);
      },
      error: () => this.logout(),
    });
  }

  logout() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    this.currentUser.set(null);
    this.router.navigate(['/login']);
  }

  getToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  }

  private loadUser(): CurrentUser | null {
    try {
      const raw = localStorage.getItem(USER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  private redirectByRole(rol: Rol) {
    const routes: Record<string, string> = {
      TIENDA: '/tienda',
      AGENTE: '/agente',
      ADMIN: '/agente',
      ADMIN_AREA: '/agente',   // ve dashboard de agente + cola, filtrado por su área
      COORDINADOR: '/coordinador',
    };
    this.router.navigate([routes[rol] ?? '/']);
  }
}