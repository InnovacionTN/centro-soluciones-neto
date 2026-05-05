# CSN Backend — Guía de integración para agentes

Documentación técnica para clasificar y crear tickets en el sistema **Centro Soluciones Neto (CSN)**.  
Dirigida a desarrolladores que integren un agente automatizado (n8n, LLM, bot, etc.) con el backend.

---

## Entornos

| Entorno | URL base | Docs interactivos | Cuándo usar |
|---------|----------|-------------------|-------------|
| **Staging** | `https://csn-api-staging-312707215871.us-central1.run.app` | [/docs](https://csn-api-staging-312707215871.us-central1.run.app/docs) | Desarrollo, pruebas, integración de nuevas features |
| **Producción** | `https://csn-api-prod-312707215871.us-central1.run.app` | [/docs](https://csn-api-prod-312707215871.us-central1.run.app/docs) | Solo flujos validados en staging primero |

> **Regla:** Toda integración nueva se prueba en **staging** primero. No conectar un agente directamente a producción sin haber validado el flujo completo.

Todos los endpoints tienen el prefijo `/api/v1/`. Ejemplo completo:
```
POST https://csn-api-staging-312707215871.us-central1.run.app/api/v1/tickets
```

---

## Autenticación

El sistema usa **JWT Bearer Token**. El token se obtiene con login y se envía en cada request.

### 1. Obtener token

```http
POST /api/v1/auth/login
Content-Type: application/json

{
  "email": "agente@csn.com",
  "password": "tu-password"
}
```

**Respuesta exitosa (200):**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer",
  "rol": "AGENTE",
  "nombre": "Carlos López",
  "tienda_id": null
}
```

### 2. Usar el token en cada request

```http
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

> El token no expira automáticamente en dev, pero en producción se recomienda renovarlo al inicio de cada sesión del agente.

---

## Flujo principal: Clasificar y crear un ticket

El flujo recomendado es en **dos pasos**: primero clasificar (para entender el problema), luego crear el ticket con la tipificación confirmada.

```
[Descripción libre del problema]
        │
        ▼
POST /ai/classify  ←── Devuelve tipificacion_id + confianza
        │
        ▼
POST /tickets  ←── Crea el ticket con tipificacion_id confirmado
        │
        ▼
[Ticket creado: folio, SLA calculado, agente asignado automáticamente]
```

---

## Paso 1 — Clasificar el problema

```http
POST /api/v1/ai/classify
Authorization: Bearer <token>
Content-Type: application/json

{
  "descripcion": "La caja registradora no enciende después del corte de luz",
  "tienda_id": 42
}
```

**Respuesta (200):**
```json
{
  "area_tecnica": "SISTEMAS",
  "tipificacion_id": 7,
  "tipificacion_nombre": "Equipo sin energía / falla eléctrica",
  "categoria": "Hardware",
  "confianza": 87,
  "urgencia_sugerida": "ALTA",
  "razon": "Detectadas palabras clave: 'caja registradora', 'no enciende', 'corte de luz'",
  "palabras_detectadas": ["caja registradora", "no enciende", "corte de luz"]
}
```

| Campo | Descripción |
|-------|-------------|
| `tipificacion_id` | ID a usar en el siguiente paso para crear el ticket |
| `confianza` | 0–100. Si es < 50, considera mostrar opciones al usuario |
| `urgencia_sugerida` | Define la prioridad del ticket (`CRITICA`, `ALTA`, `MEDIA`, `BAJA`) |
| `razon` | Explicación legible de por qué eligió esa tipificación |

---

## Paso 2 — Crear el ticket

Una vez clasificado (o si el usuario confirmó/corrigió la tipificación), crea el ticket.

```http
POST /api/v1/tickets
Authorization: Bearer <token>
Content-Type: application/json

{
  "descripcion": "La caja registradora no enciende después del corte de luz",
  "tipificacion_id": 7,
  "ia_clasificacion_aceptada": true
}
```

**Campos del body:**

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `descripcion` | string | ✅ | Texto libre del problema reportado |
| `tipificacion_id` | int | Opcional | Si se confirma o corrige la sugerencia de la IA. Si se omite, se usa la sugerencia automáticamente |
| `ia_clasificacion_aceptada` | bool | Opcional | `true` si se aceptó la sugerencia; `false` si el usuario la modificó. Afecta métricas internas |
| `metadata_extra` | object | Opcional | Campos adicionales libres (ej. número de serie, folio externo) |

> **Nota:** El `tienda_id` se toma automáticamente del token del usuario autenticado.  
> Si el agente crea tickets en nombre de una tienda, debe autenticarse con las credenciales de esa tienda.

**Respuesta exitosa (201):**
```json
{
  "id": 1024,
  "folio": "TKT-2026-01024",
  "estatus": "ASIGNADO",
  "prioridad": "ALTA",
  "tipo": "INCIDENCIA",
  "descripcion": "La caja registradora no enciende después del corte de luz",
  "solucion_propuesta": null,
  "ia_sugerencia_solucion": "Verificar interruptor de protección eléctrica...",
  "ia_confianza": 87,
  "ia_clasificacion_aceptada": true,
  "sla_limite": "2026-05-04T18:00:00",
  "sla_vencido": false,
  "fecha_apertura": "2026-05-04T10:00:00",
  "fecha_primera_respuesta": null,
  "fecha_cierre": null,
  "tienda_id": 42,
  "agente_id": 5,
  "tipificacion": {
    "id": 7,
    "area_tecnica": "SISTEMAS",
    "categoria": "Hardware",
    "problema": "Equipo sin energía / falla eléctrica",
    "tipo": "INCIDENCIA",
    "sla_horas": 8,
    "urgencia": "ALTA"
  },
  "eventos": [
    {
      "id": 1,
      "accion": "CREACION",
      "estado_anterior": null,
      "estado_nuevo": "NUEVO",
      "comentario": "Ticket creado vía API",
      "tipo_comentario": "PUBLICO",
      "timestamp": "2026-05-04T10:00:00",
      "usuario": { "id": 10, "nombre": "Bot Dany", "rol": "TIENDA" }
    }
  ]
}
```

---

## Ciclo de vida de un ticket

```
  NUEVO ──────────────────────────────────────────────────────────────────────────┐
     │                                                                            │
     └──► ASIGNADO (asignación automática)                                        │
               │                                                                  │
               ▼                                                                  │
          EN_PROCESO (agente toma el ticket)                                      │
               │                                                                  │ CANCELADO
               ▼                                                                  │ (solo ADMIN)
        ESPERANDO_TIENDA (agente envía solución propuesta)                        │
          /           \                                                           │
         ▼             ▼                                                          │
      RESUELTO      RECHAZADO ──► EN_PROCESO (reintento, prioridad sube)         │
         │                                                                        │
         ▼                                                                        │
      CERRADO ◄───────────────────────────────────────────────────────────────────┘
```

### Transiciones válidas por estado

| Estado actual | Puede ir a | ¿Quién puede hacerlo? |
|---------------|-----------|----------------------|
| `NUEVO` | `EN_PROCESO` | AGENTE, ADMIN |
| `ASIGNADO` | `EN_PROCESO` | AGENTE, ADMIN |
| `EN_PROCESO` | `ESPERANDO_TIENDA` | AGENTE, ADMIN (requiere `solucion_propuesta` ≥ 10 chars) |
| `ESPERANDO_TIENDA` | `RESUELTO` | TIENDA, ADMIN |
| `ESPERANDO_TIENDA` | `RECHAZADO` | TIENDA, ADMIN (requiere `comentario` ≥ 5 chars) |
| `RECHAZADO` | `EN_PROCESO` | AGENTE, ADMIN |
| `RESUELTO` | `CERRADO` | AGENTE, ADMIN |
| Cualquier activo | `CANCELADO` | Solo ADMIN |

> **Al rechazar:** La prioridad sube automáticamente a `ALTA` si estaba en `BAJA` o `MEDIA`.

---

## Otros endpoints útiles

### Consultar tipificaciones disponibles

Útil para mostrar un selector al usuario si la IA tiene baja confianza.

```http
GET /api/v1/tipificaciones
GET /api/v1/tipificaciones?area=SISTEMAS
Authorization: Bearer <token>
```

Áreas válidas: `ABASTO`, `SISTEMAS`, `MANTENIMIENTO`, `FINANZAS`, `COMERCIAL`, `RRHH`

---

### Consultar o actualizar un ticket

```http
GET /api/v1/tickets/{ticket_id}
Authorization: Bearer <token>
```

```http
PATCH /api/v1/tickets/{ticket_id}
Authorization: Bearer <token>
Content-Type: application/json

{
  "estatus": "RESUELTO",
  "comentario": "La solución funcionó correctamente"
}
```

---

### Listar tickets

```http
GET /api/v1/tickets
GET /api/v1/tickets?estatus=EN_PROCESO&area=SISTEMAS&limit=20&offset=0
Authorization: Bearer <token>
```

Filtros disponibles: `estatus`, `area`, `prioridad`, `solo_mios` (bool), `limit` (máx 200), `offset`

> La respuesta está filtrada automáticamente por rol: TIENDA solo ve sus tickets, AGENTE ve los de su grupo.

---

### Subir evidencia a un ticket

```http
POST /api/v1/tickets/{ticket_id}/evidencias
Authorization: Bearer <token>
Content-Type: multipart/form-data

file: <archivo>
```

Formatos permitidos: `jpg`, `png`, `webp`, `gif`, `mp4`, `mov`, `pdf`  
Tamaño máximo: **10 MB**

---

### Escalar un ticket a otro grupo

```http
POST /api/v1/tickets/{ticket_id}/escalar
Authorization: Bearer <token>
Content-Type: application/json

{
  "grupo_destino_id": 3,
  "motivo": "El problema es de infraestructura de red, no de caja"
}
```

El `motivo` debe tener mínimo 10 caracteres. El ticket vuelve a estado `ASIGNADO` con un nuevo agente del grupo destino.

---

## Catálogo de valores (enums)

### Estatus del ticket
| Valor | Descripción |
|-------|-------------|
| `NUEVO` | Recién creado, sin agente asignado |
| `ASIGNADO` | Agente asignado automáticamente, aún no tomado |
| `EN_PROCESO` | Agente trabajando activamente |
| `ESPERANDO_TIENDA` | Solución enviada, esperando confirmación de la tienda |
| `RESUELTO` | Tienda confirmó que el problema está resuelto |
| `RECHAZADO` | Tienda rechazó la solución propuesta |
| `CERRADO` | Estado final, sin más acciones posibles |
| `CANCELADO` | Cancelado por admin |

### Prioridad
| Valor | Urgencia equivalente |
|-------|---------------------|
| `CRITICA` | Requiere atención inmediata |
| `ALTA` | Atención en pocas horas |
| `MEDIA` | Atención en el día |
| `BAJA` | Sin urgencia inmediata |

### Roles de usuario
| Valor | Descripción |
|-------|-------------|
| `ADMIN` | Acceso total, puede cancelar tickets |
| `AGENTE` | Agente de soporte, pertenece a un grupo técnico |
| `TIENDA` | Usuario de tienda, abre tickets y confirma soluciones |

### Áreas técnicas
`ABASTO` · `SISTEMAS` · `MANTENIMIENTO` · `FINANZAS` · `COMERCIAL` · `RRHH`

---

## Consideraciones especiales para agentes automáticos (Dany / bots)

1. **Tickets resueltos directamente:** Si el agente (Dany) resolvió el problema en el chat sin escalar, puede crear el ticket directamente en estado `RESUELTO` usando el flujo normal de creación + PATCH inmediato.

2. **`tienda_id` en el token:** El agente debe autenticarse con credenciales de rol `TIENDA`. El sistema toma el `tienda_id` del token — no hay que enviarlo en el body.

3. **Confianza de la IA baja (< 50):** Si `confianza` es menor a 50, considera mostrar al usuario las tipificaciones del área sugerida (`GET /tipificaciones?area=...`) para que elija manualmente antes de crear el ticket.

4. **`ia_clasificacion_aceptada`:**  
   - `true` si el usuario no modificó la sugerencia de la IA  
   - `false` si el usuario eligió una tipificación diferente  
   - Omitir si se usa la IA sin intervención humana (se asume `true`)

5. **Reintentos:** La API no es idempotente en `POST /tickets`. Si el agente tiene dudas sobre si el ticket fue creado, primero consultar `GET /tickets?estatus=NUEVO` para evitar duplicados.

---

## Errores comunes

| Código | Causa probable | Solución |
|--------|---------------|----------|
| `401` | Token inválido o no enviado | Renovar token con `/auth/login` |
| `403` | Rol sin permiso para esa acción | Verificar que el rol del usuario puede ejecutar esa transición |
| `400 "Transición no permitida"` | Cambio de estado no válido según el ciclo de vida | Revisar la tabla de transiciones válidas |
| `400 "Debes describir la solución"` | `solucion_propuesta` vacío al pasar a `ESPERANDO_TIENDA` | Incluir texto de al menos 10 caracteres |
| `400 "Debes indicar por qué rechazas"` | `comentario` vacío al rechazar | Incluir motivo de al menos 5 caracteres |
| `404` | Ticket o recurso no existe | Verificar el `ticket_id` |

---

*Última actualización: 2026-05-04*