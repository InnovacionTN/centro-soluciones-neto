# Cambios requeridos en el backend CSN para la nueva versión del agente

> Filosofía: **el backend se adapta al agente**, no al revés. Esta lista recoge lo
> que el backend (`backend/app/...`) debe ajustar para que el agente Vercel quede
> construido con las mejores prácticas. Ordenado por prioridad.

## 🔴 ALTA — Seguridad: endpoints de contexto sin autenticación

`POST /dany/agente/cola` y `POST /dany/admin/contexto` (`routes.py` ~3913 y ~3953)
**no validan ningún token ni JWT**. Reciben `usuario_id` en el body y devuelven datos.
Hoy cualquiera con la URL puede leer la cola de cualquier agente o los KPIs de admin.

- **Cambio:** agregar `_: None = Depends(verify_dany_token)` a ambos (el agente los
  llamará server-side con `X-Dany-Token`, igual que `/ai/classify`).
- **Relación:** lo necesita la **Fase 4** del agente (personas AGENTE y ADMIN).

## 🟡 MEDIA — `/dany/sesion/iniciar` debe aceptar `tienda_nombre`

El agente conoce `tienda_nombre` y la tabla `DanySesion` ya tiene ese campo, pero el
schema `DanySesionInicioRequest` solo acepta `{sesion_id, tienda_id, canal}` → se pierde.

- **Cambio:** añadir `tienda_nombre: Optional[str] = None` al schema y persistirlo.
- **Beneficio:** KPIs de Dany con nombre de tienda sin joins extra.

## 🟡 MEDIA — Proxy `/dany/chat` debe mandar el secreto de entrada

El nuevo agente queda público en Cloud Run; valida un header `X-Dany-Webhook-Secret`
si `DANY_WEBHOOK_SECRET` está seteado. El proxy `POST /dany/chat` debe incluirlo al
reenviar:

```python
resp = await client.post(
    webhook_url, json=payload,
    headers={"X-Dany-Webhook-Secret": get_settings().DANY_WEBHOOK_SECRET},
)
```
Añadir `DANY_WEBHOOK_SECRET` a `config.py` y al deploy del backend (secreto
`dany-webhook-secret`). Detalle en `DEPLOY.md` paso 5. (Opcional: si no se usa el
secreto, no setear la var en el agente.)

## 🟢 CONFIG (no código) — Repuntar el webhook

- `DANY_WEBHOOK_URL` (hoy `https://webhook.soyneto.com/webhook/dany-csn`) →
  `https://csn-dany-agent-<hash>.us-central1.run.app/dany-csn`.
- El proxy `POST /dany/chat` queda **igual** (solo reenvía). Rollback = revertir la URL.
- Probar primero en **staging**.

## 🟢 LIMPIEZA (diferible) — Coerciones heredadas de n8n

`TicketDanyCreate` y `DanySesionCierreRequest` tienen `field_validator`s que aceptan
strings, proporciones 0–1, `'true'/'false'`, etc. "porque n8n los serializa así".
El nuevo agente manda **tipos limpios** (int 0–100, bool real).

- **Cambio (cuando se retire n8n):** simplificar esos validators.
- **Ahora:** no tocar — mantienen compatibilidad mientras conviven ambos.

## 🔵 MEJORA FUTURA (opcional) — Respuesta en streaming

Best practice de chat: enviar la respuesta por tokens (SSE) para que la tienda vea
escribir a Dany en vivo. Requiere:
- Agente: endpoint `POST /dany-csn/stream` (el AI SDK trae `streamText`/`toUIMessageStream`).
- Backend: que `/dany/chat` proxee el stream (passthrough de `text/event-stream`).
- Frontend: consumir el stream en el widget.
- **Decisión:** fase opcional posterior; el contrato JSON actual sigue funcionando.

## ℹ️ Sin cambio en backend — Memoria del agente

La memoria de conversación vive en una tabla nueva `dany_chat_memory` (Neon) que el
**agente** crea y administra solo (`CREATE TABLE IF NOT EXISTS`). El backend no la usa.
Solo requiere que el agente reciba `DATABASE_URL` del mismo Neon. La tabla `DanySesion`
del backend sigue siendo solo para KPIs/deflexión.
