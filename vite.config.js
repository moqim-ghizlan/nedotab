import { cpSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, loadEnv } from "vite";
import { VitePWA } from "vite-plugin-pwa";

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
      build: {
        ...build,
        outDir: "dist/pwa",
        rollupOptions: { input: { index: "index.html", recevoir: "recevoir.html" } },
      },
      plugins: [
        // V3.7: the interface opens without network; a new version is offered, never forced
        // (registerSW in src/ui/miseAJour.js). Only in this build: the extension has none.
        VitePWA({
          registerType: "prompt",
          injectRegister: false,
          manifest: false,
          workbox: {
            globPatterns: ["**/*.{js,css,html,svg,png,webp,woff2,webmanifest}"],
            // The debug console is loaded on demand only: not worth precaching (V3.10).
            globIgnores: ["**/eruda-*.js", "**/recevoir*"],
            navigateFallback: "/index.html",
            // The sign-in redirect pages of Firebase (/__/auth/...) must reach the server.
            navigateFallbackDenylist: [/^\/__\//],
            cleanupOutdatedCaches: true,
            // Firebase requests (Firestore, Storage, Auth) are never cached here: the SDK
            // and its IndexedDB cache handle them. Favicons are not cached either: <img>
            // requests are opaque (status 0), so errors and Google's default icon were cached
            // as successes and came back on every normal reload (only Ctrl+Shift+R fixed it).
            // The browser's HTTP cache is enough.
            runtimeCaching: [],
          },
        }),
      ],
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
      // V5.3: the background worker (sw-extension) keeps a fixed name: the manifest points to it.
      rollupOptions: {
        input: {
          newtab: "newtab.html",
          popup: "popup.html",
          "sw-extension": "src/platform/extension/sw.js",
        },
        output: {
          entryFileNames: (c) =>
            c.name === "sw-extension" ? "sw-extension.js" : "assets/[name]-[hash].js",
        },
      },
    },
    plugins: [manifestExtension(env)],
  };
});
