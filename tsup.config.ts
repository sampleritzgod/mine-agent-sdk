import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "providers/openai-provider": "src/providers/openai-provider.ts",
  },
  format: ["cjs", "esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  target: "es2022",
  outDir: "dist",
  // openai is a peer dependency of the openai-provider entry only; keep it
  // out of the bundle so consumers who never import it don't need it installed.
  external: ["openai"],
});
