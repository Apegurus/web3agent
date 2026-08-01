# Uniswap v4 dependency boundary

## Supported release set

The Uniswap v4 integration is intentionally anchored to this release set:

| Package | Declared version | Role |
| --- | --- | --- |
| `viem` | `^2.55.4` | All chain I/O, including `robinhood` from `viem/chains`. |
| `@uniswap/v4-sdk` | `2.3.0` | Official pool, position, and PositionManager calculations and calldata behavior. |
| `@uniswap/sdk-core` | `^7.18.0` | The exact compatible dependency line declared by `@uniswap/v4-sdk@2.3.0`. |

`@uniswap/v4-sdk` brings `ethers` and `jsbi` transitively. They are an SDK implementation detail: no public schema, API type, or raw chain-I/O module may expose them. `viem` remains the sole chain-I/O library. Future SDK imports, including ethers-facing types, belong only in `src/uniswap-v4/sdk-adapter.ts`; the adapter converts values to project-native `bigint`, address, and hex records.

Universal Router is outside this integration. `@uniswap/universal-router-sdk` is not a dependency and must not be imported. Uniswap v4 position calldata comes from the pinned v4 SDK; Robinhood swaps use the separately controlled 0x path.

## Release provenance

Only `@uniswap/v4-sdk@2.3.0` is approved for ABI, API, and golden-vector source material. npm registry metadata is authoritative for the source revision; the downloaded package is authoritative for the bytes and package identity:

| Field | Required value |
| --- | --- |
| npm `dist.integrity` | `sha512-aMsDxVFjnwxjWeX8lXJy+4SRPgllfEU05SJ6CRsiPOeqBMd9RHxvb0RXF4q42wNG/iKoUVg9O2q6s5uoRDXPrQ==` |
| repository `gitHead` | `ab3a18a62922c0bda493130e53f2c8f6fad59558` |
| registry metadata | `https://registry.npmjs.org/@uniswap%2fv4-sdk/2.3.0` |

The dependency-boundary test validates the direct declarations, lockfile integrity, AST import restrictions, and a malformed provenance fixture. With `WEB3AGENT_VERIFY_REGISTRY_PROVENANCE=1`, it also downloads the published tarball, recomputes its SHA-512 integrity, verifies `package/package.json` identifies `@uniswap/v4-sdk@2.3.0`, and requires registry `gitHead` to match this document. The published package manifest intentionally has no `gitHead`; a missing or mismatched registry revision is a fail-closed release-provenance error. Do not substitute a newer SDK release, current `main`, or locally reconstructed vectors.

## Reproduction

```bash
pnpm install --frozen-lockfile
pnpm test -- --run tests/uniswap-v4/dependency-boundary.test.ts
WEB3AGENT_VERIFY_REGISTRY_PROVENANCE=1 pnpm test -- --run tests/uniswap-v4/dependency-boundary.test.ts
pnpm why @uniswap/v4-sdk viem ethers
```

The final command records the intentional direct/transitive boundary: v4 SDK and viem are direct dependencies, while ethers is present only through the official v4 SDK dependency graph.

## ESM adapter bundling constraint

The published `@uniswap/v4-sdk@2.3.0` ESM entry is not directly executable by native Node ESM: it imports an extensionless `dist/esm/src/entities` directory and Node returns `ERR_UNSUPPORTED_DIR_IMPORT`. The package's CJS entry loads, but web3agent's public package remains ESM-only and must not use that as its runtime path.

The future `src/uniswap-v4/sdk-adapter.ts` is the only permitted source importer. `tsup.config.ts` exports and applies `uniswapV4SdkNoExternal` to both package and CLI ESM builds, so that future adapter is bundled instead of externalized. The regression test proves an externalized adapter-like output fails in Node while the configured closure loads:

```ts
[
  "@uniswap/v4-sdk",
  "@uniswap/sdk-core",
  "@uniswap/v3-periphery",
  "@uniswap/v3-sdk",
  "ethers",
  "jsbi",
  "tiny-invariant",
  "tiny-warning",
  "tslib",
  /^@ethersproject\//,
]
```

The proof fixture compiled to ESM and imported in Node with `sdkAdapterLikeProbe: "function"`. It is created and removed by `tests/uniswap-v4/sdk-bundling-boundary.test.ts`. This bundling rule applies only to the private adapter dependency closure; it does not permit SDK, ethers, or JSBI imports anywhere else, or any such type to cross the public API boundary.

## Deployment provenance and admission

Web3agent admits a Uniswap v4 deployment only from its chain-specific deployment registry. Addresses must never be inferred from a familiar value on another chain. The primary public provenance is Uniswap's [deployments page](https://developers.uniswap.org/docs/protocols/v4/deployments) and its [machine-readable deployment feed](https://developers.uniswap.org/deployments.json); the feed identifies the deployment's `chainId`, contract name, address, source reference, and source-code URL.

For Ethereum mainnet (`chainId: 1`), the official feed records:

| Contract | Address |
| --- | --- |
| PoolManager | `0x000000000004444c5dc75cB358380D2e3dE08A90` |
| PositionManager | `0xbD216513d74C8cf14cf4747E6AaA6420FF64ee9e` |
| StateView | `0x7fFE42C4a5DEeA5b0feC41C94C136Cf115597227` |
| V4Quoter | `0x52F0E24D1c21C8A0cB1e5a5dD6198556BD9E1203` |
| Permit2 | `0x000000000022D473030F116dDEE9F6B43aC78BA3` |

Those addresses document the official source; runtime admission still uses the application's verified registry and requested `chainId`. In particular, a contract address that intentionally repeats across chains is still a chain-specific deployment record. The feed can change, so release updates must re-verify the current record rather than copying this table into code.

## Public surface and safety model

The root SDK exports `getUniswapV4Deployment`, `getUniswapV4Pool`, `getUniswapV4Position`, `getUniswapV4Events`, `calculateUniswapV4Position`, `calculateUniswapV4`, `simulateUniswapV4Operation`, `mintUniswapV4Position`, `increaseUniswapV4Liquidity`, `decreaseUniswapV4Liquidity`, `collectUniswapV4Fees`, and `burnUniswapV4Position`, plus every public Uniswap v4 Zod schema and inferred type. The root contract uses project-native `bigint`, address, and hex data only; `ethers` and `jsbi` remain private adapter details.

`getUniswapV4Events` is page-oriented. Supply a bounded block interval and persist the opaque cursor returned by the page; do not request an unbounded historical scan or construct cursors yourself. Reads and calculations are point-in-time observations, not price quotes or investment advice.

Lifecycle writes are prepared through `prepareOperation({ integration: "uniswap-v4", ... })` and continued through `resumeOperation(...)`. There are two signing modes: an app-owned/browser signer performs the prepared transaction or typed-data action externally, while a managed runtime uses the normal confirmation-gated write executor. Simulation is a recommended preflight before an execution attempt, but the runtime does not require proof that it ran, and simulation cannot guarantee later state, gas, hook results, inclusion, or success.

`collect` is collect-all only: the canonical plan collects all fees currently owed by the position. Partial collection, liquidity strategies, rebalancing, portfolio valuation, accounting, tax, and profitability analysis are deliberately outside this API. Robinhood same-chain swaps are separate from position lifecycle operations: they use the provenance-tagged 0x adapter as the primary provider and require `ZEROX_API_KEY`. Only an explicit 0x `provider-unavailable` or `no-route` result permits a same-chain LI.FI fallback; authentication, rate-limit, timeout, and unknown failures do not.

## Stateless resume boundary

The resume protocol checks that each submitted action is canonical for the operation supplied to the current call and verifies confirmed transaction facts on chain. It does not persist raw signatures or derived transaction facts, and it cannot prove that a later request is the same original user intent after an interruption. Applications that need that continuity must keep an authenticated state token outside web3agent and bind it to their own user/session model.
