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
  if (!["extension", "pwa"].includes(mode))
    throw new Error(`Mode inconnu : ${mode} (attendu : extension ou pwa)`);
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const define = {
    "import.meta.env.VITE_TARGET": JSON.stringify(mode),
    "import.meta.env.VITE_VERSION": JSON.stringify(pkg.version),
  };
  // The platform layer of this target only (src/platform/index.js).
  // V3.2: Google sign-in of this target only (no web-extension Auth in the web app).
  const resolve_ = {
    alias: {
      "#plateforme": resolve(`src/platform/${mode}.js`),
      "#auth": resolve(`src/firebase/auth.${mode}.js`),
    },
  };
  const build = {
    emptyOutDir: true,
    sourcemap: true,
    // The Firebase chunk (Auth + Firestore + Storage) is ~500 KB, loaded only with an account.
    chunkSizeWarningLimit: 700,
    modulePreload: { polyfill: false },
  };
  // V3.0: the web app (iPhone, iPad, any browser), hosted on Firebase Hosting.
  if (mode === "pwa") {
    return {
      base: "/",
      publicDir: "public",
      define,
      resolve: resolve_,
      build: { ...build, outDir: "dist/pwa", rollupOptions: { input: { index: "index.html" } } },
    };
  }
  return {
    base: "./",
    publicDir: false,
    define,
    resolve: resolve_,
    build: {
      ...build,
      outDir: "dist/extension",
      rollupOptions: { input: { newtab: "newtab.html" } },
    },
    plugins: [manifestExtension(env)],
  };
});
