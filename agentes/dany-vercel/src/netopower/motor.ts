import { config } from "../config.js";

/**
 * Cliente del "motor" externo de Neto (precios, promociones, sincronización SIAN,
 * análisis de foto). Mismo host y key que el servidor de multimedia.
 *   Base: DANY_MEDIA_BASE_URL (https://dany.netopower123.com)
 *   Auth: header X-API-Key (DANY_MEDIA_API_KEY)
 */
async function motorPost<T>(endpoint: string, body: unknown): Promise<T> {
  const resp = await fetch(`${config.motorBaseUrl}${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(config.mediaApiKey ? { "X-API-Key": config.mediaApiKey } : {}),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  const text = await resp.text();
  if (!resp.ok) throw new Error(`motor ${endpoint} → ${resp.status}: ${text.slice(0, 150)}`);
  return text ? (JSON.parse(text) as T) : ({} as T);
}

export const motor = {
  /** Valida/consulta una promoción en el motor. */
  validarPromocion: (p: {
    producto: string;
    precio?: string | number;
    fecha_inicio?: string;
    fecha_termino?: string;
    store_id: number;
  }) => motorPost<unknown>("/api/promotions/validate", p),

  /** Sincroniza artículos en SIAN. */
  sincronizarProductos: (skus: string[], storeIds: number[]) =>
    motorPost<unknown>("/api/products/sync", { skus, store_ids: storeIds }),

  /** Analiza una imagen (promo/hardware/general) — requiere URL pública de la imagen. */
  analizarFoto: (imagenUrl: string) =>
    motorPost<unknown>("/api/image-analysis/analyze", { imagen_url: imagenUrl }),

  /**
   * Consulta de precios (API Patricia, host aparte, sin auth).
   * `mensaje` es lenguaje natural (incluye producto y tienda).
   * Devuelve { status, tienda_nombre, total_encontrados, productos[] }.
   */
  consultarPrecios: async (mensaje: string, channelId: string) => {
    const resp = await fetch(
      `${config.preciosApiUrl}/api/v1/verificar/consulta-precio`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mensaje, channel_id: channelId }),
        signal: AbortSignal.timeout(30_000),
      },
    );
    const text = await resp.text();
    if (!resp.ok) throw new Error(`consulta-precio → ${resp.status}: ${text.slice(0, 150)}`);
    return text ? JSON.parse(text) : {};
  },
};
