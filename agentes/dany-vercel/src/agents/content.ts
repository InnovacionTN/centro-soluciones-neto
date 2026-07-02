import type { ModelMessage } from "ai";
import type { DanyInput } from "../types.js";

/**
 * Construye el contenido del mensaje del usuario.
 *
 * - Si hay imagen (data URL base64 en `imagen`, o `imagenUrl`), se adjunta como
 *   parte multimodal para que Gemini la "vea" directamente (mejor que la describa
 *   un paso aparte, como hacía n8n).
 * - Para la MEMORIA se guarda solo texto + marcador, nunca el base64: así el
 *   historial no crece sin control ni se reenvían fotos viejas cada turno.
 */
export function buildUserMessages(input: DanyInput): {
  forModel: ModelMessage;
  forMemory: ModelMessage;
} {
  const tieneImagen = Boolean(input.imagen || input.imagenUrl);
  const texto = input.prompt || (tieneImagen ? "(El usuario envió una imagen.)" : "");

  if (!tieneImagen) {
    const msg: ModelMessage = { role: "user", content: texto };
    return { forModel: msg, forMemory: msg };
  }

  // data URL base64 tiene prioridad; si no, URL pública.
  const imageSource = input.imagen || input.imagenUrl;

  const forModel: ModelMessage = {
    role: "user",
    content: [
      { type: "text", text: texto },
      { type: "image", image: imageSource },
    ],
  };
  const forMemory: ModelMessage = {
    role: "user",
    content: `${texto}\n[el usuario adjuntó una imagen]`,
  };
  return { forModel, forMemory };
}
