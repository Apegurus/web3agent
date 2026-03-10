import { readFileSync } from "node:fs";
import { defineConfig } from "tsup";

const pkg = JSON.parse(readFileSync("./package.json", "utf-8"));

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node18",
  clean: true,
  banner: {
    js: "#!/usr/bin/env node",
  },
  splitting: true,
  sourcemap: false,
  dts: false,
  shims: false,
  skipNodeModulesBundle: true,
  noExternal: ["@goat-sdk/plugin-erc721"],
  define: {
    __VERSION__: JSON.stringify(pkg.version),
  },
});
