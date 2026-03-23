# Centro de Soluciones — Neto

Sistema propio de gestión de tickets para la red de 4,000+ tiendas Soluciones Neto.
Reemplaza Zendesk Enterprise con una solución personalizada, más rápida y a una fracción del costo.

---

## ¿Qué es esto?

El **Centro de Soluciones** es el sistema mediante el cual las tiendas de la red Neto reportan incidencias y requerimientos operativos (fallas de equipo, problemas de conectividad, cuestiones de abasto, etc.) y el Call Center los atiende, escala y resuelve.

La principal diferencia vs Zendesk: **la IA clasifica el problema automáticamente** mientras la tienda escribe, elimina el árbol de tipificación de 4 niveles y asigna el ticket al agente correcto sin intervención humana.

---

## Arquitectura general

```
┌─────────────────────────────────────────────────────────────┐
│                       Navegador / App                       │
│              Angular 17 — localhost:4200 (dev)              │
│              Firebase Hosting (producción)                  │
└──────────────────────┬──────────────────────────────────────┘
                       │ HTTP/REST (/api/v1/*)
┌──────────────────────▼──────────────────────────────────────┐
│                      Backend API                            │
│           FastAPI + Python 3.11 — localhost:8000            │
│           Cloud Run (producción)                            │
├─────────────────────────────────────────────────────────────┤
│  Motor IA: Gemini 2.5 Flash (google-generativeai)           │
│  Fallback: clasificación por reglas ponderadas              │
└───────┬─────────────────────────┬───────────────────────────┘
        │                         │
┌───────▼──────────┐   ┌──────────▼──────────────────────────┐
│   PostgreSQL     │   │         Almacenamiento               │
│   Neon.tech (dev)│   │  Local uploads/ (dev)               │
│   Cloud SQL(prod)│   │  Google Cloud Storage (prod)        │
└──────────────────┘   └─────────────────────────────────────┘
```

---

## Repositorios del proyecto

```
centro-soluciones-neto/
├── centro-soluciones/          ← Backend (FastAPI)
│   └── README.md
└── centro-soluciones-frontend/ ← Frontend (Angular)
    └── README.md
```

---

## Inicio rápido

### Prerrequisitos
- Python 3.11+
- Node.js 18+
- PostgreSQL (o cuenta gratis en [Neon.tech](https://neon.tech))
- API key de Gemini (gratis en [Google AI Studio](https://aistudio.google.com/app/apikey))

### 1. Backend

```powershell
cd centro-soluciones
python -m venv venv
venv\Scripts\Activate.ps1
pip install -r requirements.txt

# Configurar .env (ver .env.example)
# DATABASE_URL=postgresql://...
# GEMINI_API_KEY=AIzaSy...

python -m scripts.seed              # Carga datos de prueba
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### 2. Frontend (nueva terminal)

```powershell
cd centro-soluciones-frontend
npm install
npm start
```

### 3. Abrir en el navegador

| URL | Descripción |
|---|---|
| `http://localhost:4200` | Portal web |
| `http://localhost:8000/docs` | API Swagger (desarrollo) |

### Credenciales de prueba

| Usuario | Contraseña | Rol |
|---|---|---|
| `admin@soyneto.com` | `Neto2024!` | Administrador |
| `christian.gutierrez@soyneto.com` | `Neto2024!` | Agente Call Center |
| `t749@soyneto.com` | `Neto2024!` | Tienda 749 PANZACOLA |

---

## Roles y accesos

| Rol | Puede hacer |
|---|---|
| **TIENDA** | Crear tickets, ver sus propios tickets, confirmar/rechazar soluciones, subir evidencias |
| **AGENTE** | Ver y atender todos los tickets de su grupo, tomar, enviar solución, escalar, notas internas |
| **ADMIN** | Todo lo anterior + cancelar tickets + CRUD de catálogos (usuarios, tipificaciones, grupos, ruteo) |

---

## Flujo de un ticket

```
Tienda describe → IA clasifica → Round Robin asigna agente
                                          ↓
                                  NUEVO → ASIGNADO
                                          ↓
                              Agente toma → EN_PROCESO
                                          ↓
                         Agente propone solución → ESPERANDO_TIENDA
                                          ↓
                         Tienda confirma → RESUELTO → CERRADO
                         Tienda rechaza → RECHAZADO → EN_PROCESO (loop)
```

---

## Módulos implementados

| Módulo | Estado | Descripción |
|---|---|---|
| Autenticación JWT | ✅ | Login, roles, guard por ruta |
| Motor IA (Gemini) | ✅ | Clasificación + sugerencia al agente |
| Ciclo de vida ticket | ✅ | 8 estados, permisos por rol |
| Ruteo automático | ✅ | Matriz tipificación+zona → grupo → Round Robin |
| Escalación | ✅ | Con motivo obligatorio, nota interna automática |
| Notas internas | ✅ | PUBLICO/INTERNO, tienda no ve las internas |
| Evidencias multimedia | ✅ | Fotos, video, PDF — local/GCS |
| Panel Admin | ✅ | CRUD sin código: usuarios, tips, grupos, ruteo |
| Dashboard métricas | ✅ | Por área, SLA, prioridad, IA |
| CSAT post-cierre | 🔜 | v1.1 |
| Alertas SLA | 🔜 | v1.1 |
| Auto-cierre 72h | 🔜 | v1.1 |
| Plantillas respuesta | 🔜 | v1.1 |
| Exportación Excel | 🔜 | v1.2 |
| Base de conocimiento | 🔜 | v2.0 |

---

## Decisiones de diseño clave

### IA en lugar de árbol de tipificación
Zendesk usa un árbol rígido de 4 niveles. El Centro de Soluciones usa texto libre + IA: la tienda describe en lenguaje natural y Gemini selecciona la tipificación correcta del catálogo. Si no hay API key o Gemini falla, el sistema usa un fallback de keywords ponderadas — siempre clasifica algo.

### Sin migración histórica
No se migran tickets de Zendesk. La DB arranca limpia. Los catálogos (tipificaciones, grupos, matriz de ruteo) se cargan manualmente desde el panel admin.

### Storage dual local/GCS
En desarrollo las evidencias se guardan en `uploads/` local. En producción se cambia `STORAGE_BACKEND=gcs` en `.env` — el código no cambia.

### Sin Docker en desarrollo
El equipo de desarrollo corre el stack directamente en Windows con Neon.tech como DB en la nube. Docker está disponible para producción en Cloud Run.

---

## Costos estimados (producción)

| Servicio | Costo mensual estimado |
|---|---|
| Cloud Run (backend) | ~$10-30 USD |
| Cloud SQL PostgreSQL | ~$25-50 USD |
| Firebase Hosting (frontend) | Gratis (tier gratuito) |
| Gemini 2.5 Flash (IA) | ~$4-50 USD (según volumen) |
| Cloud Storage (evidencias) | ~$2-5 USD |
| **Total estimado** | **~$40-135 USD/mes** |

Comparado con Zendesk Enterprise (~$150+ USD/agente/mes para 20+ agentes = $3,000+/mes), el ahorro es del orden de 95%.

---

## Roadmap de versiones

| Versión | Contenido | Estado |
|---|---|---|
| MVP (v1.0) | 6 fases: auth, IA, flujo ticket, escalación, evidencias, admin | ✅ Completo |
| v1.1 | CSAT, alertas SLA, auto-cierre, plantillas de respuesta, KPIs por agente | 🔜 Próximo |
| v1.2 | Tickets relacionados, exportación Excel, notificaciones email | 🔜 Planeado |
| v2.0 | Base de conocimiento semántica, NPS, BI dashboards | 🔜 Futuro |

---

## Contribución

El proyecto usa ramas por fase:
- `main` — código estable del piloto
- `feature/fase-*` — desarrollo activo de nuevas fases

Todo cambio de schema de DB requiere un script de migración en `centro-soluciones/scripts/`.
