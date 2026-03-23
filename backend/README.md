# 🚀 Centro de Soluciones — MVP Backend

Portal de gestión de tickets impulsado por IA. FastAPI + PostgreSQL + Claude Haiku.

## Levantar en local (5 minutos)

### Requisitos
- Docker Desktop instalado y corriendo
- (Opcional) API key de Anthropic para activar clasificación IA real

### 1. Clonar / descomprimir el proyecto

```bash
cd centro-soluciones
```

### 2. Configurar variables de entorno

```bash
cp .env .env.local
# Editar .env: agregar ANTHROPIC_API_KEY si tienes una
```

### 3. Levantar con Docker

```bash
docker-compose up --build
```

La primera vez construye la imagen (~2 min). Las siguientes veces arranca en segundos.

### 4. Cargar datos mock

En otra terminal (con los contenedores ya corriendo):

```bash
docker-compose exec api python scripts/seed.py
```

### 5. Verificar que funciona

- **API Docs (Swagger):** http://localhost:8000/docs
- **Health check:** http://localhost:8000/health
- **ReDoc:** http://localhost:8000/redoc

---

## Credenciales de prueba

| Email | Password | Rol |
|-------|----------|-----|
| admin@soyneto.com | Neto2024! | Admin |
| christian.gutierrez@soyneto.com | Neto2024! | Agente (Sistemas) |
| t749@soyneto.com | Neto2024! | Tienda 749 - PANZACOLA |

---

## Endpoints principales

```
POST   /api/v1/auth/login          → Login, devuelve JWT
GET    /api/v1/auth/me             → Info del usuario actual

POST   /api/v1/ai/classify         → Clasificar texto libre con IA
GET    /api/v1/tipificaciones      → Catálogo de tipificaciones

POST   /api/v1/tickets             → Crear ticket (IA clasifica automático)
GET    /api/v1/tickets             → Listar tickets (filtros: estatus, area, prioridad)
GET    /api/v1/tickets/{id}        → Detalle + bitácora completa
PATCH  /api/v1/tickets/{id}        → Actualizar estado / solución

GET    /api/v1/dashboard           → Métricas en tiempo real
```

## Flujo de prueba rápido

```bash
# 1. Login como tienda
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"t749@soyneto.com","password":"Neto2024!"}'

# Guarda el access_token

# 2. Crear ticket (la IA clasifica automáticamente)
curl -X POST http://localhost:8000/api/v1/tickets \
  -H "Authorization: Bearer TU_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"descripcion":"No tenemos internet desde esta mañana, la antena parece apagada"}'

# Respuesta incluye: folio, estatus, clasificación IA, agente asignado, SLA

# 3. Ver dashboard como agente
# Login con christian.gutierrez@soyneto.com y GET /api/v1/dashboard
```

## Sin API key de Anthropic

El sistema funciona con clasificación por reglas (keywords).
Agrega `ANTHROPIC_API_KEY=sk-ant-...` en `.env` para activar IA real.

## Estructura del proyecto

```
centro-soluciones/
├── app/
│   ├── api/v1/endpoints/routes.py   # Todos los endpoints
│   ├── core/
│   │   ├── config.py               # Settings (pydantic)
│   │   └── security.py             # JWT + auth
│   ├── db/session.py               # SQLAlchemy engine
│   ├── models/models.py            # Todos los modelos ORM
│   ├── schemas/schemas.py          # Pydantic request/response
│   ├── services/
│   │   ├── ia_service.py           # Motor IA (Claude Haiku)
│   │   └── ticket_service.py       # Ruteo, SLA, bitácora
│   └── main.py                     # App FastAPI
├── scripts/seed.py                 # Datos mock
├── docker-compose.yml
├── Dockerfile
├── requirements.txt
└── .env
```
