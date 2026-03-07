# Issues — web3agent-framework

## Known Gotchas (from Metis review)
- GOAT pins MCP SDK 1.0.4 — must use pnpm peerDependencyRules.allowedVersions
- Blockscout `__unlock_blockchain_analysis__` — bootstrap tool, auto-call then filter
- Orbs LiqHub only on 6/17 chains — must validate per-chain availability
- tsc strips shebangs — tsup handles this, use tsup not tsc
- Task 1 MUST freeze ALL shared TypeScript interfaces — Wave 2 tasks depend on these contracts
- formatToolError() helper must be consistent across ALL tools
- EVM subprocess: must use process.on('exit') + client.close() to prevent zombies
- Confirmation queue: needs TTL + createdAt timestamp for stale operation detection
