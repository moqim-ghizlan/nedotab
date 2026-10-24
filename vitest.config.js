import { defineConfig } from "vitest/config";

const define = { "import.meta.env.VITE_TARGET": JSON.stringify("extension") };

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
    ],
    coverage: {
      provider: "v8",
      include: ["src/core/**"],
      reporter: ["text-summary", "text"],
      thresholds: { lines: 90 },
    },
  },
});
