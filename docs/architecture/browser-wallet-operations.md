# Browser Wallet Operations

`web3agent` now treats browser-wallet support as a generic prepared-operation flow instead of a set of protocol-specific one-offs.

## Primary Model

1. `prepareOperation(...)`
   - Returns the next wallet actions plus opaque `resumeState`
   - Supported integrations today:
     - `orbs` (`swap`, `twap`, `limit`)
     - `lifi` (`bridge`)
     - `goat` (`tool`)
2. The surrounding app performs the wallet work externally
   - Send transactions
   - Sign typed data
   - Sign messages
3. `resumeOperation(...)`
   - Replays the operation using the provided action results
   - Merges newly supplied results with progress already stored inside `resumeState.state.actionResults`
   - Either returns the next pending action set or a completed result
   - Treats transaction results as complete only when the caller submits `{ type: "transaction", txHash, status: "confirmed" }`
   - Verifies the referenced transaction receipt before advancing

## Why This Exists

- Browser-wallet consumers do not have a server-side private key
- MCP hosts can prepare and resume, but generic MCP hosts cannot open wallet popups on their own
- GOAT, Orbs, and LI.FI can all fit behind the same action model:
  - `transaction`
  - `signTypedData`
  - `signMessage`

## Compatibility Layer

The protocol-specific helpers remain available:

- `prepareSwapIntent`
- `getRequiredApprovals`
- `prepareTwapIntent`
- `prepareLimitIntent`
- `prepareBridgeIntent`
- `submitSignedSwap`
- `submitSignedOrder`

They are now thin wrappers over the generic prepared-operation engine.

## MCP Surface

The generic MCP tools are:

- `operation_prepare`
- `operation_resume`
- `transaction_simulate`

The older Orbs / LI.FI browser-wallet MCP tools remain available as compatibility aliases.

`operation_resume` is intentionally marked destructive because a resume can advance an operation to a final signed submission or on-chain transaction.

## Internal Architecture

- `src/operations/chain-access.ts`
  - Shared chain lookup, config-aware transport resolution, and public-client helpers
- `src/operations/validation.ts`
  - Shared chain/address/hex validation and error preservation helpers
- `src/operations/goat-wallet.ts`
  - Prepared-action wallet implementation used to replay GOAT tools
- `src/api/operations.ts`
  - Thin generic prepare/resume dispatcher
- `src/api/operations/orbs.ts`
  - Orbs swap/TWAP/limit preparation, resume, and compatibility submissions
- `src/api/operations/lifi.ts`
  - LI.FI bridge preparation, resume, Permit2 handling, and chain metadata caching
- `src/api/schemas/*.ts`
  - Domain-specific browser-wallet and root API validators
- `src/api/simulation/fallback-decoder.ts`
  - Best-effort balance-change decoder for RPCs without `debug_traceCall`

## Notes

- `simulateTransaction()` uses the same chain-access layer as prepared operations
- Trace support is cached with a TTL and can fall back cleanly when `debug_traceCall` is unavailable or unusable
- Simulation failures are exception-based
  - successful simulations return `{ success: true, gasEstimate, balanceChanges }`
  - invalid params, reverts, and RPC failures throw `Web3AgentError`
- Prepared operations are staged
  - `prepareOperation()` returns only the next required wallet actions, not always the full end-to-end sequence
  - LI.FI and GOAT can require multiple resume rounds before the final transaction is available
- `prepareBridgeIntent()` is the Orbzy-friendly compatibility path
  - `steps` and `actions` are both transaction-only, including any required approval transactions before the bridge call
  - use `prepareOperation()` with `integration: "lifi"` when you need the staged external-wallet flow with typed-data signing
- Resume callers only need to send newly completed actions each round
  - previously completed action results are persisted in the opaque resume state
- Prepared GOAT flows are address-based in this revision
  - ticker-based token lookup is intentionally unsupported in prepared GOAT mode
- Permit2 approvals are intentional and broad
  - browser-wallet integrators should surface this approval tradeoff in their own UI
- ACP and ACP Virtuals remain direct-execution tools in this revision
  - they do not yet expose browser-wallet compatibility helpers
- The env-gated browser-wallet e2e test in [`tests/e2e/browser-wallet-flow.test.ts`](../../tests/e2e/browser-wallet-flow.test.ts) runs when all of these variables are set:
  - `BROWSER_WALLET_E2E`
  - `BROWSER_WALLET_E2E_CHAIN_ID`
  - `BROWSER_WALLET_E2E_ACCOUNT`
  - `BROWSER_WALLET_E2E_FROM_TOKEN`
  - `BROWSER_WALLET_E2E_TO_TOKEN`
  - `BROWSER_WALLET_E2E_IN_AMOUNT`
  - `BROWSER_WALLET_E2E_SIGNATURE`
- Runtime wallet persistence, confirmation queues, and CLI startup behavior are unchanged
