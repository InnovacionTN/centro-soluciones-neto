import { config } from "../config.js";
import { type MemoryStore, InMemoryStore } from "./store.js";
import { PostgresStore } from "./postgres.js";

export type { MemoryStore } from "./store.js";

let singleton: MemoryStore | null = null;

/**
 * Devuelve el store de memoria. Usa Postgres/Neon si hay DATABASE_URL;
 * si no, cae a memoria de proceso (dev/test).
 */
export function getMemory(): MemoryStore {
  if (singleton) return singleton;
  if (config.databaseUrl) {
    console.log("[memory] usando PostgresStore (Neon)");
    singleton = new PostgresStore(config.databaseUrl);
  } else {
    console.warn("[memory] sin DATABASE_URL → InMemoryStore (no persistente)");
    singleton = new InMemoryStore();
  }
  return singleton;
}
