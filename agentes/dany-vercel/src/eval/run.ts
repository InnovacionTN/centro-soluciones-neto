/**
 * Runner de evaluación de comportamiento de Dany.
 *
 * Lanza cada conversación de cases.ts contra el agente vivo (HTTP) y verifica las
 * aserciones. Es una prueba de integración: requiere el agente en :8080 y el backend
 * CSN arriba (el agente los llama). No mockea el LLM a propósito — evaluamos el
 * comportamiento real.
 *
 *   npm run eval                      # usa http://localhost:8080/dany-csn
 *   AGENT_URL=... TIENDA_ID=749 npm run eval
 *
 * Sale con código 1 si algún caso falla (apto para CI).
 */
import { CASES, NO_FUGAS, type Case, type Turn } from "./cases.js";

const AGENT_URL = process.env.AGENT_URL ?? "http://localhost:8080/dany-csn";
const TIENDA_ID = Number(process.env.TIENDA_ID ?? 749);
const TIENDA_NOMBRE = process.env.TIENDA_NOMBRE ?? "PANZACOLA";
const USUARIO_ID = Number(process.env.USUARIO_ID ?? 18);

interface AgentResponse {
  respuesta: string;
  accion: string;
  multimedia_url: string | null;
}

async function send(sesionId: string, rol: string, turn: Turn): Promise<AgentResponse> {
  const body: Record<string, unknown> = {
    sesion_id: sesionId,
    tienda_id: TIENDA_ID,
    tienda_nombre: TIENDA_NOMBRE,
    rol_usuario: rol,
    usuario_id: USUARIO_ID,
  };
  if (turn.evento) body.evento = turn.evento;
  else body.mensaje = turn.user;

  const res = await fetch(AGENT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as AgentResponse;
}

interface Fail {
  caso: string;
  turno: number;
  motivo: string;
  respuesta: string;
}

function checkTurn(c: Case, idx: number, turn: Turn, r: AgentResponse, fails: Fail[]) {
  const txt = r.respuesta ?? "";
  const push = (motivo: string) =>
    fails.push({ caso: c.name, turno: idx + 1, motivo, respuesta: txt.slice(0, 160) });

  // Reglas globales de no-fuga (solo para TIENDA).
  if ((c.rol ?? "TIENDA") === "TIENDA") {
    for (const rx of NO_FUGAS) if (rx.test(txt)) push(`fuga interna: ${rx}`);
  }
  for (const rx of turn.mustMatch ?? []) if (!rx.test(txt)) push(`falta mustMatch: ${rx}`);
  for (const rx of turn.mustNotMatch ?? []) if (rx.test(txt)) push(`viola mustNotMatch: ${rx}`);
  if (turn.expectAccion && r.accion !== turn.expectAccion)
    push(`accion esperada ${turn.expectAccion}, recibí ${r.accion}`);
}

async function main() {
  console.log(`\n🧪 Eval Dany → ${AGENT_URL}  (tienda ${TIENDA_ID})\n`);
  const fails: Fail[] = [];
  let turnos = 0;

  for (const c of CASES) {
    const rol = c.rol ?? "TIENDA";
    const sesionId = `eval-${c.name}-${Date.now()}`;
    process.stdout.write(`• ${c.name} `);
    try {
      for (let i = 0; i < c.turns.length; i++) {
        const r = await send(sesionId, rol, c.turns[i]);
        checkTurn(c, i, c.turns[i], r, fails);
        turnos++;
        process.stdout.write(".");
      }
      const ok = !fails.some((f) => f.caso === c.name);
      console.log(ok ? " ✅" : " ❌");
    } catch (e) {
      fails.push({ caso: c.name, turno: 0, motivo: `error: ${(e as Error).message}`, respuesta: "" });
      console.log(" 💥");
    }
  }

  console.log("\n────────────────────────────────────────");
  if (fails.length === 0) {
    console.log(`✅ TODO PASÓ — ${CASES.length} casos, ${turnos} turnos.\n`);
    process.exit(0);
  }
  console.log(`❌ ${fails.length} fallo(s) en ${turnos} turnos:\n`);
  for (const f of fails) {
    console.log(`  [${f.caso} · turno ${f.turno}] ${f.motivo}`);
    if (f.respuesta) console.log(`     ↳ "${f.respuesta}"`);
  }
  console.log("");
  process.exit(1);
}

main().catch((e) => {
  console.error("eval crash:", e);
  process.exit(1);
});
