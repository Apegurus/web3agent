# @web3agent — Build the Package

## Project context

New standalone npm package, no existing codebase. TypeScript (ESM, Node 18+), built with `tsc`, published to npm with a `bin` entry so it runs via `npx`. No frontend, no database, no hosting — just a CLI process.

The package wraps the GOAT SDK into a zero-config MCP (Model Context Protocol) server. GOAT (Great Onchain Agent Toolkit) exposes 200+ onchain actions as typed tools. Our job is to package it so dropping one `npx` command into an agent config gives you a fully functional Web3 tool server — no API keys required to get started, progressively more powerful as you add them.

## This task

Build and prepare `@web3agent` for npm publication. The package must be runnable immediately via `npx @web3agent` (or similar TBD name) with zero config, and unlock deeper capabilities as env vars are added.

**In scope:** Everything described in this prompt.

**Out of scope:** SSE/hosted transport (stdio only for now), non-EVM chains, a web UI.

---

## Domain knowledge

### MCP (Model Context Protocol)

MCP is a standard protocol for exposing tools to AI agents. The relevant transport for this package is stdio — the server communicates via stdin/stdout, which is how tools like Claude Code, Cursor, Windsurf, and OpenCode discover and call tools from a local process.

Each tool is registered with a name, description, and Zod parameter schema. The response shape is always `{ content: [{ type: "text", text: "..." }] }`. Startup logs must go to stderr — stdout is reserved for the MCP protocol wire format.

The npm package is `@modelcontextprotocol/sdk`. Prometheus should research the current API patterns for McpServer and StdioServerTransport.

### GOAT SDK

GOAT's MCP adapter (`@goat-sdk/adapter-model-context-protocol`) provides a `getOnChainTools()` function that returns a tool list and a tool handler. The tools are registered manually onto the MCP server by iterating the list. GOAT uses JSON Schema for parameter types, which need to be converted to Zod at registration time.

GOAT requires a wallet client even for read-only operations. When no wallet credentials are configured, the server should generate an ephemeral private key per session (never returned to the user) to satisfy GOAT's requirements. Write operations will fail at the RPC level with a clear error — that's acceptable behavior.

### Progressive capability tiers

The server loads plugins conditionally based on which env vars are present:

**Always active (zero config):** ETH transfers, ERC-20 (USDC/USDT/WETH/DAI), ERC-721, ENS resolution, DexScreener market data, CoinGecko prices.

**Active when a wallet is configured (`PRIVATE_KEY` or `MNEMONIC`):** Uniswap, Balancer, LI.FI cross-chain routing, and Orbs advanced orders (TWAP and dLIMIT).

**Active when specific API keys are present:** 0x Protocol (requires `ZEROX_API_KEY`).

Plugin failures should be caught and skipped silently — chain incompatibility or missing deps shouldn't crash the server.

### LI.FI cross-chain integration

LI.FI (`@lifi/sdk`) is a cross-chain aggregator that routes across 18+ bridges and 32+ DEXes in a single call. DeBridge, Stargate, Across, Hop and others are all available as routes underneath it — LI.FI picks the optimal one. It is NOT a GOAT plugin; it integrates directly as a set of custom MCP tools registered alongside GOAT's tools.

Key concepts Prometheus should understand before planning the implementation:

- LI.FI has its own `createConfig` / `EVM` provider setup, separate from GOAT's wallet client. Both run simultaneously but are configured independently.
- Cross-chain execution involves transactions on multiple chains. LI.FI internally calls a `switchChain` callback when it needs to sign on a different chain — the implementation must handle this correctly or execution will silently fail mid-route.
- Quote retrieval (`getRoutes`) is read-only and works without a wallet. Route execution (`executeRoute`) requires signing and should only be available when a wallet is configured.
- `executeRoute` is long-running — bridge completions can take minutes. The tool call will block until the route resolves or errors.
- Route response objects are large. Tool responses should return a trimmed summary (amount out, fees, estimated time, bridge/DEX used), not the full object.
- `LIFI_API_KEY` is optional. The free tier is rate-limited but functional for development.

### Wallet generation tools

These are custom MCP tools that live outside GOAT and run locally with no network calls. They cover a real use case: generating fresh wallets reduces key exposure risk compared to reusing a primary wallet for agent operations.

Five tools: generate a private key, generate a mnemonic phrase (12 or 24 words), derive a wallet address from a mnemonic, derive multiple addresses from a mnemonic (batch), and inspect the currently active wallet. Generation tools must include a warning that the key/mnemonic is returned once and never stored — the user must save it immediately. Tools that derive addresses should never return private keys.

Viem provides all the necessary primitives from `viem/accounts`. No third-party key generation libraries needed.

### Orbs advanced orders and liquidity (four products)

Orbs has four distinct products relevant here. The integration approach differs per product — some have real SDKs, some are pure contract interaction.

---

**1. Liquidity Hub** (`@orbs-network/liquidity-hub-sdk`)

This is a real headless TypeScript SDK — not React-only. `constructSDK({ partner, chainId })` returns an instance with `getQuote()` and swap execution. It sources liquidity from a competitive solver network that includes ParaSwap, Odos, AMM pools, and private market maker inventory. Trades are gasless for users (solvers price gas into their fees). If the Hub can't beat the AMM price, it falls back to the AMM — it can only improve on a trade, never worsen it.

This is the Orbs equivalent of LI.FI but for same-chain swaps: better price discovery than routing through a single DEX. It complements LI.FI (which handles cross-chain) rather than competing with it.

Prometheus should research the SDK source in `orbs-network/liquidity-hub-sdk` to understand if `constructSDK` works cleanly in a Node.js (non-browser, non-Wagmi) environment, or if it has browser/Wagmi dependencies that need to be stripped.

---

**2. dTWAP** — direct contract interaction, no REST API

Placing a TWAP order means calling `ask()` on the deployed TWAP contract with the order parameters. There is no HTTP quoter API for TWAP order creation. The taker network (Orbs validators + any third party) handles routing internally using ParaSwap API — the maker doesn't need to worry about this.

Key parameters: source token, destination token, amount per chunk, minimum output per chunk (0 for market order), total deadline, fill delay between chunks, and the exchange adapter address. ERC-20 approval to the TWAP contract must happen first.

Order status is readable via the Lens contract. `configs.json` in `orbs-network/twap` has deployed addresses per chain and available exchange adapters.

---

**3. dLIMIT** — same contract as dTWAP, specific parameterization

dLIMIT is not a separate contract — it's dTWAP with one chunk, where `dstMinAmount` encodes the limit price floor. Placing a limit order means calling `ask()` with chunks=1 and a non-zero `dstMinAmount`. Same approval flow, same contract, same Lens for status.

---

**4. dSLTP** — stop-loss and take-profit, newest product (November 2025)

dSLTP adds stop-market and stop-limit orders. Stop-market guarantees execution once the trigger price is hit (with potential slippage). Stop-limit adds a price floor protection below the trigger. This is the newest Orbs product and has the least documentation — Prometheus should research the `orbs-network` GitHub for any dSLTP-specific contracts or SDK additions before planning the implementation.

---

**Integration approach summary for Prometheus:**

| Product | Integration method | Quoter/read |
|---|---|---|
| Liquidity Hub | `@orbs-network/liquidity-hub-sdk` | `getQuote()` in SDK |
| dTWAP | Direct contract `ask()` | Lens contract |
| dLIMIT | Direct contract `ask()` (1 chunk, non-zero min) | Lens contract |
| dSLTP | TBD — research needed | TBD |

All four should be gated behind wallet configuration (Tier 1). Liquidity Hub quote is read-only and can be offered in read-only mode.

All write operations are gated behind an explicit confirmation step by default. This is opt-out, not opt-in — the safe behavior is on unless deliberately disabled.

**How it works (pending queue pattern):**

When a write tool is called (send ETH, swap, bridge, activate wallet, etc.), it does not execute immediately. Instead it:
1. Simulates or describes the operation
2. Adds it to an in-memory pending queue with a unique ID
3. Returns a human-readable summary of what will happen — amounts, chains, estimated fees, contracts involved
4. Waits for explicit confirmation via `transaction_confirm(id)` before executing

The agent is structurally forced to surface the summary before anything hits the chain. The user sees exactly what's about to happen and must explicitly approve it.

**Supporting tools:**
- `transaction_confirm(id)` — executes the queued operation
- `transaction_deny(id)` — discards it
- `transaction_list()` — shows all pending operations (useful if multiple are queued)

The pending queue is in-memory only. It clears on server restart, which is a deliberate safety property — there are no orphaned pending transactions that execute unexpectedly after a restart.

**Opting out:**

Two mechanisms, both should work:
- `CONFIRM_WRITES=false` env var — disables confirmation globally at startup (for CI/CD or fully automated pipelines that have their own approval flow)
- `wallet_set_confirmation(enabled: boolean)` tool — runtime toggle, useful when the user wants to temporarily disable for a batch of trusted operations

When confirmation is disabled, write tools execute immediately and return the result directly — same behavior as if `transaction_confirm` had been called automatically.

**What counts as a write:** Any tool that submits a transaction — ETH transfers, token transfers/approvals, swaps, bridges, contract calls. `wallet_activate` and `wallet_deactivate` are also confirmation-gated since they change the security state of the server. Read tools (quotes, balances, prices, address derivation) are never gated.

Prometheus should research whether GOAT's tool handler exposes enough pre-execution information to build a meaningful summary (amounts, recipient, contract address) before the transaction is signed, or whether the summary has to be constructed from the tool call parameters alone.

The active wallet persists to `~/.web3agent/wallet.json` as a plaintext JSON file, mode 600 (user read/write only). This is the same model as `~/.ssh/id_rsa` — no encryption, but strict file permissions mean only the current user process can read it.

File shape:
```json
{ "type": "private-key", "privateKey": "0x...", "address": "0x..." }
```
or for mnemonic wallets:
```json
{ "type": "mnemonic", "mnemonic": "word word ...", "accountIndex": 0, "addressIndex": 0 }
```

**Startup resolution order:**
1. `PRIVATE_KEY` env var — takes precedence if set (CI/CD, explicit override)
2. `MNEMONIC` env var — same
3. `~/.web3agent/wallet.json` — loaded if file exists and is readable
4. Read-only mode — ephemeral session key, no writes

**`wallet_activate` tool** — accepts a private key or mnemonic, hot-swaps the active account, and writes it to `~/.web3agent/wallet.json` for future sessions. The combination of generate → activate means a user can go from zero to write-capable in two tool calls with no env vars and no restarts, and the wallet survives server restarts automatically from then on.

**`wallet_deactivate` tool** — clears the persisted file and reverts to read-only mode, after explicit confirmation from use and a backup of exisitng keys.

The file is created with `fs.writeFile` + `fs.chmod(path, 0o600)` immediately after write. Prometheus should research whether there's a TOCTOU race on some platforms between write and chmod, and whether `open(path, O_CREAT | O_WRONLY, 0o600)` via a lower-level API is safer. For v1 the simple approach is probably fine.

- **private-key mode:** `PRIVATE_KEY` set — full write access
- **mnemonic mode:** `MNEMONIC` set — HD derivation via `WALLET_ACCOUNT_INDEX` / `WALLET_ADDRESS_INDEX` (both default to 0)
- **read-only mode:** neither set — ephemeral session key, writes fail gracefully

### Chain is per-call, not per-server

There is no `CHAIN_ID` environment variable. Chain selection is a **call-time parameter** on every tool that needs it. The server holds the account (keypair or mnemonic) but constructs a wallet client on demand for whichever chain a given tool call targets.

This is not optional — it's required for any realistic multi-step workflow. A bridge from ETH → Base followed by a deposit on Aave on Base involves three chains in a single agent session, with no restart between steps.

The wallet client is a factory, not a singleton. Any tool that sends transactions accepts a `chainId` parameter and resolves the appropriate viem chain object at call time. The supported chain set is fixed and ships with the package — the same major EVM chains (mainnet, Base, Arbitrum, Optimism, Polygon, Linea, BSC, Avalanche, zkSync Era, Scroll, Mode, Blast, Mantle, Celo, Gnosis, Sepolia, Base Sepolia). LI.FI already handles this correctly via its `switchChain` callback; GOAT-backed write tools need the same treatment.

`RPC_URL` is dropped as a concept for the same reason — a single RPC override doesn't make sense when the active chain is dynamic. Prometheus should research how to handle per-chain RPC configuration, or whether falling back to viem's public transports for all chains is acceptable for v1.

### npx compatibility

The compiled output must be executable directly via `npx` — shebang line, correct permissions, and a `bin` entry in `package.json`. A post-build script handles this since `tsc` doesn't preserve executability.

### WEB3_CONTEXT.md

A markdown file that ships with the package, intended to be placed in a project root or agent rules file. It should be a concise routing guide — which MCP server to use for what (Blockscout for history, EVM for live state, this one for DeFi and wallet ops). Not documentation — just the minimum an agent needs to route tool calls correctly.

---

## Things to research and clarify

Investigate the following before finalizing the plan, and ask me about anything where source research is insufficient:

- Current `@modelcontextprotocol/sdk` API — specifically how `McpServer.tool()` handles Zod schemas, and whether there are any changes in recent versions to the stdio transport setup
- Current `@goat-sdk/adapter-model-context-protocol` — the exact shape of `listOfTools()` output and what the JSON Schema → Zod conversion needs to handle (nested objects, arrays, optional fields)
- `@lifi/sdk` v3 EVM provider setup for server-side (non-Wagmi) usage — how `getWalletClient` and `switchChain` callbacks should be structured with a raw viem wallet client
- Whether any of the GOAT plugins (Uniswap, Balancer) have known chain restrictions that would affect Tier 1 behavior on non-mainnet chains
- Best approach for keeping the LI.FI `getWalletClient` closure in sync with the active chain — since chain is now per-call, the factory pattern needs to work cleanly with LI.FI's internal `switchChain` callback
- `orbs-network/liquidity-hub-sdk`: whether `constructSDK` works in Node.js without Wagmi/browser dependencies, and the exact shape of `getQuote()` arguments and response
- `orbs-network/twap` repo: current `configs.json` for deployed contract addresses and exchange adapters per chain; `ask()` function signature from `twap.abi.json`; how the Lens contract is queried for order status by maker address
- `orbs-network` GitHub: any dSLTP-specific contracts, ABIs, or SDK packages — this product launched November 2025 and may not be well-documented yet

---

## Success criteria

- `npm install` completes without errors on Node 18+
- `npm run build` compiles without errors and produces a valid `dist/index.js`
- `npm pack` produces a tarball with the correct files and no missing dependencies
- `npx .` starts the server with no env vars, prints a startup summary to stderr, and accepts MCP connections
- `npx .` starts in read-only mode with no env vars, prints a useful startup summary to stderr
- After `wallet_generate` + `wallet_activate`, write operations work and `~/.web3agent/wallet.json` exists with mode 600
- Server restart with no env vars loads the persisted wallet and resumes write-capable mode
- `wallet_deactivate` removes the file and reverts to read-only
- `PRIVATE_KEY` env var takes precedence over the persisted file
- Wallet generation tools work in all modes including read-only
- DexScreener and CoinGecko tools return data with no credentials configured
- With a wallet configured, Uniswap/Balancer/LI.FI tools appear in the tool list
- `orbs_get_quote` returns a Liquidity Hub quote for a same-chain swap without a wallet configured
- `orbs_place_twap` queues a pending summary (chunk size, count, fill delay, estimated duration) before executing
- `orbs_place_limit` queues a pending summary (limit price, expiry) before executing
- `orbs_list_orders` returns open orders for the active wallet address via the Lens contract
- With confirmation enabled (default), a swap tool call returns a pending summary and does not execute until `transaction_confirm` is called
- `CONFIRM_WRITES=false` causes write tools to execute immediately with no queue step
- `transaction_deny` discards a pending operation without executing it
- `server_status` reports whether confirmation mode is currently enabled
- `npm run build` succeeds and `npm pack` produces a valid, publishable tarball