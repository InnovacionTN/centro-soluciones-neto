import type { ModelMessage } from "ai";

/**
 * Memoria de conversación por sesion_id. Necesaria porque Cloud Run es stateless:
 * sin esto, Dany no recuerda el turno anterior.
 *
 * Interfaz + adaptadores (in-memory para dev/test, Postgres/Neon para prod).
 */
export interface MemoryStore {
  load(sessionId: string): Promise<ModelMessage[]>;
  append(sessionId: string, messages: ModelMessage[]): Promise<void>;
  clear(sessionId: string): Promise<void>;
}

/** Conserva solo los últimos N mensajes para acotar tokens/costo. */
export const MAX_MESSAGES = 40;

export function trimHistory(messages: ModelMessage[]): ModelMessage[] {
  if (messages.length <= MAX_MESSAGES) return messages;
  return messages.slice(messages.length - MAX_MESSAGES);
}

/** Adaptador en memoria del proceso. Solo dev/test (se pierde al reiniciar). */
export class InMemoryStore implements MemoryStore {
  private map = new Map<string, ModelMessage[]>();

  async load(sessionId: string): Promise<ModelMessage[]> {
    return this.map.get(sessionId) ?? [];
  }

  async append(sessionId: string, messages: ModelMessage[]): Promise<void> {
    const prev = this.map.get(sessionId) ?? [];
    this.map.set(sessionId, trimHistory([...prev, ...messages]));
  }

  async clear(sessionId: string): Promise<void> {
    this.map.delete(sessionId);
  }
}
