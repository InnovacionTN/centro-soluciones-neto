import { google } from "@ai-sdk/google";
import { config } from "./config.js";

/**
 * Modelo central. El provider @ai-sdk/google toma la key de
 * GOOGLE_GENERATIVE_AI_API_KEY automáticamente.
 *
 * Aislado aquí para poder cambiar de modelo/proveedor en un solo lugar.
 */
export const danyModel = () => google(config.model);
