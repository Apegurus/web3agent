import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node18",
  clean: true,
  banner: {
    js: "#!/usr/bin/env node",
  },
  splitting: false,
  sourcemap: false,
  dts: false,
  shims: false,
  skipNodeModulesBundle: true,
});
