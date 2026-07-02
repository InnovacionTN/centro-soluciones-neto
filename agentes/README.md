# Agentes — Dany / Daniel

Esta carpeta contiene el agente de IA **Dany** del Centro de Soluciones Neto (CSN).

## Estructura

```
agentes/
├── dany-vercel/         ← ⭐ IMPLEMENTACIÓN ACTUAL: Vercel AI SDK + Gemini 2.5 (Cloud Run)
│                           Ver dany-vercel/README.md — reemplaza al flujo de n8n
└── n8n-export/          ← Implementación previa en n8n (referencia / origen de la migración)
    ├── portal/          ← Dany del portal web. Canal: widget chat de tienda
    │   ├── A-dany CSN v2.4.json        ← workflow principal (router + 3 personas)
    │   └── subworkflows/               ← tools que llamaba el agente (1 archivo = 1 tool)
    ├── slack/           ← Dany Slack (precios/promociones)
    └── _historico/      ← versiones viejas (v2.1, paso2, paso4) — solo histórico
```

> La lógica actual de Dany vive en código en [`dany-vercel/`](dany-vercel/README.md). Los JSON de
> n8n se conservan como referencia del comportamiento original.

## Qué hace Dany (resumen)

Asistente de soporte de primera línea. Un solo webhook recibe el mensaje y enruta por
`rol_usuario` a tres personas:

| Rol | Persona | Función |
|-----|---------|---------|
| TIENDA | **Dany** | Resuelve problemas guiados (hardware), clasifica y escala creando tickets |
| AGENTE | **Dany copiloto** | Resume y prioriza la cola del agente (read-only) |
| ADMIN / ADMIN_AREA / COORDINADOR | **Daniel** | KPIs, alertas SLA, torre de control (read-only) |

### Contrato del webhook (entrada → salida)

**Entrada** (`POST`, lo reenvía el backend desde `POST /api/v1/dany/chat`):
```json
{ "message": "...", "session_id": "...", "tienda_id": 749, "tienda_nombre": "...",
  "rol_usuario": "TIENDA", "usuario_id": 123, "imagen_url": "", "imagen": "data:image/...;base64,..." }
```

**Salida**:
```json
{ "respuesta": "texto al usuario", "accion": "continuar", "resumen": "...", "multimedia_url": null }
```

### Tools del agente TIENDA (cada una pega a un endpoint del backend CSN)

| Tool | Endpoint backend | Auth |
|------|------------------|------|
| `CSN_registrar_sesion` | `POST /dany/sesion/iniciar` | X-Dany-Token |
| `CSN_clasificar_problema` | `POST /ai/classify` | X-Dany-Token |
| `CSN_crear_ticket` | `POST /tickets/desde-dany` | X-Dany-Token |
| `CSN_cerrar_sesion` | `POST /dany/sesion/cerrar` | X-Dany-Token |
| `Resolver_problema_hardware` | consulta KB de procedimientos (tabla SQL) | — |
| `CSN_mandar_multimedia` / `Obtener_url_multimedia` | servidor media `dany.netopower123.com` | X-API-Key |

> Las tools de **precios/promociones** (`consultar-precios`, `Consultar_promociones`,
> `Actualizar_promocion`, `Analizar_foto_promocion`, `Sincronizar_productos`) pegan al
> "motor" externo `*.netopower123.com` y se usan sobre todo en el canal Slack.

Ver el detalle técnico completo en [`../CSN_CONTEXTO_COMPLETO.md`](../CSN_CONTEXTO_COMPLETO.md) §9.
