# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Backend

```bash
cd backend
source venv/Scripts/activate          # Windows bash
# or: venv\Scripts\Activate.ps1       # PowerShell
uvicorn app.main:app --reload --port 8000
```

API docs at `http://localhost:8000/docs`. Health check: `GET /health`.

### Frontend

```bash
cd frontend
npm start          # runs ng serve with proxy to localhost:8000
```

App at `http://localhost:4200`. The proxy config in `proxy.conf.json` forwards `/api/*` to the backend.

### Database / Seed

```bash
cd backend
python -m scripts.seed              # initial data (checks existing, safe to re-run)
python -m scripts.reset_seed        # full wipe + reseed
```

Tables are auto-created on backend startup via `Base.metadata.create_all()`. There is no Alembic auto-migration — schema changes require manual scripts in `backend/scripts/`.

---

## Architecture

### Stack

- **Backend**: FastAPI + SQLAlchemy + PostgreSQL (Neon serverless). Single router file: `app/api/v1/endpoints/routes.py` (~1700 lines, all 29 endpoints).
- **Frontend**: Angular 17 standalone components with Signals (no NgRx). All state via `signal()` / `computed()`.
- **AI**: Google Gemini 2.5 Flash for ticket classification. Falls back to keyword scoring if `GEMINI_API_KEY` is missing.
- **Auth**: JWT (HS256, 480 min). Stored in `localStorage` as `cs_token`. Angular interceptor injects `Authorization: Bearer` on every request.

### Backend Structure

```
app/
├── api/v1/endpoints/routes.py   # All endpoints in one file
├── core/
│   ├── config.py                # Pydantic Settings — reads .env with absolute path
│   └── security.py              # get_current_user(), require_rol() dependency
├── models/models.py             # 10 SQLAlchemy tables + 6 enums
├── schemas/schemas.py           # Pydantic request/response models
└── services/
    ├── ia_service.py            # Gemini classification + keyword fallback
    ├── ticket_service.py        # Folio generation, round-robin routing, SLA, audit log
    └── storage_service.py       # Local uploads/ or Google Cloud Storage
```

### Frontend Structure

```
src/app/
├── core/
│   ├── guards/auth.guard.ts         # CanActivateFn — role-based redirect
│   ├── interceptors/auth.interceptor.ts  # JWT injection + 401 → logout
│   ├── models.ts                    # Shared TypeScript interfaces
│   └── services/                    # auth, ticket, admin services
├── features/
│   ├── tienda/                      # Store views (dashboard, nuevo-ticket, ticket-detalle)
│   ├── agente/                      # Agent views (dashboard, cola, ticket)
│   └── admin/                       # Admin shell with 4 tabs
└── shared/components/               # navbar, status-badge, evidencias
```

### Roles & Ticket Flow

Three roles: **TIENDA** (stores), **AGENTE** (call center), **ADMIN**.

Ticket lifecycle:

```
Store describes → AI classifies → Round-robin assigns → NUEVO
→ ASIGNADO → EN_PROCESO → ESPERANDO_TIENDA → RESUELTO → CERRADO
                     ↑ RECHAZADO ←────────────────────┘ (store rejects)
```

### Key Design Decisions

- **Single routes.py**: All API endpoints live in one file. Add new endpoints there.
- **Settings absolute path**: `config.py` resolves `.env` via `Path(__file__).parent.parent.parent / ".env"` — works regardless of where uvicorn is launched.
- **Dany agent**: Dany runs as its own Cloud Run service (Vercel AI SDK + Gemini 2.5), source in `agentes/dany-vercel/` (own README). The backend proxies to it server-side via `POST /api/v1/dany/chat` to avoid browser CORS — set `DANY_WEBHOOK_URL` in `.env`. The TIENDA chat UI lives in `tienda-dashboard.component.ts`. Behavior rules are in `agentes/dany-vercel/src/agents/prompts.ts`; validate changes with `npm run eval` (suite in `src/eval/`).
- **Gemini key/model**: classification model is `gemini-2.5-flash` (`gemini-2.0-flash` was retired). Use the `AQ.Ab8...` key (the older `AIza...` key's project is access-denied → 403). Prod reads it from Secret Manager (`gemini-api-key`).
- **Javier (WhatsApp agent)**: External agent that hits the API directly (no proxy). Uses a TIENDA-role service account. See `AGENTS_API.md` for full integration docs.
- **External agents doc**: `AGENTS_API.md` at repo root — reference for Dany/Javier developers covering auth, ticket creation (resolved + open), and payload examples.
- **Angular signals only**: No Observable-based state. Components use `signal()`, `computed()`, and `effect()` directly.
- **Inline component styles**: All Angular components use inline `styles: [\`...\`]`. The global design tokens (CSS variables) are in`frontend/src/styles.css`.

### CSS Design Tokens (styles.css)

Key variables used throughout:

- `--c-blue: #0E3B83` / `--c-blue-lt: #E6EDF8` / `--c-blue-md: #A0BAE2`
- `--c-amber: #FF5100` (primary orange/actions)
- `--c-purple: #1ABC9C` (accent cyan — named purple for legacy reasons)
- `--c-green`, `--c-red`, `--c-teal` — semantic status colors
- `--c-surface`, `--c-bg`, `--c-border`, `--c-text`, `--c-muted`
- `--radius-md: 6px`, `--radius-lg: 10px`, `--radius-xl: 16px`

### Test Credentials (from seed.py)

| Email | Password | Role |
|---|---|---|
| <admin@soyneto.com> | Neto2024! | ADMIN |
| <christian.gutierrez@soyneto.com> | Neto2024! | AGENTE |
| <t749@soyneto.com> | Neto2024! | TIENDA |
