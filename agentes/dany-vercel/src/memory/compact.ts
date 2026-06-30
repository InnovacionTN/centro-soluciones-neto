import type { ModelMessage } from "ai";

/**
 * Compacta el historial que se ENVÍA al modelo (no el que se persiste).
 *
 * Problema: cada turno re-mandamos a Gemini todo el historial. Los resultados de
 * Resolver_problema_soporte son blobs de ~3-5 KB con el procedimiento completo; si
 * la tienda cambia de problema (impresora → monitor → terminal) acumulamos varios
 * y los reenviamos enteros en cada turno → más tokens, más latencia, más ruido.
 *
 * Solución: por cada herramienta, dejamos en claro SOLO su último resultado pesado
 * (el flujo activo, que el modelo necesita para saber el siguiente paso) y sustituimos
 * los anteriores por una nota breve. Conservamos type/toolName/toolCallId/providerOptions
 * intactos para no romper el emparejamiento tool-call↔tool-result ni los thoughtSignature
 * de Gemini (quitarlos provoca error 400; ver docs Gemini "Thought Signatures").
 *
 * No tocamos mensajes de assistant ni de usuario. La memoria en Neon se guarda completa
 * (fidelidad para el visor de conversaciones); esto solo afecta lo que ve el modelo.
 */

const HEAVY_CHARS = 800;

function stub(toolName: string) {
  return {
    type: "json" as const,
    value: {
      nota: `Resultado previo de ${toolName} ya utilizado en esta conversación; se omite el detalle para ahorrar contexto.`,
    },
  };
}

export function compactForModel(messages: ModelMessage[]): ModelMessage[] {
  // 1) Localiza el índice del último tool-result pesado de cada herramienta.
  const lastHeavyIdx = new Map<string, number>();
  messages.forEach((m, i) => {
    if (m.role !== "tool" || !Array.isArray(m.content)) return;
    for (const part of m.content) {
      if (part.type !== "tool-result" || !part.toolName) continue;
      if (JSON.stringify(part.output ?? {}).length > HEAVY_CHARS) {
        lastHeavyIdx.set(part.toolName, i);
      }
    }
  });
  if (lastHeavyIdx.size === 0) return messages;

  // 2) Sustituye los pesados que NO son el último de su herramienta.
  return messages.map((m, i) => {
    if (m.role !== "tool" || !Array.isArray(m.content)) return m;
    let changed = false;
    const content = m.content.map((part) => {
      if (part.type !== "tool-result" || !part.toolName) return part;
      const heavy = JSON.stringify(part.output ?? {}).length > HEAVY_CHARS;
      const isLatest = lastHeavyIdx.get(part.toolName) === i;
      if (heavy && !isLatest) {
        changed = true;
        return { ...part, output: stub(part.toolName) };
      }
      return part;
    });
    return changed ? ({ ...m, content } as ModelMessage) : m;
  });
}
