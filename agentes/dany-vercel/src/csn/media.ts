import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { config } from "../config.js";

/**
 * Resolución de URLs de multimedia desde un MANIFIESTO local (sin API de listado).
 * El manifiesto (src/kb/media-manifest.json) mapea cada referencia ("vid cpu 1")
 * a su ruta de archivo ("1 - CPU/Vid CPU 1.mp4"). La URL final apunta al bucket
 * público de GCS (config.mediaBaseUrl).
 *
 * Esto elimina la dependencia del API flaky de listado: una sola fuente estable.
 */
const __dirname = dirname(fileURLToPath(import.meta.url));
const MANIFEST: Record<string, string> = JSON.parse(
  readFileSync(join(__dirname, "..", "kb", "media-manifest.json"), "utf8"),
);

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
const encodePath = (p: string) =>
  p.split("/").map(encodeURIComponent).join("/");

/**
 * Mapea referencias ("Vid CPU 1", "IMG MON 5") → URL pública del archivo.
 * Las que no estén en el manifiesto se omiten (el agente sigue solo con texto).
 */
export async function resolveMediaUrls(
  refs: string[],
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const ref of refs) {
    const path = MANIFEST[norm(ref)];
    if (path) out[ref] = `${config.mediaBaseUrl}/${encodePath(path)}`;
  }
  return out;
}
