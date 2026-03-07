# Decisions — web3agent-framework

## 2026-03-06: Session Start
- Plan selected: web3agent-framework (76 tasks, 11 main + F1-F4 verification)
- Git initialized in /Users/ignacioblitzer/Develop/defizoo/web3agent
- Worktree: same directory (greenfield project, no separate branch needed)
- Execution order follows wave structure from plan

## Key Technical Decisions (from Prometheus plan)
- MCP SDK v1.27.1 with low-level Server API
- StreamableHTTPClientTransport for Blockscout (SSE fallback)
- EVM MCP as subprocess via StdioClientTransport
- Chain-aware GOAT with per-chain handler caching
- LI.FI direct integration (NOT through GOAT)
- peerDependencyRules to reconcile GOAT's MCP SDK pin (1.0.4) with framework (1.27.1)
