import { z } from "zod";

/**
 * Contrato del webhook de Dany — IDÉNTICO al de n8n para permitir el cutover
 * repuntando DANY_WEBHOOK_URL sin tocar frontend ni backend.
 *
 * Entrada: la reenvía el backend desde POST /api/v1/dany/chat
 * Salida:  la consume el frontend Angular.
 */

export const RolUsuario = z.enum([
  "TIENDA",
  "AGENTE",
  "COORDINADOR",
  "ADMIN_AREA",
  "ADMIN",
]);
export type RolUsuario = z.infer<typeof RolUsuario>;

export const DanyRequest = z
  .object({
    // El portal manda "message"/"session_id"; algunos clientes mandan los alias en español.
    message: z.string().optional(),
    mensaje: z.string().optional(),
    session_id: z.string().optional(),
    sesion_id: z.string().optional(),

    tienda_id: z.coerce.number().optional(),
    tienda_nombre: z.string().optional().default(""),

    rol_usuario: RolUsuario.optional().default("TIENDA"),
    usuario_id: z.coerce.number().nullable().optional(),

    imagen_url: z.string().optional().default(""),
    imagen: z.string().optional().default(""), // data URL base64

    // Eventos de inactividad disparados por el frontend (sin texto del usuario).
    evento: z.enum(["recordatorio", "cierre_inactividad"]).optional(),
  })
  .transform((b) => ({
    prompt: b.message ?? b.mensaje ?? "",
    sesionId: b.session_id ?? b.sesion_id ?? "",
    tiendaId: b.tienda_id,
    tiendaNombre: b.tienda_nombre ?? "",
    rol: b.rol_usuario ?? "TIENDA",
    usuarioId: b.usuario_id ?? null,
    imagenUrl: b.imagen_url ?? "",
    imagen: b.imagen ?? "",
    evento: b.evento ?? null,
  }));

export type DanyInput = z.infer<typeof DanyRequest>;

/** Respuesta que espera el frontend. */
export interface DanyResponse {
  respuesta: string;
  accion: "continuar" | "resuelto" | "escalado";
  resumen: string;
  multimedia_url: string | null;
}
