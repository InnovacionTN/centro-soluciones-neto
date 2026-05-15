# Centro de Soluciones Neto

Sistema propio de gestión de tickets para la red de 4,000+ tiendas Soluciones Neto.
Reemplaza Zendesk Enterprise con una solución personalizada, más rápida y a una fracción del costo.

**Producción:** [https://csn.soyneto.com](https://csn.soyneto.com)

---

## ¿Qué es esto?

El **Centro de Soluciones** es el sistema mediante el cual las tiendas de la red Neto reportan incidencias y requerimientos operativos (fallas de equipo, problemas de conectividad, cuestiones de abasto, etc.) y el Call Center los atiende, escala y resuelve.

Diferencias clave vs Zendesk:
- **IA clasifica automáticamente** mientras la tienda escribe — elimina el árbol de tipificación de 4 niveles
- **Dany** — asistente IA 24/7 que intenta resolver sin crear ticket (deflexión)
- **Daniel** — copiloto para agentes, coordinadores y admins con datos en tiempo real vía n8n + Gemini

---

## Arquitectura general

```
┌─────────────────────────────────────────────────────────────┐
│                    Angular 17 (Frontend)                    │
│            Firebase Hosting — csn.soyneto.com               │
└──────────────────────┬──────────────────────────────────────┘
                       │ HTTPS REST (/api/v1/*)
┌──────────────────────▼──────────────────────────────────────┐
│              FastAPI + Python 3.11 (Backend)                │
│       Cloud Run — csn-api-prod-312707215871.us-central1     │
├─────────────────────────────────────────────────────────────┤
│  Motor IA: Gemini 2.5 Flash (google-generativeai)           │
│  Agente Dany: n8n + Gemini (webhook /dany/chat)             │
│  Memoria: Postgres Chat Memory (n8n)                        │
└───────┬─────────────────────────┬───────────────────────────┘
        │                         │
┌───────▼──────────┐   ┌──────────▼──────────────────────────┐
│   PostgreSQL     │   │         Almacenamiento               │
│   Cloud SQL(prod)│   │  Google Cloud Storage (prod)        │
│   Neon.tech (dev)│   │  Local uploads/ (dev)               │
└──────────────────┘   └─────────────────────────────────────┘
```

---

## Estructura del repositorio

```
centro-soluciones-neto/
├── backend/                ← FastAPI + SQLAlchemy
│   ├── app/
│   │   ├── api/v1/endpoints/
│   │   ├── core/           ← config, security, db
│   │   └── models/         ← ORM models
│   └── scripts/            ← seed, migraciones
├── frontend/               ← Angular 17 standalone
│   └── src/app/
│       ├── features/
│       │   ├── tienda/     ← portal tienda + Dany chat
│       │   ├── agente/     ← cola, dashboard, copiloto
│       │   ├── coordinador/
│       │   └── admin/      ← KPIs, usuarios, configuración
│       └── shared/
├── agentes/                ← Flows n8n (JSON exportados)
│   └── A-dany CSN v2.4.json   ← versión en producción
└── docs/
    ├── canvas-csn-slack.md    ← Guía Slack Canvas
    └── guia-usuario-csn-v1.0.html
```

---

## Inicio rápido (desarrollo)

### Prerrequisitos
- Python 3.11+
- Node.js 18+
- PostgreSQL (o cuenta gratis en [Neon.tech](https://neon.tech))
- API key de Gemini (gratis en [Google AI Studio](https://aistudio.google.com/app/apikey))

### 1. Backend

```powershell
cd backend
python -m venv venv
venv\Scripts\Activate.ps1
pip install -r requirements.txt

# Copiar y configurar variables de entorno
cp .env.example .env
# DATABASE_URL=postgresql://...
# GEMINI_API_KEY=AIzaSy...

python -m scripts.seed          # Carga datos de prueba
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### 2. Frontend

```powershell
cd frontend
npm install
npm start
```

### 3. URLs de desarrollo

| URL | Descripción |
|---|---|
| `http://localhost:4200` | Portal web |
| `http://localhost:8000/docs` | Swagger / API docs |
| `http://localhost:8000/redoc` | ReDoc |

---

## Credenciales de prueba

Todas usan la contraseña: **`Neto2024!`**

### Administrador

| Email | Rol |
|---|---|
| `admin@soyneto.com` | ADMIN (acceso global) |

### Agentes Call Center

| Email | Nombre | Grupo / Área |
|---|---|---|
| `christian.gutierrez@soyneto.com` | Christian Gutiérrez | Sistemas SION |
| `david.ramirez@soyneto.com` | David Ramírez | Sistemas SION |
| `arturo.cortez@soyneto.com` | Arturo Cortez | Sistemas SION |
| `alejandra.sanchez@soyneto.com` | Alejandra E. Sánchez | Abasto Nacional |
| `hugo.patlan@soyneto.com` | Hugo Patlán Piñón | Abasto Nacional |
| `everardo.mtz@soyneto.com` | Everardo Martínez | Mantenimiento Sur |
| `brenda.alvarez@soyneto.com` | Brenda Isabel Álvarez | Finanzas |
| `gerente.comercial@soyneto.com` | Gerente Comercial | Comercial |

### Tiendas de prueba

| Email | Tienda | Zona |
|---|---|---|
| `t749@soyneto.com` | #749 PANZACOLA | Balam |
| `t1296@soyneto.com` | #1296 TUXTLA CHICO | Campeche Sur |
| `t411@soyneto.com` | #411 JALAPA CENTRO | Veracruz Norte |
| `t1483@soyneto.com` | #1483 RODRIGUEZ CLARA | Veracruz Sur |
| `t7270@soyneto.com` | #7270 LOS ANGELES | Tabasco |
| `t616@soyneto.com` | #616 HUACTZICO | Tabasco |
| `t4553@soyneto.com` | #4553 HUITZUCO | CDMX Norte |
| `t4524@soyneto.com` | #4524 ACATZINGO | CDMX Sur |
| `t1058@soyneto.com` | #1058 COMISTÁN | Estado de Mexico |
| `t2845@soyneto.com` | #2845 TLACOTEPEC | Monterrey |
| `t1659@soyneto.com` | #1659 CUICHAPA CENTRO | Guadalajara |
| `t219@soyneto.com` | #219 CALICANTO | Colima |
| `t575@soyneto.com` | #575 COTAXTLA JUAREZ | Veracruz Norte |
| `t1563@soyneto.com` | #1563 PEDRO MORENO | Jalisco Sur |
| `t196@soyneto.com` | #196 GUACAMAYAS IMSS | CDMX Norte |
| `t1213@soyneto.com` | #1213 SAN PABLO ETLA | Balam |
| `t1126@soyneto.com` | #1126 SANTA CLARA | Yucatan Norte |
| `t1221@soyneto.com` | #1221 LA COLSA | Coahuila |
| `t8971@soyneto.com` | #8971 IMSS CENTRO | CDMX Sur |

---

## Roles y accesos

| Rol | Descripción |
|---|---|
| **TIENDA** | Crear tickets, ver sus propios tickets, confirmar/rechazar soluciones, chatear con Dany |
| **AGENTE** | Cola de tickets de su grupo, tomar, resolver, escalar, notas internas, Dany copiloto |
| **COORDINADOR** | Vista de su compañía (filtrado por grupo → región), KPIs, Daniel |
| **ADMIN_AREA** | Vista filtrada por área técnica, gestión de usuarios de su área |
| **ADMIN** | Acceso global completo: CRUD usuarios, tipificaciones, grupos, ruteo, KPIs totales |

---

## Dany — Agente IA (n8n + Gemini)

El sistema tiene **3 instancias de Dany** según el rol, todas corriendo en el mismo flow n8n (`A-dany CSN v2.4.json`) con un `Switch_Rol` que enruta:

| Instancia | Rol | Función |
|---|---|---|
| **Dany** (tienda) | TIENDA | Troubleshooting guiado, deflexión antes de crear ticket |
| **Dany Agente** (copiloto) | AGENTE | Cola prioritaria, resúmenes de tickets, consultas de estado |
| **Daniel** (admin) | ADMIN / ADMIN_AREA / COORDINADOR | KPIs en tiempo real, alertas, análisis operativo |

Cada instancia tiene su propia **Postgres Chat Memory** en n8n (por `sesion_id`), sin historial en el payload.

El backend actúa como proxy: `POST /api/v1/dany/chat` → n8n webhook.

---

## Flujo de un ticket

```
Tienda describe → Dany intenta resolver (deflexión)
                        ↓ no resuelto
              IA clasifica → Round Robin asigna agente
                        ↓
                NUEVO → ASIGNADO
                        ↓
            Agente toma → EN_PROCESO
                        ↓
       Agente propone solución → ESPERANDO_TIENDA
                        ↓
       Tienda confirma → RESUELTO → CERRADO (72h auto)
       Tienda rechaza  → RECHAZADO → EN_PROCESO (loop)
```

---

## Módulos implementados

| Módulo | Estado | Descripción |
|---|---|---|
| Autenticación JWT | ✅ | Login, roles, guard por ruta |
| Motor IA (Gemini) | ✅ | Clasificación automática + sugerencia al agente |
| Ciclo de vida ticket | ✅ | 8 estados, permisos por rol |
| Ruteo automático | ✅ | Tipificación + zona → grupo → Round Robin |
| Escalación | ✅ | Motivo obligatorio, nota interna automática |
| Notas internas | ✅ | PUBLICO / INTERNO — tienda no ve las internas |
| Evidencias multimedia | ✅ | Fotos, video, PDF — GCS en producción |
| Panel Admin | ✅ | CRUD: usuarios, tipificaciones, grupos, ruteo |
| Dashboard KPIs | ✅ | SLA, resolución, deflexión Dany, por área/rol |
| Dany — Tienda | ✅ | Chat IA 24/7, imágenes, deflexión antes del ticket |
| Dany — Agente (copiloto) | ✅ | Cola urgente, resúmenes, consultas por folio |
| Daniel — Admin/Coordinador | ✅ | KPIs + alertas torre en tiempo real |
| Dark mode | ✅ | CSS variables, respeta preferencia del sistema |
| CSAT post-cierre | 🔜 | v1.1 |
| Alertas SLA automáticas | 🔜 | v1.1 |
| Auto-cierre 72h | 🔜 | v1.1 |
| Plantillas de respuesta | 🔜 | v1.1 |
| Cambio contraseña (Slack) | 🔜 | v1.1 |
| Exportación Excel | 🔜 | v1.2 |
| Paso 1: Dany con imágenes (n8n) | 🔜 | pendiente |
| Paso 3: Vista agente CC + Dany | 🔜 | pendiente |
| Paso 5: Funciones Slack avanzadas | 🔜 | pendiente |

---

## Decisiones de diseño

**IA en lugar de árbol de tipificación** — Zendesk usa un árbol rígido de 4 niveles. Aquí la tienda describe en lenguaje natural y Gemini selecciona la tipificación. Si falla la API, hay fallback de keywords ponderadas.

**Memoria en n8n, no en frontend** — El historial de conversación vive en Postgres Chat Memory (n8n), una instancia por agente. El frontend solo manda el mensaje actual.

**Sin migración histórica** — La DB arranca limpia. Los catálogos se cargan desde el panel admin.

**Storage dual local/GCS** — En dev las evidencias van a `uploads/`. En prod se cambia `STORAGE_BACKEND=gcs` en `.env`.

---

## Costos estimados (producción)

| Servicio | Costo mensual estimado |
|---|---|
| Cloud Run (backend) | ~$10–30 USD |
| Cloud SQL PostgreSQL | ~$25–50 USD |
| Firebase Hosting (frontend) | Gratis |
| Gemini 2.5 Flash (IA) | ~$4–50 USD (según volumen) |
| Cloud Storage (evidencias) | ~$2–5 USD |
| **Total estimado** | **~$40–135 USD/mes** |

Vs Zendesk Enterprise (~$150+/agente/mes × 20 agentes = $3,000+/mes) → **ahorro ~95%**

---

## Roadmap

| Versión | Contenido | Estado |
|---|---|---|
| v1.0 | Auth, IA, ciclo ticket, escalación, evidencias, admin, Dany IA, KPIs, dark mode | ✅ Completo |
| v1.1 | CSAT, alertas SLA, auto-cierre, plantillas, cambio contraseña Slack | 🔜 Próximo |
| v1.2 | Tickets relacionados, exportación Excel, notificaciones email | 🔜 Planeado |
| v2.0 | Base de conocimiento semántica, NPS, BI dashboards | 🔜 Futuro |

---

## Ramas Git

- `main` — código estable, producción
- `develop` — integración de features
- `claude/suspicious-ardinghelli-*` — worktrees Claude Code

Todo cambio de schema de DB requiere script de migración en `backend/scripts/`.
