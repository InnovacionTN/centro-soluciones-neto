export const TIENDA_ROUTES = [
    {
        path: '',
        loadComponent: () => import('./tienda-dashboard.component').then(m => m.TiendaDashboardComponent),
    },
    {
        path: 'nuevo',
        loadComponent: () => import('./nuevo-ticket.component').then(m => m.NuevoTicketComponent),
    },
    {
        path: 'ticket/:id',
        loadComponent: () => import('./ticket-detalle.component').then(m => m.TicketDetalleComponent),
    },
];
//# sourceMappingURL=tienda.routes.js.map