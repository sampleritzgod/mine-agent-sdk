import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "providers/openai-provider": "src/providers/openai-provider.ts",
    "providers/anthropic-provider": "src/providers/anthropic-provider.ts",
    "providers/gemini-provider": "src/providers/gemini-provider.ts",
  },
  format: ["cjs", "esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  target: "es2022",
  outDir: "dist",
  // Each real provider's SDK is a peer dependency of its own entry only; keep
  // them out of the bundle so consumers who never import a provider don't
  // need its SDK installed.
  external: ["openai", "@anthropic-ai/sdk", "@google/genai"],
});
