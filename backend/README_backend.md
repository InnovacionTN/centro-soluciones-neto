# Centro de Soluciones — Backend API

Motor de gestión de tickets para la red de tiendas Soluciones Neto.
Construido con **FastAPI + PostgreSQL + Gemini 2.5 Flash**.

---

## Stack

| Tecnología | Versión | Uso |
|---|---|---|
| Python | 3.11+ | Lenguaje principal |
| FastAPI | 0.111.0 | Framework web / API REST |
| SQLAlchemy | 2.0.30 | ORM |
| PostgreSQL | 15+ | Base de datos (Neon.tech en dev) |
| Pydantic | 2.7.1 | Validación de schemas |
| python-jose | 3.3.0 | Autenticación JWT |
| passlib + bcrypt | 1.7.4 / 4.0.1 | Hash de contraseñas |
| google-generativeai | 0.7.2 | IA — Gemini 2.5 Flash |
| python-multipart | 0.0.9 | Subida de archivos |
| uvicorn | 0.29.0 | Servidor ASGI |

---

## Estructura del proyecto

```
centro-soluciones/
├── app/
│   ├── api/v1/endpoints/
│   │   └── routes.py          # Todos los endpoints (29 rutas)
│   ├── core/
│   │   ├── config.py          # Settings desde .env
│   │   └── security.py        # JWT, guards, hash
│   ├── db/
│   │   └── session.py         # Engine SQLAlchemy + get_db
│   ├── models/
│   │   └── models.py          # 10 modelos SQLAlchemy + enums
│   ├── schemas/
│   │   └── schemas.py         # Schemas Pydantic (request/response)
│   └── services/
│       ├── ia_service.py      # Motor IA Gemini + fallback
│       ├── storage_service.py # Almacenamiento local / GCS
│       └── ticket_service.py  # Lógica de negocio tickets
├── scripts/
│   ├── seed.py                # Datos de prueba
│   ├── migrar_estados.py      # Migración Fase C (enum DB)
│   └── migrar_fase_e.py       # Migración Fase E (tabla evidencias)
├── uploads/                   # Evidencias en desarrollo (creada automáticamente)
├── .env                       # Variables de entorno (no commitear)
├── .env.example               # Plantilla de variables
├── requirements.txt           # Dependencias
└── main.py                    # Punto de entrada
```

---

## Instalación (desarrollo sin Docker)

### Requisitos
- Python 3.11+
- PostgreSQL (o cuenta en [Neon.tech](https://neon.tech) — gratis)

### Pasos

```powershell
# 1. Clonar y crear entorno virtual
cd centro-soluciones
python -m venv venv
venv\Scripts\Activate.ps1      # Windows
# source venv/bin/activate     # Linux/Mac

# 2. Instalar dependencias
pip install -r requirements.txt

# 3. Configurar variables de entorno
copy .env.example .env
# Editar .env con los valores reales

# 4. Crear tablas y datos de prueba
python -m scripts.seed

# 5. Levantar el servidor
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

El servidor estará disponible en `http://localhost:8000`.
Documentación interactiva (Swagger): `http://localhost:8000/docs`

---

## Variables de entorno

```env
# Base de datos (requerido)
DATABASE_URL=postgresql://usuario:contraseña@host/base_de_datos

# JWT (requerido — cambiar en producción)
SECRET_KEY=cadena-aleatoria-minimo-32-caracteres
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=480

# Google Gemini (opcional — sin ella usa fallback por reglas)
GEMINI_API_KEY=AIzaSy...
# Obtener key gratuita: https://aistudio.google.com/app/apikey

# Almacenamiento de evidencias
STORAGE_BACKEND=local       # "local" en dev, "gcs" en producción
GCS_BUCKET_NAME=            # Solo si STORAGE_BACKEND=gcs
MAX_UPLOAD_SIZE_MB=10

# Slack (opcional)
SLACK_BOT_TOKEN=
SLACK_DEFAULT_CHANNEL=#centro-soluciones-dev
```

---

## Endpoints de la API

### Autenticación
| Método | Ruta | Descripción |
|---|---|---|
| POST | `/api/v1/auth/login` | Login — devuelve JWT |
| GET | `/api/v1/auth/me` | Perfil del usuario autenticado |

### IA / Clasificación
| Método | Ruta | Descripción |
|---|---|---|
| POST | `/api/v1/ai/classify` | Clasificar texto libre con Gemini |
| GET | `/api/v1/tipificaciones` | Catálogo de tipificaciones |

### Tickets
| Método | Ruta | Descripción |
|---|---|---|
| POST | `/api/v1/tickets` | Crear ticket |
| GET | `/api/v1/tickets` | Listar tickets (filtros por rol) |
| GET | `/api/v1/tickets/{id}` | Detalle de ticket |
| PATCH | `/api/v1/tickets/{id}` | Actualizar estado / comentar |
| POST | `/api/v1/tickets/{id}/escalar` | Escalar a otro grupo |

### Evidencias
| Método | Ruta | Descripción |
|---|---|---|
| POST | `/api/v1/tickets/{id}/evidencias` | Subir evidencia (imagen/video/PDF) |
| GET | `/api/v1/tickets/{id}/evidencias` | Listar evidencias del ticket |
| DELETE | `/api/v1/tickets/{id}/evidencias/{evId}` | Eliminar evidencia |
| GET | `/api/v1/evidencias/{archivo}` | Servir archivo (solo en dev local) |

### Grupos y Dashboard
| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/v1/grupos` | Listar grupos del CC |
| GET | `/api/v1/dashboard` | Métricas agregadas |

### Admin (requieren rol ADMIN)
| Método | Ruta | Descripción |
|---|---|---|
| GET/POST/PATCH | `/api/v1/admin/usuarios` | CRUD de usuarios |
| GET/POST/PATCH | `/api/v1/admin/tipificaciones` | CRUD de tipificaciones |
| GET/POST/PATCH | `/api/v1/admin/grupos` | CRUD de grupos |
| GET/POST/DELETE | `/api/v1/admin/ruteo` | Matriz de ruteo |
| GET/POST/PATCH | `/api/v1/admin/tiendas` | CRUD de tiendas |

---

## Modelo de datos

```
cat_regiones    → cat_zonas → tiendas → tickets
                               ↘ usuarios (TIENDA)
cat_grupos → usuarios (AGENTE) → tickets (agente_id)
cat_tipificaciones → matriz_ruteo ← cat_grupos
                   ↘ tickets (tipificacion_id)
tickets → bitacora_eventos
        → ticket_evidencias
```

**10 tablas:** `cat_regiones`, `cat_zonas`, `tiendas`, `cat_grupos`, `usuarios`, `cat_tipificaciones`, `matriz_ruteo`, `tickets`, `bitacora_eventos`, `ticket_evidencias`

---

## Flujo del motor de IA

```
Texto de la tienda
       ↓
  Capa 1: Detección de urgencia por frases clave (siempre activa)
       ↓
  ¿Hay GEMINI_API_KEY?
  ├── Sí → Gemini 2.5 Flash (response_mime_type=application/json)
  │         Confianza: 80-95%
  └── No → Fallback por keywords ponderadas
            Confianza: 0-70%, normaliza acentos
       ↓
  Resultado: área + tipificación + urgencia + confianza
```

---

## Migraciones

El proyecto no usa Alembic automático. Cada cambio de schema requiere un script manual en `scripts/`:

```powershell
# Ejecutar desde la raíz del proyecto con venv activo
python -m scripts.migrar_estados    # Fase C — nuevos estados del enum
python -m scripts.migrar_fase_e     # Fase E — tabla ticket_evidencias
```

---

## Credenciales de prueba (seed)

| Email | Contraseña | Rol |
|---|---|---|
| `admin@soyneto.com` | `Neto2024!` | ADMIN |
| `christian.gutierrez@soyneto.com` | `Neto2024!` | AGENTE |
| `t749@soyneto.com` | `Neto2024!` | TIENDA (tienda 749 PANZACOLA) |

---

## Despliegue en GCP (producción)

```bash
# Build y push a Artifact Registry
gcloud builds submit --tag gcr.io/[PROYECTO]/centro-soluciones-api

# Deploy en Cloud Run
gcloud run deploy centro-soluciones-api \
  --image gcr.io/[PROYECTO]/centro-soluciones-api \
  --platform managed \
  --region us-central1 \
  --set-env-vars DATABASE_URL=...,SECRET_KEY=...,GEMINI_API_KEY=...
```

Solo cambiar `DATABASE_URL` a Cloud SQL y `STORAGE_BACKEND=gcs`. El código no cambia.
