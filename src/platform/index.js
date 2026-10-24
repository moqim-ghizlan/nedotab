import * as ext from "./extension.js";
import * as pwa from "./pwa.js";

export const plateforme = import.meta.env.VITE_TARGET === "pwa" ? pwa : ext;
