# web3agent

> Web3 MCP proxy server — gives AI agents (Claude Code, Cursor, Windsurf, OpenCode) complete Web3 capabilities through a single install.

## Install

```bash
npx web3agent init
```

Detects your AI agent host and configures it automatically.

## Usage

```bash
# Configure your AI agent host
npx web3agent init

# Start the MCP server (stdio)
npx web3agent

# Options
npx web3agent --help
npx web3agent --version
```

## Programmatic Usage

### Root API

Use the package root when you want stable, typed Web3 capabilities from another app or agent layer.

```js
import { getChain, listChainTokens, resolveCanonicalTokenSync, resolveToken } from "web3agent";

const chain = getChain(8453);
const usdc = resolveCanonicalTokenSync({ symbol: "USDC", chainId: 8453 });
const tokens = listChainTokens({ chainId: 8453 });
const discovered = await resolveToken({ symbol: "DEGEN", chainId: 8453 });

console.log(chain?.name, usdc?.address, discovered.address, tokens.tokens.length);
```

Use `resolveCanonicalToken()` / `resolveCanonicalTokenSync()` when you only want well-known registry tokens and native-token aliases. Use `resolveToken()` when you want registry resolution plus DexScreener discovery fallback for long-tail assets.

Root API helpers lazily create a shared default runtime under the hood. Long-lived processes can import `shutdownDefaultRuntime` from `web3agent/runtime` to release those resources when finished.

### Browser Wallet Flows

Use the root package API when your app owns the signer, for example a browser wallet connected through wagmi or AppKit.

```js
import { prepareOperation, resumeOperation, simulateTransaction } from "web3agent";
```

The primary flow is generic:

1. `prepareOperation(...)` returns the next wallet actions plus `resumeState`
2. Your app executes those actions with the browser wallet
3. `resumeOperation(...)` continues until the operation completes

Protocol-specific helpers like `prepareSwapIntent()` and `submitSignedSwap()` remain available as compatibility wrappers, but new integrations should target the generic prepared-operation API first.

Prepared browser-wallet flows are staged. `prepareOperation()` and `resumeOperation()` only return the next required actions, and `resumeOperation()` persists previously completed action results inside the opaque resume state so callers only need to submit newly finished actions on each round.

For LI.FI compatibility helpers, `prepareBridgeIntent()` now returns both `steps` (transaction-only compatibility view) and `actions` (the browser-wallet action sequence including signatures).

Architecture notes live in [docs/architecture/browser-wallet-operations.md](./docs/architecture/browser-wallet-operations.md).

### Runtime API

Use `web3agent/runtime` when you need tool discovery, generic invocation, wallet flows, or upstream passthrough tools.

```js
import { createRuntime } from "web3agent/runtime";

const runtime = await createRuntime();

try {
  console.log(runtime.getHealth());
  console.log(runtime.listTools().slice(0, 5).map((tool) => tool.name));
  const result = await runtime.invokeTool("list_supported_chains");
  console.log(result.structuredContent);
} finally {
  await runtime.shutdown();
}
```

## Smoke Tests

Run the standard repo checks first:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Then run the packaged API smoke scripts:

```bash
node examples/root-api-smoke.mjs
node examples/runtime-smoke.mjs
node examples/runtime-smoke.mjs --run
```

`root-api-smoke.mjs` is fully local. `runtime-smoke.mjs` without flags verifies the runtime import surface only. `runtime-smoke.mjs --run` starts the real runtime in read-only mode, so upstream services may appear as degraded or fail if network access is unavailable.

The env-gated browser-wallet e2e test in [`tests/e2e/browser-wallet-flow.test.ts`](/Users/ignacioblitzer/.codex/worktrees/3cd6/web3agent-cli/tests/e2e/browser-wallet-flow.test.ts) runs when these variables are present: `BROWSER_WALLET_E2E`, `BROWSER_WALLET_E2E_CHAIN_ID`, `BROWSER_WALLET_E2E_ACCOUNT`, `BROWSER_WALLET_E2E_FROM_TOKEN`, `BROWSER_WALLET_E2E_TO_TOKEN`, `BROWSER_WALLET_E2E_IN_AMOUNT`, and `BROWSER_WALLET_E2E_SIGNATURE`.

## What you get

- **Blockscout** — indexed blockchain data (address info, tx history, NFTs, contract ABIs). Supported on 8 chains: Ethereum, Polygon, Arbitrum, Optimism, Base, Gnosis, Scroll, zkSync Era.
- **Etherscan** — contract ABI fetching (requires `ETHERSCAN_API_KEY`)
- **EVM MCP** — live on-chain state (balances, contract reads/writes, gas, ENS, multicall)
- **GOAT plugins** — Uniswap, Balancer, ERC-20/721, ENS, DexScreener
- **Optional GOAT plugins** — 0x (requires `ZEROX_API_KEY`), CoinGecko (requires `COINGECKO_API_KEY`)
- **LI.FI** — cross-chain bridging and swaps across 20+ chains
- **Orbs** — Liquidity Hub aggregated swaps, dTWAP, dLIMIT orders
- **Token resolver** — symbol-to-address resolution with built-in registry and DexScreener fallback
- **Wallet management** — generate, persist, activate/deactivate, derive addresses, sign messages
- **Confirmation queue** — write operations require explicit confirmation by default

## Supported Hosts

| Host | Config Location |
|------|----------------|
| Claude Code | `~/.claude/mcp.json` |
| Cursor | `.cursor/mcp.json` |
| Windsurf | `~/.codeium/windsurf/mcp_config.json` |
| OpenCode | `.opencode/config.json` |

## Supported Chains

Ethereum, Base, Arbitrum, Optimism, Polygon, Linea, BSC, Avalanche, zkSync Era, Scroll, Mode, Blast, Mantle, Celo, Gnosis, Sepolia, Base Sepolia.

Default: **Base (8453)**. Override with `CHAIN_ID` env var or `chainId` parameter per call.

## Environment Variables

See [WEB3_CONTEXT.md](./WEB3_CONTEXT.md) for the full environment variable table.

## Known Limitations

- **Blockscout** tools only work on 8 chains (Ethereum, Polygon, Arbitrum, Optimism, Base, Gnosis, Scroll, zkSync Era)
- **dSLTP** (stop-loss/take-profit orders) is not yet available
- **0x** and **CoinGecko** plugins require their respective API keys
- **Browser wallet signing over MCP** is indirect: MCP can prepare, simulate, and submit signed payloads, but generic MCP hosts cannot open a browser wallet prompt on their own

## Requirements

- Node.js 18+
- pnpm (for development)

## License

MIT
