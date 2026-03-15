import { readFileSync } from "node:fs";
import { defineConfig } from "tsup";

const pkg = JSON.parse(readFileSync("./package.json", "utf-8"));

export default defineConfig([
  {
    entry: {
      index: "src/index.ts",
      "runtime/index": "src/runtime/index.ts",
      "mcp/index": "src/mcp/index.ts",
      "agdp/api": "src/agdp/api.ts",
      "x402/client": "src/x402/client.ts",
    },
    format: ["esm"],
    target: "node22",
    clean: true,
    splitting: true,
    sourcemap: false,
    dts: true,
    shims: false,
    skipNodeModulesBundle: true,
    noExternal: ["@goat-sdk/plugin-erc721"],
    define: {
      __VERSION__: JSON.stringify(pkg.version),
    },
  },
  {
    entry: {
      cli: "src/cli.ts",
    },
    format: ["esm"],
    target: "node22",
    clean: false,
    banner: {
      js: "#!/usr/bin/env node",
    },
    splitting: false,
    sourcemap: false,
    dts: false,
    shims: false,
    skipNodeModulesBundle: true,
    noExternal: ["@goat-sdk/plugin-erc721"],
    define: {
      __VERSION__: JSON.stringify(pkg.version),
    },
  },
]);
