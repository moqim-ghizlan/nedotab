/**
 * The platform the code runs on: "#plateforme" is resolved at build time (vite.config.js,
 * vitest.config.js) to extension.js or pwa.js, so that each target only carries its own
 * code (no chrome.* in the web app). The interface reads `plateforme.capacites`.
 */
import * as impl from "#plateforme";

export const plateforme = impl;
