import { __decorate } from "tslib";
import { Injectable, signal, computed } from '@angular/core';
import { tap, catchError, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
const TOKEN_KEY = 'cs_token';
const USER_KEY = 'cs_user';
let AuthService = class AuthService {
    constructor(http, router) {
        this.http = http;
        this.router = router;
        this.api = environment.apiUrl;
        this.currentUser = signal(this.loadUser());
        this.isLoggedIn = computed(() => !!this.currentUser());
        this.rol = computed(() => this.currentUser()?.rol ?? null);
        this.isTienda = computed(() => this.rol() === 'TIENDA');
        this.isAgente = computed(() => this.rol() === 'AGENTE');
        this.isAdmin = computed(() => this.rol() === 'ADMIN');
        this.isCoordinador = computed(() => this.rol() === 'COORDINADOR'); // ← Sprint 2
        // Exponer token como signal para componentes que lo necesiten
        this.token = computed(() => localStorage.getItem(TOKEN_KEY) ?? '');
    }
    login(creds) {
        return this.http.post(`${this.api}/auth/login`, creds).pipe(tap(res => {
            localStorage.setItem(TOKEN_KEY, res.access_token);
            this.loadProfile();
        }), catchError(err => {
            const msg = err.error?.detail ?? 'Error al iniciar sesión';
            return throwError(() => new Error(msg));
        }));
    }
    loadProfile() {
        this.http.get(`${this.api}/auth/me`).subscribe({
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
    getToken() {
        return localStorage.getItem(TOKEN_KEY);
    }
    loadUser() {
        try {
            const raw = localStorage.getItem(USER_KEY);
            return raw ? JSON.parse(raw) : null;
        }
        catch {
            return null;
        }
    }
    redirectByRole(rol) {
        const routes = {
            TIENDA: '/tienda',
            AGENTE: '/agente',
            ADMIN: '/agente',
            COORDINADOR: '/coordinador', // ← Sprint 2
        };
        this.router.navigate([routes[rol] ?? '/']);
    }
};
AuthService = __decorate([
    Injectable({ providedIn: 'root' })
], AuthService);
export { AuthService };
//# sourceMappingURL=auth.service.js.map