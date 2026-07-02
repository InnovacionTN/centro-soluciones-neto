import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
export const authGuard = (allowedRoles) => () => {
    const auth = inject(AuthService);
    const router = inject(Router);
    if (!auth.isLoggedIn()) {
        router.navigate(['/login']);
        return false;
    }
    if (allowedRoles && !allowedRoles.includes(auth.rol())) {
        // Redirigir a la página correcta según el rol real del usuario
        const fallbacks = {
            TIENDA: '/tienda',
            AGENTE: '/agente',
            ADMIN: '/agente',
            COORDINADOR: '/coordinador', // ← Sprint 2
        };
        const destino = fallbacks[auth.rol() ?? ''] ?? '/login';
        router.navigate([destino]);
        return false;
    }
    return true;
};
//# sourceMappingURL=auth.guard.js.map