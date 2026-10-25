import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

// V3.0: the whole suite runs for each target (`npm run test:cibles`): CIBLE=pwa vitest run.
const cible = process.env.CIBLE === "pwa" ? "pwa" : "extension";
const define = { "import.meta.env.VITE_TARGET": JSON.stringify(cible) };
const resolve_ = {
  alias: {
    "#plateforme": resolve(`src/platform/${cible}.js`),
    "#auth": resolve(`src/firebase/auth.${cible}.js`),
  },
};

// Security-rules tests need the Firebase emulators: `npm run test:regles` starts them and
// sets FIRESTORE_EMULATOR_HOST, which enables the "regles" project.
const avecEmulateurs = !!process.env.FIRESTORE_EMULATOR_HOST;

export default defineConfig({
  define,
  resolve: resolve_,
  test: {
    projects: [
      {
        define,
        resolve: resolve_,
        test: {
          name: "core",
          environment: "node",
          include: ["tests/core/**/*.test.js", "tests/scripts/**/*.test.js"],
        },
      },
      {
        define,
        resolve: resolve_,
        test: { name: "ui", environment: "happy-dom", include: ["tests/ui/**/*.test.js"] },
      },
      ...(avecEmulateurs
        ? [
            {
              // The redirect sign-in of the web app cannot run in Node: the emulator tests
              // sign in with a token (auth.extension.js) and test the rest of each target.
              resolve: {
                alias: { ...resolve_.alias, "#auth": resolve("src/firebase/auth.extension.js") },
              },
              test: {
                name: "regles",
                env: { VITE_UTILISER_EMULATEURS: "true" },
                // The files share the emulators and clear them: one at a time.
                fileParallelism: false,
                environment: "node",
                include: ["tests/regles/**/*.test.js"],
                testTimeout: 20000,
              },
            },
          ]
        : []),
    ],
    coverage: {
      provider: "v8",
      include: ["src/core/**"],
      reporter: ["text-summary", "text"],
      thresholds: { lines: 90 },
    },
  },
});
