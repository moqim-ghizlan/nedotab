import { cpSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, loadEnv } from "vite";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

/**
 * Writes dist/extension/manifest.json (version from package.json, OAuth client id from the
 * environment) and copies the icons.
 */
function manifestExtension(env) {
  return {
    name: "manifest-extension",
    apply: "build",
    writeBundle(options) {
      const source = JSON.parse(readFileSync(resolve("extension/manifest.json"), "utf8"));
      source.version = pkg.version;
      // Google sign-in (V2.1): the client id comes from .env.local, never from the repository.
      if (env.VITE_OAUTH_CLIENT_ID_EXTENSION) {
        source.oauth2 = {
          client_id: env.VITE_OAUTH_CLIENT_ID_EXTENSION,
          scopes: ["openid", "email", "profile"],
        };
      }
      mkdirSync(options.dir, { recursive: true });
      writeFileSync(resolve(options.dir, "manifest.json"), JSON.stringify(source, null, 2));
      cpSync(resolve("extension/icons"), resolve(options.dir, "icons"), { recursive: true });
    },
  };
}

export default defineConfig(({ mode }) => {
  if (mode === "pwa") throw new Error("Cible PWA prévue en V3.0");
  if (mode !== "extension") throw new Error(`Mode inconnu : ${mode} (attendu : extension)`);
  const env = loadEnv(mode, process.cwd(), "VITE_");
  return {
    base: "./",
    publicDir: false,
    define: {
      "import.meta.env.VITE_TARGET": JSON.stringify(mode),
      "import.meta.env.VITE_VERSION": JSON.stringify(pkg.version),
    },
    build: {
      outDir: "dist/extension",
      emptyOutDir: true,
      sourcemap: true,
      modulePreload: { polyfill: false },
      rollupOptions: { input: { newtab: "newtab.html" } },
    },
    plugins: [manifestExtension(env)],
  };
});
