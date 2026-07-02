import type { ModelMessage, ToolSet } from "ai";
import type { DanyInput, DanyResponse } from "../types.js";
import { runAgent, respuestaDany } from "./runner.js";
import { PROMPT_TIENDA, PROMPT_AGENTE, PROMPT_ADMIN } from "./prompts.js";
import { buildTiendaTools, buildAgenteTools, buildAdminTools } from "./tools.js";
import { buildUserMessages } from "./content.js";
import { getMemory } from "../memory/index.js";
import { compactForModel } from "../memory/compact.js";
import { csn } from "../csn/client.js";

/**
 * Trae el contexto en vivo de la persona (cola del agente / KPIs del admin) y lo
 * formatea para inyectarlo en el system. Si falla el fetch, devuelve "" (la persona
 * responde que no tiene datos en lugar de romperse).
 */
async function contextoEnVivo(rol: string, usuarioId: number | null): Promise<string> {
  if (!usuarioId) return "";
  try {
    if (rol === "AGENTE") {
      const tickets = await csn.colaAgente(usuarioId, 25);
      return `\n\n## DATOS EN VIVO\ntickets_data (${tickets.length}):\n${JSON.stringify(tickets)}`;
    }
    // ADMIN / ADMIN_AREA / COORDINADOR
    const { kpis, torre } = await csn.adminContexto(usuarioId);
    return `\n\n## DATOS EN VIVO\nkpis_data: ${JSON.stringify(kpis)}\ntorre_data (${torre.length}): ${JSON.stringify(torre)}`;
  } catch (e) {
    console.error("[contexto] error:", e);
    return "";
  }
}

/**
 * Router por rol_usuario — equivalente al nodo Switch_Rol de n8n.
 * TIENDA → Dany (con tools + memoria)
 * AGENTE → copiloto read-only (contexto de cola en Fase 4)
 * ADMIN/ADMIN_AREA/COORDINADOR → Daniel read-only (KPIs en Fase 4)
 */
export async function handleDany(input: DanyInput): Promise<DanyResponse> {
  // Cierre por inactividad: DETERMINISTA (mensaje fijo + cerrar sesión), sin pasar por el LLM.
  if (input.evento === "cierre_inactividad") {
    if (input.sesionId) {
      try {
        await csn.cerrarSesion({
          sesion_id: input.sesionId,
          resuelto_sin_ticket: true,
        });
      } catch (e) {
        console.error("[cierre] error cerrando sesión:", e);
      }
    }
    return {
      respuesta:
        "⏰ Cerré este caso por inactividad ✅\nLo marqué como resuelto. Si necesitas algo más, escríbeme cuando quieras y empezamos de nuevo. 🙌",
      accion: "resuelto",
      resumen: "",
      multimedia_url: null,
    };
  }

  // El contexto de sesión va en el system (no se guarda en el historial).
  const contexto = [
    `tienda_id: ${input.tiendaId ?? "(n/d)"}`,
    `sesion_id: ${input.sesionId || "(n/d)"}`,
    `tienda_nombre: ${input.tiendaNombre || "(n/d)"}`,
    `usuario_id: ${input.usuarioId ?? "(n/d)"}`,
    `rol_usuario: ${input.rol}`,
  ].join("\n");

  let basePrompt: string;
  let tools: ToolSet | undefined;
  let datosEnVivo = "";
  const mediaEnviada: string[] = []; // URLs que el agente muestra este turno
  const estado = { cerrada: false, ticketCreado: false }; // lo marcan las tools al cerrar
  switch (input.rol) {
    case "AGENTE":
      basePrompt = PROMPT_AGENTE;
      datosEnVivo = await contextoEnVivo("AGENTE", input.usuarioId);
      if (input.usuarioId) tools = buildAgenteTools({ usuarioId: input.usuarioId });
      break;
    case "ADMIN":
    case "ADMIN_AREA":
    case "COORDINADOR":
      basePrompt = PROMPT_ADMIN;
      datosEnVivo = await contextoEnVivo(input.rol, input.usuarioId);
      if (input.usuarioId) tools = buildAdminTools({ usuarioId: input.usuarioId });
      break;
    case "TIENDA":
    default:
      basePrompt = PROMPT_TIENDA;
      if (input.sesionId && input.tiendaId) {
        tools = buildTiendaTools({
          tiendaId: input.tiendaId,
          sesionId: input.sesionId,
          tiendaNombre: input.tiendaNombre,
          mediaEnviada,
          estado,
        });
      }
      break;
  }

  const system = `${basePrompt}\n\n## CONTEXTO DE ESTA SESIÓN\n${contexto}${datosEnVivo}`;

  // Memoria: cargar historial previo de la sesión (vacío si no hay sesion_id).
  const memory = getMemory();
  const useMemory = Boolean(input.sesionId);
  // Cargamos el historial completo y lo compactamos SOLO para el modelo: los
  // procedimientos pesados superados se sustituyen por una nota (la memoria en
  // Neon queda intacta). Reduce tokens/latencia sin perder el flujo activo.
  const history: ModelMessage[] = useMemory
    ? compactForModel(await memory.load(input.sesionId))
    : [];

  // Mensaje del usuario: evento de inactividad, o mensaje normal (con imagen).
  let forModel, forMemory;
  if (input.evento === "recordatorio") {
    const instr =
      "[EVENTO_SISTEMA: La tienda lleva varios minutos sin responder. Pregúntale en UNA sola línea, amable, si pudo realizar el último paso o si quiere seguir con otra cosa. No repitas el procedimiento ni crees ticket.]";
    forModel = { role: "user" as const, content: instr };
    forMemory = forModel;
  } else {
    ({ forModel, forMemory } = buildUserMessages(input));
  }
  const messages = [...history, forModel];

  const result = await runAgent({ system, messages, tools, maxSteps: 8 });

  // Persistir el turno (mensaje del usuario sin base64 + lo que generó el modelo).
  if (useMemory) {
    await memory.append(input.sesionId, [forMemory, ...result.messages]);
  }

  // accion: avisa al frontend si el caso CERRÓ (para detener recordatorios de inactividad).
  // Cierra si se creó ticket O se cerró sesión (robusto aunque el modelo omita una).
  const cerro = estado.cerrada || estado.ticketCreado;
  const accion = cerro
    ? estado.ticketCreado
      ? "escalado"
      : "resuelto"
    : "continuar";

  return respuestaDany(result.text, {
    accion,
    ...(mediaEnviada.length ? { multimedia_url: mediaEnviada.join(",") } : {}),
  });
}
