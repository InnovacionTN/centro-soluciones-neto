# CSN Backend — Guía de integración para agentes

Documentación técnica para integrar agentes automáticos (Daniel CSN y Daniel Slack) con el
backend de **Centro Soluciones Neto (CSN)**. Escrita para Andrés, quien desarrolla Daniel Slack.

---

## Contexto del sistema

CSN es un sistema de tickets de soporte para tiendas Neto. Las tiendas reportan problemas,
el backend los clasifica con IA (Gemini), los asigna automáticamente a un agente humano y les
da seguimiento hasta resolución.

### Los dos Danieles — mismo backend, distinto canal

| | **Daniel CSN** | **Daniel Slack** |
|--|----------------|------------------|
| **Qué es** | Agente IA en el portal web de la tienda | Agente IA en Slack |
| **Dónde vive** | n8n — subworkflows del portal CSN | n8n — flujo de Slack (Andrés) |
| **Cómo crea tickets** | `POST /tickets/desde-dany` | `POST /tickets/desde-dany` — **igual** |
| **Autenticación** | `X-Dany-Token` header | `X-Dany-Token` header — **igual** |
| **Estado** | ✅ Producción | 🔧 En desarrollo |

Daniel Slack debe comportarse exactamente igual que Daniel CSN a nivel de API.
El backend no distingue de dónde viene el request, solo valida el token.

---

## Entornos

| Entorno | URL base | Docs interactivos |
|---------|----------|-------------------|
| **Producción** | `https://csn-api-prod-312707215871.us-central1.run.app` | [/docs](https://csn-api-prod-312707215871.us-central1.run.app/docs) |
| **Staging** | `https://csn-api-staging-312707215871.us-central1.run.app` | [/docs](https://csn-api-staging-312707215871.us-central1.run.app/docs) |

> Los workflows actuales de Daniel CSN en n8n apuntan a una URL anterior del mismo servicio:
> `https://csn-api-prod-xdngdvdxua-uc.a.run.app` — ambas URLs funcionan y apuntan al mismo backend.
> Para Daniel Slack usar las URLs de arriba (`312707215871`).

Todos los endpoints van con el prefijo `/api/v1/`:
```
POST https://csn-api-prod-312707215871.us-central1.run.app/api/v1/tickets/desde-dany
```

---

## Autenticación — X-Dany-Token

Los agentes automáticos **no usan login ni JWT**. Usan un header fijo en cada request:

```
X-Dany-Token: <valor>
```

### Cómo funciona

El backend valida ese header contra la variable de entorno `DANY_SYSTEM_TOKEN`.
**Esa variable no está configurada en ningún entorno actualmente**, lo que significa que
el backend acepta cualquier valor — incluso un string vacío.

```python
# security.py — comportamiento actual
if not s.DANY_SYSTEM_TOKEN:
    return  # acepta cualquier token → modo abierto
```

### Cómo obtener el token en n8n (para Andrés)

En n8n ya existe la credencial **`CSN Dany Token`** que usa Daniel CSN.
Andrés debe pedirle a Alejandro acceso a esa credencial, o crear una nueva del mismo tipo:

| Campo en n8n | Valor |
|--------------|-------|
| Tipo | `httpHeaderAuth` |
| Header Name | `X-Dany-Token` |
| Header Value | Cualquier string (ej. `daniel-slack-token`) — actualmente el backend acepta cualquier valor |

> **Para producción real:** Se recomienda que Alejandro configure `DANY_SYSTEM_TOKEN`
> como variable de entorno en Cloud Run y que ambos agentes usen ese mismo valor.
> Por ahora el sistema funciona sin él.

### Cómo se autentican los humanos (solo referencia)

Los agentes humanos, admins y tiendas que usan el portal CSN se autentican diferente:
```
POST /api/v1/auth/login  →  { email, password }  →  JWT Bearer token (expira 8h)
```
Los agentes automáticos **no usan este flujo**.

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
X-Dany-Token: daniel-slack-token
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

**Genera el `sesion_id` así en n8n:**
```
slack-{{ $json.userId }}-{{ Date.now() }}
```

---

### 2 — Clasificar el problema

```http
POST /api/v1/ai/classify
X-Dany-Token: daniel-slack-token
Content-Type: application/json

{
  "descripcion": "El aire acondicionado no enciende desde el corte de luz",
  "tienda_id": 749
}
```

**Respuesta:**
```json
{
  "area_tecnica": "MANTENIMIENTO",
  "tipificacion_id": 46,
  "tipificacion_nombre": "Equipo climatización sin energía",
  "categoria": "Climatización",
  "confianza": 87,
  "urgencia_sugerida": "ALTA",
  "razon": "Detectadas palabras clave: 'aire acondicionado', 'no enciende', 'corte de luz'",
  "palabras_detectadas": ["aire acondicionado", "no enciende", "corte de luz"]
}
```

Guardar en variables de n8n: `tipificacion_id`, `area_tecnica`, `confianza`.

> Si `confianza < 40` el ticket igual se crea pero queda en revisión manual sin agente asignado.

---

### 3 — Crear el ticket

```http
POST /api/v1/tickets/desde-dany
X-Dany-Token: daniel-slack-token
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

> **n8n serializa números como strings por defecto.** El backend los convierte automáticamente,
> así que `"tienda_id": "749"` y `"tienda_id": 749` son equivalentes.

**Respuesta exitosa (201):**
```json
{
  "folio": "TKT-2026-01024",
  "id": 1024,
  "estatus": "ASIGNADO",
  "prioridad": "ALTA",
  "area_tecnica": "MANTENIMIENTO",
  "agente_nombre": "Carlos López",
  "sla_limite": "2026-05-06T10:00:00",
  "grupo_nombre": "Mantenimiento: Centro"
}
```

Mostrar el `folio` a la tienda en Slack como número de referencia del ticket.

---

### 4 — Cerrar sesión

```http
POST /api/v1/dany/sesion/cerrar
X-Dany-Token: daniel-slack-token
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
| `mensajes_count` | Número de mensajes intercambiados |
| `tipificacion_detectada` | Área técnica del problema |

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

---

## Catálogo de valores

### Áreas técnicas
`ABASTO` · `SISTEMAS` · `MANTENIMIENTO` · `FINANZAS` · `COMERCIAL` · `RRHH` · `OPERACIONES`

### Estatus del ticket
| Valor | Significado |
|-------|-------------|
| `NUEVO` | Creado, sin agente asignado |
| `ASIGNADO` | Agente asignado por Round Robin |
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
| `401` | `"Token Dany inválido"` | Header `X-Dany-Token` incorrecto | Verificar que el header se está enviando |
| `422` | `"Tienda no encontrada"` | `tienda_id` no existe en la DB | Verificar número económico con Alejandro |
| `400` | `"tienda_id es requerido"` | Campo vacío o null | Asegurar que n8n mapea el tienda_id |
| `422` | `"sesion_id"` requerido | Falta el campo | Generar ID antes de llamar |
| `500` | Error interno | Bug o DB | Avisar a Alejandro con el folio o timestamp |

---

## Checklist antes de conectar a prod

- [ ] Credencial `httpHeaderAuth` creada en n8n con `X-Dany-Token` (o reusar `CSN Dany Token`)
- [ ] `tienda_id` mapeado desde el contexto de Slack
- [ ] `sesion_id` único generado por conversación
- [ ] Flujo completo probado en staging con una tienda real
- [ ] Ticket aparece en el portal CSN con folio correcto
- [ ] `resuelto_sin_ticket: true` se registra correctamente en KPIs
- [ ] Folio del ticket se muestra a la tienda en Slack como confirmación

---

*Última actualización: 2026-05-05 — Alejandro Sánchez / CSN*
