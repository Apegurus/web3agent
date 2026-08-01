[![npm version](https://img.shields.io/npm/v/web3agent.svg)](https://www.npmjs.com/package/web3agent)
[![npm downloads](https://img.shields.io/npm/dw/web3agent.svg)](https://www.npmjs.com/package/web3agent)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![GitHub stars](https://img.shields.io/github/stars/Apegurus/web3agent.svg)](https://github.com/Apegurus/web3agent)
[![smithery badge](https://smithery.ai/badge/Apegurus/web3agent)](https://smithery.ai/servers/Apegurus/web3agent)

> **See it in production:** [The Arena](https://arena.web3agent.fi) — 11 AI agents trade real capital through Web3Agent.

# web3agent

> MCP package: `web3agent` | npm: <https://www.npmjs.com/package/web3agent> | GitHub: <https://github.com/Apegurus/web3agent> | Contact: <hello@apeguru.dev>

**Links:** [Website](https://web3agent.fi) · [GitHub](https://github.com/Apegurus/web3agent) · [npm](https://www.npmjs.com/package/web3agent) · [Smithery](https://smithery.ai/servers/Apegurus/web3agent) · [The Arena](https://arena.web3agent.fi) · [X / @Web3AgentFi](https://x.com/Web3AgentFi)

Give your AI agent EVM execution and DeFi tooling: swaps, bridges, limit and trigger orders, exchange trading, market data, research, wallet management. 190+ MCP tools. One install.

Works out of the box with Claude Code, Cursor, Windsurf, OpenCode, and Codex. Self-custodial. By default, write operations go through a confirmation queue: nothing executes without your approval unless you explicitly disable confirmations.

EVM execution is a solved problem. Stop rebuilding it. Plug in and ship.

---

## What you can do

Once installed, your AI agent can execute real DeFi operations in plain language:

- **"Swap 0.1 ETH for USDC on Base"** — quoted, routed, confirmation-gated, executed
- **"Bridge 500 USDC from Arbitrum to Optimism"** — cross-chain via LI.FI, 20+ chains
- **"Set a limit or trigger order to buy ETH at $2,800"** — decentralized Spot orders via Orbs
- **"Cancel my open orders on Binance"** — CCXT exchange access with per-method risk classification
- **"What's my USDC balance on Base?"** — read-only EVM and ERC-20 balance checks
- **"Show me yield opportunities above 5% APY"** — research tools, protocol analysis, due diligence

Common flows avoid ABI handling and transaction building. Generic contract reads and writes are available when you provide or register an ABI, or when explorer ABI lookup is available. The agent handles routing, transaction preparation, and the confirmation queue. You approve, it executes.

---

## Quickstart for agent power users

```bash
npx web3agent init
```

This detects Claude Code, Cursor, Windsurf, OpenCode, or Codex and configures the MCP server automatically. Restart your host, then ask:

```text
What Web3 tools do you have available, and what chain are you configured for?
```

For any other MCP-capable host, configure a stdio server that runs:

```bash
npx web3agent
```

The generic MCP config shape is:

```json
{
  "web3agent": {
    "type": "stdio",
    "command": "npx",
    "args": ["web3agent"]
  }
}
```

Writes are confirmation-gated by default, and wallet secrets are not exposed through MCP unless explicitly enabled.

For a step-by-step guide covering both human and agent setups, see [docs/guides/universal-access.md](docs/guides/universal-access.md).

### Smithery local bundle

Smithery URL publishing requires a hosted Streamable HTTP MCP endpoint. Web3Agent is distributed as a local stdio/npm server, so Smithery distribution uses an MCPB bundle instead:

```bash
pnpm run mcpb:check
smithery mcp publish dist/web3agent.mcpb -n Apegurus/web3agent
```

The generated MCPB is a thin local bundle that launches the published npm package with `npm exec --package web3agent@0.6.2`.

## Why Web3Agent

- **One-line install.** `npx web3agent init` auto-configures Claude Code, Cursor, Windsurf, OpenCode, or Codex. No manual config edits for supported hosts.
- **Self-custodial.** Keys stay in your environment, wallet secrets are kept out of agent-visible MCP flows by default, and every write goes through the confirmation queue unless you intentionally disable it.
- **Battle-tested infrastructure.** Built on GOAT SDK, LI.FI, Orbs, Blockscout, Etherscan, DexScreener, and other production Web3 rails.
- **Live in production.** Powers Orbzy and [The Arena](https://arena.web3agent.fi), where AI agents trade real capital through Web3Agent.
- **One MCP surface.** Swaps, bridges, orders, market data, research, token resolution, wallet lifecycle, and agent-payment protocols are available through one server.

## Who it is for

- AI agent builders who need Web3 execution without rebuilding protocol integrations
- DeFi teams adding MCP support to internal tools, research agents, or trading agents
- Developers prototyping wallet-aware agents, swaps, bridges, and market workflows
- MCP host users who want read-only chain data plus explicit-confirmation write flows

### Copy-paste prompts

Use these after installation to get to value quickly:

```text
List the supported chains and tell me which Web3 tools are safest to try first.
```

```text
Resolve USDC, WETH, and DEGEN on Base. Show token addresses and decimals.
```

```text
Quote swapping 0.01 ETH to USDC on Base, but do not execute anything.
```

```text
Show yield opportunities above 5% APY and explain the main protocol risks.
```

```text
Explain this wallet's recent activity on Base: 0x0000000000000000000000000000000000000000
```

---

## Supported hosts

| Host        | Config location                                 |
| ----------- | ----------------------------------------------- |
| Claude Code | `~/.claude/mcp.json`                            |
| Cursor      | `.cursor/mcp.json`                              |
| Windsurf    | `~/.codeium/windsurf/mcp_config.json`           |
| OpenCode    | `.opencode/config.json`                         |
| Codex       | `.codex/config.toml`                            |
| OpenClaw    | agent-mediated self-install via canonical guide |

---

## Supported chains

Basic EVM operations use viem's chain registry and can target any viem-supported EVM chain when RPC access is available.

Enhanced swap and order integrations currently cover Ethereum, Base, Arbitrum, Optimism, Polygon, Linea, BSC, Avalanche, Sonic, Mode, Blast, Celo, Gnosis, and Robinhood Chain. Robinhood support includes verified Uniswap v4 positions and 0x swap routing. Token resolution, explorer, LI.FI, and market/research tools have provider-specific coverage; LI.FI bridge quotes and execution support 20+ chains through LI.FI's own chain list.

**Default:** Base (8453). Override with the `CHAIN_ID` env var or pass `chainId` per call.

---

## What's included

| Capability          | Provider                        | Notes                                                                    |
| ------------------- | ------------------------------- | ------------------------------------------------------------------------ |
| On-chain state      | Native EVM tools                | Balances, contract reads/writes, gas, ENS, multicall (27 tools)          |
| Swaps               | Orbs / 0x / LI.FI / GOAT        | Robinhood uses 0x first and LI.FI only for no-route/provider-unavailable |
| Uniswap v4 positions | Uniswap v4                      | Verified reads, exact calculations, simulation, and gated lifecycle writes |
| Aggregated swaps    | Orbs Liquidity Hub              | Optimal pricing via solver network                                       |
| Cross-chain bridges | LI.FI                           | 20+ chains                                                               |
| Lending             | GOAT SDK / protocol integrations | Aave, Morpho, and major money-market surfaces where supported           |
| Advanced orders     | Orbs                            | Spot market, limit, TWAP, stop-loss, take-profit, delayed orders         |
| Exchange trading    | CCXT                            | Public/private access across 100+ exchanges (6 tools)                    |
| Block explorer      | Blockscout + Etherscan          | Address info, tx history, NFTs, contract ABIs, network stats (35 tools)  |
| Market data         | DefiLlama / CoinGecko / Binance | TVL, prices, DEX volume, stablecoin stats, sentiment (20 tools)          |
| Research            | DefiLlama / on-chain            | Contract security, yield analysis, whale tracking, governance (13 tools) |
| Token resolution    | Built-in registry + DexScreener | Symbol-to-address, long-tail assets                                      |
| Wallet management   | web3agent + Open Wallet Standard | CLI/MCP lifecycle, encrypted OWS vault when configured, legacy fallback  |
| Confirmation queue  | Built-in                        | Write operations require explicit approval by default                    |
| Agent protocols     | aGDP / ACP / ERC-8183 / x402 / ERC-8004 | Agent marketplace, cooperation, payments                         |
| Price data          | CoinGecko                       | Requires `COINGECKO_API_KEY`                                             |
| 0x swaps            | 0x                              | Requires `ZEROX_API_KEY`                                                 |

---

## Starter templates

```bash
npx web3agent create
```

Scaffolds a ready-to-run project from one of three bundled templates:

- **Vercel AI SDK** — chat agent with tool calling
- **Mastra** — agent framework with web3agent tools
- **MCP-host** — lightweight MCP client

Each starter uses the same `web3agent` lifecycle surfaces as MCP and CLI.

---

## Examples

Root examples are included in the npm package:

```bash
# Safe import-only previews
node examples/swap.mjs
node examples/bridge.mjs

# Read-only live quote examples
node examples/swap.mjs --quote
node examples/bridge.mjs --quote

# Prepared external-wallet flows
WEB3AGENT_EXAMPLE_ACCOUNT=0x... node examples/swap.mjs --prepare
WEB3AGENT_EXAMPLE_ACCOUNT=0x... node examples/bridge.mjs --prepare

# Uniswap v4 is fixture-only unless a mode is explicitly selected
node examples/uniswap-v4.mjs
node examples/uniswap-v4.mjs --read
WEB3AGENT_EXAMPLE_ACCOUNT=0x... WEB3AGENT_EXAMPLE_CURRENCY1_ADDRESS=0x... WEB3AGENT_EXAMPLE_TOKEN_ID=... WEB3AGENT_EXAMPLE_SOURCE_BLOCK_NUMBER=... WEB3AGENT_EXAMPLE_SOURCE_BLOCK_HASH=0x... node examples/uniswap-v4.mjs --prepare
WEB3AGENT_EXAMPLE_ACCOUNT=0x... WEB3AGENT_EXAMPLE_CURRENCY1_ADDRESS=0x... WEB3AGENT_EXAMPLE_TOKEN_ID=... WEB3AGENT_EXAMPLE_SOURCE_BLOCK_NUMBER=... WEB3AGENT_EXAMPLE_SOURCE_BLOCK_HASH=0x... node examples/uniswap-v4.mjs --simulate
```

The examples default to small USDC-denominated flows and only prepare wallet actions when you pass `--prepare`.

### Uniswap v4 positions

Uniswap v4 position support is a staged, browser-wallet-safe flow. It provides verified deployment, pool, position, and bounded-event reads; deterministic position calculations; lifecycle preparation (`mint`, `increase`, `decrease`, `collect`, and `burn`); and preflight simulation. It does **not** run a portfolio strategy, calculate tax/accounting, select a rebalance policy, or make an execution decision for you.

Use `examples/uniswap-v4.mjs` to preview the exact inputs before connecting any service. `--read` is a wallet-free Robinhood public-client bytecode verification; set `WEB3AGENT_EXAMPLE_RPC_URL` only to override viem's official Robinhood RPC. `--prepare` and `--simulate` are runtime-backed modes that require an account, `WEB3AGENT_EXAMPLE_CURRENCY1_ADDRESS`, `WEB3AGENT_EXAMPLE_TOKEN_ID`, a real canonical pool, and a pinned source block. Set the normal runtime `RPC_URL` for those modes; optional pool overrides include `WEB3AGENT_EXAMPLE_POOL_FEE`, `WEB3AGENT_EXAMPLE_TICK_SPACING`, and `WEB3AGENT_EXAMPLE_POOL_HOOKS`. `--execute` is intentionally refused unless `WEB3AGENT_EXAMPLE_EXECUTE=1`, `WEB3AGENT_EXAMPLE_ACCOUNT`, and `WEB3AGENT_EXAMPLE_CONFIRMATION_ID` are all present. The example never submits a transaction: execution remains an application/MCP confirmation-queue responsibility.

For the complete API, deployed-contract provenance, event cursor rules, and simulation caveats, see [docs/architecture/uniswap-v4.md](docs/architecture/uniswap-v4.md). For browser wallet action/resume semantics, see [docs/architecture/browser-wallet-operations.md](docs/architecture/browser-wallet-operations.md).

## Quickstart examples

### Agent that prepares a swap on Base

```js
import { prepareOperation, resolveCanonicalTokenSync } from "web3agent";

const chainId = 8453;
const usdc = resolveCanonicalTokenSync({ chainId, symbol: "USDC" });
const weth = resolveCanonicalTokenSync({ chainId, symbol: "WETH" });

if (!usdc || !weth) throw new Error("Missing canonical token");

const intent = await prepareOperation({
  integration: "orbs",
  kind: "swap",
  account: "0xYourWallet",
  chainId,
  fromToken: usdc.address,
  toToken: weth.address,
  fromAmount: "10000000",
  slippagePct: 0.5,
});

console.log(intent.nextActions);
```

### Agent that prepares a bridge from Ethereum to Arbitrum

```js
import { prepareOperation, resolveCanonicalTokenSync } from "web3agent";

const fromChainId = 1;
const toChainId = 42161;
const from = resolveCanonicalTokenSync({ chainId: fromChainId, symbol: "USDC" });
const to = resolveCanonicalTokenSync({ chainId: toChainId, symbol: "USDC" });

if (!from || !to) throw new Error("Missing canonical token");

const bridge = await prepareOperation({
  integration: "lifi",
  kind: "bridge",
  account: "0xYourWallet",
  fromChainId,
  toChainId,
  fromToken: from.address,
  toToken: to.address,
  fromAmount: "1000000",
});

console.log(bridge.nextActions);
```

### Agent that monitors a wallet

```js
import { getAddressInfo, getTransactionHistory, listSupportedChains } from "web3agent";

const address = "0x0000000000000000000000000000000000000000";
const chainId = 8453;

const [chains, info, history] = await Promise.all([
  listSupportedChains(),
  getAddressInfo({ address, chainId }),
  getTransactionHistory({ address, chainId, pageSize: 5 }),
]);

console.log({
  supportedChains: chains.chains.length,
  wallet: info,
  recentTransactions: history.transactions,
});
```

---

## For crypto teams

Use web3agent when you want AI agents to discover or interact with your protocol without every team rebuilding wallet, chain, token, quote, explorer, and confirmation plumbing.

Integration surfaces:

- **MCP tools** for Claude Code, Cursor, Windsurf, OpenCode, Codex, and other MCP hosts
- **Programmatic SDK** from `web3agent` for app-owned agents and browser-wallet flows
- **Prepared operations** for protocols that need users or apps to sign externally
- **Confirmation-gated writes** so execution never bypasses an explicit approval path by default

Good first integration targets:

- token, market, and position reads
- quote and simulation tools
- prepared wallet actions for browser/app signing
- protocol-specific research or risk tools

For protocol support or integration questions, open an issue at <https://github.com/Apegurus/web3agent/issues> or contact <hello@apeguru.dev>.

---

## Usage

```bash
# Initialize for your host (run once)
npx web3agent init

# Start the MCP server
npx web3agent

# CLI fallback (for non-MCP hosts or scripting)
npx web3agent tools list --json
npx web3agent tools call resolve_token --input '{"symbol":"USDC","chainId":8453}' --json
npx web3agent doctor --json

# Local-only wallet secret flows (requires OWS_PASSPHRASE >= 12 chars and an interactive TTY)
OWS_PASSPHRASE='...' npx web3agent wallet generate
OWS_PASSPHRASE='...' npx web3agent wallet generate --mnemonic
OWS_PASSPHRASE='...' npx web3agent wallet activate --from-file ./secret.txt --type private-key

# Options
npx web3agent --help
npx web3agent --version
```

Wallet secret MCP tools are disabled by default so private keys and mnemonics do not enter an AI agent's inference context. Use the local `web3agent wallet ...` commands above for safe generation/import. If you explicitly accept the risk of agent-visible secrets, set `WEB3AGENT_ALLOW_AGENT_VISIBLE_SECRETS=1` to re-enable the legacy MCP behavior.

`wallet_deactivate` only deactivates the current runtime session and returns to read-only ephemeral mode. Use confirmation-gated `wallet_delete` when you intentionally want to permanently remove persisted wallet material.

### Wallet security defaults

By default, web3agent keeps wallet secrets out of MCP tool responses and agent-visible inputs. The local `web3agent wallet ...` commands are the recommended way to generate or import private keys and mnemonics because they require an interactive TTY and refuse JSON secret output. Set `WEB3AGENT_ALLOW_AGENT_VISIBLE_SECRETS=1` only if you explicitly accept that private keys or mnemonics can be sent through the MCP host and visible to the agent/inference provider.

For persisted server-side wallets, setting `OWS_PASSPHRASE` is **not mandatory, but strongly recommended**. When it is set on macOS/Linux and OWS is available, web3agent uses the Open Wallet Standard encrypted vault instead of the legacy filesystem-protected wallet store. The OWS spec minimum is 12 characters; web3agent warns on weak runtime passphrases and local wallet generation/import rejects shorter values. Use a 16+ character mixed passphrase in production. Configure it in the process that runs web3agent, whether that is `npx web3agent` as an MCP server or an app/service using `createRuntime({ env: { OWS_PASSPHRASE: "..." } })`.

If `OWS_PASSPHRASE` is missing, empty, OWS is unavailable, the platform is Windows, or `OWS_FORCE_LEGACY=1` is set, web3agent falls back to legacy wallet storage protected by file permissions only. Migrating a legacy `wallet.json` leaves a plaintext `wallet.json.migrated` rollback backup; delete it after verifying OWS access. For multi-agent services, run separate wallet-using runtimes in separate processes until per-runtime wallet isolation is supported.

---

## Programmatic usage

### Root API

Use the package root for stable, typed EVM capabilities from another app or agent layer.

```javascript
import {
  getChain,
  listChainTokens,
  resolveCanonicalTokenSync,
  resolveToken,
} from "web3agent";

const chain = getChain(8453);
const usdc = resolveCanonicalTokenSync({ symbol: "USDC", chainId: 8453 });
const tokens = listChainTokens({ chainId: 8453 });
const discovered = await resolveToken({ symbol: "DEGEN", chainId: 8453 });

console.log(
  chain?.name,
  usdc?.address,
  discovered.address,
  tokens.tokens.length,
);
```

Use `resolveCanonicalToken()` for well-known registry tokens and native-token aliases. Use `resolveToken()` when you also want DexScreener discovery fallback for long-tail assets.

### Browser wallet flows

Use the root API when your app owns the signer (e.g. a browser wallet via wagmi or AppKit).

```javascript
import {
  prepareOperation,
  resumeOperation,
  simulateTransaction,
} from "web3agent";
```

1. `prepareOperation(...)` returns the next wallet actions plus `resumeState`
2. Your app executes those actions with the browser wallet
3. `resumeOperation(...)` continues until the operation completes

Transaction actions are only considered complete once you return a confirmed result:

```javascript
{ type: "transaction", txHash: "0x...", status: "confirmed" }
```

`resumeOperation()` independently verifies the receipt before advancing.

Prepared integrations are `orbs` (`swap`, `order`), `lifi` (`bridge` and Robinhood
same-chain fallback), `zeroex` (Robinhood `swap`), `goat` (`tool`), and `uniswap-v4`
(`mint`, `increase`, `decrease`, `collect`, `burn`). Robinhood same-chain swaps route to
0x first and use LI.FI only when 0x returns the explicit `no-route` or
`provider-unavailable` class.

The root SDK also exposes the complete Uniswap v4 surface:
`getUniswapV4Deployment`, `getUniswapV4Pool`, `getUniswapV4Position`,
`getUniswapV4Events`, `calculateUniswapV4Position`, `calculateUniswapV4`,
`simulateUniswapV4Operation`, `mintUniswapV4Position`,
`increaseUniswapV4Liquidity`, `decreaseUniswapV4Liquidity`,
`collectUniswapV4Fees`, and `burnUniswapV4Position`.

Architecture notes: [docs/architecture/browser-wallet-operations.md](docs/architecture/browser-wallet-operations.md)

### Runtime API

Use `web3agent/runtime` when you need tool discovery, generic invocation, or upstream passthrough tools.

```javascript
import { createRuntime } from "web3agent/runtime";

const runtime = await createRuntime();

try {
  console.log(runtime.getHealth());
  console.log(
    runtime
      .listTools()
      .slice(0, 5)
      .map((tool) => tool.name),
  );
  const result = await runtime.invokeTool("list_supported_chains");
  console.log(result.structuredContent);
} finally {
  await runtime.shutdown();
}
```

---

## Environment variables

See [WEB3_CONTEXT.md](WEB3_CONTEXT.md) for the full environment variable reference.

For authenticated exchange access via CCXT tools, set `CCXT_CONFIG_PATH` to a JSON file containing named accounts and exchange credentials.

---

## Known limitations

- Blockscout explorer tools work on 8 chains only (Ethereum, Polygon, Arbitrum, Optimism, Base, Gnosis, Scroll, zkSync Era)
- Yield tooling is read-only research; protocol-specific execution beyond first-class tools uses ABI-backed EVM calls
- 0x and CoinGecko plugins require their respective API keys
- MCP hosts cannot open a browser wallet prompt directly — MCP can prepare, simulate, and submit signed payloads, but signing requires your app to handle the wallet interaction

---

## Requirements

- Node.js 22+
- pnpm (for development)

---

## License

MIT
