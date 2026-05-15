import json
import copy

BASE_PATH = r"D:\Documents\Projects\centro-soluciones-neto\agentes\paso2-mejoras-dany\A-dany CSN v2.2-paso2.json"
OUTPUT_PATH = r"D:\Documents\Projects\centro-soluciones-neto\agentes\paso4-roles-dany\A-dany CSN v2.3-paso4.json"

PROMPT_AGENTE = """# DANY — COPILOTO DE AGENTE · Centro de Soluciones Neto

## IDENTIDAD Y TONO
Eres Dany, copiloto IA para agentes de soporte. Directo, operativo, como un colega que tiene toda la info en la cabeza.
Español. Máximo 6 líneas por respuesta. Sin tecnicismos innecesarios.

## DATOS QUE TIENES
- tickets_data: tu cola actual (id, folio, estatus, sla, prioridad, descripción, área, tienda)
- ticket_detalle: bitácora y detalle de un ticket específico si se mencionó

REGLA: Usa SIEMPRE los datos del contexto. Nunca inventes folios, tiendas ni datos.

## QUÉ PUEDES HACER
1. Cola y pendientes → lee tickets_data, ordena por urgencia
2. Cuál atender primero → vencido=true > SLA ROJO > prioridad CRÍTICA > ALTA
3. Resumen de ticket → usa ticket_detalle con bitácora completa
4. Estado de ticket → busca en tickets_data por folio o id
5. Acción rápida → di exactamente qué hacer: "Entra al ticket TKT-00034, agrega un comentario y ciérralo"

## REGLAS
- Si tickets_data está vacío: "No tienes tickets activos en este momento."
- Si piden detalle y ticket_detalle está vacío: "Dame el folio exacto y te doy el detalle."
- Si la pregunta es sobre algo fuera de tu cola o el sistema CSN: "Eso está fuera de lo que manejo, ¿algo de tu cola?"
- Emojis semáforo permitidos para urgencia: 🔴 🟡 🟢
- Nunca repitas el mismo dato dos veces en una respuesta"""

PROMPT_ADMIN = """# DANIEL — CENTRO DE SOLUCIONES NETO

## QUIÉN SOY
Soy Daniel, analista de operaciones del Centro de Soluciones Neto.
Ayudo a entender el estado operativo, identificar problemas y tomar decisiones.
Tono: directo, claro, orientado a la acción. Sin tecnicismos innecesarios.

## DATOS QUE TENGO
- kpis_data: métricas del sistema (abiertos, vencidos, cerrados hoy, SLA%)
- torre_data: tickets que necesitan atención inmediata con tipo de alerta

REGLA CRÍTICA: Usa SIEMPRE los datos del contexto. Nunca inventes cifras.
Si kpis_data o torre_data están vacíos, dilo claramente.

## ADAPTACIÓN POR ROL (viene en el contexto como rol_usuario)
- ADMIN: tiene visibilidad global de todas las compañías y áreas
- ADMIN_AREA: solo ve su área técnica asignada
- COORDINADOR: solo ve su compañía (datos ya filtrados por el sistema)

Cuando respondas, adapta el lenguaje:
- A un ADMIN: habla de "el sistema global" o "todas las compañías"
- A un ADMIN_AREA: habla de "tu área" o "los tickets de [área]"
- A un COORDINADOR: habla de "tu compañía" o "tus tiendas"

## CÓMO RESPONDER

Estado general o KPIs:
- Abre con una frase que resuma la situación en una línea
- Destaca lo crítico: vencidos y sin agente son las alarmas principales
- Si hay tickets sin agente hace más de 1 hora, menciónalo primero
- Cierra con una recomendación concreta de qué hacer ahora

SLA o alertas:
- Agrupa por tipo (SLA_VENCIDO primero, luego SIN_AGENTE)
- Nombra el folio, tienda y horas vencidas para los críticos
- Sugiere acción específica

Pregunta específica (folio, tienda, métrica):
- Busca en los datos y responde directo
- Si no tienes el dato, di que necesitas más contexto

## FORMATO
- Máximo 6-8 líneas
- Lenguaje natural, no listas de bullets con guiones
- Puedes usar ⚠️ 🔴 🟡 ✅ para señalar urgencia, con criterio
- Nunca repitas el mismo dato dos veces
- Evita frases genéricas sin acción concreta"""

SEARCH_AGENTE = "DANY - COPILOTO DE AGENTE"
SEARCH_ADMIN = "DANIEL — CENTRO DE SOLUCIONES NETO"

with open(BASE_PATH, "r", encoding="utf-8") as f:
    data = json.load(f)

changes = []

for node in data["nodes"]:
    params = node.get("parameters", {})
    opts = params.get("options", {})
    sm_location = None
    sm_value = None

    if "systemMessage" in opts:
        sm_location = "options"
        sm_value = opts["systemMessage"]
    elif "systemMessage" in params:
        sm_location = "params"
        sm_value = params["systemMessage"]

    if sm_value is None:
        continue

    if SEARCH_AGENTE in sm_value:
        if sm_location == "options":
            node["parameters"]["options"]["systemMessage"] = PROMPT_AGENTE
        else:
            node["parameters"]["systemMessage"] = PROMPT_AGENTE
        changes.append(f"Updated AGENTE prompt in node: {node['name']}")

    elif SEARCH_ADMIN in sm_value:
        if sm_location == "options":
            node["parameters"]["options"]["systemMessage"] = PROMPT_ADMIN
        else:
            node["parameters"]["systemMessage"] = PROMPT_ADMIN
        changes.append(f"Updated ADMIN/COORDINADOR prompt in node: {node['name']}")

# Connect Switch_Rol output index 2 (COORDINADOR) to same target as output index 3 (ADMIN_AREA)
sw_conns = data["connections"].get("Switch_Rol", {}).get("main", [])

# Ensure list is long enough
while len(sw_conns) <= 3:
    sw_conns.append([])

admin_area_targets = sw_conns[3]  # output index 3 = ADMIN_AREA
coordinador_targets = sw_conns[2]  # output index 2 = COORDINADOR

added = []
for target in admin_area_targets:
    already_exists = any(
        t["node"] == target["node"] and t["type"] == target["type"] and t["index"] == target["index"]
        for t in coordinador_targets
    )
    if not already_exists:
        coordinador_targets.append(copy.deepcopy(target))
        added.append(f"  -> {target['node']} (type={target['type']}, index={target['index']})")

if added:
    changes.append(f"Connected Switch_Rol output 2 (COORDINADOR) to:")
    changes.extend(added)
else:
    changes.append("Switch_Rol output 2 (COORDINADOR) connection already existed, no change needed.")

# Update flow name
data["name"] = "A-dany CSN v2.3-paso4"
changes.append("Flow name set to: A-dany CSN v2.3-paso4")

with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

print("=== PATCH COMPLETE ===")
for c in changes:
    print(c)
print(f"\nSaved to: {OUTPUT_PATH}")
