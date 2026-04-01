import { Routes } from '@angular/router';

export const ADMIN_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./admin-shell.component').then(m => m.AdminShellComponent),
  },
  {
    path: 'kpis',
    loadComponent: () =>
      import('./kpis/admin-kpis.component').then(m => m.AdminKpisComponent),
  },
  // ── Sprint 3: Panel de métricas Dany ──────────────────────────────────────
  {
    path: 'dany',
    loadComponent: () =>
      import('./dany/dany-kpis.component').then(m => m.DanyKpisComponent),
  },
];