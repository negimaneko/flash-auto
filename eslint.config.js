import js from "@eslint/js";
import globals from "globals";

export default [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.node,
      },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "no-undef": "error",
      "no-constant-condition": "warn",
      "no-debugger": "error",
      "no-duplicate-case": "error",
      "no-empty": "warn",
      "no-unreachable": "error",
      "eqeqeq": ["warn", "smart"],
      "no-var": "warn",
      "preserve-caught-error": "off",
      "no-useless-assignment": "off",
    },
  },
  {
    ignores: ["dist/", "node_modules/", ".vercel/"],
  },
];
