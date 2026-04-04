import reactHooks from "@typescript-eslint/eslint-plugin"
import parser from "@typescript-eslint/parser"
import reactHooksPlugin from "eslint-plugin-react-hooks"
import reactRefresh from "eslint-plugin-react-refresh"

const browserGlobals = {
  AbortController: "readonly",
  ResizeObserver: "readonly",
  TextDecoder: "readonly",
  URL: "readonly",
  console: "readonly",
  document: "readonly",
  fetch: "readonly",
  localStorage: "readonly",
  setTimeout: "readonly",
  clearTimeout: "readonly",
  window: "readonly",
}

export default [
  {
    ignores: ["dist", "coverage"],
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      parser,
      ecmaVersion: 2022,
      sourceType: "module",
      globals: browserGlobals,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    plugins: {
      "@typescript-eslint": reactHooks,
      "react-hooks": reactHooksPlugin,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...reactHooksPlugin.configs.recommended.rules,
      "@typescript-eslint/no-explicit-any": "off",
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
    },
  },
]
