import js from "@eslint/js";
import globals from "globals";

export default [
  { ignores: ["dist/", "release/", "coverage/", "node_modules/"] },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: { ...globals.browser },
    },
    rules: {
      "no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      // V3.0: only the extension's platform layer may use chrome.*; the rest of the code runs
      // in the web app too and goes through src/platform (plateforme, capacites).
      "no-restricted-globals": [
        "error",
        { name: "chrome", message: "chrome.* seulement dans src/platform/extension.js" },
      ],
    },
  },
  {
    files: ["src/platform/extension.js"],
    languageOptions: { globals: { chrome: "readonly" } },
    rules: { "no-restricted-globals": "off" },
  },
  {
    files: ["scripts/**", "*.config.js"],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    files: ["tests/**"],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
  {
    files: ["src/core/**"],
    rules: {
      "no-restricted-globals": [
        "error",
        ...["document", "window", "chrome", "localStorage", "fetch"].map((name) => ({
          name,
          message: "src/core doit rester pur",
        })),
      ],
    },
  },
];
