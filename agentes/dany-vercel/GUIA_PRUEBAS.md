# Guía de pruebas — Dany CSN

> Versión local. Entra a **http://localhost:4200**, inicia sesión como tienda y abre el chat de Dany.
> Escribe la **frase sugerida** y verifica el comportamiento. Reporta cualquier respuesta rara.

## A. Comportamiento a verificar (haz esto primero)

| # | Qué probar | Cómo | Esperado |
|---|---|---|---|
| 1 | Saludo | escribe `hola` | Saludo cálido, ofrece ayuda, 1 emoji, sin volcar datos |
| 2 | Soporte paso a paso | `mi monitor no enciende` | Empieza en el primer paso, UNA sola pregunta, espera tu respuesta |
| 3 | Siempre desde el inicio | `ya revisé el cable y el monitor sigue sin prender` | Agradece el adelanto pero empieza igual desde el primer paso |
| 4 | Confirmar antes de cerrar | lleva un caso a resuelto | Pregunta *¿se solucionó lo de…?* ANTES de cerrar |
| 5 | Suena humano (no bot) | cualquier flujo | NUNCA dice "tool", "procedimiento", "FASE", "sistema" ni nombres de flujo |
| 6 | Escalar con confirmación | responde "no" hasta agotar el flujo | Propone crear reporte y pide tu OK antes de crearlo |
| 7 | Escalación inmediata | `no tengo ventas en toda la tienda` / `quiero un folio` / `antena roja` | Escala directo sin agotar pasos |
| 8 | Inactividad | deja el chat quieto | 5 min recordatorio · 15 min otro · 25 min cierra (baja los tiempos en código para probar rápido) |
| 9 | Multimedia | flujo con imagen/video (ej. cpu) | Debe mostrar la media *(hoy degrada: server de media caído → sigue por texto)* |
| 10 | Foto | adjunta una imagen | Dany la "ve" y la clasifica (promo / equipo / general) |
| 11 | Precios/Promos | `precio del fabuloso` | *(hoy degrada: motores no responden → avisa con gracia)* |

> ⚠️ = la frase enruta a un flujo distinto (rephrasea o lo afinamos) · todos encuentran algo (no hay "no encontré").

## B. Flujos por categoría

### Mantenimiento (36)

| Flujo | Frase sugerida | Rutea |
|---|---|---|
| Aire Acondicionado | `aire acondicionado` | ✅ |
| Alfombra | `alfombra` | ✅ |
| Cerrajería | `cerrajería` | ✅ |
| Eléctrico / Apagador | `eléctrico apagador` | ✅ |
| Eléctrico / Contacto | `eléctrico contacto` | ✅ |
| Muro | `muro` | ✅ |
| Pintura | `pintura` | ✅ |
| Piso | `piso` | ✅ |
| Plafón | `plafón` | ✅ |
| Sillas Secretariales | `sillas secretariales` | ✅ |
| Sillones | `sillones` | ✅ |
| Soporte de Pantalla | `soporte de pantalla` | ⚠️→ Monitor / No enciende |
| Hidrosanitario / Lavabo Damas | `hidrosanitario lavabo damas` | ✅ |
| Aire Acondicionado | `aire acondicionado` | ✅ |
| Carpintería | `carpintería` | ✅ |
| Cerrajería | `cerrajería` | ✅ |
| Eléctrico / Apagador | `eléctrico apagador` | ✅ |
| Eléctrico / Contacto | `eléctrico contacto` | ✅ |
| Eléctrico / Lámpara | `eléctrico lámpara` | ✅ |
| Eléctrico / Reflectores Exteriores | `eléctrico reflectores exteriores` | ✅ |
| Estacionamiento | `estacionamiento` | ✅ |
| Fuente | `fuente` | ✅ |
| Guarniciones | `guarniciones` | ✅ |
| Hidrosanitario / Baño Damas | `hidrosanitario baño damas` | ✅ |
| Hidrosanitario / Baño Caballeros | `hidrosanitario baño caballeros` | ✅ |
| Hidrosanitario / Monomando del Lavamanos | `hidrosanitario monomando del lavamanos` | ✅ |
| Hidrosanitario / Lavabo Caballeros | `hidrosanitario lavabo caballeros` | ✅ |
| Impermeabilización | `impermeabilización` | ✅ |
| Jardineras | `jardineras` | ✅ |
| Mobiliario | `mobiliario` | ✅ |
| Muro | `muro` | ✅ |
| Persianas | `persianas` | ✅ |
| Pintura | `pintura` | ✅ |
| Piso | `piso` | ✅ |
| Plafón | `plafón` | ✅ |
| Soporte de Pantalla | `soporte de pantalla` | ⚠️→ Monitor / No enciende |

### Soporte Técnico (Hardware) (18)

| Flujo | Frase sugerida | Rutea |
|---|---|---|
| CPU / No enciende | `cpu no enciende` | ✅ |
| Impresora / No enciende | `impresora no enciende` | ✅ |
| Impresora / Validar impresión | `impresora validar impresión` | ✅ |
| Terminal Bancaria | `terminal bancaria` | ✅ |
| Teclado / Sin funcionamiento | `teclado sin funcionamiento` | ✅ |
| Lector de Huella | `lector de huella` | ✅ |
| Scanner / No enciende | `scanner no enciende` | ✅ |
| Monitor / No enciende | `monitor no enciende` | ✅ |
| Monitor / Sin imagen | `monitor sin imagen` | ✅ |
| Cajón de Dinero / Sin apertura | `cajón de dinero sin apertura` | ✅ |
| Firewall / No enciende | `firewall no enciende` | ✅ |
| Fortinet / Conexiones | `fortinet conexiones` | ✅ |
| Firewall / Juniper | `firewall juniper` | ✅ |
| Modem Satelital | `modem satelital` | ✅ |
| Modem / Falla | `modem falla` | ✅ |
| Modem / Satelital Falla | `modem satelital falla` | ✅ |
| Switch / Encendido | `switch encendido` | ✅ |
| Intermitencia Antena | `intermitencia antena` | ✅ |

### Sistema SION (16)

| Flujo | Frase sugerida | Rutea |
|---|---|---|
| Inventario cíclico no generado | `inventario cíclico no generado` | ✅ |
| Inventario cíclico no permite el cierre | `inventario cíclico no permite el cierre` | ✅ |
| No pasa pago de servicio | `no pasa pago de servicio` | ✅ |
| Corresponsalía Bancaria BAZ | `corresponsalía bancaria baz` | ✅ |
| No permite ingreso de usuario | `no permite ingreso de usuario` | ✅ |
| Lentitud de módulos | `lentitud de módulos` | ✅ |
| Módulos inhabilitados | `módulos inhabilitados` | ✅ |
| Ventas fuera de línea | `ventas fuera de línea` | ✅ |
| Egreso de valores | `egreso de valores` | ✅ |
| Traspaso de valores | `traspaso de valores` | ✅ |
| Redondeo | `redondeo` | ✅ |
| Recargas | `recargas` | ✅ |
| Giftcard | `giftcard` | ✅ |
| Módulo de venta NULL | `módulo de venta null` | ✅ |
| Boleto de lotería | `boleto de lotería` | ✅ |
| Retiros | `retiros` | ✅ |

### Coach (12)

| Flujo | Frase sugerida | Rutea |
|---|---|---|
| Justificación de asistencia | `justificación de asistencia` | ✅ |
| Bloqueo de usuario | `bloqueo de usuario` | ✅ |
| Corte Z | `corte z` | ✅ |
| Corte ZZ | `corte zz` | ⚠️→ Corte Z |
| Órdenes de compra | `órdenes de compra` | ✅ |
| Transferencia entre tiendas | `transferencia entre tiendas` | ✅ |
| Egreso de valores | `egreso de valores` | ✅ |
| Traspaso de valores | `traspaso de valores` | ✅ |
| Inventarios | `inventarios` | ✅ |
| Recaptura de huella | `recaptura de huella` | ✅ |
| Consulta de tarjeta | `consulta de tarjeta` | ✅ |
| Validar venta | `validar venta` | ✅ |

### Aseguramiento de Ingresos (5)

| Flujo | Frase sugerida | Rutea |
|---|---|---|
| Bloqueo de Usuario | `bloqueo de usuario` | ✅ |
| Corresponsalía Bancaria BAZ | `corresponsalía bancaria baz` | ✅ |
| Faltante | `faltante` | ✅ |
| Reverso | `reverso` | ✅ |
| Egreso de Valores | `egreso de valores` | ✅ |

### Comercial (5)

| Flujo | Frase sugerida | Rutea |
|---|---|---|
| Promoción no pasa | `promoción no pasa` | ✅ |
| Producto adoptado | `producto adoptado` | ✅ |
| Código de barras | `código de barras` | ✅ |
| Producto para transferencia | `producto para transferencia` | ✅ |
| Producto para OC | `producto para oc` | ⚠️→ Producto para transferencia |

### Venteks (3)

| Flujo | Frase sugerida | Rutea |
|---|---|---|
| Activar / Desactivar Protocolo | `activar desactivar protocolo` | ✅ |
| Billetero | `billetero` | ✅ |
| Caja Electrónica | `caja electrónica` | ✅ |

### Protección Civil (3)

| Flujo | Frase sugerida | Rutea |
|---|---|---|
| Extintor | `extintor` | ✅ |
| Solicitud de Señalitica | `solicitud de señalitica` | ✅ |
| Solicitud de Botiquín | `solicitud de botiquín` | ✅ |

---

**Cobertura:** 94/98 flujos enrutan correcto con la frase simple.

### Nota: nombres de flujo duplicados (calidad de datos)
Hay 13 nombres repetidos. Algunos legítimos entre áreas (ej. *Egreso de valores* en SION/Coach/Aseguramiento). 9 pares en **Mantenimiento** son **dos versiones distintas** del mismo flujo (Aire Acondicionado, Cerrajería, Eléctrico/Apagador, Eléctrico/Contacto, Muro, Pintura, Piso, Plafón, Soporte de Pantalla) — pendiente decidir cuál versión es la canónica.
