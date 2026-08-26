import { defineConfig, globalIgnores } from "eslint/config";
import eslint from "@eslint/js";
import next from "@next/eslint-plugin-next";
import jsxA11y from "eslint-plugin-jsx-a11y";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

const eslintConfig = defineConfig([
  globalIgnores([
    ".next/**",
    "dist/**",
    "out/**",
    "build/**",
    "work/**",
    ".wrangler/**",
    "next-env.d.ts",
    "worker-configuration.d.ts",
  ]),
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  react.configs.flat.recommended,
  react.configs.flat["jsx-runtime"],
  reactHooks.configs.flat["recommended-latest"],
  jsxA11y.flatConfigs.recommended,
  next.configs["core-web-vitals"],
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.serviceworker,
      },
    },
    settings: {
      react: {
        version: "detect",
      },
    },
    rules: {
      // These are local SVG interface assets. Routing them through Next's
      // raster image optimizer adds no value on the Worker deployment.
      "@next/next/no-img-element": "off",
    },
  },
  {
    // This screen is an event-driven realtime orchestrator. These compiler
    // diagnostics mistake intentional clock/ref reads and connection bootstrap
    // effects for ordinary render state.
    files: ["app/page.tsx"],
    rules: {
      "react-hooks/purity": "off",
      "react-hooks/refs": "off",
      "react-hooks/set-state-in-effect": "off",
    },
  },
  {
    // The admin route is intentionally a tiny isolated control surface. Its
    // plain anchors force a full logout/reset when returning to the game.
    files: ["app/admin/page.tsx"],
    rules: {
      "@next/next/no-html-link-for-pages": "off",
      "jsx-a11y/no-autofocus": "off",
    },
  },
]);

export default eslintConfig;
