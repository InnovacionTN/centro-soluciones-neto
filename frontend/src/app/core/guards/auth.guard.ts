import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { Rol } from '../models';

export const authGuard = (allowedRoles?: Rol[]): CanActivateFn => () => {
  const auth   = inject(AuthService);
  const router = inject(Router);

  if (!auth.isLoggedIn()) {
    router.navigate(['/login']);
    return false;
  }

  if (allowedRoles && !allowedRoles.includes(auth.rol()!)) {
    const fallback = auth.isTienda() ? '/tienda' : '/agente';
    router.navigate([fallback]);
    return false;
  }

  return true;
};
