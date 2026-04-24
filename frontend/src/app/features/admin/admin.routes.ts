import { authGuard } from '../../core/guards/auth.guard';
import { Routes } from '@angular/router';

export const ADMIN_ROUTES: Routes = [
  // Shell principal — contiene Daniel panel + router-outlet
  {
    path: '',
    canActivate: [authGuard(['ADMIN'])],
    loadComponent: () =>
      import('./admin-shell.component').then(m => m.AdminShellComponent),
    children: [
      { path: '', redirectTo: 'torre', pathMatch: 'full' },
      {
        path: 'torre',
        loadComponent: () =>
          import('./admin-torre.component').then(m => m.AdminTorreComponent),
      },
      {
        path: 'incidentes',
        loadComponent: () =>
          import('./admin-incidentes.component').then(m => m.AdminIncidentesComponent),
      },
      {
        path: 'usuarios',
        loadComponent: () =>
          import('./admin-usuarios.component').then(m => m.AdminUsuariosComponent),
      },
      {
        path: 'tipificaciones',
        loadComponent: () =>
          import('./admin-tipificaciones.component').then(m => m.AdminTipificacionesComponent),
      },
      {
        path: 'ruteo',
        loadComponent: () =>
          import('./admin-ruteo.component').then(m => m.AdminRuteoComponent),
      },
      {
        path: 'grupos',
        loadComponent: () =>
          import('./admin-grupos.component').then(m => m.AdminGruposComponent),
      },
      {
        path: 'regiones',
        loadComponent: () =>
          import('./admin-regiones.component').then(m => m.AdminRegionesComponent),
      },
      {
        path: 'zonas',
        loadComponent: () =>
          import('./admin-zonas.component').then(m => m.AdminZonasComponent),
      },
    ],
  },
  // Pantallas propias fuera del shell — accesibles para ADMIN y ADMIN_AREA
  {
    path: 'kpis',
    canActivate: [authGuard(['ADMIN', 'ADMIN_AREA'])],
    loadComponent: () =>
      import('./kpis/admin-kpis.component').then(m => m.AdminKpisComponent),
  },
  {
    path: 'dany',
    canActivate: [authGuard(['ADMIN', 'ADMIN_AREA'])],
    loadComponent: () =>
      import('./dany/dany-kpis.component').then(m => m.DanyKpisComponent),
  },
];