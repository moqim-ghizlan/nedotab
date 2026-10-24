import { defineConfig } from "vitest/config";

const define = { "import.meta.env.VITE_TARGET": JSON.stringify("extension") };

// Security-rules tests need the Firebase emulators: `npm run test:regles` starts them and
// sets FIRESTORE_EMULATOR_HOST, which enables the "regles" project.
const avecEmulateurs = !!process.env.FIRESTORE_EMULATOR_HOST;

export default defineConfig({
  define,
  test: {
    projects: [
      {
        define,
        test: {
          name: "core",
          environment: "node",
          include: ["tests/core/**/*.test.js", "tests/scripts/**/*.test.js"],
        },
      },
      {
        define,
        test: { name: "ui", environment: "happy-dom", include: ["tests/ui/**/*.test.js"] },
      },
      ...(avecEmulateurs
        ? [
            {
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
