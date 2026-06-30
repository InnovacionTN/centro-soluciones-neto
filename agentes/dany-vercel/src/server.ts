import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { config, hasModelKey } from "./config.js";
import { DanyRequest, type DanyResponse } from "./types.js";
import { handleDany } from "./agents/index.js";

const app = new Hono();

app.get("/health", (c) =>
  c.json({
    status: "ok",
    service: "csn-dany-agent",
    model: config.model,
    modelKey: hasModelKey(),
    env: config.nodeEnv,
  }),
);

/**
 * Endpoint principal — mismo contrato que el webhook n8n "dany-csn".
 * El backend CSN reenvía aquí desde POST /api/v1/dany/chat.
 */
app.post("/dany-csn", async (c) => {
  // Auth de entrada opcional: si DANY_WEBHOOK_SECRET está seteado, exigirlo.
  if (config.webhookSecret) {
    if (c.req.header("X-Dany-Webhook-Secret") !== config.webhookSecret) {
      return c.json({ error: "no autorizado" }, 401);
    }
  }

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "JSON inválido" }, 400);
  }

  const parsed = DanyRequest.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "payload inválido", detalle: parsed.error.issues }, 422);
  }

  if (!hasModelKey()) {
    // Modo degradado: permite probar la tubería sin key (como el demo mode de n8n).
    const fallback: DanyResponse = {
      respuesta:
        "Dany está en línea pero falta configurar la API key del modelo (GOOGLE_GENERATIVE_AI_API_KEY).",
      accion: "continuar",
      resumen: "",
      multimedia_url: null,
    };
    return c.json(fallback);
  }

  try {
    const res = await handleDany(parsed.data);
    return c.json(res);
  } catch (err) {
    console.error("[dany-csn] error:", err);
    const fail: DanyResponse = {
      respuesta:
        "Tuve un problema técnico al procesar tu mensaje. Intenta de nuevo en un momento.",
      accion: "continuar",
      resumen: "",
      multimedia_url: null,
    };
    return c.json(fail, 200); // 200 para que el frontend muestre el mensaje
  }
});

serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`[csn-dany-agent] escuchando en :${info.port} (env=${config.nodeEnv})`);
});
