import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * Base de conocimiento de flujos de soporte (98 flujos, 8 categorías).
 * Fuente: export de las tablas v2 de n8n (Resolver_problema_soporte), normalizado
 * a un JSON plano versionado: src/kb/flujos.json.
 *
 * Estructura de cada flujo:
 *   id, categoria, numero, flujo, descripcion_corta,
 *   procedimiento_completo (texto con 🟢 INICIO / PASO N / ❓ DECISIÓN / 🚨 ESCALAR | ruta → área / ✅ RESUELTO),
 *   multimedia_disponible ("IMG CPU 2 (imagen) | Vid CPU 1 (video) | ...")
 */
export interface Flow {
  id: number;
  categoria: string;
  numero: number;
  flujo: string;
  descripcion_corta: string;
  procedimiento_completo: string;
  multimedia_disponible: string;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
export const FLOWS: Flow[] = JSON.parse(
  readFileSync(join(__dirname, "flujos.json"), "utf8"),
) as Flow[];

// ─── Tokenización (sin acentos: "promoción"→"promocion") ──────────────────────
function tokenizar(s: string): string[] {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // quita diacríticos (acentos, ñ→n)
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3);
}

/** Sinónimos del usuario → términos del catálogo (se expanden al tokenizar la consulta). */
const SINONIMOS: Record<string, string[]> = {
  pantalla: ["monitor"],
  datafono: ["terminal", "bancaria"],
  biometrico: ["huella", "lector"],
  clima: ["aire", "acondicionado"],
  refrigerador: ["refrigeracion"],
  congelador: ["refrigeracion"],
  bloqueado: ["bloqueo"],
  bloqueada: ["bloqueo"],
  internet: ["red", "sion"],
  caja: ["punto", "venta"],
};

/** keywords de un flujo: nombre + categoría (peso alto) + descripción corta (normal). */
function flowTokens(f: Flow): { nombre: string[]; desc: string[] } {
  const nombre = [...new Set([...tokenizar(f.flujo), ...tokenizar(f.categoria)])];
  const descSet = new Set(tokenizar(f.descripcion_corta));
  for (const t of nombre) descSet.delete(t);
  return { nombre, desc: [...descSet] };
}

/** Tokens de la consulta del usuario, expandidos con sinónimos. */
function userTokenSet(descripcion: string): Set<string> {
  const set = new Set(tokenizar(descripcion));
  for (const t of [...set]) {
    for (const syn of SINONIMOS[t] ?? []) set.add(syn);
  }
  return set;
}

const TOKENS = FLOWS.map((f) => ({ flow: f, ...flowTokens(f) }));

// Document frequency SEPARADA: nombre vs descripción.
// Clave: un equipo en el NOMBRE del flujo (ej. "cpu") debe pesar mucho aunque
// se mencione en muchas descripciones. Por eso el IDF del nombre se calcula solo
// sobre los nombres de flujo.
function buildDf(pick: (t: { nombre: string[]; desc: string[] }) => string[]) {
  const df: Record<string, number> = {};
  for (const tk of TOKENS) for (const t of new Set(pick(tk))) df[t] = (df[t] ?? 0) + 1;
  return df;
}
const DF_NOMBRE = buildDf((t) => t.nombre);
const DF_DESC = buildDf((t) => t.desc);
const idfNombre = (t: string) => 1 / (DF_NOMBRE[t] ?? 1);
const idfDesc = (t: string) => 1 / (DF_DESC[t] ?? 1);

// ─── Multimedia ───────────────────────────────────────────────────────────────
export interface MediaRef {
  ref: string; // nombre exacto del archivo, ej. "Vid CPU 1"
  tipo: "imagen" | "video";
}

/** Extrae las referencias multimedia de un flujo desde multimedia_disponible. */
export function mediaRefs(f: Flow): MediaRef[] {
  const out: MediaRef[] = [];
  for (const parte of (f.multimedia_disponible || "").split("|")) {
    const m = parte.trim().match(/^(.*?)\s*\((imagen|video)\)$/i);
    if (m) out.push({ ref: m[1].trim(), tipo: m[2].toLowerCase() as "imagen" | "video" });
  }
  return out;
}

// ─── Acceso ────────────────────────────────────────────────────────────────────
export interface FlowMatch {
  id: number;
  categoria: string;
  flujo: string;
  procedimiento_completo: string;
  media: MediaRef[];
}

function findByName(name: string): Flow | undefined {
  const n = name.trim().toLowerCase();
  return FLOWS.find((f) => f.flujo.trim().toLowerCase() === n);
}

/**
 * Expande los flujos referenciados ("continuar con el flujo 'X'") concatenando su
 * procedimiento, para que el agente reciba el árbol completo de una vez y no tenga
 * que "buscar otra vez" a mitad de la conversación. Evita ciclos con `seen`.
 */
function expand(
  f: Flow,
  seen: Set<number>,
): { proc: string; media: MediaRef[] } {
  seen.add(f.id);
  let proc = f.procedimiento_completo;
  let media = mediaRefs(f);
  const refs = new Set<string>();
  const re = /flujo\s*["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(f.procedimiento_completo)) !== null) refs.add(m[1]);
  for (const name of refs) {
    const rf = findByName(name);
    if (rf && !seen.has(rf.id)) {
      const sub = expand(rf, seen);
      proc += `\n\n— (continuación del diagnóstico) —\n${sub.proc}`;
      media = [...media, ...sub.media];
    }
  }
  // dedupe media por ref
  const vistos = new Set<string>();
  media = media.filter((x) => !vistos.has(x.ref) && vistos.add(x.ref));
  return { proc, media };
}

function toMatch(f: Flow): FlowMatch {
  const { proc, media } = expand(f, new Set());
  return {
    id: f.id,
    categoria: f.categoria,
    flujo: f.flujo,
    procedimiento_completo: proc,
    media,
  };
}

export function getFlow(id: number): FlowMatch | null {
  const f = FLOWS.find((x) => x.id === id);
  return f ? toMatch(f) : null;
}

/**
 * Empareja la descripción del usuario con el mejor flujo.
 * Score = Σ IDF de tokens coincidentes; el NOMBRE del flujo pesa x4 (es lo más
 * discriminante). Determinista, sin llamada extra al modelo. Match por palabra completa.
 */
export function matchFlow(descripcion: string): FlowMatch | null {
  const userTokens = userTokenSet(descripcion);
  if (userTokens.size === 0) return null;

  let best: Flow | null = null;
  let bestScore = 0;
  for (const { flow, nombre, desc } of TOKENS) {
    let score = 0;
    for (const t of nombre) if (userTokens.has(t)) score += idfNombre(t) * 4;
    for (const t of desc) if (userTokens.has(t)) score += idfDesc(t);
    if (score > bestScore) {
      bestScore = score;
      best = flow;
    }
  }
  // Umbral: al menos una coincidencia razonablemente discriminante.
  if (!best || bestScore < 1) return null;
  return toMatch(best);
}
