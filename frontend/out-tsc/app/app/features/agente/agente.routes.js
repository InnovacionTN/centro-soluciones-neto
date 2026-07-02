export const AGENTE_ROUTES = [
    {
        path: '',
        loadComponent: () => import('./agente-dashboard.component').then(m => m.AgenteDashboardComponent),
    },
    {
        path: 'cola',
        loadComponent: () => import('./agente-cola.component').then(m => m.AgenteColaComponent),
    },
    {
        path: 'ticket/:id',
        loadComponent: () => import('./agente-ticket.component').then(m => m.AgenteTicketComponent),
    },
];
//# sourceMappingURL=agente.routes.js.map