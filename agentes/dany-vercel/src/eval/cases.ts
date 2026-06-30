/**
 * Casos de evaluación de comportamiento de Dany (rol TIENDA).
 *
 * Cada caso es una conversación de uno o varios turnos. Por turno declaramos:
 *  - mustMatch:    la respuesta DEBE cumplir TODAS estas expresiones.
 *  - mustNotMatch: la respuesta NO debe cumplir NINGUNA (fugas / antipatrones).
 *  - expectAccion: (opcional) acción esperada (continuar | resuelto | escalado).
 *
 * Además, a TODAS las respuestas se les aplican las reglas globales NO_FUGAS
 * (que Dany nunca revele mecánica interna). Estos casos cubren los bugs reales
 * que encontramos analizando conversaciones de producción.
 */

export interface Turn {
  user: string;
  evento?: "recordatorio" | "cierre_inactividad";
  mustMatch?: RegExp[];
  mustNotMatch?: RegExp[];
  expectAccion?: "continuar" | "resuelto" | "escalado";
}

export interface Case {
  name: string;
  rol?: "TIENDA" | "AGENTE" | "ADMIN";
  turns: Turn[];
}

/** Antipatrones que NINGUNA respuesta de tienda debe contener (fuga de lo interno). */
export const NO_FUGAS: RegExp[] = [
  /\bPASO\s*\d/i, // "PASO 3"
  /\bFASE\b/,
  /\bherramienta\b/i,
  /\btool\b/i,
  /Folio CSN/i,
  /no encontr[ée]/i,
  /\[MULTIMEDIA/i,
  /el sistema me (mand|dij|pid)/i,
  /\bSwitch\b/,
  /https?:\/\//i, // nunca pegar URLs en el texto
];

export const CASES: Case[] = [
  {
    name: "saludo-no-listo",
    turns: [
      {
        user: "Hola necesito ayuda",
        // Un saludo no debe responderse con "¡Listo!" (eso es solo tras completar algo).
        mustNotMatch: [/^¡?\s*listo/i],
        expectAccion: "continuar",
      },
    ],
  },
  {
    name: "vago-pregunta-sintoma",
    turns: [
      {
        // Descripción vaga: debe PREGUNTAR el síntoma, no saltar a un paso profundo.
        user: "tengo problemas con la impresora",
        mustMatch: [/\?/],
        mustNotMatch: [/corte de (la )?impresi[oó]n/i, /¿imprime (bien|correctamente)/i],
        expectAccion: "continuar",
      },
    ],
  },
  {
    name: "arranca-por-el-inicio",
    turns: [
      {
        // Síntoma claro de no encender: debe arrancar por lo primero (encendido),
        // NO por un paso de verificación final (corte/impresión correcta).
        user: "la impresora no imprime, no prende",
        mustMatch: [/encend|prend|foquito|bot[oó]n|cable/i],
        mustNotMatch: [/corte de (la )?impresi[oó]n/i],
        expectAccion: "continuar",
      },
    ],
  },
  {
    name: "terminal-intenta-antes-de-escalar",
    turns: [
      {
        // Caso real: antes escalaba directo. Debe intentar diagnóstico, NO proponer ticket ya.
        user: "la terminal no abre sesión, ya reinicié y nada",
        mustMatch: [/\?/],
        mustNotMatch: [/genero (un|el) reporte/i, /\bfolio\b/i, /crear (un )?ticket/i],
        expectAccion: "continuar",
      },
    ],
  },
  {
    name: "sin-fugas-multiturno",
    turns: [
      { user: "el monitor tiene rayas en la pantalla", expectAccion: "continuar" },
      { user: "ya revisé el cable y sigue igual" },
      { user: "no, sigue con rayas" },
    ],
  },
  {
    name: "precio-no-inventa",
    turns: [
      {
        // No debe inventar precios; debe consultarlos o pedir el producto.
        user: "cuánto cuesta la coca cola de 600ml",
        mustNotMatch: NO_FUGAS,
      },
    ],
  },
];
