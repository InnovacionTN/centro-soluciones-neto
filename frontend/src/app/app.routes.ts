import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () =>
      import('./features/auth/login.component').then(m => m.LoginComponent),
  },
  {
    path: 'tienda',
    canActivate: [authGuard(['TIENDA'])],
    loadChildren: () =>
      import('./features/tienda/tienda.routes').then(m => m.TIENDA_ROUTES),
  },
  {
    path: 'agente',
    canActivate: [authGuard(['AGENTE', 'ADMIN', 'ADMIN_AREA'])],
    loadChildren: () =>
      import('./features/agente/agente.routes').then(m => m.AGENTE_ROUTES),
  },
  {
    path: 'admin',
    canActivate: [authGuard(['ADMIN', 'ADMIN_AREA', 'COORDINADOR'])],
    loadChildren: () =>
      import('./features/admin/admin.routes').then(m => m.ADMIN_ROUTES),
  },
  {
    path: 'coordinador',
    canActivate: [authGuard(['COORDINADOR', 'ADMIN'])],
    loadComponent: () =>
      import('./features/coordinador/coordinador-dashboard.component')
        .then(m => m.CoordinadorDashboardComponent),
  },
  // Chat de Dany — agentes y coordinadores (tienda lo tiene en /tienda)
  {
    path: 'chat-dany',
    canActivate: [authGuard(['AGENTE', 'COORDINADOR', 'ADMIN', 'ADMIN_AREA'])],
    loadComponent: () =>
      import('./features/tienda/dany-chat.component')
        .then(m => m.DanyChatComponent),
  },
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  { path: '**', redirectTo: 'login' },
];