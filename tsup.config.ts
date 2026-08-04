import { readFileSync } from "node:fs";
import { defineConfig } from "tsup";

const pkg = JSON.parse(readFileSync("./package.json", "utf-8"));

export const uniswapV4SdkNoExternal = [
  /^@uniswap\//,
  "@uniswap/v4-sdk",
  "@uniswap/sdk-core",
  "@uniswap/v3-periphery",
  "@uniswap/v3-sdk",
  "aes-js",
  "bn.js",
  "bech32",
  "big.js",
  "brorand",
  "decimal.js-light",
  "elliptic",
  "ethers",
  "hash.js",
  "hmac-drbg",
  "inherits",
  "js-sha3",
  "jsbi",
  "minimalistic-crypto-utils",
  "minimalistic-assert",
  "scrypt-js",
  "tiny-invariant",
  "tiny-warning",
  "toformat",
  "tslib",
  /^@ethersproject\//,
] as const;

export default defineConfig([
  {
    entry: {
      index: "src/index.ts",
      "create/index": "src/create/index.ts",
      "runtime/index": "src/runtime/index.ts",
      "mcp/index": "src/mcp/index.ts",
      "agdp/api": "src/agdp/api.ts",
      "x402/client": "src/x402/client.ts",
      "ows-backend": "src/wallet/ows-backend.ts",
    },
    format: ["esm"],
    target: "node22",
    clean: true,
    splitting: true,
    sourcemap: false,
    dts: true,
    shims: false,
    skipNodeModulesBundle: true,
    noExternal: ["@goat-sdk/plugin-erc721", ...uniswapV4SdkNoExternal],
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
    noExternal: ["@goat-sdk/plugin-erc721", ...uniswapV4SdkNoExternal],
    define: {
      __VERSION__: JSON.stringify(pkg.version),
    },
  },
]);
