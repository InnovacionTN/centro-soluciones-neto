# Plan de Pruebas — Centro de Soluciones Neto v1.3

**Fecha:** Marzo 2026 | **Ambiente recomendado:** Staging + datos de seed

---

## Credenciales de prueba

| Email | Password | Rol |
|---|---|---|
| admin@soyneto.com | Neto2024! | ADMIN |
| christian.gutierrez@soyneto.com | Neto2024! | AGENTE |
| t749@soyneto.com | Neto2024! | TIENDA |

---

## 1. Autenticación y Sesión

| # | Caso | Pasos | Resultado esperado |
|---|---|---|---|
| 1.1 | Login exitoso | Ingresar credenciales correctas | Redirige al dashboard del rol correspondiente |
| 1.2 | Login fallido | Contraseña incorrecta | Mensaje "Credenciales inválidas", sin token |
| 1.3 | Usuario inactivo | Login con usuario desactivado desde admin | Error 401 |
| 1.4 | Token expirado | Esperar 8h o modificar exp manualmente | Redirige a login automáticamente (interceptor 401) |
| 1.5 | Logout manual | Click en "Cerrar sesión" en navbar | Limpia `cs_token`, redirige a `/login` |
| 1.6 | Acceso sin token | Navegar a `/agente` sin estar logueado | Guard redirige a `/login` |
| 1.7 | Acceso rol incorrecto | TIENDA intenta navegar a `/agente` | Guard redirige a su dashboard |

---

## 2. Roles y Permisos

| # | Caso | Usuario | Resultado esperado |
|---|---|---|---|
| 2.1 | TIENDA ve solo sus tickets | t749 | GET /tickets solo devuelve tickets de tienda 749 |
| 2.2 | AGENTE ve solo su grupo | christian | Cola muestra solo tickets de su grupo |
| 2.3 | ADMIN ve todo | admin | Todos los tickets accesibles |
| 2.4 | TIENDA no puede tomar ticket | t749 | Botón "Tomar" no visible; PATCH rechazado (403) |
| 2.5 | AGENTE no puede cancelar | christian | Sin opción CANCELADO; API devuelve 403 |
| 2.6 | Solo ADMIN cancela | admin | PATCH estatus=CANCELADO exitoso |
| 2.7 | Notas internas | t749 lee bitácora | Notas INTERNO no visibles en timeline |
| 2.8 | TIENDA no ve tickets de otra tienda | t749 intenta GET /tickets/{id de otra tienda} | 403 |

---

## 3. Creación de Tickets con IA

| # | Caso | Descripción de prueba | Resultado esperado |
|---|---|---|---|
| 3.1 | Clasificación CRITICA | "no tenemos internet desde las 8am" | Urgencia CRITICA, área SISTEMAS, SLA 4h |
| 3.2 | Clasificación ALTA | "el lector de huella no detecta" | Área SISTEMAS, urgencia ALTA |
| 3.3 | Clasificación BAJA | "el proveedor no ha visitado la tienda" | Área ABASTO, urgencia BAJA |
| 3.4 | Texto ambiguo | "hay un problema en la tienda" | IA devuelve confianza baja (<60%) |
| 3.5 | Ajuste manual | IA sugiere SISTEMAS, usuario cambia a MANTENIMIENTO | `ia_clasificacion_aceptada = false` en DB |
| 3.6 | Sin API Key Gemini | Desactivar GEMINI_API_KEY | Fallback por palabras clave, confianza ≤70% |
| 3.7 | Ticket CRITICA → Slack | Crear ticket CRITICA con Slack configurado | Mensaje en canal Slack del grupo |
| 3.8 | Routing por zona | Tienda en Zona Norte con tipificación de lector | Asignado a grupo "Sistemas Norte" |
| 3.9 | Sin regla de ruteo | Tipificación sin regla en matriz | Ticket NUEVO sin agente asignado |

---

## 4. Smart Load Balancing

| # | Caso | Setup | Resultado esperado |
|---|---|---|---|
| 4.1 | Agente con menos carga recibe ticket | Agente A: 0 tickets, Agente B: 3 tickets activos | Nuevo ticket → Agente A |
| 4.2 | Peso por antigüedad | Agente A: 1 ticket frescos (1.0), Agente B: 1 ticket 48h (2.0) | Nuevo ticket → Agente A |
| 4.3 | Desempate por último asignado | Agente A y B con misma carga | Ticket → quien lleva más sin recibir |
| 4.4 | Sin agentes disponibles | Desactivar todos los agentes del grupo | Ticket NUEVO sin agente (agente_id null) |
| 4.5 | Agente desactivado no recibe | Desactivar Agente B | Tickets solo van a agentes activos |
| 4.6 | Escalación usa Smart LB | Escalar a nuevo grupo | Agente de menor carga del grupo destino recibe |

---

## 5. Flujo Completo Tienda–Agente

| # | Caso | Pasos | Estado final |
|---|---|---|---|
| 5.1 | Flujo feliz | Tienda crea → Agente toma → Envía solución → Tienda confirma | RESUELTO → CERRADO |
| 5.2 | Rechazo y reintento | Tienda crea → Agente resuelve → Tienda rechaza → Agente reintenta → Tienda confirma | CERRADO |
| 5.3 | Conversación múltiple | ESPERANDO_TIENDA → Tienda "necesito más ayuda" → ESPERANDO_AGENTE → Agente continúa | RESUELTO |
| 5.4 | Prioridad sube en rechazo | Ticket MEDIA, tienda rechaza | Prioridad sube a ALTA |
| 5.5 | Tienda resuelve directamente | Desde cualquier estado activo, tienda marca resuelto | RESUELTO directo |
| 5.6 | Auto-cierre 72h | Ticket en RESUELTO, llamar /internal/auto-cierre con horas=0 | CERRADO con nota interna |
| 5.7 | Recordatorio 12h | Ticket ESPERANDO_TIENDA con `fecha_primera_respuesta` > 12h, llamar auto-cierre | Nota interna "Recordatorio: 12 horas" |

---

## 6. Copiloto del Agente (Similares)

| # | Caso | Setup | Resultado esperado |
|---|---|---|---|
| 6.1 | Panel aparece | Abrir ticket con tipificación que tiene histórico cerrado | Panel "Soluciones anteriores" visible con cards |
| 6.2 | Sin histórico | Tipificación sin tickets cerrados | Panel no aparece |
| 6.3 | Ordenado por CSAT | 3 tickets cerrados: CSAT 5, 3, 4 | Orden: 5 → 4 → 3 |
| 6.4 | Máximo 5 resultados | Tipificación con 10 tickets cerrados | Panel muestra solo 5 |
| 6.5 | "Usar esta solución" | Click en el botón | Texto copiado al textarea de respuesta |
| 6.6 | Panel colapsa al usar | Click "Usar esta solución" | `showSimilares = false` |
| 6.7 | Sin solución = no aparece | Ticket CERRADO sin `solucion_propuesta` | No aparece en similares |
| 6.8 | Solo AGENTE/ADMIN ve | TIENDA intenta GET /tickets/{id}/similares | 403 Forbidden |

---

## 7. Dany — Agente de Primera Línea

| # | Caso | Pasos | Resultado esperado |
|---|---|---|---|
| 7.1 | Apertura del chat | Login como TIENDA, dashboard cargado | Widget Dany visible en panel derecho |
| 7.2 | Quick chip | Click en "Sin internet / WiFi caído" | Chip enviado como mensaje, Dany responde |
| 7.3 | Flujo resuelto | Dany devuelve `accion: "resuelto"` | Botón "Registrar como resuelto" aparece |
| 7.4 | Registrar resuelto | Click en "Registrar como resuelto" | Ticket creado + PATCH RESUELTO, se muestra folio |
| 7.5 | Flujo escalar | Dany devuelve `accion: "escalar"` | Botón "Crear ticket" aparece |
| 7.6 | Escalar | Click en "Crear ticket" | Ticket creado en NUEVO/ASIGNADO, se muestra folio con link |
| 7.7 | Demo mode | DANY_WEBHOOK_URL vacío o inaccesible | Respuestas hardcodeadas en español |
| 7.8 | Sesión única | Abrir Dany, cerrar, volver a abrir | Nueva sesión con nuevo `sesion_id` |

---

## 8. Escalación

| # | Caso | Pasos | Resultado esperado |
|---|---|---|---|
| 8.1 | Escalar exitoso | Agente en EN_PROCESO → escala a grupo diferente | Ticket reasignado, bitácora con ESCALACION |
| 8.2 | Motivo obligatorio | Escalar con menos de 10 chars | Botón deshabilitado |
| 8.3 | No escalar desde CERRADO | Ticket CERRADO | Botón de escalación no visible |
| 8.4 | Smart LB en escalación | Escalar a grupo con agentes desiguales | Asignado al de menor carga |

---

## 9. SLA

| # | Caso | Resultado esperado |
|---|---|---|
| 9.1 | SLA calculado al crear | POST /tickets | `sla_limite = fecha_apertura + tipificacion.sla_horas` |
| 9.2 | SLA vencido en lista | Ticket con sla_limite en el pasado | `sla_vencido: true` en GET /tickets |
| 9.3 | SLA no cuenta en RESUELTO | Ticket RESUELTO con sla_limite pasado | `sla_vencido: false` |
| 9.4 | SLA vencidos en dashboard | Dashboard con tickets vencidos | Contador correcto |
| 9.5 | Badge SLA en cola | Cola del agente | Badge rojo "⚠ SLA Vencido" visible |

---

## 10. CSAT

| # | Caso | Resultado esperado |
|---|---|---|
| 10.1 | Modal aparece | Ticket RESUELTO, login como TIENDA | Modal CSAT visible |
| 10.2 | Calificación 5 estrellas | Enviar CSAT 5 | `csat_score = 5` en DB, modal desaparece |
| 10.3 | Con comentario | CSAT + texto | `csat_comentario` guardado |
| 10.4 | No se puede repetir | Enviar CSAT dos veces al mismo ticket | 400 o modal ya no aparece |
| 10.5 | CSAT en KPIs agente | KPIs muestran promedio por agente | Promedio correcto calculado |
| 10.6 | Orden en Copiloto | Ticket cerrado con CSAT 5 vs CSAT 2 | CSAT 5 aparece primero en similares |

---

## 11. Plantillas de Respuesta

| # | Caso | Resultado esperado |
|---|---|---|
| 11.1 | Listar por área | Agente con ticket de SISTEMAS | Solo plantillas de SISTEMAS + globales |
| 11.2 | Usar plantilla | Click en plantilla | Texto copiado al textarea |
| 11.3 | Crear plantilla | Admin crea plantilla global (sin área) | Disponible para todos los agentes |
| 11.4 | Sin plantillas | Área sin plantillas configuradas | Mensaje "No hay plantillas para esta área" |

---

## 12. Dashboard y KPIs

| # | Caso | Resultado esperado |
|---|---|---|
| 12.1 | KPIs globales | GET /dashboard | Abiertos, en proceso, vencidos correctos |
| 12.2 | KPIs agente | Admin → KPIs, filtro por fechas | Cerrados, tiempo promedio, CSAT, SLA% por agente |
| 12.3 | % IA aceptada | Dashboard | Tickets con `ia_clasificacion_aceptada=true / total` |
| 12.4 | Notificaciones navbar | Login como TIENDA con ticket en ESPERANDO_TIENDA | Badge con contador visible |

---

## 13. Admin — Gestión de Catálogos

| # | Módulo | Casos |
|---|---|---|
| 13.1 | Usuarios | Crear, activar/desactivar, cambiar grupo/tienda |
| 13.2 | Tipificaciones | Crear con SLA y palabras clave, editar urgencia |
| 13.3 | Grupos | Crear grupo nuevo, asignar canal Slack |
| 13.4 | Matriz de Ruteo | Crear regla zona-específica y regla global, verificar fallback |
| 13.5 | Tiendas | Crear tienda, asignar a zona |

---

## 14. Agentes externos (API — Dany/Javier)

| # | Caso | Endpoint | Resultado esperado |
|---|---|---|---|
| 14.1 | Login bot | POST /auth/login con usuario de servicio | Token JWT válido |
| 14.2 | Clasificar texto | POST /ai/classify | `tipificacion_id` + `urgencia` + `confianza` |
| 14.3 | Crear ticket abierto | POST /tickets con JWT de bot | Ticket en ASIGNADO, agente asignado por Smart LB |
| 14.4 | Crear ticket resuelto | POST /tickets + PATCH RESUELTO | Ticket en RESUELTO con solución |
| 14.5 | Token expirado | Llamar con token vencido | 401 Unauthorized |
| 14.6 | Rol incorrecto | Bot con rol AGENTE intenta POST /tickets como TIENDA | 403 |
| 14.7 | Proxy Dany | POST /dany/chat con historial | Respuesta del webhook n8n |

---

## 15. Seguridad

| # | Caso | Resultado esperado |
|---|---|---|
| 15.1 | Swagger en producción | GET /docs en env=production | 404 Not Found |
| 15.2 | CORS en staging | Request desde dominio no permitido | 403 / sin headers CORS |
| 15.3 | JWT inválido | Token firmado con secret incorrecto | 401 Unauthorized |
| 15.4 | Fuerza bruta login | 20 intentos fallidos | (Rate limiting pendiente — Sprint 3) |
| 15.5 | XSS en descripción | Descripción con `<script>alert(1)</script>` | HTML escapado, sin ejecución |
| 15.6 | Headers seguridad | GET / en prod | X-Frame-Options, X-Content-Type-Options presentes |
| 15.7 | Acceso entre tiendas | tienda 749 intenta GET /tickets de tienda 750 | 403 |
| 15.8 | Endpoint interno sin auth | POST /internal/auto-cierre sin token | 422/401 (protegido por no estar en schema) |

---

## 16. Infraestructura / Ambientes

| # | Caso | Resultado esperado |
|---|---|---|
| 16.1 | Health check local | GET http://localhost:8000/health | `{"status":"ok","env":"development"}` |
| 16.2 | Health check staging | GET https://csn-api-staging.run.app/health | `{"status":"ok","env":"staging"}` |
| 16.3 | Health check prod | GET https://csn-api-prod.run.app/health | `{"status":"ok","env":"production"}` |
| 16.4 | Rewrite Firebase staging | GET https://csn-staging.web.app/api/v1/health | Mismo response que Cloud Run staging |
| 16.5 | Rewrite Firebase prod | GET https://csn-prod.web.app/api/v1/health | Mismo response que Cloud Run prod |
| 16.6 | Proxy local frontend | npm start + GET /api/v1/health | Proxy redirige a localhost:8000 |

---

## Orden de ejecución sugerido

```
1. Seed → 2. Auth → 3. Roles → 4. Creación tickets → 5. Flujo completo
→ 6. Smart LB → 7. Copiloto → 8. Dany → 9. SLA/auto-cierre → 10. CSAT
→ 11. Escalación → 12. Plantillas → 13. Dashboard → 14. Admin
→ 15. API externa → 16. Seguridad → 17. Infraestructura
```

## Pendientes / No testeables aún (Sprint 2)

- Incidente Masivo (nueva tabla no creada)
- Torre de Control (campos pendientes)
- Rate limiting en login (Sprint 3)
