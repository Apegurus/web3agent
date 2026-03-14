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
   - Either returns the next pending action set or a completed result

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
- `submitSignedTwapOrder`

They are now thin wrappers over the generic prepared-operation engine.

## MCP Surface

The generic MCP tools are:

- `operation_prepare`
- `operation_resume`
- `transaction_simulate`

The older Orbs / LI.FI browser-wallet MCP tools remain available as compatibility aliases.

## Internal Architecture

- `src/operations/chain-access.ts`
  - Shared chain lookup, config-aware transport resolution, and public-client creation
- `src/operations/validation.ts`
  - Shared chain/address/hex validation and error preservation helpers
- `src/operations/goat-wallet.ts`
  - Prepared-action wallet implementation used to replay GOAT tools
- `src/api/operations.ts`
  - Generic prepare/resume API and protocol adapters

## Notes

- `simulateTransaction()` uses the same chain-access layer as prepared operations
- Trace support is cached with a TTL and can fall back cleanly when `debug_traceCall` is unavailable or unusable
- Runtime wallet persistence, confirmation queues, and CLI startup behavior are unchanged
