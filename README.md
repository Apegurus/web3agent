# web3agent

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

## Install

```bash
npx web3agent init
```

Detects your AI agent host and configures it automatically.

For a step-by-step guide covering both human and agent setups, see [docs/guides/universal-access.md](docs/guides/universal-access.md).

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

Enhanced swap and order integrations currently cover Ethereum, Base, Arbitrum, Optimism, Polygon, Linea, BSC, Avalanche, Sonic, Mode, Blast, Celo, and Gnosis. Token resolution, explorer, LI.FI, and market/research tools have provider-specific coverage; LI.FI bridge quotes and execution support 20+ chains through LI.FI's own chain list.

**Default:** Base (8453). Override with the `CHAIN_ID` env var or pass `chainId` per call.

---

## What's included

| Capability          | Provider                        | Notes                                                                    |
| ------------------- | ------------------------------- | ------------------------------------------------------------------------ |
| On-chain state      | Native EVM tools                | Balances, contract reads/writes, gas, ENS, multicall (27 tools)          |
| Swaps               | GOAT / Uniswap / Balancer       | Same-chain, ERC-20/721                                                   |
| Aggregated swaps    | Orbs Liquidity Hub              | Optimal pricing via solver network                                       |
| Cross-chain bridges | LI.FI                           | 20+ chains                                                               |
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
```

The examples default to small USDC-denominated flows and only prepare wallet actions when you pass `--prepare`.

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
