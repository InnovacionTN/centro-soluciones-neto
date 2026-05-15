import { authGuard } from '../../core/guards/auth.guard';
import { Routes } from '@angular/router';

// Roles que pueden acceder al shell de configuración
const CONFIG_ROLES = ['ADMIN', 'ADMIN_AREA', 'COORDINADOR'];

export const ADMIN_ROUTES: Routes = [
  {
    path: '',
    canActivate: [authGuard(CONFIG_ROLES)],
    loadComponent: () =>
      import('./admin-shell.component').then(m => m.AdminShellComponent),
    children: [
      // Default: grupos es la pantalla de entrada para todos los roles de config
      { path: '', redirectTo: 'grupos', pathMatch: 'full' },

      // ── Pantallas de catálogo — accesibles a todos los roles de config ──
      {
        path: 'grupos',
        canActivate: [authGuard(CONFIG_ROLES)],
        loadComponent: () =>
          import('./admin-grupos.component').then(m => m.AdminGruposComponent),
      },
      {
        path: 'tipificaciones',
        canActivate: [authGuard(CONFIG_ROLES)],
        loadComponent: () =>
          import('./admin-tipificaciones.component').then(m => m.AdminTipificacionesComponent),
      },
      {
        path: 'ruteo',
        canActivate: [authGuard(CONFIG_ROLES)],
        loadComponent: () =>
          import('./admin-ruteo.component').then(m => m.AdminRuteoComponent),
      },

      // ── Solo ADMIN y ADMIN_AREA ──
      {
        path: 'usuarios',
        canActivate: [authGuard(['ADMIN', 'ADMIN_AREA'])],
        loadComponent: () =>
          import('./admin-usuarios.component').then(m => m.AdminUsuariosComponent),
      },
      {
        path: 'regiones',
        canActivate: [authGuard(['ADMIN'])],
        loadComponent: () =>
          import('./admin-regiones.component').then(m => m.AdminRegionesComponent),
      },
      {
        path: 'zonas',
        canActivate: [authGuard(['ADMIN'])],
        loadComponent: () =>
          import('./admin-zonas.component').then(m => m.AdminZonasComponent),
      },

      // ── Solo ADMIN (v2) — rutas mantenidas para no romper links directos ──
      {
        path: 'torre',
        canActivate: [authGuard(['ADMIN'])],
        loadComponent: () =>
          import('./admin-torre.component').then(m => m.AdminTorreComponent),
      },
      {
        path: 'incidentes',
        canActivate: [authGuard(['ADMIN'])],
        loadComponent: () =>
          import('./admin-incidentes.component').then(m => m.AdminIncidentesComponent),
      },
    ],
  },

  // ── Fuera del shell (pantalla completa) ──
  {
    path: 'kpis',
    canActivate: [authGuard(['ADMIN', 'ADMIN_AREA', 'COORDINADOR'])],
    loadComponent: () =>
      import('./kpis/admin-kpis.component').then(m => m.AdminKpisComponent),
  },
  {
    path: 'dany',
    canActivate: [authGuard(['ADMIN', 'ADMIN_AREA', 'COORDINADOR'])],
    loadComponent: () =>
      import('./dany/dany-kpis.component').then(m => m.DanyKpisComponent),
  },
];
