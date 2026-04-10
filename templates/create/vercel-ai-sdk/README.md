# __PROJECT_NAME__

Starter built on the Vercel AI SDK with runtime-discovered `web3agent` tools.

## Quickstart

1. Copy `.env.example` to `.env`
2. Fill in your model provider key
3. Run `npm run check`
4. Run `npm run dev`

## 30-second path

If you already have a throwaway dev wallet and one model API key ready, the fastest path is:

1. Copy `.env.example` to `.env`
2. Set `ANTHROPIC_API_KEY` or `OPENAI_API_KEY`
3. Keep `CONFIRM_WRITES=true`
4. Run `npm run check`
5. Run `npm run dev`
6. Ask the starter to bridge a small test amount, then confirm it with the exact queued ID

## First Write Tutorial

The canonical lifecycle in this starter is:

`quote -> simulate -> prepare -> confirm -> execute -> resume -> status`

The included lifecycle example lives in `src/examples/lifecycle.ts` and follows the same safe-write shape used in M1:

1. queue a bridge or swap with `lifi_execute_bridge`
2. confirm it explicitly with `transaction_confirm`
3. inspect the returned result and follow up with status tools as needed

## Troubleshooting

- Node.js 22+ is required
- leave `CONFIRM_WRITES=true` for the first write flow
- use a throwaway dev wallet only
- if a backend is degraded, run the root package doctor flow before debugging the starter
