# Centro de Soluciones — Backend API

Motor de gestión de tickets para la red de tiendas Soluciones Neto.
**FastAPI + PostgreSQL (Neon) + Gemini 2.5 Flash.** Desplegado en Cloud Run.

> Parte del monorepo CSN. Ver el [README raíz](../README.md) para la visión de los 3 componentes
> (backend · frontend · agente Dany).

---

## Stack

| Tecnología | Uso |
|---|---|
| Python 3.11+ | Lenguaje |
| FastAPI | API REST |
| SQLAlchemy 2.0 | ORM |
| PostgreSQL (Neon.tech) | Base de datos serverless |
| Pydantic 2 | Validación de schemas y settings |
| python-jose | JWT (HS256, 480 min) |
| passlib + bcrypt | Hash de contraseñas |
| google-generativeai | IA — clasificación con Gemini 2.5 Flash |
| uvicorn | Servidor ASGI |

---

## Estructura

```
backend/
├── app/
│   ├── api/v1/endpoints/routes.py   # TODOS los endpoints (un solo archivo)
│   ├── core/config.py               # Settings desde .env (ruta absoluta)
│   ├── core/security.py             # get_current_user(), require_rol(), hash
│   ├── db/session.py                # Engine SQLAlchemy + get_db
│   ├── models/models.py             # Modelos SQLAlchemy + enums
│   ├── schemas/schemas.py           # Schemas Pydantic (request/response)
│   └── services/
│       ├── ia_service.py            # Motor IA Gemini 2.5 + fallback por reglas
│       ├── ticket_service.py        # Folio, ruteo round-robin, SLA, bitácora
│       └── storage_service.py       # Uploads local / Google Cloud Storage
├── scripts/seed.py                  # Datos de prueba (idempotente)
└── .env                             # Variables (NO commitear)
```

Las tablas se crean solas al arrancar (`Base.metadata.create_all`). **No hay Alembic** — un
cambio de schema que agregue columnas requiere `ALTER TABLE` manual (script en `scripts/`).

---

## Desarrollo local

```bash
cd backend
python -m venv venv
source venv/Scripts/activate          # Windows bash  (o venv\Scripts\Activate.ps1 en PowerShell)
pip install -r requirements.txt
cp .env.example .env                   # configurar valores reales
python -m scripts.seed                 # tablas + datos de prueba
uvicorn app.main:app --reload --port 8000
```

- Swagger: `http://localhost:8000/docs` · Health: `GET /health`

---

## Variables de entorno (.env)

```env
DATABASE_URL=postgresql://...           # Neon (dev usa STAGING, prod usa su propia BD)
SECRET_KEY=cadena-aleatoria-min-32
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=480
GEMINI_API_KEY=AQ.Ab8...                # key de Gemini (ver nota abajo)
DANY_WEBHOOK_URL=http://localhost:8080/dany-csn   # agente Dany (Vercel AI SDK)
ENVIRONMENT=development
```

> **Sobre `GEMINI_API_KEY`:** el modelo es `gemini-2.5-flash` (el `gemini-2.0-flash` fue retirado por
> Google). La key correcta es la `AQ.Ab8...` (la `AIza...` anterior está en un proyecto con acceso
> denegado → 403). Sin key válida, la clasificación cae a reglas por keywords (confianza baja).
> En prod la key se lee de Secret Manager (`gemini-api-key`). Ver [memoria del proyecto].

---

## Endpoints clave

**Auth:** `POST /auth/login`, `GET /auth/me`
**IA:** `POST /ai/classify` (Gemini), `GET /tipificaciones`
**Tickets:** `POST|GET /tickets`, `GET|PATCH /tickets/{id}`, `POST /tickets/{id}/escalar`
**Evidencias:** `POST|GET /tickets/{id}/evidencias`, `GET /media/proxy`
**Dashboard/Admin:** `GET /dashboard`, CRUD bajo `/admin/*` (require ADMIN)

### Integración con el agente Dany (servicio aparte, ver [agentes/dany-vercel](../agentes/dany-vercel/README.md))

| Ruta | Auth | Uso |
|---|---|---|
| `POST /dany/chat` | JWT del portal | **Proxy** → reenvía al webhook del agente (evita CORS) |
| `POST /dany/sesion/iniciar` · `/cerrar` | `X-Dany-Token` | Sesiones de Dany (KPIs/deflexión) |
| `POST /tickets/desde-dany` | `X-Dany-Token` | Crear ticket desde el agente |
| `POST /dany/agente/*`, `/dany/admin/*` | `X-Dany-Token` | Copiloto AGENTE/ADMIN (cola, KPIs, similares) |
| `GET /admin/dany/conversaciones` | JWT ADMIN | Visor de conversaciones (solo super-usuarios) |

---

## Modelo de datos

```
cat_regiones → cat_zonas → tiendas → tickets → bitacora_eventos
                            ↘ usuarios (TIENDA)            ↘ ticket_evidencias
cat_grupos → usuarios (AGENTE) → tickets (agente_id)
tipificaciones → matriz_ruteo ← cat_grupos
dany_sesiones / dany_chat_memory   # del agente (sesiones + memoria de chat)
```

---

## Motor de IA (ia_service.py)

```
Texto de la tienda
  → Capa 1: detección de urgencia por frases clave (siempre)
  → ¿hay GEMINI_API_KEY válida?
       sí → Gemini 2.5 Flash (response_mime_type=json) → confianza alta
       no → fallback por keywords ponderadas (normaliza acentos)
  → área + tipificación + urgencia + confianza
```

---

## Despliegue (Cloud Run · gen-lang-client-0189172552)

```bash
gcloud builds submit --tag gcr.io/gen-lang-client-0189172552/csn-api-prod
gcloud run deploy csn-api-prod \
  --image gcr.io/gen-lang-client-0189172552/csn-api-prod:latest \
  --region us-central1 --platform managed --allow-unauthenticated \
  --set-env-vars ENVIRONMENT=production \
  --set-secrets "DATABASE_URL=csn-database-url-prod:latest,SECRET_KEY=csn-secret-key-prod:latest,GEMINI_API_KEY=gemini-api-key:latest" \
  --memory 1Gi --cpu 2 --min-instances 1 --max-instances 10
```

---

## Credenciales de prueba (seed)

| Email | Contraseña | Rol |
|---|---|---|
| `admin@soyneto.com` | `Neto2024!` | ADMIN |
| `christian.gutierrez@soyneto.com` | `Neto2024!` | AGENTE |
| `t749@soyneto.com` | `Neto2024!` | TIENDA (#749 PANZACOLA) |
