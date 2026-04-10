# __PROJECT_NAME__

Local MCP-host quickstart for `web3agent`.

This starter keeps the M1 install contract intact:

- generic hosts can still point directly at `npx web3agent`
- this project-local wrapper is for cases where you want local scripts, checked-in examples, and project-owned environment configuration

## Quickstart

1. Copy `.env.example` to `.env`
2. Run `npm install`
3. Run `npm run check`
4. Run `npm run print:mcp-config`
5. Point your MCP-capable host at the printed stdio config
6. Start the local server with `npm run dev`

## 30-second path

If your host can already consume a stdio MCP server, the 30-second path is:

1. Copy `.env.example` to `.env`
2. Keep `CONFIRM_WRITES=true`
3. Run `npm install`
4. Run `npm run check`
5. Run `npm run print:mcp-config`
6. Paste that config into your host and invoke `lifi_execute_bridge`, then `transaction_confirm`

## First Write Tutorial

The canonical write flow in this starter stays on the same queue-confirm lifecycle used everywhere else:

`lifi_execute_bridge -> transaction_confirm`

The included lifecycle example in `src/examples/lifecycle.ts` uses `web3agent/runtime` directly so the example and MCP server share the same tool core.

## Troubleshooting

- use `npx web3agent` directly if you do not need a project-local wrapper
- generic MCP hosts cannot click browser wallet popups; use prepare/resume flows instead
- keep `CONFIRM_WRITES=true` for your first safe write flow
