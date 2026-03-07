# web3agent — Build the Framework

## Project context

New standalone npm package (name TBD — see open questions). TypeScript (ESM, Node 18+), built with `tsc`, published to npm with a `bin` entry. No frontend, no database, no hosting — a CLI + MCP server process.

The goal is a **zero-config Web3 agent framework**: one install command that gives any AI agent (Claude, Cursor, Windsurf, OpenCode) complete Web3 capabilities — on-chain execution, DeFi protocols, cross-chain bridging, advanced orders, indexed blockchain history, and live chain state — without the user manually configuring multiple separate servers.

## This task

Build and publish the framework package to npm. It has two primary modes that run from the same binary:

**Mode 1 — CLI config generator:** `npx <package> init` detects which agent environment the user is in (Claude Code, Cursor, Windsurf, OpenCode), generates the correct MCP config block (JSON or YAML), and writes it to the right location. All three MCP servers are auto-configured in a single command.

**Mode 2 — Single-server proxy:** `npx <package>` (no subcommand) starts a single MCP stdio server that internally proxies all three tool namespaces. The agent only needs to add one entry to its config instead of three.

Both modes must work from the same published package. Prometheus should determine whether one binary serves both modes (default = proxy, `init` subcommand = config generator) or two separate bin entries. This is an open architecture question.

**In scope:** Everything described in this prompt.

**Out of scope:** SSE/hosted transport (stdio only), non-EVM chains, a web UI, anything requiring a persistent backend.

---

## Domain knowledge

### MCP (Model Context Protocol)

MCP is a standard protocol for exposing tools to AI agents. The relevant transport for this package is stdio — the server communicates via stdin/stdout. Each tool has a name, description, and Zod parameter schema. Responses are always `{ content: [{ type: "text", text: "..." }] }`. Startup logs go to **stderr** — stdout is the MCP wire format and cannot be written to directly.

The npm package is `@modelcontextprotocol/sdk`. Key imports:

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
```

Prometheus should verify the current SDK API before planning — the MCP SDK has been evolving and the exact registration patterns may differ from older examples.

### The three MCP servers in the framework

The framework bundles three distinct tool sources. Prometheus must determine the right packaging approach for Blockscout and EVM MCP — they are existing packages/binaries, not code we're writing from scratch.

---

**1. web3agent custom tools (built by us)**

This is the core of the custom package. It wraps GOAT SDK and adds custom integrations for LI.FI, Orbs, and wallet management. Full details in the section below.

---

**2. Blockscout MCP**

Blockscout provides indexed blockchain history, verified contract ABIs, transaction history, token transfer events, and NFT metadata. This is **not** something GOAT covers — GOAT has no concept of indexed historical state.

Prometheus should research the current Blockscout MCP package (likely `@blockscout/mcp-server` or similar on npm/GitHub) to understand: what package name to depend on, how it's invoked as a subprocess, which env vars it requires (Blockscout API URL is likely the key one), and whether it's stdio-compatible.

The framework should be able to spawn Blockscout MCP as a subprocess (if not proxying) or include it as a dependency (if proxying). The user should not need to know Blockscout exists to get its tools.

---

**3. EVM MCP**

EVM MCP provides live on-chain state: current balances, contract reads, gas estimation, and general `eth_call` access. While GOAT also reads balances, EVM MCP is more general-purpose — it can read any contract, any method, without needing a plugin.

Prometheus should research the current EVM MCP package on npm/GitHub to understand its invocation, env var requirements (likely RPC URLs per chain), and stdio compatibility.

---

### The proxy architecture

When running in proxy mode, the package starts a single MCP server that fans out tool calls to the appropriate backend:

- Tool calls prefixed or tagged for Blockscout → forwarded to Blockscout MCP subprocess
- Tool calls prefixed or tagged for EVM → forwarded to EVM MCP subprocess
- All other tool calls → handled by the built-in GOAT/LI.FI/Orbs logic

The MCP SDK may have built-in support for composing multiple servers. If not, the proxy layer needs to manually aggregate tool lists at startup and route call handlers. Prometheus should research this before committing to an approach.

An alternative to subprocess proxying is running all three in the same Node process if the Blockscout and EVM packages expose programmatic APIs rather than requiring a subprocess. Prometheus should evaluate which is simpler and more reliable.

---

### The CLI config generator

`npx <package> init` should:

1. Detect the agent environment (check for `.claude/`, `.cursor/`, `.windsurf/`, `opencode.json`, etc.)
2. Ask the user for any required env vars (Blockscout API URL, optional API keys)
3. Generate the correct config block for the detected environment
4. Write it to the right config file location
5. Print a confirmation with what was written

Agent config formats differ:
- **Claude Code** (`~/.claude/claude.json`): JSON with `mcpServers` object, each entry has `command`/`args`/`env`
- **Cursor** (`.cursor/mcp.json`): similar JSON structure
- **Windsurf** (`.windsurf/mcp_config.json`): similar
- **OpenCode** (`opencode.json`): may differ — Prometheus should verify the current format

In proxy mode, the config generator writes a **single** server entry pointing at `npx <package>`. In non-proxy mode, it writes three separate entries (one per server). Both options should be supported — the user can choose at `init` time.

---

### GOAT SDK (core of our custom tools)

GOAT (Great Onchain Agent Toolkit) has an MCP adapter (`@goat-sdk/adapter-model-context-protocol`) that returns `getOnChainTools()` with a tool list and handler. Tools are registered manually onto the MCP server. GOAT uses JSON Schema for parameter types; these must be converted to Zod at registration.

GOAT requires a wallet client even for read-only operations. When no credentials are configured, generate an ephemeral private key per session to satisfy GOAT's requirement. Write operations fail at the RPC level — that's fine.

**Progressive capability tiers based on env vars:**

- **Tier 0 (always active):** ETH transfers, ERC-20 (USDC/USDT/WETH/DAI), ERC-721, ENS resolution, DexScreener, CoinGecko
- **Tier 1 (wallet configured — `PRIVATE_KEY` or `MNEMONIC`):** Uniswap, Balancer, LI.FI cross-chain, Orbs (all four products)
- **Tier 2 (specific API keys):** 0x Protocol (requires `ZEROX_API_KEY`)

Wrap each plugin in `try/catch` — silent skip on failure.

---

### Chain handling — per call, not per server

Chain is a **per-call parameter**, not a server-level config. The wallet client is a factory `(account, chainId) → walletClient` — not a singleton. This is essential for multi-step workflows like "bridge ETH from mainnet to Base, then deposit on Aave on Base" which involve three chains without restarting the server.

Supported chains: mainnet (1), Base (8453, default), Arbitrum (42161), Optimism (10), Polygon (137), Linea (59144), BSC (56), Avalanche (43114), zkSync Era (324), Scroll (534352), Mode (34443), Blast (81457), Mantle (5000), Celo (42220), Gnosis (100), Sepolia (11155111), Base Sepolia (84532).

`CHAIN_ID` env var sets the default chain. `RPC_URL` overrides the public transport for that chain. All tool calls that interact with the chain accept an optional `chainId` parameter that overrides the default.

---

### Wallet persistence

Wallets can persist across server restarts via `~/.web3agent/wallet.json` (mode 600, same model as `~/.ssh/id_rsa`). This is plaintext — security comes from file permissions, not encryption.

Startup resolution order:
1. `PRIVATE_KEY` env var (takes precedence — CI/CD override)
2. `MNEMONIC` env var
3. `~/.web3agent/wallet.json` if it exists
4. Ephemeral read-only mode (fresh key per session, never persisted)

`wallet_activate` tool: accepts private key or mnemonic, hot-swaps the active account, writes to `~/.web3agent/wallet.json`. `wallet_deactivate` removes the file, reverts to read-only.

---

### Write confirmation layer

By default, write operations don't execute immediately — they queue a pending operation and return a human-readable summary + queue ID. The user (or agent) must call `transaction_confirm(id)` to execute or `transaction_deny(id)` to discard.

`transaction_list()` shows all pending operations. The queue is in-memory only — clears on restart (deliberate safety property).

Opt-out: `CONFIRM_WRITES=false` env var disables globally. `wallet_set_confirmation(enabled: boolean)` tool toggles at runtime.

What counts as a write (gated by confirmation): ETH transfers, token transfers/approvals, swaps, bridges, contract calls, `wallet_activate`, `wallet_deactivate`. Read tools are never gated.

---

### Wallet generation tools (always active, no network calls)

Five custom tools using viem primitives:

1. `wallet_generate` — generates a private key, returns `{ address, privateKey, warning }`
2. `wallet_generate_mnemonic` — generates a BIP-39 mnemonic (12 or 24 words), returns `{ mnemonic, firstAddress, derivationPath, warning }`
3. `wallet_from_mnemonic` — derives address from mnemonic, returns `{ address, derivationPath }` (no private key)
4. `wallet_derive_addresses` — batch derives 1–20 addresses from a mnemonic
5. `wallet_get_active` — returns current wallet address, chain, and mode (`"private-key"` | `"mnemonic"` | `"read-only"`)

Warning text on generation tools must be explicit: key/mnemonic is returned once, never stored, save it immediately.

---

### LI.FI cross-chain integration

LI.FI (`@lifi/sdk`) is a cross-chain aggregator routing across 18+ bridges and 32+ DEXes. It is NOT a GOAT plugin — it registers as a set of custom MCP tools directly on the server.

LI.FI has its own `createConfig` / `EVM` provider setup, separate from GOAT's wallet client. The `switchChain` callback must return a fresh wallet client for the target chain — never reuse the same instance across chains. Cross-chain routes involve transactions on multiple chains; LI.FI calls `switchChain` internally when signing on a different chain.

Custom tools: `lifi_get_quote` (read-only, always active when wallet configured), `lifi_execute_bridge` (write, gated by confirmation layer), `lifi_get_chains` (read-only, always active).

`lifi_get_quote` returns a trimmed summary — not the full route object. Full route objects are large and will bloat context.

`LIFI_API_KEY` is optional — free tier is rate-limited but functional.

---

### Orbs integration (four products)

Orbs has four distinct products. All are gated behind wallet configuration (Tier 1). The integration approach differs per product.

**1. Liquidity Hub** (`@orbs-network/liquidity-hub-sdk`)

Real headless TypeScript SDK. `constructSDK({ partner, chainId })` returns an instance with `getQuote()` and swap execution. Sources liquidity from a competitive solver network (ParaSwap, Odos, AMM pools, private market makers). Gasless for users. Falls back to AMM if it can't beat the price — can only improve, never worsen. Same-chain equivalent of LI.FI.

Prometheus must verify whether `constructSDK` works in Node.js without Wagmi/browser dependencies before planning.

**2. dTWAP** — direct contract `ask()` call, no REST API

Placing a TWAP order means calling `ask()` on the deployed TWAP contract. Key parameters: source token, destination token, amount per chunk, min output per chunk (0 = market), deadline, fill delay, exchange adapter address. ERC-20 approval required first. Order status via Lens contract. Deployed addresses in `configs.json` in `orbs-network/twap` repo.

**3. dLIMIT** — same contract as dTWAP, one chunk

dLIMIT is dTWAP with `chunks=1` and a non-zero `dstMinAmount`. Same contract, same approval flow, same Lens for status.

**4. dSLTP** — stop-loss and take-profit (launched November 2025)

Newest Orbs product. Supports stop-market (guarantees execution, potential slippage) and stop-limit (price floor protection). Prometheus should research `orbs-network` GitHub for dSLTP-specific contracts, ABIs, and any SDK before planning — this is the least documented product.

---

### Utility tools

Two always-active utility tools:
- `server_status` — returns wallet mode, active chain, which plugins loaded, confirmation mode enabled/disabled
- `list_supported_chains` — returns all chains the server supports with IDs and names

---

### WEB3_CONTEXT.md

A markdown file that ships with the package and is meant to be placed in the project root or referenced in agent rules. It provides routing guidance so agents know which server handles which queries:

```
Active MCPs:
- blockscout   → indexed history, verified ABIs, tx history, NFT metadata, token transfers
- evm          → live on-chain state: balances, contract reads, gas estimation, eth_call
- web3 (this)  → wallet ops, DeFi execution, market data, cross-chain bridging, advanced orders

Use web3 for: generating wallets, token swaps (Uniswap/Balancer/0x), cross-chain bridging (LI.FI),
same-chain aggregated swaps (Orbs Liquidity Hub), TWAP orders, limit orders, stop-loss/take-profit,
market data (DexScreener/CoinGecko), sending ETH and tokens, approving contracts.

Use blockscout for: wallet history, NFT ownership, contract verification status, past transactions.
Use evm for: current balance checks, reading contract state, gas estimation.
```

---

### Environment variables

| Variable | Effect |
|---|---|
| `CHAIN_ID` | Default chain (default: 8453 = Base) |
| `PRIVATE_KEY` | Enables write mode, takes precedence over wallet file |
| `MNEMONIC` | Alternative to PRIVATE_KEY |
| `RPC_URL` | Override public RPC for default chain |
| `WALLET_ACCOUNT_INDEX` | HD account index when using MNEMONIC (default 0) |
| `WALLET_ADDRESS_INDEX` | HD address index when using MNEMONIC (default 0) |
| `COINGECKO_API_KEY` | Higher rate limits on CoinGecko |
| `ZEROX_API_KEY` | Enables 0x Protocol plugin |
| `LIFI_API_KEY` | Higher LI.FI rate limits (optional, free tier works) |
| `CONFIRM_WRITES` | Set to `false` to disable confirmation layer |
| `BLOCKSCOUT_API_URL` | Blockscout instance URL (required for Blockscout tools) |

---

## Open questions for Prometheus to clarify in interview

Prometheus should ask the user these questions before finalizing the plan:

1. **Package name:** Does `@web3agent` npm org already exist? Alternatives: `web3agent` (unscoped), `@web3agent/cli` as the root package with `@web3agent/mcp` as the core server. What's the publishing target?

2. **Proxy vs subprocess for Blockscout and EVM MCP:** After researching those packages, is it cleaner to spawn them as subprocesses and proxy their stdio, or do they expose programmatic Node.js APIs that can be imported and run in-process? The answer affects the whole proxy architecture.

3. **ERC-20 token list:** Should the default token list (USDC/USDT/WETH/DAI) be hardcoded, or configurable via env var / config file?

4. **LI.FI quote detail level:** Should `lifi_get_quote` return just the headline numbers (amount out, fee, time), or also include bridge/DEX breakdown per step? More detail is more useful but bloats context.

5. **CI/CD and publish automation:** Is GitHub Actions + npm publish on tag expected? Changesets for versioning?

---

## Success criteria

**CLI config generator:**
- `npx <package> init` detects the agent environment without being told
- Writes a valid MCP config block that references all three servers
- In proxy mode, the config block is a single entry pointing at `npx <package>`
- In multi-server mode, three separate entries are written
- Dry-run option shows what would be written without modifying files

**Proxy mode / server startup:**
- `npx <package>` with no env vars starts successfully, prints startup summary to stderr, accepts MCP connections
- Tool list includes tools from all three servers (custom, Blockscout, EVM MCP)
- DexScreener and CoinGecko return data with no credentials
- `server_status` correctly reports loaded capabilities

**Wallet flow:**
- `wallet_generate` + `wallet_activate` produces a write-capable session in two tool calls
- `~/.web3agent/wallet.json` exists with mode 600 after activation
- Server restart with no env vars loads persisted wallet, resumes write-capable mode
- `wallet_deactivate` removes the file, reverts to read-only
- `PRIVATE_KEY` env var takes precedence over persisted file

**Confirmation layer:**
- Write tool call returns a pending summary with queue ID, does not execute
- `transaction_confirm(id)` executes the operation
- `transaction_deny(id)` discards it without executing
- `CONFIRM_WRITES=false` causes write tools to execute immediately

**DeFi execution:**
- With wallet configured, Uniswap/Balancer/LI.FI/Orbs tools appear in the tool list
- `lifi_get_quote` returns valid routes for a cross-chain pair without executing
- `orbs_get_quote` returns a Liquidity Hub quote for a same-chain swap
- `orbs_place_twap` queues a pending summary (chunk size, count, fill delay, duration) before executing
- `orbs_place_limit` queues a pending summary (limit price, expiry) before executing

**Package quality:**
- `npm install` completes on Node 18+ without errors
- `npm run build` produces valid `dist/index.js`
- `npm pack` produces a tarball with correct files and no missing dependencies
- All tool responses are valid JSON wrapped in `{ content: [{ type: "text", text: "..." }] }`
- `WEB3_CONTEXT.md` is included in the published package