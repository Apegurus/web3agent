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

## Requirements

- Node.js 18+
- pnpm (for development)

## License

MIT
