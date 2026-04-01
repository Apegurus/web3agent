import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
  },
  external: ["web3agent/create"],
  format: ["esm"],
  target: "node22",
  clean: true,
  splitting: false,
  sourcemap: false,
  dts: true,
  banner: {
    js: "#!/usr/bin/env node",
  },
  shims: false,
  skipNodeModulesBundle: true,
});
