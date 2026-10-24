import js from "@eslint/js";
import globals from "globals";

export default [
  { ignores: ["dist/", "release/", "coverage/", "node_modules/"] },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: { ...globals.browser, chrome: "readonly" },
    },
    rules: { "no-unused-vars": ["error", { argsIgnorePattern: "^_" }] },
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
