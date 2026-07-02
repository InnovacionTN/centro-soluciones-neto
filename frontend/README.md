# Centro de Soluciones — Frontend

Portal web de la red Soluciones Neto. **Angular 17 (standalone) + Signals + TypeScript.**

> Parte del monorepo CSN. Ver el [README raíz](../README.md) para la visión completa.

---

## Stack

| Tecnología | Uso |
|---|---|
| Angular 17.3 | Framework (componentes standalone) |
| Angular Signals | Estado reactivo — **sin NgRx**, todo con `signal()`/`computed()`/`effect()` |
| TypeScript 5.4 | Lenguaje |
| RxJS | Solo para streams HTTP |
| Firebase Hosting | Despliegue (csn.soyneto.com) |

Estilos: cada componente usa `styles: [\`...\`]` inline; los tokens de diseño (variables CSS)
viven en `src/styles.css`.

---

## Estructura

```
src/app/
├── app.config.ts / app.routes.ts     # Providers + rutas raíz (lazy)
├── core/
│   ├── guards/auth.guard.ts          # CanActivateFn por rol
│   ├── interceptors/auth.interceptor.ts  # Inyecta JWT + 401 → logout
│   ├── models.ts                     # Interfaces compartidas
│   └── services/                     # auth · ticket · admin
├── features/
│   ├── tienda/
│   │   ├── tienda-dashboard.component.ts  # Dashboard + CHAT con Dany (componente real)
│   │   ├── nuevo-ticket.component.ts      # Wizard 3 pasos + clasificación IA
│   │   └── ticket-detalle.component.ts    # Ver / confirmar / rechazar
│   ├── agente/                        # dashboard, cola, ticket, copiloto Daniel
│   └── admin/                         # shell con pestañas (usuarios, tips, grupos, ruteo)
└── shared/components/                 # navbar, status-badge, evidencias
```

> El chat con Dany vive en **`tienda-dashboard.component.ts`** (incluye temporizadores de
> inactividad, render de multimedia y manejo de `accion`). El antiguo `dany-chat.component.ts`
> fue eliminado por código muerto.

---

## Arranque

```bash
cd frontend
npm install
npm start        # ng serve con proxy → localhost:8000
```

App en `http://localhost:4200`. `proxy.conf.json` reenvía `/api/*` al backend (evita CORS).

---

## Rutas y acceso

| Ruta | Acceso |
|---|---|
| `/login` | Público |
| `/tienda`, `/tienda/nuevo`, `/tienda/ticket/:id` | TIENDA |
| `/agente`, `/agente/cola`, `/agente/ticket/:id` | AGENTE (ticket también ADMIN) |
| `/admin` | ADMIN |

El guard `authGuard(['ROL'])` protege rutas; el login redirige según rol.

---

## Flujos principales

- **Tienda — chat Dany:** mensaje → `POST /api/v1/dany/chat` (proxy al agente) → render de
  respuesta + multimedia; temporizadores de inactividad (recordatorio / cierre).
- **Tienda — nuevo ticket:** describe (debounce → `/ai/classify`) → confirma clasificación → `POST /tickets`.
- **Agente:** cola → tomar (EN_PROCESO) → solución (ESPERANDO_TIENDA) / escalar.
- **Tienda — responder:** ESPERANDO_TIENDA → confirmar (RESUELTO) / rechazar (motivo → vuelve al agente).

Estados del ticket:
```
NUEVO → ASIGNADO → EN_PROCESO → ESPERANDO_TIENDA → RESUELTO → CERRADO
                              ↘ RECHAZADO ───────────────────↗ EN_PROCESO
```

---

## Build y deploy (Firebase Hosting)

```bash
npm run build                          # output: dist/centro-soluciones/browser/
firebase login                         # si la sesión caducó: firebase login --reauth
firebase deploy --only hosting
```

`src/environments/` controla `apiUrl` (`/api/v1` en dev vía proxy y en prod vía hosting rewrite).
