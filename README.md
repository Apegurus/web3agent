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

- **Blockscout** — indexed blockchain data (address info, tx history, NFTs, contract ABIs)
- **EVM MCP** — live on-chain state (balances, contract reads, gas, ENS)
- **GOAT plugins** — Uniswap, Balancer, ERC-20/721, DexScreener
- **LI.FI** — cross-chain bridging and swaps
- **Orbs** — Liquidity Hub aggregated swaps, dTWAP, dLIMIT orders
- **Wallet management** — generate, persist, derive addresses

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

## Requirements

- Node.js 18+
- pnpm (for development)

## License

MIT
