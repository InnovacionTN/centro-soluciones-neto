import { Routes } from '@angular/router';

export const ADMIN_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./admin-shell.component').then(m => m.AdminShellComponent),
  },
  // ── Sprint 4: Dashboard ejecutivo de KPIs ──────────────────────────────────
  {
    path: 'kpis',
    loadComponent: () =>
      import('./kpis/admin-kpis.component').then(m => m.AdminKpisComponent),
  },
];