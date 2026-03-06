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

### Transaction management
- `transaction_confirm(id)` — execute a queued write operation
- `transaction_deny(id)` — discard a queued operation
- `transaction_list()` — list pending operations

### DeFi tools

**GOAT plugins** (Uniswap, Balancer, ERC-20, ERC-721, ENS, DexScreener):
- All accept optional `chainId` parameter (defaults to active chain)
- Uniswap: chains 1, 137, 43114, 8453, 10, 42161, 42220
- Balancer: chains 34443, 8453, 137, 100, 42161, 43114, 10

**LI.FI cross-chain bridging** (prefix: `lifi_`):
- `lifi_get_chains` — list supported chains
- `lifi_get_quote` — get bridge/swap quote
- `lifi_execute_bridge` — execute cross-chain bridge (write, confirmation-gated)

**Orbs DeFi** (prefix: `orbs_`):
- `orbs_get_quote` — Liquidity Hub aggregated swap quote (chains: 137, 56, 8453, 59144, 81457, 42161)
- `orbs_swap` — execute swap (write, confirmation-gated)
- `orbs_place_twap` — place dTWAP order (write, confirmation-gated)
- `orbs_place_limit` — place dLIMIT order (write, confirmation-gated)
- `orbs_list_orders` — list open TWAP/dLIMIT orders

### Utilities
- `server_status` — wallet mode, active chain, confirmation setting, backend health
- `list_supported_chains` — all 17 supported chains with IDs and names

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
