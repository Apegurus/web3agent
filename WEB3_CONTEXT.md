# Web3Agent — MCP Proxy Context

All Web3 tools are accessible through a single `web3agent` MCP server entry.

## Tool Routing Guide

### Blockscout tools (prefix: `blockscout_`)
Indexed blockchain data: address info, token balances, transaction history, NFT metadata, contract ABI, contract source code, ENS resolution, block info. Works on 3000+ chains.

Tools: `blockscout_get_address_info`, `blockscout_get_tokens_by_address`, `blockscout_get_transactions_by_address`, `blockscout_get_token_transfers_by_address`, `blockscout_nft_tokens_by_address`, `blockscout_get_block_info`, `blockscout_get_transaction_info`, `blockscout_get_contract_abi`, `blockscout_inspect_contract_code`, `blockscout_read_contract`, `blockscout_get_block_number`, `blockscout_lookup_token_by_symbol`, `blockscout_get_address_by_ens_name`, `blockscout_get_chains_list`, `blockscout_direct_api_call`

### EVM tools (prefix: `evm_`)
Live on-chain state: current balances, contract reads, gas estimation, ENS resolution, multicall, signing. Writes require a configured wallet.

### Wallet tools (prefix: `wallet_`)
- `wallet_generate` — generate new wallet (key shown once, never stored)
- `wallet_generate_mnemonic` — generate BIP-39 mnemonic
- `wallet_from_mnemonic` — derive address from mnemonic
- `wallet_derive_addresses` — batch derive 1-20 addresses
- `wallet_get_active` — get current wallet address, chain, mode
- `wallet_activate` — activate wallet from private key or mnemonic, persists to disk (mode 0600)
- `wallet_deactivate` — deactivate current wallet, delete key file, revert to read-only
- `wallet_set_confirmation` — toggle write confirmation at runtime (enabled/disabled)

### Transaction management
- `transaction_confirm(id)` — execute a queued write operation
- `transaction_deny(id)` — discard a queued operation
- `transaction_list()` — list pending operations
- `transaction_simulate()` — simulate an unsigned transaction, estimate gas, and preview balance changes

### Browser-wallet operations
- `operation_prepare` — prepare the next external-wallet actions plus opaque `resumeState`
- `operation_resume` — continue a prepared operation after signatures or transactions complete externally
- These are the primary MCP tools for browser-wallet flows across Orbs, LI.FI, and GOAT

### DeFi tools

**GOAT plugins** (Uniswap, Balancer, ERC-20, ERC-721, ENS, DexScreener):
- All accept optional `chainId` parameter (defaults to active chain)
- Uniswap: chains 1, 137, 43114, 8453, 10, 42161, 42220
- Balancer: chains 34443, 8453, 137, 100, 42161, 43114, 10

**LI.FI cross-chain bridging** (prefix: `lifi_`):
- `lifi_get_chains` — list supported chains
- `lifi_get_quote` — get bridge/swap quote
- `lifi_execute_bridge` — execute cross-chain bridge (write, confirmation-gated)
- `lifi_prepare_bridge_intent` — prepare raw bridge transaction steps for an external wallet (read-only)
  Compatibility note: `operation_prepare` / `operation_resume` are the preferred generic MCP flow

**Orbs DeFi** (prefix: `orbs_`):
- `orbs_get_quote` — Liquidity Hub aggregated swap quote (chains: 137, 56, 8453, 59144, 81457, 42161)
- `orbs_swap` — execute swap (write, confirmation-gated)
- `orbs_prepare_swap_intent` — prepare swap quote + EIP-712 payload for an external wallet (read-only)
- Slippage naming is explicit: quote/swap flows use `slippagePct`; Spot/TWAP/limit order flows use `slippageBps`
- `orbs_get_required_approvals` — check wrap / Permit2 approval steps before signing (read-only)
- `orbs_swap_status` — check status of a pending Liquidity Hub swap (takes chainId, sessionId, user)
- `orbs_place_twap` — place dTWAP order (write, confirmation-gated)
- `orbs_prepare_twap_intent` — prepare dTWAP order data for an external wallet (read-only)
- `orbs_place_limit` — place dLIMIT order (write, confirmation-gated)
- `orbs_prepare_limit_intent` — prepare dLIMIT order data for an external wallet (read-only)
- `orbs_submit_signed_swap` — submit an externally signed Orbs swap (write)
- `orbs_place_order` — place a gasless Spot order (market, limit, TWAP, stop-loss, take-profit). Write, confirmation-gated.
- `orbs_prepare_order_intent` — prepare a Spot order for external wallet signing (read-only)
- `orbs_submit_signed_order` — submit an externally signed Spot order (write)
- `orbs_query_orders` — query Spot orders by swapper address or order hash (read-only)
- `orbs_cancel_order` — cancel a Spot order on-chain (write, confirmation-gated)
  Compatibility note: these remain supported, but `operation_prepare` / `operation_resume` are the generic-first browser-wallet flow

### Browser-wallet limitation
The browser-wallet tools are MCP-compatible, but generic MCP hosts cannot trigger browser wallet popups themselves. Use MCP to prepare, simulate, and resume operations; perform the actual wallet signing in the surrounding app or host integration.

### Token resolution (prefix: none)
- `resolve_token(symbol, chainId)` — resolve token symbol to contract address and decimals. Uses built-in registry with DexScreener fallback. ALWAYS use this before swaps/bridges.
- `list_chain_tokens(chainId)` — list all well-known tokens for a chain from the built-in registry

### Utilities
- `server_status` — wallet mode, active chain, confirmation setting, backend health
- `list_supported_chains` — all 17 supported chains with IDs and names

### Agentic Economy — x402 Payments (prefix: `x402_`)
HTTP-native stablecoin payments for AI agent services. Use `x402_check_requirements` first to preview cost, then `x402_fetch` to execute.
- `x402_check_requirements` — probe a URL for payment requirements (amount, token, network). Returns null if no payment needed. (read-only)
- `x402_fetch` — fetch a URL with automatic x402 payment. Shows cost in confirmation before paying. (write, confirmation-gated)

### Agentic Economy — Job Escrow / ERC-8183 (prefix: `erc8183_`)
EIP-8183 specification reference implementation (no canonical deployed contract). Job flow: create → setBudget → fund → submit → complete/reject. Expired jobs support `erc8183_claim_refund`. Distinct from `acp_*` tools which target the Virtuals production ACPRouter on Base.
- `erc8183_create_job` — create a new job specifying provider, evaluator, description, and expiry duration (write)
- `erc8183_set_budget` — set the budget for a job (write)
- `erc8183_fund_job` — approve token allowance + fund job escrow in one confirmation (write)
- `erc8183_submit_job` — submit a deliverable (string, gets keccak256-hashed on-chain) (write)
- `erc8183_complete_job` — mark job complete, release payment to provider (write)
- `erc8183_reject_job` — reject submitted deliverable, funds remain in escrow (write)
- `erc8183_claim_refund` — reclaim escrowed funds after job expiry (write)
- `erc8183_get_job` — read current job state: client, provider, budget, status, deliverable (read-only)

### Agentic Economy — Virtuals ACP / ACPRouter (prefix: `acp_`)
On-chain job lifecycle on the Virtuals ACPRouter V2 (Base mainnet and Base Sepolia). Uses a memo-based protocol: jobs progress through phases (Request → Negotiation → Transaction → Evaluation → Completed/Rejected) via memos that participants create and sign. No `ACP_CONTRACT_ADDRESS` env var needed — canonical addresses are hardcoded.
- `acp_create_job` — create a job specifying provider, evaluator, description, expiry, and optional budget (write)
- `acp_set_budget` — set or update job budget with payment token (write)
- `acp_fund_job` — approve token allowance + fund job via payable escrow memo (write)
- `acp_submit_job` — submit deliverable as a memo, advancing job to evaluation phase (write)
- `acp_complete_job` — approve the latest pending memo (auto-resolved), completing the job (write)
- `acp_reject_job` — reject the latest pending memo (auto-resolved), rejecting the deliverable (write)
- `acp_claim_refund` — claim escrowed budget after job completion or expiry (write)
- `acp_get_job` — read job state with full memo history, phase, participants, and pending actions (read-only)

### Agentic Economy — Agent Marketplace / aGDP (prefix: `agdp_`)
Discover and hire agents on the Virtuals Protocol aGDP marketplace (`acpx.virtuals.io`). No wallet required for discovery.
- `agdp_get_offerings` — search agent marketplace by query string; returns name, wallet, offerings, metrics (read-only)
- `agdp_get_offering` — get details of a specific agent by ID (read-only)
- `agdp_get_my_jobs` — list active or completed jobs for the current wallet (read-only)
- `agdp_hire_agent` — hire an agent via aGDP API (write, confirmation-gated). For on-chain job creation, use `acp_create_job` separately.
- `agdp_create_offering` — register an agent offering on aGDP. Requires `LITE_AGENT_API_KEY` from Virtuals — visit agdp.io/join to register.

### Agentic Economy — Agent Identity / ERC-8004 (prefix: `erc8004_`)
On-chain agent identity (ERC-721) and reputation registry. Canonical contracts deployed on Base and Base Sepolia. Requires IPFS hosting or `PINATA_JWT` for registration JSON.
- `erc8004_register_agent` — register agent on-chain: checks for duplicate, validates JSON, pins to IPFS via Pinata or uses provided `agentURI` (write, confirmation-gated)
- `erc8004_get_agent` — get agent info by agentId or wallet address (read-only)
- `erc8004_update_agent` — update agent registration URI on-chain (write, confirmation-gated)
- `erc8004_submit_feedback` — submit reputation feedback (-100 to +100) for an agent (write, confirmation-gated)
- `erc8004_get_feedback` — get aggregated reputation summary for an agent (read-only)

## Chain Selection
Default chain: **Base (8453)**. Override per-call with `chainId` parameter.

Supported chains:
| Chain | ID |
|-------|-----|
| Ethereum | 1 |
| Base | 8453 |
| Arbitrum | 42161 |
| Optimism | 10 |
| Polygon | 137 |
| Linea | 59144 |
| BSC | 56 |
| Avalanche | 43114 |
| zkSync Era | 324 |
| Scroll | 534352 |
| Mode | 34443 |
| Blast | 81457 |
| Mantle | 5000 |
| Celo | 42220 |
| Gnosis | 100 |
| Sepolia | 11155111 |
| Base Sepolia | 84532 |

## Confirmation Queue
Write operations (swaps, bridges, transfers) are queued by default. Use `transaction_confirm(id)` to execute. Disable with `CONFIRM_WRITES=false`.

## Environment Variables
| Variable | Default | Description |
|----------|---------|-------------|
| `CHAIN_ID` | 8453 | Default chain (Base) |
| `PRIVATE_KEY` | — | Wallet private key |
| `MNEMONIC` | — | BIP-39 mnemonic |
| `WALLET_ACCOUNT_INDEX` | 0 | HD account index |
| `WALLET_ADDRESS_INDEX` | 0 | HD address index |
| `RPC_URL` | — | Custom RPC for default chain |
| `CONFIRM_WRITES` | true | Require confirmation for writes |
| `BLOCKSCOUT_MCP_URL` | https://mcp.blockscout.com/mcp | Blockscout MCP endpoint |
| `ETHERSCAN_API_KEY` | — | Etherscan API key |
| `LIFI_API_KEY` | — | LI.Fi API key |
| `ZEROX_API_KEY` | — | 0x API key (enables 0x plugin) |
| `COINGECKO_API_KEY` | — | CoinGecko API key (enables CoinGecko plugin) |
| `ACP_PAYMENT_TOKEN` | — | ERC-20 token address for ACP escrow (defaults to USDC on active chain) |
| `PINATA_JWT` | — | Pinata JWT for auto-pinning ERC-8004 agent registration JSON to IPFS |
| `ERC8004_AGENT_URI` | — | Advertised MCP endpoint URI for ERC-8004 agent registration |
| `AGDP_API_URL` | https://acpx.virtuals.io/api | aGDP marketplace API base URL |

## Known Limitations

- **Blockscout chain coverage**: Blockscout hosted instances support only 8 chains (Ethereum, Polygon, Arbitrum, Optimism, Base, Gnosis, Scroll, zkSync Era). Other chains (BSC, Linea, Avalanche, Blast, Mantle, Mode) are NOT supported by Blockscout tools.
- **dSLTP (Stop Loss/Take Profit)**: Not yet available. Feature-gated for future release.
- **CoinGecko and 0x plugins**: Require API keys (`COINGECKO_API_KEY`, `ZEROX_API_KEY`) to activate.
