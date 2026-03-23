import { Routes } from '@angular/router';

export const AGENTE_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./agente-dashboard.component').then(m => m.AgenteDashboardComponent),
  },
  {
    path: 'cola',
    loadComponent: () =>
      import('./agente-cola.component').then(m => m.AgenteColaComponent),
  },
  {
    path: 'ticket/:id',
    loadComponent: () =>
      import('./agente-ticket.component').then(m => m.AgenteTicketComponent),
  },
];
