import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    name: "mineSDK/ignores",
    ignores: [
      "**/dist/**",
      "**/.next/**",
      "**/.source/**",
      "**/node_modules/**",
      "**/coverage/**",
      "**/*.d.ts",
      "apps/**", // apps/web lints itself with Next's rules
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    name: "mineSDK/globals",
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: { ...globals.node, ...globals.es2023 },
    },
    rules: {
      // Project-wide convention: a leading underscore marks a deliberately unused arg/var.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", ignoreRestSiblings: true },
      ],
    },
  },
  {
    name: "mineSDK/library-type-checked",
    files: ["**/src/**/*.ts", "**/test/**/*.ts"],
    extends: [...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/require-await": "error",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/switch-exhaustiveness-check": [
        "error",
        { considerDefaultExhaustiveForUnions: true },
      ],
      eqeqeq: ["error", "always", { null: "ignore" }],
      "no-console": "error",
    },
  },
  {
    name: "mineSDK/tests",
    files: ["**/test/**/*.ts"],
    rules: {
      "@typescript-eslint/require-await": "off",
      "@typescript-eslint/no-base-to-string": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
      // node:test's top-level test()/describe() calls return a Promise the
      // runner schedules internally — floating by design, not a bug.
      "@typescript-eslint/no-floating-promises": "off",
    },
  },
  {
    name: "mineSDK/examples",
    files: ["examples/**/*.ts", "**/examples/**/*.ts"],
    rules: { "no-console": "off", "@typescript-eslint/no-explicit-any": "off" },
  },
  {
    name: "mineSDK/config-files",
    files: ["**/*.config.{ts,mts,js,mjs}", "**/*.setup.ts"],
    rules: { "no-console": "off", "@typescript-eslint/no-require-imports": "off" },
  },
  prettier,
);
