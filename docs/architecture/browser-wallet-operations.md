# Browser Wallet Operations

`web3agent` now treats browser-wallet support as a generic prepared-operation flow instead of a set of protocol-specific one-offs.

## Primary Model

1. `prepareOperation(...)`
   - Returns the next wallet actions plus opaque `resumeState`
   - Supported integrations today:
     - `orbs` (`swap`, `order`)
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

## Resume-State Integrity and Upgrades

Orbs swaps/orders, LI.FI bridge/same-chain operations, and 0x swaps authenticate their immutable resume envelope,
including its integration and kind, before returning another wallet action. Configure
`WEB3AGENT_RESUME_STATE_SECRETS` as a comma-separated key ring whose entries are each at least 32
characters. The first entry signs new states and later entries verify states created before rotation.
Every replica or ephemeral runtime that can prepare or resume the same operation must use the same
ring.

On macOS and Linux, when that variable is unset, a host-local 32-byte key is created at
`~/.web3agent/resume-state.key` with owner-only permissions. That fallback survives restarts on one
durable host, but it is not portable across containers, replicas, or replaced home directories.
Windows cannot enforce the required POSIX ownership and permission checks, so it fails closed unless
`WEB3AGENT_RESUME_STATE_SECRETS` is configured explicitly.

Resume states emitted before integrity tags were introduced cannot resume through the hardened
Orbs, LI.FI, or 0x paths. After upgrading, prepare those in-flight operations again rather than
copying an unsigned state forward. GOAT and Uniswap v4 retain their existing canonical replay and
receipt-verification boundaries; they do not use this HMAC envelope.

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

### Stateless Uniswap v4 resume boundary

Uniswap v4 external-wallet resumes treat all transaction facts in `resumeState` as untrusted.
Each resume replans from the supplied operation and its pinned source block; a persisted plan is
only checked for equality with that fresh canonical plan. Signature results return the immediately
derived Permit2 or PositionManager transaction once, but store neither the signature nor derived
transaction facts. A later transaction hash is accepted only after the actual chain transaction is
decoded: Permit2 batches and signer recovery must exactly match the canonical typed data; delegated
NFT calls must be an exact two-call `multicall(permit, canonical-final-call)` with the recovered NFT
owner signature. Normal approvals and final calls are byte-compared with canonical calldata.

Without a server-signed opaque state token, a stateless service cannot authenticate that the supplied
operation is the original operation it prepared. It instead guarantees that every requested or
executed action is canonical for the operation currently supplied and is wallet-signed where
authorization requires a signature. Applications requiring original-intent continuity must add an
authenticated state token outside this protocol.

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
- Runtime wallet persistence and CLI startup behavior are unchanged; Orbs/LI.FI/0x resume authentication
  adds the key-management behavior described above

### Uniswap v4 lifecycle prerequisites and scope

- Prepare the selected `mint`, `increase`, `decrease`, `collect`, or `burn` operation, simulate it at its pinned source block, then present the next action to the user. Simulation is a preflight prerequisite, not execution authority: the caller must still obtain a fresh wallet signature or transaction confirmation.
- `collect` means collect all currently owed fees for the position under the canonical/pinned plan. It does not support an arbitrary partial amount and does not calculate realized P&L, tax lots, accounting entries, or a liquidity-management strategy.
- Event reads are deliberately bounded. A caller supplies a finite scope and follows the returned cursor; web3agent does not offer an unbounded historical event stream.
- A stateless `resumeOperation()` has no authenticated memory of an original user intent. It canonicalizes the operation presented on the current call and verifies submitted facts; applications that require continuity across tabs, restarts, or interrupted signing must bind the operation to their own authenticated state token.
