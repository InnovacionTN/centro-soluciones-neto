# CSN — Contexto Completo del Sistema
> Documento de referencia técnica y operativa para el equipo de desarrollo.
> Última actualización: 2026-05-21 | Rama activa: `develop`

---

## 1. ¿Qué es CSN?

**Centro Soluciones Neto** es el sistema de soporte técnico de primera línea para las tiendas de la cadena Neto. Reemplaza a Zendesk Enterprise y a los canales informales (WhatsApp, llamadas, correos).

**Objetivo principal:** Centralizar, tipificar y resolver incidencias técnicas de las tiendas con visibilidad total para coordinadores y administradores de área, aprovechando IA para reducir el volumen de tickets que llegan a agentes humanos.

**Escala real en producción (mayo 2026):**
- **1,837 tiendas** activas
- **1,895 usuarios** totales (tiendas + agentes + admins)
- **66 agentes** distribuidos en 30 grupos
- **8 tickets** en producción al cierre de este doc

---

## 2. Stack Tecnológico

| Capa | Tecnología | Notas |
|------|-----------|-------|
| Backend | FastAPI + Python 3.11 | Monolito en `routes.py` (~4,100 líneas) |
| Base de datos | PostgreSQL 15 en **Neon.tech** | 3 DBs separadas: dev, staging, prod |
| Frontend | Angular 17 (standalone components) | Signals, computed, lazy routes |
| Hosting backend | **GCP Cloud Run** | Proyecto `gen-lang-client-0189172552`, región `us-central1` |
| Hosting frontend | **Firebase Hosting** | |
| Automatización / IA | **n8n** (auto-hospedado) | Orquesta a Daniel CSN y Daniel Slack |
| IA clasificación | Google Gemini | Vía `GEMINI_API_KEY` en GCP Secret Manager |
| Secrets | **GCP Secret Manager** | 4 secretos en prod |
| Auth agentes | Header `X-Dany-Token` | Secreto `dany-webhook` en Secret Manager |
| Auth humanos | JWT Bearer (HS256) | Expira en 24h |

---

## 3. Infraestructura GCP

### Proyecto y región
```
Proyecto: gen-lang-client-0189172552
Región: us-central1
```

### URLs de Cloud Run

| Entorno | URL canónica | URL alternativa (n8n actual) |
|---------|-------------|------------------------------|
| **Producción** | `https://csn-api-prod-312707215871.us-central1.run.app` | `https://csn-api-prod-xdngdvdxua-uc.a.run.app` |
| **Staging** | `https://csn-api-staging-312707215871.us-central1.run.app` | — |

> Ambas URLs de producción apuntan al mismo servicio. Los workflows de n8n usan la URL alternativa.

### GCP Secret Manager — secretos en producción

| Nombre del secreto | Variable de entorno en Cloud Run | Contenido |
|-------------------|----------------------------------|-----------|
| `csn-database-url-prod` | `DATABASE_URL` | Connection string PostgreSQL prod (Neon.tech) |
| `csn-secret-key-prod` | `SECRET_KEY` | Clave HMAC para JWT |
| `gemini-api-key` | `GEMINI_API_KEY` | API key de Google Gemini (⚠️ con error 403 — pendiente renovar) |
| `dany-webhook` | `DANY_SYSTEM_TOKEN` | Token de autenticación para agentes externos |

> **CRÍTICO:** Al hacer `gcloud run deploy ... --set-secrets`, se deben incluir los 4 secretos en el mismo comando o los omitidos se desmontan.

### Comando de deploy completo
```bash
gcloud run deploy csn-api-prod \
  --image gcr.io/gen-lang-client-0189172552/csn-api-prod \
  --region us-central1 \
  --platform managed \
  --set-secrets="DATABASE_URL=csn-database-url-prod:latest,SECRET_KEY=csn-secret-key-prod:latest,GEMINI_API_KEY=gemini-api-key:latest,DANY_SYSTEM_TOKEN=dany-webhook:latest" \
  --no-traffic-wait
```

---

## 4. Bases de Datos (Neon.tech)

| Entorno | Host Neon | Notas |
|---------|-----------|-------|
| Producción | `ep-...` (ver `csn-database-url-prod` en Secret Manager) | DB activa con datos reales |
| Staging | `ep-bold-cake-adgogkvj` | Copia de esquema, datos de prueba |
| Desarrollo | `ep-rapid-term` (local dev) | Uso local |

---

## 5. Estructura del Proyecto

```
centro-soluciones-neto/
├── backend/
│   ├── app/
│   │   ├── api/v1/endpoints/
│   │   │   └── routes.py              ← MONOLITO: todos los endpoints
│   │   ├── models/
│   │   │   └── models.py              ← SQLAlchemy models
│   │   ├── schemas/
│   │   │   └── schemas.py             ← Pydantic schemas
│   │   ├── services/
│   │   │   └── ticket_service.py      ← Lógica de negocio, round-robin
│   │   └── config.py                  ← Variables de entorno
│   └── scripts/
│       ├── migrar_sprint6a.py         ← Migración: area_restriccion + ADMIN_AREA
│       └── resetear_passwords.py      ← Reset masivo de contraseñas
├── frontend/src/app/
│   ├── features/
│   │   ├── agente/                    ← Dashboard, cola, detalle de ticket
│   │   ├── admin/                     ← KPIs, usuarios, tipificaciones, grupos
│   │   ├── tienda/                    ← Dashboard tienda + chat Dany
│   │   ├── auth/                      ← Login
│   │   └── coordinador/               ← Vista coordinador (básica)
│   ├── core/
│   │   ├── services/
│   │   │   ├── ticket.service.ts      ← HTTP calls a /tickets/*
│   │   │   ├── auth.service.ts        ← JWT, currentUser signal
│   │   │   └── admin.service.ts       ← HTTP calls a /admin/*
│   │   └── guards/auth.guard.ts       ← Protección de rutas por rol
│   └── app.routes.ts                  ← Rutas raíz por rol
├── agentes/
│   ├── CSN_ crear ticket.json         ← Subworkflow n8n: POST /tickets/desde-dany
│   ├── CSN_ clasificar problema.json  ← Subworkflow n8n: POST /ai/classify
│   ├── CSN_ registrar sesión.json     ← Subworkflow n8n: POST /dany/sesion/iniciar
│   └── CSN_ cerrar sesión.json        ← Subworkflow n8n: POST /dany/sesion/cerrar
├── AGENTE_API_DOCS.md                 ← Guía de integración para Andrés (Daniel Slack)
└── CSN_CONTEXTO_COMPLETO.md           ← Este archivo
```

---

## 6. Roles y Permisos

### Jerarquía de roles (enum `RolUsuario`)

```
TIENDA
  └─ Solo ve sus propios tickets
  └─ Chatea con Dany para resolver problemas o escalar

AGENTE
  └─ Ve todos los tickets de SU grupo (grupo_id)
  └─ Toma, atiende y cierra tickets
  └─ Usa copiloto de soluciones históricas
  └─ Si grupo_id = NULL → ve 0 tickets (bug crítico si no se asigna grupo)

COORDINADOR  (en desarrollo — UI básica)
  └─ Ve tickets de su zona_id

ADMIN_AREA
  └─ Ve todos los tickets donde tipificacion.area_tecnica == area_restriccion
  └─ Gestiona tipificaciones de su área
  └─ Ve KPIs de sus grupos
  └─ area_restriccion debe estar seteada o ve todos los tickets

ADMIN
  └─ Ve TODO
  └─ Gestiona usuarios, grupos, tipificaciones, tiendas, ruteo
  └─ Exporta reportes
```

### Lógica de filtro en `GET /tickets` (backend)

```python
if rol == TIENDA:
    filter(tienda_id == current_user.tienda_id)
elif rol == AGENTE:
    filter(grupo_id == current_user.grupo_id)   # None → 0 resultados
elif rol == COORDINADOR:
    filter(zona_id == current_user.zona_id)
elif rol == ADMIN_AREA:
    join(Tipificacion).filter(area_tecnica == area_restriccion)
# ADMIN: sin filtro, ve todo
```

> **Bug corregido (commit 413cbf1):** Cuando ADMIN_AREA llamaba con `?area=SISTEMAS`, el backend
> hacía doble JOIN a Tipificacion → 0 resultados. Fix: ignorar `?area=` param para ADMIN_AREA.

### Rutas de frontend por rol

| Ruta | Roles permitidos |
|------|-----------------|
| `/tienda/*` | TIENDA |
| `/agente/*` | AGENTE, ADMIN, ADMIN_AREA |
| `/admin/*` | ADMIN, ADMIN_AREA, COORDINADOR |
| `/coordinador` | COORDINADOR, ADMIN |

---

## 7. Autenticación

### Humanos — JWT Bearer

```http
POST /api/v1/auth/login
Content-Type: application/json

{"email": "usuario@tiendasneto.com", "password": "Neto2026!"}
```

Respuesta:
```json
{
  "access_token": "eyJ...",
  "token_type": "bearer",
  "rol": "ADMIN",
  "nombre": "Alejandro Sanchez Vinagre",
  "tienda_id": null
}
```

- Token expira en **24 horas**
- Email se normaliza a lowercase antes de consultar DB
- Usar en header: `Authorization: Bearer <token>`

### Agentes externos — X-Dany-Token

```http
POST /api/v1/tickets/desde-dany
X-Dany-Token: 1f31e534cf886dbeca80b8f879c68eb4f09d2a092991d310906e4ae7928506f8
Content-Type: application/json
```

- Token almacenado en GCP Secret Manager (`dany-webhook`)
- Variable de entorno en Cloud Run: `DANY_SYSTEM_TOKEN`
- En n8n: credencial **"CSN Dany Token"** (id: `91WQp1DzpIyS2Yti`), tipo `httpHeaderAuth`

---

## 8. Endpoints Principales

Todos bajo el prefijo `/api/v1/`.

### Auth

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| POST | `/auth/login` | Ninguna | Login → JWT |
| GET | `/auth/me` | JWT | Usuario actual |
| POST | `/auth/request-password-change` | JWT | Solicitar cambio de contraseña |

### Tickets (humanos)

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| POST | `/tickets` | JWT | Crear ticket (TIENDA o AGENTE) |
| POST | `/tickets/intake` | JWT | Intake rápido con clasificación IA |
| GET | `/tickets` | JWT | Listar tickets (filtrado por rol) |
| GET | `/tickets/{id}` | JWT | Detalle de ticket |
| PATCH | `/tickets/{id}` | JWT | Actualizar ticket (estado, notas, etc.) |
| GET | `/tickets/{id}/similares` | JWT | Copiloto: últimos 5 tickets similares cerrados |
| POST | `/tickets/{id}/escalar` | JWT | Escalar a otro grupo |
| POST | `/tickets/{id}/programar-visita` | JWT | (Mantenimiento) programar visita |
| POST | `/tickets/{id}/iniciar-visita` | JWT | (Mantenimiento) marcar inicio de visita |
| POST | `/tickets/{id}/esperar-pieza` | JWT | (Mantenimiento) esperar refacción |
| POST | `/tickets/{id}/evidencias` | JWT | Subir foto/evidencia |
| GET | `/tickets/{id}/evidencias` | JWT | Listar evidencias |
| POST | `/tickets/{id}/csat` | JWT | Calificar resolución (TIENDA) |

### Tickets (agentes externos — Dany)

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| POST | `/tickets/desde-dany` | X-Dany-Token | Crear ticket desde agente IA |
| POST | `/dany/sesion/iniciar` | X-Dany-Token | Registrar inicio de sesión Dany |
| POST | `/dany/sesion/cerrar` | X-Dany-Token | Cerrar sesión (resuelto o escalado) |
| POST | `/dany/chat` | JWT | Proxy backend → n8n webhook (evita CORS) |
| POST | `/dany/agente/cola` | JWT | Contexto de cola para Daniel agente |
| POST | `/dany/admin/contexto` | JWT | Contexto de KPIs para Daniel admin |
| GET | `/dany/debug` | JWT | Debug estado de Daniel |

### IA y Tipificaciones

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| POST | `/ai/classify` | X-Dany-Token o JWT | Clasificar problema con IA Gemini |
| GET | `/tipificaciones` | JWT | Catálogo de tipificaciones (filtrable por área) |

### Dashboard y KPIs

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| GET | `/dashboard` | JWT | Métricas resumen (abiertos, SLA, por área) |
| GET | `/admin/kpis-agentes` | JWT ADMIN/ADMIN_AREA | KPIs por agente |
| GET | `/admin/kpis/ejecutivo` | JWT ADMIN/ADMIN_AREA | Vista ejecutiva |
| GET | `/admin/kpis/tendencia` | JWT | Tendencia histórica |
| GET | `/admin/kpis/por-area` | JWT | KPIs desglosados por área |
| GET | `/admin/kpis/por-grupo` | JWT | KPIs por grupo |
| GET | `/admin/kpis/por-agente` | JWT | KPIs extendidos por agente |
| GET | `/admin/kpis/dany` | JWT | KPIs de Dany (deflexión, sesiones) |
| GET | `/admin/torre` | JWT | Torre de control (alertas SLA masivas) |

### Admin — Gestión

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| GET | `/admin/usuarios` | JWT ADMIN | Listar usuarios (filtrable por rol) |
| POST | `/admin/usuarios` | JWT ADMIN | Crear usuario |
| PATCH | `/admin/usuarios/{id}` | JWT ADMIN | Editar usuario (grupo, rol, activo, etc.) |
| GET/POST/PATCH | `/admin/grupos` | JWT ADMIN | CRUD grupos |
| GET/POST/PATCH | `/admin/tipificaciones` | JWT ADMIN/ADMIN_AREA | CRUD tipificaciones |
| GET/POST/PATCH | `/admin/tiendas` | JWT ADMIN | CRUD tiendas |
| GET/POST/PATCH | `/admin/zonas` | JWT ADMIN | CRUD zonas geográficas |
| GET/POST/PATCH | `/admin/regiones` | JWT ADMIN | CRUD regiones |
| GET/POST/DELETE | `/admin/ruteo` | JWT ADMIN | Matriz de ruteo tipificación→grupo |
| POST | `/admin/tickets/exportar` | JWT ADMIN/ADMIN_AREA | Exportar CSV de tickets |
| POST | `/admin/tickets/cierre-masivo` | JWT ADMIN | Cierre masivo de tickets |
| GET/POST/PATCH | `/admin/incidentes` | JWT ADMIN/ADMIN_AREA | Incidentes masivos (Sprint 2) |
| POST | `/internal/auto-cierre` | Internal | Job de auto-cierre SLA |
| POST | `/internal/escalar-sla-dany` | Internal | Escalado automático por SLA |

---

## 9. Dany / Daniel — Agente IA

### Dos versiones del mismo agente

| | Daniel CSN (portal) | Daniel Slack |
|--|--|--|
| Canal | Widget chat en portal web de tienda | Slack |
| Orquestación | n8n interno (subworkflows) | n8n de Andrés (en desarrollo) |
| Auth | X-Dany-Token (credencial n8n "CSN Dany Token") | X-Dany-Token (mismo valor) |
| Estado | ✅ Producción activo | 🔧 En desarrollo |
| Endpoints que usa | Los 4 Dany endpoints | Los mismos 4 endpoints |

> El backend **no distingue** entre Daniel CSN y Daniel Slack. Ambos usan los mismos endpoints con el mismo token.

### Flujo completo de una sesión Dany

```
[1] TIENDA escribe problema o selecciona quick chip
          │
          ▼
[2] Frontend → POST /dany/chat { mensaje, tienda_id, sesion_id }
    Backend reenvía a n8n (DANY_WEBHOOK_URL)
          │
          ▼
[3] n8n llama → POST /dany/sesion/iniciar  (1a vez)
    Registra: { tienda_id, sesion_id, tienda_nombre }
          │
          ▼
[4] n8n llama → POST /ai/classify
    Body: { descripcion, tienda_id }
    Respuesta: { area, tipificacion_id, confianza (0-1) }
          │
    ┌─────┴──────────────────────────┐
    │                                │
[5a] Dany resuelve en chat       [5b] Dany no puede resolver
    (pasos guiados, respuestas)       │
    │                                 │
    ▼                                 ▼
[6a] POST /dany/sesion/cerrar    [6b] POST /tickets/desde-dany
     { resuelto_sin_ticket: true }    { tienda_id, sesion_id, descripcion,
                                        ia_area, pasos_intentados,
     Solo queda registro de sesión     tipificacion_id, ia_confianza }
     NO se crea ticket
                                  ▼
                            Ticket creado → asignado al agente
                            con menor carga del grupo correcto
                            POST /dany/sesion/cerrar
                            { resuelto_sin_ticket: false }
```

### Subworkflows n8n (carpeta `/agentes`)

| Archivo | Endpoint que llama | Propósito |
|---------|-------------------|-----------|
| `CSN_ registrar sesión.json` | `POST /dany/sesion/iniciar` | Inputs: `tienda_id`, `sesion_id`, `tienda_nombre` |
| `CSN_ clasificar problema.json` | `POST /ai/classify` | Inputs: `descripcion`, `tienda_id` |
| `CSN_ crear ticket.json` | `POST /tickets/desde-dany` | Inputs: 7 campos (ver abajo) |
| `CSN_ cerrar sesión.json` | `POST /dany/sesion/cerrar` | Inputs: `sesion_id`, `resuelto_sin_ticket`, `mensajes_count`, `area_detectada` |

### Body para POST /tickets/desde-dany

```json
{
  "tienda_id": 749,
  "sesion_id": "wvfb8w49r39mnzkdkbe",
  "descripcion": "Aire acondicionado no enciende en tienda PANZACOLA.",
  "ia_area": "MANTENIMIENTO",
  "pasos_intentados": "Se revisaron las pastillas eléctricas pero el equipo sigue sin encender.",
  "tipificacion_id": 46,
  "ia_confianza": 0.63
}
```

### Quick chips del chat Dany (tienda)
- "Sin internet"
- "Caja bloqueada"
- "Error corte de caja"
- "Impresora no imprime"

### Demo mode
Si `DANY_WEBHOOK_URL` devuelve 503, el backend usa respuestas hardcodeadas con detección de keywords en español (modo fallback sin n8n).

### IA Classify — confianza
| Confianza | Comportamiento |
|-----------|---------------|
| ≥ 80% | Asignación directa al grupo correcto |
| 60–79% | Asignación con nota "verificar tipificación" |
| < 60% | Fallback a reglas de palabras clave |

> **Estado actual:** `GEMINI_API_KEY` retorna 403. Se usa fallback de reglas (~60% efectividad). **Pendiente:** renovar key en [aistudio.google.com](https://aistudio.google.com).

---

## 10. Grupos y Asignación de Agentes

### Grupos de Sistemas (SISTEMAS)

| ID | Nombre | Agentes con grupo |
|----|--------|-----------------|
| 15 | Sistemas: Soporte | Eduardo Salas (id:3693) |
| 16 | Sistemas: Comunicaciones | — |
| 17 | Sistemas: SION | Christian Gutiérrez (id:3) |
| 18 | Sistemas: Abasto | Karina Yáñez (id:8) |
| 19 | Sistemas: CEDIS | Juana Perez Mancilla (id:3692) |
| 39 | Corporativo | Diana Villanueva (id:7) |
| 40 | Sistemas: Soporte CENTRO | 7 agentes (Cristian Rosillo, Horacio Chávez, etc.) |
| 41 | Sistemas: Soporte ORIENTE | 4 agentes |
| 42 | Sistemas: Soporte PONIENTE | 7 agentes |
| 43 | Sistemas: Soporte SURESTE | 2 agentes |
| 44 | Sistemas: Soporte VERACRUZ | 3 agentes |

### Grupos de Mantenimiento (MANTENIMIENTO)

| ID | Nombre | Agentes |
|----|--------|---------|
| 20 | Mantenimiento: Centro | 7 agentes (Everardo Martínez id:12, etc.) |
| 21 | Mantenimiento: Oriente | 4 agentes |
| 22 | Mantenimiento: Poniente | 6 agentes |
| 23 | Mantenimiento: Sureste | 5 agentes |
| 24 | Mantenimiento: Veracruz | 2 agentes |
| 25 | Mantenimiento: Corporativo | 2 agentes |

### Otros grupos
- Abasto: Centro (26), Oriente (27), Poniente (28), Sureste (29), Veracruz (30)
- Finanzas: Aseguramiento de Ingresos (31), Inventarios y Venteks (32), Planeación (33)
- Comercial: Categorías (34), Gerencia (35)
- RRHH (36)
- Operaciones: SION (38), Tiendas (37)

### Round-robin inteligente
Asignación automática al agente con **menor carga activa** en el grupo correspondiente.
Función: `assign_agent_round_robin()` en `ticket_service.py`.

---

## 11. Usuarios Clave en Producción

### Admins

| ID | Nombre | Email | Rol |
|----|--------|-------|-----|
| 3687 | Alejandro Sanchez Vinagre | alejandro.sanchezvi@tiendasneto.com | ADMIN |
| 3740 | Andres Pedroza | andres.pedroza@tiendasneto.com | ADMIN |

> Contraseña actual: `Neto2026!`

### Admin Área Sistemas

| ID | Nombre | Email | area_restriccion |
|----|--------|-------|-----------------|
| 3690 | Daniel Carrales | dvazquezc@tiendasneto.com | SISTEMAS |
| 3689 | Hugo Patlan | hpatlan@tiendasneto.com | SISTEMAS |
| 3739 | Cristian Argenis | cristian.pucheta@tiendasneto.com | SISTEMAS |
| 3657 | Admin Área Sistemas | admin.sistemas@soyneto.com | SISTEMAS |

### Admin Área Mantenimiento

| ID | Nombre | Email | area_restriccion |
|----|--------|-------|-----------------|
| 3658 | Admin Área Mantenimiento | admin.mantenimiento@soyneto.com | MANTENIMIENTO |

### Bot desactivado

| ID | Nombre | Email | Estado |
|----|--------|-------|--------|
| 3699 | Agente Daniel | agenteDaniel@tiendasneto.com | ❌ INACTIVO (desactivado manualmente) |

---

## 12. Estado de Sprints

### Sprint 1 — Completado ✅

| Feature | Descripción | Endpoint / Cambio |
|---------|------------|------------------|
| Motor SLA | Cálculo dinámico de SLA con semáforo | Lógica en `_enriquecer_sla()`, campo `sla_status` en respuestas |
| Smart Load Balancing | Round-robin por carga activa (no histórico) | `assign_agent_round_robin()` en `ticket_service.py` |
| Copiloto del Agente | Últimos 5 tickets similares cerrados | `GET /tickets/{id}/similares` |
| Torre de Control | Alertas SLA masivas para admins | `GET /admin/torre` |

### Sprint 2 — En desarrollo 🔧

| Feature | Descripción | Estado |
|---------|------------|--------|
| Incidente Masivo | Tabla `incidentes_masivos` + 3 endpoints + broadcast | Endpoints creados, UI pendiente |
| Daniel Slack | Agente Dany en canal Slack (Andrés) | n8n en desarrollo |
| Gemini API Key | Renovar key con error 403 | ⚠️ Pendiente |

---

## 13. Modelos de Base de Datos Clave

### Ticket
```
id, folio (TKT-YYYY-NNNNN), tienda_id, agente_id, grupo_id, tipificacion_id,
estatus (NUEVO|ASIGNADO|EN_PROCESO|ESPERANDO_TIENDA|ESPERANDO_AGENTE|
         RECHAZADO|PROGRAMADO_VISITA|EN_VISITA|ESPERANDO_PIEZA|CERRADO|RESUELTO|CANCELADO),
prioridad (BAJA|MEDIA|ALTA|CRITICA),
origen (PORTAL|DANY|SLACK|API),
descripcion, solucion_propuesta, pasos_intentados,
sla_limite (datetime), sla_vencido (bool),
ia_area, ia_confianza, ia_clasificacion_aceptada,
sesion_dany_id, incidente_id,
fecha_apertura, fecha_cierre, fecha_visita_programada,
pieza_requerida, csat_score
```

### Usuario
```
id, email, nombre, hashed_password,
rol (TIENDA|AGENTE|COORDINADOR|ADMIN_AREA|ADMIN),
activo, disponible,
grupo_id, tienda_id, zona_id, area_restriccion,
last_login, created_at
```

### Tipificacion (cat_tipificaciones)
```
id, area_tecnica (SISTEMAS|MANTENIMIENTO|FINANZAS|COMERCIAL|RRHH|OPERACIONES|ABASTO),
categoria, subcategoria, problema,
tipo (INCIDENCIA|REQUERIMIENTO|CONSULTA),
urgencia (BAJA|MEDIA|ALTA|CRITICA),
sla_horas, sla_policy_id,
requiere_foto, activo
```

### Grupo
```
id, nombre, area_tecnica, region_id, compania_id, slack_canal, activo
```

### DanySesion
```
id, sesion_id (str único), tienda_id, tienda_nombre,
mensajes_count, resuelto_sin_ticket (bool),
tipificacion_detectada, fecha_inicio, fecha_cierre
```

---

## 14. Bugs Conocidos y Correcciones

### Corregidos ✅

| Bug | Causa | Fix | Commit |
|-----|-------|-----|--------|
| ADMIN_AREA ve 0 tickets en lista | Doble JOIN a Tipificacion al pasar `?area=` + filtro de rol | Backend: ignorar `?area=` cuando rol=ADMIN_AREA | `413cbf1` |
| ADMIN ve tabla vacía en dashboard | `misTickets()` filtra por agente asignado (Alejandro nunca tiene tickets) | Frontend: ADMIN también usa `gruposTorre()` | `413cbf1` |
| Bot Agente Daniel recibía tickets reales | Usuario activo en grupo de Sistemas: Soporte con round-robin | Desactivar usuario id:3699 | Prod directo |
| Clasificación con double-quoted descripcion | jsonBody en n8n con `=` extra | Eliminar `=` del inicio de la cadena | Fix en n8n |

### Pendientes ⚠️

| Bug / Pendiente | Prioridad | Descripción |
|----------------|-----------|-------------|
| GEMINI_API_KEY 403 | Alta | Key expirada/inválida. Renovar en aistudio.google.com, actualizar secreto en GCP |
| 13 agentes @soyneto.com sin grupo | Media | Cuentas antiguas nunca logueadas, sin grupo asignado. Decidir: desactivar o asignar grupo |
| Zohara (id:13) y José Guadalupe (id:15) logueados sin grupo | Alta | Se loguearon pero no ven tickets. Asignar grupo correcto |
| Contraseñas de 41 usuarios sin login | Media | Nunca han entrado — coordinar entrega de contraseñas |

---

## 15. Variables de Entorno Backend

```env
# PostgreSQL (Neon.tech)
DATABASE_URL=postgresql://neondb_owner:...@ep-....neon.tech/neondb?sslmode=require

# JWT
SECRET_KEY=<secret desde GCP Secret Manager csn-secret-key-prod>

# Gemini IA
GEMINI_API_KEY=<secret desde GCP Secret Manager gemini-api-key>

# Token para agentes externos (Dany)
DANY_SYSTEM_TOKEN=<secret desde GCP Secret Manager dany-webhook>

# URL del webhook n8n de Dany
DANY_WEBHOOK_URL=<URL del webhook n8n donde vive Daniel CSN>

# Entorno
ENVIRONMENT=production  # o staging / development
```

---

## 16. Comandos Frecuentes

### Login como admin
```bash
curl -s -X POST "https://csn-api-prod-xdngdvdxua-uc.a.run.app/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  --data-raw '{"email":"alejandro.sanchezvi@tiendasneto.com","password":"Neto2026!"}'
```

### Crear usuario
```bash
curl -s -X POST "https://csn-api-prod-xdngdvdxua-uc.a.run.app/api/v1/admin/usuarios" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  --data-raw '{
    "email": "nuevo@tiendasneto.com",
    "nombre": "Nombre Apellido",
    "password": "Neto2026!",
    "rol": "AGENTE",
    "grupo_id": 15
  }'
```

### Asignar grupo a agente
```bash
curl -s -X PATCH "https://csn-api-prod-xdngdvdxua-uc.a.run.app/api/v1/admin/usuarios/{id}" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  --data-raw '{"grupo_id": 15}'
```

### Desactivar usuario
```bash
curl -s -X PATCH "https://csn-api-prod-xdngdvdxua-uc.a.run.app/api/v1/admin/usuarios/{id}" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  --data-raw '{"activo": false}'
```

### Build y deploy a producción
```bash
cd backend/
gcloud auth login
gcloud config set project gen-lang-client-0189172552
gcloud builds submit --tag gcr.io/gen-lang-client-0189172552/csn-api-prod
gcloud run deploy csn-api-prod \
  --image gcr.io/gen-lang-client-0189172552/csn-api-prod \
  --region us-central1 \
  --platform managed \
  --set-secrets="DATABASE_URL=csn-database-url-prod:latest,SECRET_KEY=csn-secret-key-prod:latest,GEMINI_API_KEY=gemini-api-key:latest,DANY_SYSTEM_TOKEN=dany-webhook:latest" \
  --no-traffic-wait
```

### Migración de base de datos
```bash
# Siempre verificar DATABASE_URL antes de correr
cd backend/scripts/
python migrar_sprint6a.py  # agrega area_restriccion + ADMIN_AREA enum
```

---

## 17. Ramas Git

| Rama | Propósito |
|------|-----------|
| `develop` | Rama principal de desarrollo ← **rama activa** |
| `main` | Producción estable |
| `feature/mejoras-agente-roles` | Feature branch de mejoras de roles |

---

## 18. Contactos del Proyecto

| Rol | Nombre | Email |
|-----|--------|-------|
| Admin del sistema | Alejandro Sánchez Vinagre | alejandro.sanchezvi@tiendasneto.com |
| Admin del sistema | Andrés Pedroza | andres.pedroza@tiendasneto.com |
| Daniel Slack (n8n) | Andrés (externo) | — |
| Gerente de Sistemas | Daniel Carrales | dvazquezc@tiendasneto.com |
| Subgerente Sistemas | Hugo Patlan | hpatlan@tiendasneto.com |

---

*Generado automáticamente — actualizar manualmente al hacer cambios estructurales al sistema.*
