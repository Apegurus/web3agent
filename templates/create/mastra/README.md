# __PROJECT_NAME__

Mastra starter that keeps `web3agent` as the Web3 execution substrate instead of introducing a second transaction lifecycle.

## Quickstart

1. Copy `.env.example` to `.env`
2. Add your model provider key
3. Run `npm install`
4. Run `npm run check`
5. Run `npm run dev`

## 30-second path

If you already have a provider key and a throwaway dev wallet ready, the 30-second path is:

1. Copy `.env.example` to `.env`
2. Set `OPENAI_API_KEY` and keep `MASTRA_MODEL` at its default
3. Keep `CONFIRM_WRITES=true`
4. Run `npm install`
5. Run `npm run check`
6. Start the Mastra app with `npm run dev` and use the prepared-operation tools for the first bridge flow

## First Write Tutorial

This starter is organized around the canonical safe-write lifecycle:

`quote -> simulate -> prepare -> confirm -> execute -> resume -> status`

The included lifecycle example in `src/examples/lifecycle.ts` uses the public `web3agent` root APIs:

- `prepareOperation(...)`
- `simulateTransaction(...)`
- `resumeOperation(...)`

The Mastra agent tools in `src/mastra/tools/web3agent-tools.ts` wrap those same public surfaces so the agent and the standalone example stay aligned.

## Troubleshooting

- Node.js 22+ is required
- keep `CONFIRM_WRITES=true` for the first write flow
- if you see degraded adapters, debug the underlying `web3agent` environment first
- run `npm run example:lifecycle` only after setting the live-flow variables in `.env`
