# Web3 Agent Setup Guide

Two MCPs. One context file. Zero config. Works on Claude Code, Cursor, Windsurf, and OpenCode.

---

## What you're installing

**Blockscout** — Indexed chain data via hosted SSE. No install, no key.
Covers: address history, token metadata, verified ABIs, contract source, NFT data, search across 3000+ EVM chains.

**EVM MCP** — Live RPC state via npx stdio. No config for reads.
Covers: current balances, direct contract reads, ENS resolution, gas estimation. Writes unlock only if you add a private key.

---

## Claude Code

**1. Add the MCPs**

Edit `~/.claude/mcp.json` (create it if it doesn't exist):

```json
{
  "mcpServers": {
    "blockscout": {
      "type": "sse",
      "url": "https://mcp.blockscout.com/mcp"
    },
    "evm": {
      "command": "npx",
      "args": ["-y", "@mcpdotdirect/evm-mcp-server"]
    }
  }
}
```

**2. Add context**

Create `CLAUDE.md` in your project root (or append if it exists):

```markdown
## Web3

Two MCPs are active. Use the right one for the job:

- **blockscout** → historical data, token metadata, verified ABIs, contract source
  code, tx history, NFT data, address search. Works on 3000+ EVM chains.
- **evm** → current on-chain state: live balances, direct contract reads (view
  functions), ENS resolution, gas estimation. Writes require PRIVATE_KEY env var.

When both could work, prefer blockscout for anything historical or enriched,
evm for anything that needs to reflect the current block.
```

**3. Restart Claude Code.** Done.

---

## Cursor

**1. Add the MCPs**

Edit `.cursor/mcp.json` in your project root (create if needed):

```json
{
  "mcpServers": {
    "blockscout": {
      "type": "sse",
      "url": "https://mcp.blockscout.com/mcp"
    },
    "evm": {
      "command": "npx",
      "args": ["-y", "@mcpdotdirect/evm-mcp-server"]
    }
  }
}
```

**2. Add context**

Create `.cursor/rules/web3.mdc`:

```markdown
---
description: Web3 blockchain tools — use for any on-chain queries, contract
  interaction, token data, DeFi analysis, address lookups, ENS resolution.
globs: ["**/*.sol", "**/*.ts", "**/*.js"]
alwaysApply: false
---

## Web3

Two MCPs are active. Use the right one for the job:

- **blockscout** → historical data, token metadata, verified ABIs, contract source
  code, tx history, NFT data, address search. Works on 3000+ EVM chains.
- **evm** → current on-chain state: live balances, direct contract reads (view
  functions), ENS resolution, gas estimation. Writes require PRIVATE_KEY env var.

When both could work, prefer blockscout for anything historical or enriched,
evm for anything that needs to reflect the current block.
```

**3. Restart Cursor.** Done.

---

## Windsurf

**1. Add the MCPs**

Edit `~/.codeium/windsurf/mcp_config.json` (create if needed):

```json
{
  "mcpServers": {
    "blockscout": {
      "serverUrl": "https://mcp.blockscout.com/mcp"
    },
    "evm": {
      "command": "npx",
      "args": ["-y", "@mcpdotdirect/evm-mcp-server"]
    }
  }
}
```

**2. Add context**

Create `.windsurf/rules/web3.md` in your project root:

```markdown
## Web3

Two MCPs are active. Use the right one for the job:

- **blockscout** → historical data, token metadata, verified ABIs, contract source
  code, tx history, NFT data, address search. Works on 3000+ EVM chains.
- **evm** → current on-chain state: live balances, direct contract reads (view
  functions), ENS resolution, gas estimation. Writes require PRIVATE_KEY env var.

When both could work, prefer blockscout for anything historical or enriched,
evm for anything that needs to reflect the current block.
```

**3. Restart Windsurf.** Done.

---

## OpenCode (OmO)

**1. Add the MCPs**

Edit `.opencode/config.json` in your project root (create if needed):

```json
{
  "mcp": {
    "blockscout": {
      "type": "sse",
      "url": "https://mcp.blockscout.com/mcp"
    },
    "evm": {
      "type": "local",
      "command": "npx",
      "args": ["-y", "@mcpdotdirect/evm-mcp-server"]
    }
  }
}
```

**2. Add context**

Add to your project's `AGENTS.md` (or create it):

```markdown
## Web3

Two MCPs are active. Use the right one for the job:

- **blockscout** → historical data, token metadata, verified ABIs, contract source
  code, tx history, NFT data, address search. Works on 3000+ EVM chains.
- **evm** → current on-chain state: live balances, direct contract reads (view
  functions), ENS resolution, gas estimation. Writes require PRIVATE_KEY env var.

When both could work, prefer blockscout for anything historical or enriched,
evm for anything that needs to reflect the current block.
```

**3. Restart OpenCode.** Done.

---

## Enabling writes (optional)

When you need the agent to sign and send transactions, add `PRIVATE_KEY` to
your environment. The EVM MCP never stores it — it's used only for signing.

```bash
# In your shell profile or .env (never commit this)
export PRIVATE_KEY=0x...
```

Then update the `evm` entry in whichever MCP config you're using:

```json
"evm": {
  "command": "npx",
  "args": ["-y", "@mcpdotdirect/evm-mcp-server"],
  "env": {
    "PRIVATE_KEY": "${PRIVATE_KEY}"
  }
}
```

---

## Test it

Once set up, paste this into your agent to confirm both MCPs are working:

```
What ERC-20 tokens does vitalik.eth hold on Base?
What is the current ETH balance of vitalik.eth on mainnet?
```

The first query hits Blockscout (indexed token data).
The second hits EVM MCP (live RPC state).
If both return results, you're fully set up.

---

## Chain IDs for reference

The EVM MCP accepts a `chainId` parameter on most tools.
Most used:

| Chain     | ID     |
|-----------|--------|
| Ethereum  | 1      |
| Base      | 8453   |
| Arbitrum  | 42161  |
| Optimism  | 10     |
| Polygon   | 137    |
| Linea     | 59144  |
| BSC       | 56     |
| Avalanche | 43114  |
| zkSync    | 324    |
| Scroll    | 534352 |

Blockscout works with chain names and IDs interchangeably.
Use `get_chains` to see the full list of 3000+ supported networks.