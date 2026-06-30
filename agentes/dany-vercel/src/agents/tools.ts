import { tool, type ToolSet } from "ai";
import { z } from "zod";
import { csn, CsnError } from "../csn/client.js";
import { matchFlow } from "../kb/flows.js";
import { resolveMediaUrls } from "../csn/media.js";
import { motor } from "../netopower/motor.js";

/**
 * Contexto de la sesión TIENDA. tienda_id / sesion_id se INYECTAN aquí —
 * el modelo nunca los provee, así no puede inventarlos (mejora vs n8n).
 */
export interface TiendaCtx {
  tiendaId: number;
  sesionId: string;
  tiendaNombre: string;
  /** Colector mutable: URLs de multimedia que el agente decidió mostrar este turno. */
  mediaEnviada: string[];
  /** Estado mutable del cierre: el agente lo marca al cerrar sesión / crear ticket. */
  estado: { cerrada: boolean; ticketCreado: boolean };
}

/** Envuelve la ejecución para que un fallo de tool no rompa el loop. */
async function safe<T>(fn: () => Promise<T>): Promise<T | { error: string }> {
  try {
    return await fn();
  } catch (e) {
    const msg = e instanceof CsnError ? e.message : String(e);
    console.error("[tool] error:", msg);
    return { error: msg };
  }
}

/**
 * Límite de llamadas por tool en un mismo turno — REGLA ANTI-LOOP forzada en
 * código (en n8n solo era una súplica en el prompt). Evita reintentos en bucle.
 */
const LIMITES: Record<string, number> = {
  CSN_registrar_sesion: 1,
  CSN_clasificar_problema: 1,
  CSN_crear_ticket: 1,
  CSN_cerrar_sesion: 1,
  // Resolver_problema_soporte: hasta 3 (reformular si falla + seguir flujos referenciados).
  Resolver_problema_soporte: 3,
};

export function buildTiendaTools(ctx: TiendaCtx): ToolSet {
  const llamadas: Record<string, number> = {};
  const limitar = (nombre: string): { error: string } | null => {
    llamadas[nombre] = (llamadas[nombre] ?? 0) + 1;
    const max = LIMITES[nombre] ?? Infinity;
    if (llamadas[nombre] > max) {
      return {
        error: `${nombre} ya se llamó ${max} vez/veces en esta conversación. No la vuelvas a llamar; continúa o informa al usuario.`,
      };
    }
    return null;
  };

  return {
    CSN_registrar_sesion: tool({
      description:
        "Llama AL INICIO de cada conversación. PRIMER paso siempre. No requiere parámetros: tienda y sesión vienen del contexto.",
      inputSchema: z.object({}),
      execute: async () =>
        limitar("CSN_registrar_sesion") ??
        safe(() => csn.iniciarSesion(ctx.sesionId, ctx.tiendaId)),
    }),

    CSN_clasificar_problema: tool({
      description:
        "Clasifica el problema para obtener tipificacion_id, ia_area (area_tecnica) y urgencia. Llama ANTES de CSN_crear_ticket. Llamar UNA sola vez.",
      inputSchema: z.object({
        descripcion: z
          .string()
          .describe("El problema en UNA oración clara."),
      }),
      execute: async ({ descripcion }) =>
        limitar("CSN_clasificar_problema") ??
        safe(() => csn.clasificar(descripcion, ctx.tiendaId)),
    }),

    CSN_crear_ticket: tool({
      description:
        "Crea un ticket de soporte. Llama SOLO UNA VEZ y solo tras CSN_clasificar_problema + confirmación del usuario. Usa ia_area y tipificacion_id que devolvió CSN_clasificar_problema.",
      inputSchema: z.object({
        descripcion: z.string().describe("Una oración del problema."),
        ia_area: z
          .string()
          .describe("area_tecnica devuelta por CSN_clasificar_problema."),
        tipificacion_id: z
          .number()
          .describe("tipificacion_id de CSN_clasificar_problema."),
        pasos_intentados: z
          .string()
          .optional()
          .describe("Resumen de lo que ya se intentó en el chat."),
        ia_confianza: z
          .number()
          .min(0)
          .max(100)
          .optional()
          .describe("confianza (0-100) de CSN_clasificar_problema."),
      }),
      execute: async (p) => {
        const limite = limitar("CSN_crear_ticket");
        if (limite) return limite;
        const r = await safe(() =>
          csn.crearTicket({
            tienda_id: ctx.tiendaId,
            sesion_id: ctx.sesionId,
            descripcion: p.descripcion,
            ia_area: p.ia_area,
            tipificacion_id: p.tipificacion_id,
            pasos_intentados: p.pasos_intentados,
            ia_confianza: p.ia_confianza,
          }),
        );
        if (!(r as { error?: string }).error) ctx.estado.ticketCreado = true;
        return r;
      },
    }),

    CSN_cerrar_sesion: tool({
      description:
        "Llama AL FINAL siempre antes de despedirte. resuelto_sin_ticket=true si resolviste sin ticket, false si creaste ticket.",
      inputSchema: z.object({
        resuelto_sin_ticket: z.boolean(),
        mensajes_count: z.number().optional(),
        area_detectada: z
          .string()
          .optional()
          .describe("Área detectada (SISTEMAS, MANTENIMIENTO, etc.)."),
      }),
      execute: async (p) => {
        const limite = limitar("CSN_cerrar_sesion");
        if (limite) return limite;
        ctx.estado.cerrada = true;
        // NO forzamos ticketCreado aquí: solo CSN_crear_ticket lo marca true, y SOLO si el
        // backend respondió sin error. Así, si el ticket falló, no reportamos "escalado" en falso.
        return safe(() =>
          csn.cerrarSesion({
            sesion_id: ctx.sesionId,
            resuelto_sin_ticket: p.resuelto_sin_ticket,
            mensajes_count: p.mensajes_count,
            tipificacion_detectada: p.area_detectada,
          }),
        );
      },
    }),

    Resolver_problema_soporte: tool({
      description:
        "Usa esta tool cuando el usuario reporte CUALQUIER problema técnico u operativo: hardware (CPU, impresora, monitor, teclado, scanner, lector de huella, terminal bancaria, cajón), Sistema SION, Coach, Mantenimiento (aire, refrigeración, eléctrico), Aseguramiento, Comercial, Venteks o Protección Civil. Pasa la descripción completa del usuario. Devuelve el procedimiento paso a paso y la multimedia con sus URLs ya resueltas.",
      inputSchema: z.object({
        descripcion: z
          .string()
          .describe("Descripción completa del problema del usuario."),
      }),
      execute: async ({ descripcion }) => {
        const limite = limitar("Resolver_problema_soporte");
        if (limite) return limite;
        const flow = matchFlow(descripcion);
        if (!flow) {
          return {
            encontrado: false,
            mensaje:
              "No encontré un flujo que coincida. Pide al usuario que describa mejor el equipo o sistema y el síntoma exacto.",
          };
        }
        // Resuelve las URLs de multimedia (best-effort; si el server falla, van sin URL).
        const urls = await resolveMediaUrls(flow.media.map((m) => m.ref));
        return {
          encontrado: true,
          flujo: flow.flujo,
          categoria: flow.categoria,
          procedimiento: flow.procedimiento_completo,
          multimedia: flow.media.map((m) => ({
            ref: m.ref,
            tipo: m.tipo,
            url: urls[m.ref] ?? null,
          })),
        };
      },
    }),

    Mandar_multimedia: tool({
      description:
        "Muestra una imagen o video de apoyo al usuario en el chat. Úsala cuando el PASO actual incluya [MULTIMEDIA: X]: pásale la url EXACTA de ese archivo (tomada del arreglo 'multimedia' que devolvió Resolver_problema_soporte). El archivo se muestra en el chat; NO escribas la URL en tu texto.",
      inputSchema: z.object({
        url: z
          .string()
          .describe("URL exacta del archivo, del arreglo multimedia de Resolver_problema_soporte."),
      }),
      execute: async ({ url }) => {
        if (!url || !/^https?:\/\//.test(url)) return { ok: false };
        if (!ctx.mediaEnviada.includes(url)) ctx.mediaEnviada.push(url);
        return { ok: true };
      },
    }),

    consultar_precios: tool({
      description:
        "Consulta el precio de uno o varios productos en lenguaje natural. Úsala cuando el usuario pregunte por precios. Pasa la consulta del usuario (ej. 'precio del fabuloso'); la tienda se agrega automáticamente. Devuelve los productos con su precio.",
      inputSchema: z.object({
        consulta: z
          .string()
          .describe("Lo que pregunta el usuario sobre precios (producto/s)."),
      }),
      execute: async ({ consulta }) => {
        // La API parsea la tienda del texto; la añadimos si no viene.
        const mensaje = /tienda\s*\d+/i.test(consulta)
          ? consulta
          : `${consulta} tienda ${ctx.tiendaId}`;
        return safe(() => motor.consultarPrecios(mensaje, ctx.sesionId));
      },
    }),

    Consultar_promociones: tool({
      description:
        "Consulta/valida una promoción en el motor de Neto. Úsala cuando el usuario pregunte si una promoción es válida o sus condiciones. store_id se toma del contexto.",
      inputSchema: z.object({
        producto: z.string().describe("Nombre o SKU del producto."),
        precio: z.union([z.string(), z.number()]).optional(),
        fecha_inicio: z.string().optional(),
        fecha_termino: z.string().optional(),
      }),
      execute: async (p) =>
        safe(() => motor.validarPromocion({ ...p, store_id: ctx.tiendaId })),
    }),

    Actualizar_promocion: tool({
      description:
        "Sincroniza un artículo en SIAN para la tienda (actualiza precio/promoción). Pásale el SKU exacto. store_id se toma del contexto.",
      inputSchema: z.object({
        sku: z.string().describe("SKU exacto del artículo a sincronizar."),
      }),
      execute: async ({ sku }) =>
        safe(() => motor.sincronizarProductos([sku], [ctx.tiendaId])),
    }),
  };
}

// ─── Tools del AGENTE (copiloto) ──────────────────────────────────────────────
export interface AgenteCtx {
  usuarioId: number;
}

export function buildAgenteTools(ctx: AgenteCtx): ToolSet {
  return {
    ver_ticket: tool({
      description:
        "Trae el detalle y la bitácora de un ticket de la cola del agente (qué reportó la tienda, qué se ha intentado, quién lo tiene, estatus y SLA). Úsala cuando el agente pida ver/abrir un ticket por su folio (ej. TKT-2026-00008) o número.",
      inputSchema: z.object({
        folio: z
          .string()
          .describe("Folio (TKT-...) o número del ticket que pide el agente."),
      }),
      execute: async ({ folio }) =>
        safe(() => csn.agenteTicket(ctx.usuarioId, folio)),
    }),

    casos_similares: tool({
      description:
        "Busca casos YA RESUELTOS parecidos (misma tipificación) con la solución que funcionó. Úsala cuando el agente pregunte cómo resolver un ticket o qué se hizo en casos anteriores. Pásale el folio/número del ticket en cuestión.",
      inputSchema: z.object({
        folio: z.string().describe("Folio o número del ticket de referencia."),
      }),
      execute: async ({ folio }) =>
        safe(() => csn.agenteSimilares(ctx.usuarioId, folio)),
    }),
  };
}

// ─── Tools del ADMIN / COORDINADOR (copiloto de operación) ────────────────────
export interface AdminCtx {
  usuarioId: number;
}

export function buildAdminTools(ctx: AdminCtx): ToolSet {
  return {
    kpis_detalle: tool({
      description:
        "Desglose de KPIs a demanda: tickets activos/vencidos/cerrados hoy POR AGENTE y POR ÁREA (respeta el alcance del rol). Úsala cuando pregunten cómo va cada agente o cada área, quién está más cargado o atrasado, o rendimiento del equipo.",
      inputSchema: z.object({}),
      execute: async () => safe(() => csn.adminKpis(ctx.usuarioId)),
    }),

    buscar_ticket: tool({
      description:
        "Trae el detalle y la bitácora de un ticket por su folio (TKT-...) o número: estatus, SLA, tienda, quién lo tiene y qué se ha hecho. Úsala cuando pregunten por un ticket específico.",
      inputSchema: z.object({
        folio: z.string().describe("Folio (TKT-...) o número del ticket."),
      }),
      execute: async ({ folio }) =>
        safe(() => csn.agenteTicket(ctx.usuarioId, folio)),
    }),
  };
}
