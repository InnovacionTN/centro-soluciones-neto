# csn-dany-agent

Agente **Dany** del Centro de Soluciones Neto, implementado con **Vercel AI SDK v6 + Gemini 2.5 Flash**
y servido con **Hono** sobre Node 20. Reemplaza al workflow de n8n manteniendo idéntico el contrato
del webhook (cutover = repuntar `DANY_WEBHOOK_URL` del backend).

> Origen n8n (referencia): [`../n8n-export/`](../n8n-export/). Visión del monorepo: [README raíz](../../README.md).

---

## Una persona, tres roles

Un solo agente que enruta por `rol_usuario` ([`agents/index.ts`](src/agents/index.ts)):

| Rol | Persona | Función |
|---|---|---|
| TIENDA | **Dany** | Soporte guiado paso a paso (98 flujos), multimedia, deflexión y escalación con ticket |
| AGENTE | **Dany copiloto** | Cola priorizada, ver ticket, casos similares (read-only) |
| ADMIN / ADMIN_AREA / COORDINADOR | **Daniel** | KPIs, alertas, torre de control (read-only) |

---

## Estructura

```
src/
├── server.ts            # Hono: POST /dany-csn + GET /health
├── config.ts            # Variables de entorno
├── types.ts             # Contrato del webhook (Zod) — acepta snake_case y alias
├── model.ts             # Provider Gemini (un punto para cambiar de modelo)
├── agents/
│   ├── index.ts         # ⭐ Router por rol: memoria, contexto en vivo, system, accion
│   ├── prompts.ts       # ⭐ TODAS las reglas de comportamiento (3 prompts)
│   ├── tools.ts         # Herramientas por rol (Zod) — pegan al backend CSN
│   ├── runner.ts        # Punto único de llamada al modelo (generateText + stopWhen)
│   └── content.ts       # Mensaje del usuario (texto + imagen multimodal)
├── kb/
│   ├── flujos.json      # 98 flujos de soporte en 8 categorías
│   └── flows.ts         # matchFlow: IDF + palabra completa + sin acentos + sinónimos
├── csn/
│   ├── client.ts        # Cliente HTTP al backend CSN (X-Dany-Token)
│   └── media.ts         # Resuelve refs de multimedia → URLs de GCS
├── memory/
│   ├── index.ts         # Selector (Postgres si hay DATABASE_URL, si no in-memory)
│   ├── postgres.ts      # PostgresStore (tabla dany_chat_memory, JSONB por sesion_id)
│   ├── store.ts         # Interfaz + InMemoryStore + trimHistory (cap 40 msgs)
│   └── compact.ts       # Compacta el historial enviado al modelo (ahorra tokens)
└── eval/
    ├── cases.ts         # Casos de comportamiento (aserciones por turno)
    └── run.ts           # Runner: pega al agente vivo y verifica (npm run eval)
```

---

## Contrato `POST /dany-csn`

Entrada (la reenvía el backend desde `POST /api/v1/dany/chat`). Acepta snake_case y alias:
```json
{ "mensaje": "...", "sesion_id": "...", "tienda_id": 749, "tienda_nombre": "...",
  "rol_usuario": "TIENDA", "usuario_id": 123, "imagen": "data:image/...;base64,...",
  "evento": "recordatorio | cierre_inactividad" }
```
Salida:
```json
{ "respuesta": "...", "accion": "continuar|resuelto|escalado", "resumen": "", "multimedia_url": null }
```

`accion` lo calcula el código (no el LLM) según lo que hicieron las tools, para que el frontend
detenga los recordatorios de inactividad cuando el caso cerró.

---

## Decisiones de diseño / mejores prácticas

- **Reglas críticas en código, no en el LLM:** cierre por inactividad determinista, cálculo de
  `accion`, y anti-loop (límite de llamadas por tool por turno).
- **`thoughtSignature` preservados:** la memoria guarda los mensajes completos del assistant. Quitar
  las firmas de Gemini provoca error 400 y rompe el razonamiento multi-step.
- **Compactación de contexto** ([`memory/compact.ts`](src/memory/compact.ts)): al enviar el historial
  al modelo, deja en claro solo el último procedimiento pesado de cada herramienta y resume los
  superados. La memoria en Neon se guarda completa (fidelidad para el visor de ADMIN). Ahorra ~38%
  de tokens en charlas multi-tema sin perder el flujo activo.
- **Honestidad ante fallos:** si una tool devuelve error, Dany no afirma éxito ni inventa folios;
  reintenta y avisa con naturalidad (regla en `prompts.ts`).
- **Conocimiento desacoplado:** los 98 flujos viven en `kb/flujos.json`, no en el prompt.

---

## Desarrollo local

```bash
cp .env.example .env       # rellenar GOOGLE_GENERATIVE_AI_API_KEY, DANY_SYSTEM_TOKEN, DATABASE_URL
npm install
npm run dev                # tsx watch → http://localhost:8080 (recarga al guardar)
```

Otros comandos:
```bash
npm run typecheck          # solo tipos
npm run build              # compila a dist/ (+ copia kb/*.json)
npm start                  # corre dist/
npm run eval               # suite de evaluación de comportamiento (requiere agente + backend arriba)
```

### Suite de evaluación (`npm run eval`)

Prueba de integración: lanza conversaciones contra el agente vivo y verifica comportamiento
(arranca cálido, intenta pasos antes de escalar, pregunta el síntoma si es vago, no filtra lo
interno, no inventa). Sale con código 1 si algo falla → apta para CI. Casos en `src/eval/cases.ts`.

---

## Variables de entorno

```env
GOOGLE_GENERATIVE_AI_API_KEY=AQ.Ab8...   # key de Gemini (la AQ. es la correcta)
DANY_MODEL=gemini-2.5-flash
CSN_API_URL=http://localhost:8000        # backend CSN
DANY_SYSTEM_TOKEN=...                     # se manda como X-Dany-Token al backend
DATABASE_URL=postgresql://...             # memoria (Neon); sin esto usa in-memory
DANY_MEDIA_BASE_URL=https://storage.googleapis.com/csn-dany-media
PORT=8080
```

---

## Deploy a Cloud Run (gen-lang-client-0189172552)

> El secreto del modelo en CSN se llama `gemini-api-key` pero el provider lee
> `GOOGLE_GENERATIVE_AI_API_KEY` → se mapea en `--set-secrets`. Runbook completo: [`DEPLOY.md`](DEPLOY.md).

```bash
gcloud builds submit --tag gcr.io/gen-lang-client-0189172552/csn-dany-agent
gcloud run deploy csn-dany-agent \
  --image gcr.io/gen-lang-client-0189172552/csn-dany-agent \
  --region us-central1 --platform managed \
  --set-env-vars="CSN_API_URL=https://csn-api-prod-312707215871.us-central1.run.app,DANY_MODEL=gemini-2.5-flash" \
  --set-secrets="GOOGLE_GENERATIVE_AI_API_KEY=gemini-api-key:latest,DANY_SYSTEM_TOKEN=dany-webhook:latest,DATABASE_URL=csn-database-url-prod:latest"
```

**Cutover:** apuntar `DANY_WEBHOOK_URL` del backend al `/dany-csn` del servicio. Probar en staging
primero; rollback = revertir esa variable.

---

## Estado

Migración **code-complete y desplegada** (backend + agente en Cloud Run). Mejoras recientes aplicadas:
clasificación con Gemini 2.5 real, compactación de memoria, honestidad ante fallos, arranque cálido,
persona consistente (Dany/Daniel) y suite de evaluación. Notas de integración del backend:
[`BACKEND_CAMBIOS.md`](BACKEND_CAMBIOS.md) · hosting de multimedia: [`MEDIA_HOSTING.md`](MEDIA_HOSTING.md).
