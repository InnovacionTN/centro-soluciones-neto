import { generateText, stepCountIs, type ModelMessage, type ToolSet } from "ai";
import { danyModel } from "../model.js";
import type { DanyResponse } from "../types.js";

export interface RunArgs {
  system: string;
  messages: ModelMessage[];
  tools?: ToolSet;
  /** Máximo de pasos del loop tool→modelo→tool. Codifica las reglas anti-loop. */
  maxSteps?: number;
}

export interface RunResult {
  /** Texto final para el usuario. */
  text: string;
  /** Mensajes generados en esta llamada (assistant + tool), para persistir. */
  messages: ModelMessage[];
}

/**
 * Punto único de llamada al modelo. Aislar aquí permite migrar a la clase
 * `ToolLoopAgent` de AI SDK v6 sin tocar las personas.
 */
export async function runAgent(args: RunArgs): Promise<RunResult> {
  const result = await generateText({
    model: danyModel(),
    system: args.system,
    messages: args.messages,
    tools: args.tools,
    stopWhen: stepCountIs(args.maxSteps ?? 8),
  });
  return { text: result.text, messages: result.response.messages };
}

/** Limpia restos de tool-calls y normaliza saltos de línea (como hacía n8n). */
export function limpiarRespuesta(texto: string): string {
  return texto
    .replace(/\[Used tools?:[^\]]{0,800}\]/gi, "")
    .replace(/Tool:\s*\S[^\n]*/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function respuestaDany(
  texto: string,
  extra: Partial<DanyResponse> = {},
): DanyResponse {
  const limpio = limpiarRespuesta(texto);
  return {
    // Fallback si el modelo no generó texto (ej. solo llamó una tool) → evita burbuja vacía.
    respuesta: limpio || "¿Te puedo ayudar con algo más? 😊",
    accion: extra.accion ?? "continuar",
    resumen: extra.resumen ?? "",
    multimedia_url: extra.multimedia_url ?? null,
  };
}
