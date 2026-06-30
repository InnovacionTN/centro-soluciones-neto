// Carga .env en desarrollo local. En Cloud Run no hay .env (no hace nada) y las
// variables vienen de --set-env-vars / --set-secrets.
import "dotenv/config";

/**
 * Configuración central leída de variables de entorno.
 * En Cloud Run estas vienen de --set-env-vars / --set-secrets.
 */

function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined || v === "") {
    // No lanzamos en arranque para permitir health checks sin secretos
    // (las tools validan su propia config al ejecutarse).
    console.warn(`[config] variable de entorno faltante: ${name}`);
    return "";
  }
  return v;
}

export const config = {
  port: Number(process.env.PORT ?? 8080),
  nodeEnv: process.env.NODE_ENV ?? "development",

  // Modelo
  googleApiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? "",
  model: process.env.DANY_MODEL ?? "gemini-2.5-flash",

  // Backend CSN
  csnApiUrl: required("CSN_API_URL", "https://csn-api-prod-312707215871.us-central1.run.app"),
  danySystemToken: process.env.DANY_SYSTEM_TOKEN ?? "",

  // Secreto de entrada al webhook (lo manda el backend en X-Dany-Webhook-Secret).
  // Si está vacío, no se valida (útil para la primera prueba; activarlo en prod).
  webhookSecret: process.env.DANY_WEBHOOK_SECRET ?? "",

  // Archivos de multimedia (imágenes/videos) — bucket público de GCS.
  mediaBaseUrl:
    process.env.DANY_MEDIA_BASE_URL ?? "https://storage.googleapis.com/csn-dany-media",

  // Motor externo (promos/SIAN/análisis de foto) — netopower, con X-API-Key.
  motorBaseUrl: process.env.DANY_MOTOR_BASE_URL ?? "https://dany.netopower123.com",
  mediaApiKey: process.env.DANY_MEDIA_API_KEY ?? "", // X-API-Key del motor

  // API de precios (Patricia) — host aparte, sin auth
  preciosApiUrl: process.env.DANY_PRECIOS_API_URL ?? "https://patricia-api.soyneto.com",

  // Persistencia
  databaseUrl: process.env.DATABASE_URL ?? "",
} as const;

export const hasModelKey = () => config.googleApiKey.length > 0;
