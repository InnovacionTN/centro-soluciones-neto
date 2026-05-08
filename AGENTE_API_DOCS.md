# CSN Backend — Guía de integración para agentes

Documentación técnica para integrar agentes automáticos con el backend de
**Centro Soluciones Neto (CSN)**. Escrita principalmente para **Andrés**, quien desarrolla
Daniel Slack, pero aplica a cualquier agente que consuma el backend.

---

## Contexto del sistema

CSN es un sistema interno de tickets de soporte técnico para más de 4,000 tiendas Neto.
Reemplaza a Zendesk Enterprise. Stack:

- **Backend:** FastAPI + Python 3.11 + PostgreSQL (Neon.tech), en GCP Cloud Run
- **Frontend:** Angular 17, en Firebase Hosting
- **Automatización / IA:** n8n orquesta al agente **Daniel** (también llamado "Dany")
- **Proyecto GCP:** `gen-lang-client-0189172552`, región `us-central1`

### Los dos Danieles — mismo backend, distinto canal

| | **Daniel CSN** | **Daniel Slack** |
|--|----------------|------------------|
| **Qué es** | Agente IA embebido en el portal web de la tienda | Agente IA en Slack |
| **Dónde vive** | n8n — subworkflows del portal CSN | n8n — flujo de Slack (Andrés) |
| **Cómo crea tickets** | `POST /tickets/desde-dany` | `POST /tickets/desde-dany` — **igual** |
| **Autenticación** | `X-Dany-Token` header | `X-Dany-Token` header — **igual** |
| **Estado** | ✅ Producción | 🔧 En desarrollo |

El backend trata a ambos de forma idéntica. Daniel Slack solo necesita replicar
el patrón de Daniel CSN.

---

## Entornos

| Entorno | URL base | Docs interactivos |
|---------|----------|-------------------|
| **Producción** | `https://csn-api-prod-312707215871.us-central1.run.app` | [/docs](https://csn-api-prod-312707215871.us-central1.run.app/docs) |
| **Staging** | `https://csn-api-staging-312707215871.us-central1.run.app` | [/docs](https://csn-api-staging-312707215871.us-central1.run.app/docs) |

> Los subworkflows actuales de Daniel CSN apuntan a una URL anterior del mismo servicio
> (`csn-api-prod-xdngdvdxua-uc.a.run.app`). Ambas URLs son válidas y apuntan al mismo backend.
> Para Daniel Slack usar las URLs de arriba.

Todos los endpoints llevan el prefijo `/api/v1/`:
```
POST https://csn-api-prod-312707215871.us-central1.run.app/api/v1/tickets/desde-dany
```

---

## Autenticación — X-Dany-Token

Los agentes automáticos **no usan login ni JWT**. Usan un header fijo en cada request:

```
X-Dany-Token: <valor_del_token>
```

### Dónde vive el token

El token está almacenado en **GCP Secret Manager** bajo el nombre de secreto **`dany-webhook`**
(no confundir — el secreto se llama `dany-webhook`, la variable de entorno en Cloud Run es
`DANY_SYSTEM_TOKEN`).

Para consultar el valor actual:
```
GCP Console → Secret Manager → dany-webhook → Versions → latest → View secret value
```

El token es un hex de 64 caracteres generado con:
```bash
python -c "import secrets; print(secrets.token_hex(32))"
```

### Cómo configurarlo en n8n (para Andrés)

En n8n ya existe la credencial **`CSN Dany Token`** que usa Daniel CSN.
Andrés puede pedir a Alejandro que comparta el valor del secreto `dany-webhook` en GCP
y crear una credencial del mismo tipo:

| Campo en n8n | Valor |
|--------------|-------|
| **Tipo** | `httpHeaderAuth` |
| **Header Name** | `X-Dany-Token` |
| **Header Value** | El valor del secreto `dany-webhook` en GCP Secret Manager |

> El valor NO se guarda en n8n de forma visible — se pega en el campo de la credencial
> y n8n lo inyecta en cada request automáticamente.

### Comportamiento de seguridad

```
DANY_SYSTEM_TOKEN configurado en Cloud Run  →  valida el header, rechaza si no coincide (401)
DANY_SYSTEM_TOKEN vacío o no montado        →  acepta cualquier valor (modo abierto)
```

**Actualmente en producción:** el secreto `dany-webhook` SÍ está montado como
`DANY_SYSTEM_TOKEN` en Cloud Run. Cualquier request sin el header correcto recibe `401`.

### ⚠️ CRÍTICO — Deploy en Cloud Run

El comando `--set-secrets` sobreescribe TODOS los secretos previos si no se incluyen juntos.
**Siempre deployar con los 4 secretos al mismo tiempo:**

```bash
gcloud run services update csn-api-prod \
  --region us-central1 \
  --set-secrets "DATABASE_URL=csn-database-url-prod:latest,\
SECRET_KEY=csn-secret-key-prod:latest,\
GEMINI_API_KEY=gemini-api-key:latest,\
DANY_SYSTEM_TOKEN=dany-webhook:latest"
```

Para staging (misma lógica, diferentes secretos):
```bash
gcloud run services update csn-api-staging \
  --region us-central1 \
  --set-secrets "DATABASE_URL=csn-database-url-staging:latest,\
SECRET_KEY=csn-secret-key-staging:latest,\
GEMINI_API_KEY=gemini-api-key:latest,\
DANY_SYSTEM_TOKEN=dany-webhook:latest"
```

### Variables de entorno completas en producción

| Variable de entorno | Secreto en Secret Manager | Propósito |
|---------------------|--------------------------|-----------|
| `DATABASE_URL` | `csn-database-url-prod` | Conexión a PostgreSQL (Neon.tech) |
| `SECRET_KEY` | `csn-secret-key-prod` | Firma de tokens JWT para usuarios humanos |
| `GEMINI_API_KEY` | `gemini-api-key` | Clasificación IA de tickets con Gemini |
| `DANY_SYSTEM_TOKEN` | `dany-webhook` | Autenticación de los agentes n8n → backend |

> **Nota operativa:** Si `GEMINI_API_KEY` devuelve 403 (sin acceso al modelo), la clasificación
> cae al fallback de reglas por palabras clave con ~22% de confianza vs 80–95% con IA real.
> Requiere generar una nueva key desde `aistudio.google.com` vinculada al proyecto GCP.

### Cómo se autentican los humanos (solo referencia)

Los agentes humanos, admins y tiendas usan un flujo diferente:
```
POST /api/v1/auth/login  →  { email, password }  →  JWT Bearer token (expira 8h)
```
**Los agentes automáticos NO usan este flujo.**

---

## Flujo completo — cómo crear un ticket

```
1. Tienda escribe problema en Slack
         │
         ▼
2. Registrar sesión  ──►  POST /dany/sesion/iniciar
         │
         ▼
3. Clasificar problema  ──►  POST /ai/classify
         │                   Devuelve: tipificacion_id, area, confianza
         ▼
4. Crear ticket  ──►  POST /tickets/desde-dany
         │            Con tienda_id + resultado del classify
         │            Devuelve: folio, agente asignado, SLA
         ▼
5. Cerrar sesión  ──►  POST /dany/sesion/cerrar
                       Indica si se resolvió sin ticket o se escaló
```

El `tienda_id` (número económico de la tienda) lo debe conocer Daniel Slack del contexto
de Slack — por canal, por usuario mapeado, o por configuración del workspace.

---

## Endpoints detallados

### 1 — Registrar sesión

```http
POST /api/v1/dany/sesion/iniciar
X-Dany-Token: <token>
Content-Type: application/json

{
  "tienda_id": 749,
  "sesion_id": "slack-U123ABC-1746490000000",
  "tienda_nombre": "PANZACOLA"
}
```

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `tienda_id` | int | Número económico de la tienda |
| `sesion_id` | string | ID único por conversación — generar uno nuevo cada vez |
| `tienda_nombre` | string | Nombre de la tienda (solo para logs) |

Generar el `sesion_id` así en n8n:
```
slack-{{ $json.userId }}-{{ Date.now() }}
```

**Respuesta:**
```json
{
  "sesion_id": "slack-test-001",
  "tienda_id": 749,
  "mensaje": "Sesión registrada"
}
```

---

### 2 — Clasificar el problema

```http
POST /api/v1/ai/classify
X-Dany-Token: <token>
Content-Type: application/json

{
  "descripcion": "El aire acondicionado no enciende desde el corte de luz",
  "tienda_id": 749
}
```

**Respuesta:**
```json
{
  "area_tecnica": "SISTEMAS",
  "tipificacion_id": 4,
  "tipificacion_nombre": "No imprime / atascada / sin papel",
  "categoria": "Equipo de cómputo hardware",
  "subcategoria": null,
  "confianza": 60,
  "urgencia_sugerida": "ALTA",
  "razon": "[Fallback reglas] impresora, imprime",
  "palabras_detectadas": ["impresora", "imprime"]
}
```

Guardar en variables n8n: `tipificacion_id`, `area_tecnica`, `confianza`.

> Si `confianza < 40` el ticket se crea en revisión manual sin agente asignado.
> Con `GEMINI_API_KEY` activo la confianza sube a 80–95%. Sin acceso al modelo,
> cae a fallback por palabras clave con ~60% de confianza.

---

### 3 — Crear el ticket

```http
POST /api/v1/tickets/desde-dany
X-Dany-Token: <token>
Content-Type: application/json

{
  "tienda_id": 749,
  "sesion_id": "slack-U123ABC-1746490000000",
  "descripcion": "El aire acondicionado no enciende desde el corte de luz",
  "ia_area": "MANTENIMIENTO",
  "tipificacion_id": 46,
  "ia_tipificacion_id": 46,
  "ia_confianza": 87,
  "pasos_intentados": "Se revisó el interruptor principal, sigue sin encender"
}
```

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `tienda_id` | int | ✅ | Número económico de la tienda |
| `sesion_id` | string | ✅ | El mismo generado en el paso 1 |
| `descripcion` | string | ✅ | Texto del problema como lo describió la tienda |
| `ia_area` | string | ✅ | `area_tecnica` devuelto por `/ai/classify` |
| `tipificacion_id` | int | Opcional | `tipificacion_id` del classify |
| `ia_tipificacion_id` | int | Opcional | Mismo valor que `tipificacion_id` |
| `ia_confianza` | int | Opcional | 0–100, valor de `confianza` del classify |
| `pasos_intentados` | string | Opcional | Pasos que la tienda ya intentó antes de escalar |

> **n8n serializa números como strings.** El backend los convierte automáticamente —
> `"tienda_id": "749"` y `"tienda_id": 749` son equivalentes.

**Respuesta exitosa (201):**
```json
{
  "ticket_id": 34,
  "folio": "TKT-2026-00007",
  "estatus": "ASIGNADO",
  "sla_limite": "2026-05-19T17:47:00",
  "sla_status": "VERDE",
  "grupo_nombre": "Sistemas: Soporte",
  "agente_nombre": "Karen Aboytes Trejo",
  "mensaje": "Ticket TKT-2026-00007 creado. Asignado a Karen Aboytes Trejo"
}
```

Mostrar el `folio` y el `mensaje` a la tienda en Slack como confirmación.

---

### 4 — Cerrar sesión

```http
POST /api/v1/dany/sesion/cerrar
X-Dany-Token: <token>
Content-Type: application/json

{
  "sesion_id": "slack-U123ABC-1746490000000",
  "resuelto_sin_ticket": false,
  "mensajes_count": 8,
  "tipificacion_detectada": "MANTENIMIENTO"
}
```

| Campo | Descripción |
|-------|-------------|
| `resuelto_sin_ticket` | `true` si Daniel resolvió sin ticket, `false` si creó ticket |
| `mensajes_count` | Número de mensajes intercambiados en la sesión |
| `tipificacion_detectada` | Área técnica detectada |

**Respuesta:**
```json
{
  "sesion_id": "slack-test-001",
  "deflexion": false,
  "mensaje": "Escalación registrada — ticket creado"
}
```

Si `resuelto_sin_ticket: true`, `deflexion` viene en `true` y el mensaje dice `"Sesión cerrada — problema resuelto sin ticket"`.

Esto alimenta las métricas de deflexión de Daniel en el dashboard de CSN.

---

## Estructura en n8n — cómo lo hace Daniel CSN (para replicar)

Daniel CSN usa subworkflows independientes, cada uno con un nodo **HTTP Request**
y la credencial `CSN Dany Token`. Andrés puede replicar exactamente la misma estructura.

**Body del ticket en expression mode (copiado de Daniel CSN):**
```json
{
  "tienda_id": {{ parseInt($json.tienda_id) }},
  "sesion_id": "{{ $json.sesion_id }}",
  "descripcion": "{{ $json.descripcion }}",
  "ia_area": "{{ $json.ia_area }}",
  "pasos_intentados": "{{ $json.pasos_intentados }}",
  "tipificacion_id": {{ parseInt($json.tipificacion_id) }},
  "ia_confianza": {{ parseFloat($json.ia_confianza) }}
}
```

> Los nombres de tools en n8n deben usar `snake_case` (ej. `cerrar_sesion`),
> nunca guiones — n8n no los acepta en nombres de tools.

---

## Catálogo de valores

### Áreas técnicas
`ABASTO` · `SISTEMAS` · `MANTENIMIENTO` · `FINANZAS` · `COMERCIAL` · `RRHH` · `OPERACIONES`

### Estatus del ticket
| Valor | Significado |
|-------|-------------|
| `NUEVO` | Creado, sin agente asignado |
| `ASIGNADO` | Agente asignado por Round Robin automático |
| `EN_PROCESO` | Agente trabajando activamente |
| `ESPERANDO_TIENDA` | Agente envió solución, tienda debe confirmar |
| `RESUELTO` | Tienda confirmó la solución |
| `RECHAZADO` | Tienda rechazó — vuelve a EN_PROCESO con prioridad más alta |
| `CERRADO` | Estado final |

### Prioridades
`CRITICA` · `ALTA` · `MEDIA` · `BAJA`

---

## Errores comunes

| Código | Mensaje | Causa | Solución |
|--------|---------|-------|----------|
| `401` | `"Token Dany inválido"` | `X-Dany-Token` incorrecto o ausente | Verificar que el header se envía con el valor de `dany-webhook` en GCP |
| `401` | `"Token Dany inválido"` | `DANY_SYSTEM_TOKEN` se desmontó en un redeploy | Volver a deployar con los 4 secretos juntos |
| `422` | `"Tienda no encontrada"` | `tienda_id` no existe en la DB | Verificar número económico con Alejandro |
| `400` | `"tienda_id es requerido"` | Campo vacío o null | Asegurar que n8n mapea el `tienda_id` antes de llamar |
| `500` | Error interno | Bug o DB | Revisar logs en GCP → Cloud Run → csn-api-prod → Logs |

---

## Checklist antes de conectar a prod

- [ ] Obtener el valor del secreto `dany-webhook` en GCP Secret Manager
- [ ] Crear credencial `httpHeaderAuth` en n8n: `Header Name: X-Dany-Token`, `Header Value: <valor>`
- [ ] `tienda_id` mapeado desde el contexto de Slack (canal, usuario o config)
- [ ] `sesion_id` único generado por conversación
- [ ] Flujo completo probado en staging con una tienda real
- [ ] Ticket aparece en el portal CSN con folio correcto
- [ ] `resuelto_sin_ticket: true` registra deflexión en KPIs de CSN
- [ ] Folio del ticket se muestra a la tienda en Slack como confirmación

---

## Pruebas realizadas y validadas

Flujo completo probado el **2026-05-05** contra staging y producción con resultado exitoso:

| Paso | Endpoint | Resultado |
|------|----------|-----------|
| Classify | `POST /ai/classify` | ✅ `tipificacion_id: 4`, confianza 60% (fallback) |
| Sesión | `POST /dany/sesion/iniciar` | ✅ `"Sesión registrada"` |
| Ticket staging | `POST /tickets/desde-dany` | ✅ `TKT-2026-00001` asignado a Karen Aboytes |
| Cerrar sesión | `POST /dany/sesion/cerrar` | ✅ deflexión registrada |
| Ticket prod | `POST /tickets/desde-dany` | ✅ `TKT-2026-00007` asignado en Sistemas: Soporte |

---

*Última actualización: 2026-05-05 — Alejandro Sánchez / CSN*
