# 🏪 Centro de Soluciones Neto — Guía de Usuario

> Portal de soporte para Tiendas Neto · Versión 1.0 · Mayo 2026

---

## 🔗 Acceso al Portal

**URL:** https://csn.soyneto.com/login

Ingresa con tu **correo corporativo** y tu contraseña.
¿Olvidaste tu contraseña? Avisa a tu Coordinador o Administrador de Área.

---

## 👤 ¿Qué ves según tu rol?

| Rol | Qué puedes hacer |
|---|---|
| 🏪 **Tienda** | Abrir reportes, ver mis tickets, chatear con Dany 24/7 |
| 👷 **Agente CC** | Cola de tickets, dashboard, Dany copiloto |
| 🗂️ **Coordinador** | Todo lo anterior + KPIs de tu compañía |
| 🔍 **Admin de Área** | Vista de tu área técnica + gestión de usuarios |
| 🔑 **Administrador** | Acceso global completo |

---

## 🤖 Dany — Tu asistente de IA

Dany está disponible 24/7 en el portal. Dependiendo de tu rol, se comporta diferente:

---

### Para Tiendas — Dany

Dany es tu **primera línea de soporte antes de abrir un ticket**.

**¿Cómo funciona?**

1. Abre el portal y verás el chat de Dany al centro
2. Cuéntale qué está pasando en lenguaje natural
3. Dany te guía paso a paso para intentar resolver
4. Si el problema se resuelve → se registra sin ticket 🟢
5. Si no se resuelve → Dany crea el ticket automáticamente

**Dany puede ayudarte con:**
- 📡 Problemas de internet o antena sin señal
- 🖥️ Fallas en sistema POS o caja bloqueada
- 🖨️ Impresoras que no responden
- ❄️ Refrigeradores y clima
- 💡 Problemas eléctricos
- 📦 Dudas de abasto o proveedores
- 📸 Puedes enviarle **fotos del problema** directamente

> _Ejemplo: "El monitor no enciende" → Dany te guía por pasos. Si no funciona tras los intentos, abre el reporte automáticamente con el contexto de la conversación._

---

### Para Agentes — Dany Copiloto

Dany es tu **asistente de cola** dentro del dashboard.

**Preguntas que puedes hacer:**
- _"¿Cuál ticket atiendo primero?"_ → te dice cuál tiene SLA más urgente
- _"Resúmeme el TKT-00034"_ → bitácora completa en segundos
- _"¿Cuántos tickets están vencidos?"_ → conteo con folios
- _"¿Qué tickets llevan más de 2 horas sin respuesta?"_

---

### Para Coordinadores, Admins de Área y Administradores — Daniel

Daniel es tu **panel de inteligencia operativa en tiempo real**.

**Preguntas que puedes hacer:**
- _"¿Cuál es el estatus general de hoy?"_ → resumen ejecutivo con KPIs
- _"¿Cuántos tickets vencidos hay en mi área?"_ → detalle por área o compañía
- _"¿Qué tiendas tienen alertas críticas?"_ → lista con folios y tiempos
- _"¿Cuál es la tendencia de resolución esta semana?"_
- _"¿En qué me puedes ayudar?"_ → lista completa de capacidades

Daniel combina los KPIs del backend con alertas de la torre para darte contexto real, no datos estáticos.

---

## 🎫 Flujo de un Ticket (desde Tienda)

```
1️⃣  Tienda abre el portal → escribe a Dany
2️⃣  Dany intenta resolver con troubleshooting guiado
3️⃣  ¿Se resolvió?
     ✅ Sí → Dany registra como resuelto (sin ticket en cola)
     ❌ No → Dany crea el ticket automáticamente
4️⃣  La IA clasifica el ticket y lo asigna al agente correcto
5️⃣  El agente atiende y actualiza el estatus
6️⃣  Agente propone solución → Tienda confirma o rechaza
7️⃣  Ticket resuelto → cierre en 72 hrs automático
```

**Estatus de tu ticket:**

| Estatus | Qué significa |
|---|---|
| 🆕 Nuevo | Recibido, pendiente de asignación |
| 👤 Asignado | Tiene agente asignado |
| 🔧 En proceso | El agente está trabajando |
| ⏳ Esperando tienda | El agente envió solución — revisa y confirma |
| ✅ Resuelto | Problema solucionado |
| 🔁 Rechazado | La solución no funcionó — regresa al agente |
| 🔒 Cerrado | Finalizado (72h después de resuelto) |

---

## 📊 KPIs (Coordinadores y Admins)

Desde **Administración → KPIs** en el portal:

| Métrica | Descripción |
|---|---|
| 📦 Total tickets | Volumen y promedio diario |
| ✅ % SLA cumplido | Verde ≥90% · Amarillo ≥70% · Rojo <70% |
| ⏱️ Tiempo de resolución | P50 y P90 en horas |
| 😊 CSAT | Satisfacción del cliente (próximamente) |
| 🤖 % Deflexión Dany | Problemas resueltos sin abrir ticket |
| 📈 Tendencia | Comparativo mensual |

Los KPIs se filtran automáticamente según tu rol (global para Admin, por área para Admin de Área, por compañía para Coordinador).

---

## ⚙️ Configuración (Coordinadores y Admins)

Desde **Administración → Configuración:**

- **Grupos** — Equipos del Call Center y sus compañías asignadas
- **Tipificaciones** — Categorías de problemas por área técnica
- **Ruteo** — Reglas automáticas: qué tipificación + zona → qué grupo
- **Usuarios** — Alta y gestión _(solo Admin y Admin de Área)_

---

## ❓ Preguntas Frecuentes

**¿No recuerdo mi contraseña?**
→ Avisa a tu Coordinador. El cambio de contraseña desde el portal llegará próximamente.

**¿Cómo sé si mi ticket está resuelto?**
→ En el portal en "Mis Tickets". También puedes preguntarle a Dany: _"¿Cuál es el estatus de mi reporte?"_

**¿Puedo mandar fotos del problema?**
→ Sí. En el chat de Dany puedes adjuntar imágenes con el botón 📎, arrastrando la foto, o pegando con Ctrl+V.

**¿Qué hago si Dany no responde?**
→ Espera 30 segundos (puede estar procesando). Si sigue sin responder, abre el reporte manualmente desde el portal.

**¿Dany recuerda conversaciones anteriores?**
→ Cada conversación es una sesión independiente. Si cierras y vuelves a abrir, Dany empieza de nuevo.

**¿Hay modo oscuro?**
→ Sí. Está en el menú de tu usuario (esquina inferior del sidebar) → ícono de luna/sol.

**¿Puedo crear un ticket manualmente sin pasar por Dany?**
→ Sí, desde el portal con el botón "Abrir reporte manual" en la parte inferior del sidebar de tickets.

---

## 📞 Soporte y Contacto

| Canal | Para qué |
|---|---|
| **Portal** https://csn.soyneto.com | Tickets, reportes, seguimiento |
| **Slack #csn-soporte** | Dudas del portal, problemas de acceso |
| **Tu Coordinador** | Reseteo de contraseña, alta de usuarios |
| **Tu Admin de Área** | Configuración de grupos y tipificaciones |

---

_Centro de Soluciones Neto · v1.0 · Mayo 2026_
