# Centro de Soluciones — Frontend

Portal web para gestión de tickets de la red Soluciones Neto.
Construido con **Angular 17 + Signals + TypeScript**.

---

## Stack

| Tecnología | Versión | Uso |
|---|---|---|
| Angular | 17.3 | Framework principal |
| TypeScript | 5.4 | Lenguaje |
| Angular Signals | 17+ | Estado reactivo sin NgRx |
| Angular SSR | 17.3 | Server-Side Rendering (build) |
| RxJS | 7.8 | Streams HTTP |
| Angular Forms | 17.3 | Formularios reactivos |

---

## Estructura del proyecto

```
centro-soluciones-frontend/
├── src/
│   ├── app/
│   │   ├── app.config.ts              # Providers globales (HttpClient, Router)
│   │   ├── app.routes.ts              # Rutas raíz con lazy loading
│   │   ├── core/
│   │   │   ├── guards/
│   │   │   │   └── auth.guard.ts      # Guard por rol (ADMIN/AGENTE/TIENDA)
│   │   │   ├── interceptors/
│   │   │   │   └── auth.interceptor.ts # Inyección automática del JWT
│   │   │   ├── models.ts              # Interfaces TypeScript compartidas
│   │   │   └── services/
│   │   │       ├── auth.service.ts    # Login, logout, signals de usuario
│   │   │       ├── ticket.service.ts  # CRUD tickets + escalación + evidencias
│   │   │       └── admin.service.ts   # CRUD admin (usuarios, tips, ruteo)
│   │   ├── features/
│   │   │   ├── auth/
│   │   │   │   └── login.component.ts         # Pantalla de login
│   │   │   ├── tienda/
│   │   │   │   ├── tienda-dashboard.component.ts # Dashboard KPIs tienda
│   │   │   │   ├── nuevo-ticket.component.ts    # Wizard 3 pasos + IA
│   │   │   │   ├── ticket-detalle.component.ts  # Ver ticket + confirmar/rechazar
│   │   │   │   └── tienda.routes.ts
│   │   │   ├── agente/
│   │   │   │   ├── agente-dashboard.component.ts # Métricas del agente
│   │   │   │   ├── agente-cola.component.ts      # Cola de tickets + filtros
│   │   │   │   ├── agente-ticket.component.ts    # Panel de atención completo
│   │   │   │   └── agente.routes.ts
│   │   │   └── admin/
│   │   │       ├── admin-shell.component.ts       # Shell con 4 pestañas
│   │   │       ├── admin-usuarios.component.ts    # CRUD usuarios
│   │   │       ├── admin-tipificaciones.component.ts # CRUD tipificaciones
│   │   │       ├── admin-ruteo.component.ts       # Matriz de ruteo
│   │   │       ├── admin-grupos.component.ts      # CRUD grupos CC
│   │   │       └── admin.routes.ts
│   │   └── shared/
│   │       └── components/
│   │           ├── navbar.component.ts       # Barra de navegación con roles
│   │           ├── status-badge.component.ts # Badge de estado del ticket
│   │           └── evidencias.component.ts   # Grid de fotos/adjuntos
│   ├── environments/
│   │   ├── environment.ts             # Dev — apiUrl: '/api/v1'
│   │   └── environment.prod.ts        # Prod — apiUrl: '/api/v1'
│   └── styles.css                     # Design system completo (variables CSS)
├── proxy.conf.json                    # Proxy dev → localhost:8000
└── angular.json                       # Configuración Angular CLI
```

---

## Instalación y arranque

### Requisitos
- Node.js 18+
- npm 9+
- Backend corriendo en `localhost:8000` (ver README backend)

### Pasos

```powershell
# 1. Instalar dependencias
cd centro-soluciones-frontend
npm install

# 2. Iniciar en modo desarrollo
npm start
# El proxy redirige /api/* → http://localhost:8000
```

La aplicación estará disponible en `http://localhost:4200`.

---

## Rutas de la aplicación

| Ruta | Componente | Acceso |
|---|---|---|
| `/login` | `LoginComponent` | Público |
| `/tienda` | `TiendaDashboardComponent` | TIENDA |
| `/tienda/nuevo` | `NuevoTicketComponent` | TIENDA |
| `/tienda/ticket/:id` | `TicketDetalleComponent` | TIENDA |
| `/agente` | `AgenteDashboardComponent` | AGENTE |
| `/agente/cola` | `AgenteColaComponent` | AGENTE |
| `/agente/ticket/:id` | `AgenteTicketComponent` | AGENTE, ADMIN |
| `/admin` | `AdminShellComponent` | ADMIN |

El guard `authGuard(['ROL'])` protege las rutas. El login redirige automáticamente según el rol.

---

## Flujos principales

### Tienda — Crear ticket (3 pasos)

```
Paso 1: Describe el problema
  → Debounce 600ms → POST /ai/classify
  → Muestra: área + tipificación + urgencia + confianza IA

Paso 2: Confirmar clasificación
  → Tienda puede ajustar área y tipificación
  → Acepta o modifica la sugerencia de la IA

Paso 3: Enviado
  → POST /tickets
  → Folio asignado + confirmación
```

### Agente — Atender ticket

```
Cola → Ver ticket → Tomar (EN_PROCESO)
                 → Escribir solución
                 → Enviar solución (ESPERANDO_TIENDA)  ← requiere texto ≥10 chars
                 → Escalar (si es necesario)           ← seleccionar grupo + motivo
```

### Tienda — Responder solución

```
Ver ticket (ESPERANDO_TIENDA) → Confirmar → RESUELTO
                              → Rechazar  → motivo obligatorio → vuelve al agente
```

---

## Sistema de estados del ticket

```
NUEVO → ASIGNADO → EN_PROCESO → ESPERANDO_TIENDA → RESUELTO → CERRADO
                               ↘ RECHAZADO ────────────────────────────↗ EN_PROCESO
```
El `CANCELADO` solo lo puede ejecutar un ADMIN.

---

## Design system

El archivo `src/styles.css` define el sistema de diseño completo:

```css
/* Variables principales */
--c-blue, --c-blue-lt, --c-blue-md    /* Azul corporativo */
--c-teal, --c-teal-lt, --c-teal-md    /* Verde IA */
--c-amber, --c-amber-lt, --c-amber-md  /* Advertencias */
--c-red, --c-red-lt, --c-red-md        /* Errores */
--c-purple, --c-purple-lt              /* Agente */

/* Componentes */
.btn, .btn--primary, .btn--success, .btn--ghost, .btn--loading
.badge, .badge--blue, .badge--green, .badge--amber, .badge--red, .badge--gray
.card, .card--flat
.input, .field, .field__label, .field__label--required
.ia-chip                               /* Badge IA */
.timeline__item, .timeline__dot        /* Historial de eventos */
.prio, .prio--CRITICA, .prio--ALTA     /* Indicador de prioridad */
```

---

## Proxy de desarrollo

El archivo `proxy.conf.json` redirige todas las llamadas `/api/*` al backend:

```json
{
  "/api": {
    "target": "http://localhost:8000",
    "secure": false,
    "changeOrigin": true
  }
}
```

Esto evita problemas de CORS en desarrollo. En producción, nginx maneja el routing.

---

## Build de producción

```bash
# Build optimizado
npm run build

# El output queda en dist/centro-soluciones/browser/
# Servir con nginx o Firebase Hosting
```

### Deploy en Firebase Hosting

```bash
npm install -g firebase-tools
firebase login
firebase init hosting    # Seleccionar dist/centro-soluciones/browser
npm run build
firebase deploy
```

---

## Variables de entorno Angular

Los archivos en `src/environments/` controlan la URL base de la API:

```typescript
// environment.ts (dev)
export const environment = {
  production: false,
  apiUrl: '/api/v1',   // Pasa por el proxy local
};

// environment.prod.ts (producción)
export const environment = {
  production: true,
  apiUrl: '/api/v1',   // Nginx maneja el routing al backend
};
```
