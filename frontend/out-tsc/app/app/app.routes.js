import { authGuard } from './core/guards/auth.guard';
export const routes = [
    {
        path: 'login',
        loadComponent: () => import('./features/auth/login.component').then(m => m.LoginComponent),
    },
    {
        path: 'tienda',
        canActivate: [authGuard(['TIENDA'])],
        loadChildren: () => import('./features/tienda/tienda.routes').then(m => m.TIENDA_ROUTES),
    },
    {
        path: 'agente',
        canActivate: [authGuard(['AGENTE', 'ADMIN'])],
        loadChildren: () => import('./features/agente/agente.routes').then(m => m.AGENTE_ROUTES),
    },
    {
        path: 'admin',
        canActivate: [authGuard(['ADMIN'])],
        loadChildren: () => import('./features/admin/admin.routes').then(m => m.ADMIN_ROUTES),
    },
    // ── Sprint 2: Coordinador de zona (Mantenimiento) ──────────────────────────
    {
        path: 'coordinador',
        canActivate: [authGuard(['COORDINADOR', 'ADMIN'])],
        loadComponent: () => import('./features/coordinador/coordinador-dashboard.component')
            .then(m => m.CoordinadorDashboardComponent),
    },
    { path: '', redirectTo: 'login', pathMatch: 'full' },
    { path: '**', redirectTo: 'login' },
];
//# sourceMappingURL=app.routes.js.map