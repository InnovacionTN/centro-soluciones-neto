import pg from "pg";
import type { ModelMessage } from "ai";
import { type MemoryStore, trimHistory } from "./store.js";

/**
 * Adaptador Postgres/Neon. Guarda el historial de mensajes (incluye tool calls)
 * como JSONB por sesion_id. Tabla nueva, propia del agente — el backend CSN no
 * la toca (la tabla DanySesion del backend es solo para KPIs/deflexión).
 */
export class PostgresStore implements MemoryStore {
  private pool: pg.Pool;
  private ready: Promise<void>;

  constructor(connectionString: string) {
    this.pool = new pg.Pool({
      connectionString,
      ssl: { rejectUnauthorized: false }, // Neon requiere SSL
      max: 5,
    });
    this.ready = this.init();
  }

  private async init(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS dany_chat_memory (
        sesion_id   TEXT PRIMARY KEY,
        messages    JSONB NOT NULL DEFAULT '[]'::jsonb,
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
  }

  async load(sessionId: string): Promise<ModelMessage[]> {
    await this.ready;
    const r = await this.pool.query<{ messages: ModelMessage[] }>(
      "SELECT messages FROM dany_chat_memory WHERE sesion_id = $1",
      [sessionId],
    );
    return r.rows[0]?.messages ?? [];
  }

  async append(sessionId: string, messages: ModelMessage[]): Promise<void> {
    await this.ready;
    // Concatena en jsonb y recorta al límite en una sola transacción simple.
    const current = await this.load(sessionId);
    const next = trimHistory([...current, ...messages]);
    await this.pool.query(
      `INSERT INTO dany_chat_memory (sesion_id, messages, updated_at)
       VALUES ($1, $2::jsonb, now())
       ON CONFLICT (sesion_id)
       DO UPDATE SET messages = $2::jsonb, updated_at = now()`,
      [sessionId, JSON.stringify(next)],
    );
  }

  async clear(sessionId: string): Promise<void> {
    await this.ready;
    await this.pool.query("DELETE FROM dany_chat_memory WHERE sesion_id = $1", [
      sessionId,
    ]);
  }
}
