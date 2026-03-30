# API Reference — Agentes IA externos (Dany · Javier)

Guía técnica para desarrolladores de agentes conversacionales integrados con Centro de Soluciones Neto (CSN).

**Base URL producción:** `https://csn-prod.web.app/api/v1`
**Base URL staging:** `https://csn-staging.web.app/api/v1`
**Swagger interactivo:** `http://localhost:8000/docs` (solo desarrollo)

---

## Arquitectura de cada agente

### Dany — Agente IA de primer contacto (Slack + Portal CSN)

```
[Tienda en Slack]          [Tienda en portal CSN]
       │                            │
       └──────────┬─────────────────┘
                  ▼
         n8n webhook (Dany)
         Gemini 2.5 Pro LangChain
         Memoria en PostgreSQL de n8n (NO en CSN DB)
         Herramientas: precios, promociones, hardware, fotos
                  │
         accion: "continuar" ──→ sigue el chat
         accion: "escalar"   ──→ frontend CSN crea ticket vía POST /tickets
```

**Puntos clave:**
- Dany **no escribe directamente en la base de datos de CSN**. La memoria de conversación vive en el PostgreSQL propio de n8n.
- El portal CSN llama `POST /dany/chat` (proxy server-side) para evitar CORS del navegador.
- El resultado `accion: "escalar"` indica al frontend que debe abrir el modal de ticket y llamar `POST /tickets`.
- Dany solo retorna dos valores de `accion`: **`continuar`** y **`escalar`**. No existe `accion: "resuelto"`.

### Javier — Agente WhatsApp (sistema propio con BD propia)

```
[Tienda en WhatsApp]
       │
   Servidor Javier
   BD propia (PostgreSQL Javier)
       │
   POST /api/v1/tickets/intake  ──→  CSN DB
```

**Puntos clave:**
- Javier tiene su propia base de datos con un esquema diferente al de CSN.
- Usa el endpoint **`POST /tickets/intake`** que acepta el formato nativo de Javier y hace el mapeo internamente.
- Requiere credencial de servicio con rol **`AGENTE`** (no TIENDA, porque el usuario de tienda no sería real).

---

## 1. Autenticación

Todos los endpoints (excepto `/auth/login`) requieren un token JWT en el header:

```
Authorization: Bearer <access_token>
```

### Obtener token

```
POST /auth/login
Content-Type: application/json
```

```json
{
  "email": "javier-bot@soyneto.com",
  "password": "****"
}
```

**Respuesta exitosa (200):**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer",
  "usuario": {
    "id": 15,
    "nombre": "Javier Bot",
    "email": "javier-bot@soyneto.com",
    "rol": "AGENTE"
  }
}
```

> El token dura **480 minutos (8h)**. Guarda el token en memoria y renuévalo solo cuando recibas un `401`.

### Usuarios de servicio

Solicita al administrador de CSN que cree usuarios con:

| Bot | Rol requerido | Motivo |
|---|---|---|
| Dany | `TIENDA` + tienda asignada | El frontend del portal crea el ticket como si fuera la tienda |
| Javier | `AGENTE` | El intake endpoint requiere AGENTE o ADMIN para hacer lookup de tienda por nombre |

---

## 2. Integración Dany ↔ n8n

### 2a. Proxy de chat (portal CSN → n8n)

El portal CSN llama este endpoint en el servidor (server-side) para evitar CORS.
**Solo el frontend de CSN usa este endpoint — Javier no.**

```
POST /dany/chat
Authorization: Bearer <token_de_tienda>
Content-Type: application/json
```

**Payload:**
```json
{
  "mensaje": "No tenemos internet desde las 8am",
  "tienda_id": 749,
  "tienda_nombre": "PANZACOLA",
  "sesion_id": "sess_abc123",
  "historial": [
    { "de": "dany", "texto": "Hola, ¿en qué puedo ayudarte?", "tiempo": "2026-03-30T10:00:00" },
    { "de": "user", "texto": "No tenemos internet", "tiempo": "2026-03-30T10:01:00" }
  ]
}
```

**Respuesta del webhook n8n — `accion: continuar`:**
```json
{
  "respuesta": "Entendido. ¿Ya intentaron reiniciar el router?",
  "accion": "continuar"
}
```

**Respuesta del webhook n8n — `accion: escalar`:**
```json
{
  "respuesta": "Este problema requiere revisión del Call Center. Te recomiendo abrir un ticket.",
  "accion": "escalar",
  "resumen": "Sin internet desde las 8am. Router reiniciado sin éxito. Posible falla de antena."
}
```

> `accion` solo tiene dos valores posibles: **`continuar`** y **`escalar`**.
> No existe `accion: "resuelto"` — si Dany resolvió el problema, simplemente continúa el chat y termina la sesión.

### 2b. Qué hace el frontend al recibir `escalar`

1. Muestra el `resumen` de Dany como contexto prefilled en el formulario.
2. Llama `POST /ai/classify` con el resumen para obtener `tipificacion_id`.
3. Llama `POST /tickets` con la descripción completa de la conversación.
4. El agente del Call Center recibe el ticket en su cola.

### 2c. Configuración n8n requerida

El endpoint del webhook n8n se configura en `.env`:
```
DANY_WEBHOOK_URL=https://webhook.soyneto.com/webhook/dany-csn
```

Asegúrate que el workflow de n8n esté activo y el webhook en modo "Production".

---

## 3. Integración Javier — Endpoint de ingesta

Javier usa un endpoint dedicado que acepta su esquema nativo sin necesidad de mapear campos manualmente.

### 3a. Tabla de mapeo de campos

| Campo Javier | Campo CSN | Transformación |
|---|---|---|
| `store_name` | `tienda_id` | Lookup por `nombre ILIKE '%{store_name}%'` |
| `summary` | `descripcion` | Directo; si hay `reason`, se concatena |
| `reason` | `descripcion` (anexo) | Se agrega como "Contexto: {reason}" |
| `priority: "Alta"` | `prioridad: ALTA` | Mapeo directo (insensible a mayúsculas) |
| `priority: "Media"` | `prioridad: MEDIA` | |
| `priority: "Baja"` | `prioridad: BAJA` | |
| `status: "completo"` | `estatus: RESUELTO` | Marca el ticket como resuelto al crearlo |
| `status: "abierto"` | `estatus: ASIGNADO` | El sistema asigna agente normalmente |
| `rating` (1-5) | `csat_score` | Solo se guarda si `status == "completo"` |
| `area` | ignorado | La IA de CSN determina el área automáticamente |
| `sentiment` | `metadata_extra.sentiment` | Guardado en metadata para referencia |
| `javier_folio` | `metadata_extra.javier_folio` | Trazabilidad entre sistemas |
| `customer_phone` | `metadata_extra.customer_phone` | Guardado en metadata |

### 3b. Endpoint de ingesta

```
POST /tickets/intake
Authorization: Bearer <token_de_agente>
Content-Type: application/json
```

**Payload completo:**
```json
{
  "store_name": "PANZACOLA",
  "summary": "No tienen internet desde las 8am, reiniciaron el router sin éxito.",
  "reason": "El técnico externo revisó y dice que es problema del proveedor.",
  "priority": "Alta",
  "status": "abierto",
  "rating": null,
  "area": "OPERACIONES",
  "sentiment": "negativo",
  "javier_folio": "JV-2026-0042",
  "customer_phone": "+527711234567"
}
```

**Payload mínimo:**
```json
{
  "store_name": "PANZACOLA",
  "summary": "No tienen internet desde las 8am."
}
```

**Respuesta exitosa (201):**
```json
{
  "folio": "TKT-2026-00187",
  "ticket_id": 187,
  "estatus": "ASIGNADO",
  "tienda_encontrada": "PANZACOLA",
  "csat_registrado": false
}
```

**Ejemplo — ticket ya resuelto con calificación:**
```json
{
  "store_name": "PANZACOLA",
  "summary": "Problema con la impresora de etiquetas. Se resolvió cambiando el cable USB.",
  "priority": "Baja",
  "status": "completo",
  "rating": 5,
  "javier_folio": "JV-2026-0041"
}
```

**Respuesta (201):**
```json
{
  "folio": "TKT-2026-00186",
  "ticket_id": 186,
  "estatus": "RESUELTO",
  "tienda_encontrada": "PANZACOLA",
  "csat_registrado": true
}
```

> La IA de CSN clasifica automáticamente el ticket (tipificación, área, SLA) usando el `summary`. No necesitas enviar `tipificacion_id`.

### 3c. Flujo recomendado para Javier

```
WhatsApp mensaje recibido
    │
    ├─ Javier resolvió → POST /tickets/intake  { status: "completo", rating: N }
    │
    └─ Javier escaló  → POST /tickets/intake  { status: "abierto" }
                         → guardar ticket_id en BD de Javier para seguimiento
```

---

## 4. Clasificar el problema (opcional)

Si necesitas el `tipificacion_id` antes de crear el ticket (para mostrar al usuario o enrutar manualmente):

```
POST /ai/classify
Authorization: Bearer <token>
Content-Type: application/json
```

```json
{
  "descripcion": "No tenemos internet desde las 8am, reinicié el router y persiste."
}
```

**Respuesta (200):**
```json
{
  "tipificacion_id": 3,
  "area_tecnica": "SISTEMAS",
  "categoria": "Conectividad",
  "problema": "Sin internet o antena sin señal",
  "urgencia": "CRITICA",
  "confianza": 92,
  "sla_horas": 4,
  "solucion_sugerida": "Verificar configuración de antena y reiniciar equipos de red..."
}
```

| Campo | Descripción |
|---|---|
| `tipificacion_id` | ID a pasar en `POST /tickets` |
| `confianza` | 0-100. Si < 60, pide confirmación al usuario antes de escalar |
| `solucion_sugerida` | Texto que Dany puede usar como respuesta antes de decidir si escalar |

> **Nota:** El endpoint `POST /tickets/intake` (Javier) hace la clasificación internamente. No necesitas llamar `/ai/classify` por separado.

---

## 5. Crear ticket (formato CSN nativo)

Solo si necesitas control granular (por ejemplo, Dany al escalar desde el portal):

```
POST /tickets
Authorization: Bearer <token_tienda>
Content-Type: application/json
```

```json
{
  "descripcion": "Sin internet desde las 8am. Resumen de conversación con Dany:\n- Reiniciamos router sin éxito\n- Técnico externo dice que es problema del proveedor\n→ Escalando al Call Center.",
  "tipificacion_id": 3,
  "tipo": "INCIDENCIA",
  "ia_clasificacion_aceptada": true,
  "ia_confianza": 92
}
```

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `descripcion` | string | ✅ | Incluir resumen de toda la conversación |
| `tipificacion_id` | int | ✅ | De `/ai/classify` o `/tipificaciones` |
| `tipo` | string | ✅ | `"INCIDENCIA"` o `"REQUERIMIENTO"` |
| `ia_clasificacion_aceptada` | bool | — | `true` si la IA clasificó; `false` si fue manual |

**Respuesta (201):**
```json
{
  "id": 142,
  "folio": "TKT-2026-00142",
  "estatus": "ASIGNADO",
  "prioridad": "CRITICA",
  "sla_limite": "2026-03-30T14:30:00"
}
```

---

## 6. Errores comunes

| Código | Causa | Solución |
|---|---|---|
| `401 Unauthorized` | Token expirado o inválido | Hacer login de nuevo y actualizar el token |
| `403 Forbidden` | Rol insuficiente | Javier necesita rol `AGENTE`; Dany necesita rol `TIENDA` |
| `422 Unprocessable Entity` | Payload inválido o tienda no encontrada | Revisar `store_name` exacto y campos requeridos |
| `503 Service Unavailable` | Webhook n8n no responde | Verificar que el workflow de Dany esté activo en n8n |

---

## 7. Catálogo de tipificaciones

```
GET /tipificaciones?area=SISTEMAS
Authorization: Bearer <token>
```

Áreas disponibles: `SISTEMAS`, `MANTENIMIENTO`, `ABASTO`, `FINANZAS`, `COMERCIAL`, `RRHH`.

---

## 8. Resumen de endpoints por agente

| Endpoint | Dany | Javier |
|---|---|---|
| `POST /auth/login` | ✅ | ✅ |
| `POST /dany/chat` | ✅ (portal → n8n) | ❌ |
| `POST /tickets/intake` | ❌ | ✅ |
| `POST /tickets` | ✅ (al escalar) | ❌ (usar intake) |
| `POST /ai/classify` | ✅ (opcional) | ❌ (intake lo hace internamente) |
| `GET /tipificaciones` | ✅ | ❌ |

---

## 9. Credenciales de prueba

| Bot | Email | Password | Rol |
|---|---|---|---|
| Dany | dany-bot@soyneto.com | *(configurar en seed)* | TIENDA (tienda 749) |
| Javier | javier-bot@soyneto.com | *(configurar en seed)* | AGENTE |

> Solicitar al administrador que cree estos usuarios en el sistema. El usuario de Javier debe tener rol `AGENTE`.
