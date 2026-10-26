/**
 * The providers the code knows (V4.0): which ones the users can choose is decided by
 * config/ia (`fournisseurs[].actif`), not here.
 */
import * as gemini from "./gemini.js";
import * as openai from "./openai.js";

export const FOURNISSEURS = { openai, gemini };
