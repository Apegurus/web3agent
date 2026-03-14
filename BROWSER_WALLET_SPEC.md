# Browser Wallet Integration Spec

**Status**: Proposed  
**Author**: Sisyphus (via Orbzy integration analysis)  
**Date**: 2026-03-14  
**Scope**: Additive changes to `web3agent` package enabling browser-wallet consumers (Orbzy)

---

## Motivation

The `web3agent` package currently assumes a server-side wallet (private key or mnemonic) for all write operations. The execution chain is:

```
tool handler → executeWrite() → getWalletState() → getActiveAccount() → sign → submit
```

Orbzy — a Next.js chat UI showcasing web3agent — connects browser wallets via Reown AppKit + wagmi. There is no server-side key. The package needs to support a "prepare intent" flow where:

1. The package prepares unsigned transaction data (EIP-712 typed data, raw calldata)
2. The consumer signs with its own wallet (browser, hardware, etc.)
3. The package submits the signed result

All changes are **additive**. No existing functions, tool handlers, or CLI behavior are modified.

---

## New Public API Functions

### 1. `prepareSwapIntent`

Prepares an Orbs Liquidity Hub swap for external signing. Gets a quote with EIP-712 permit data and normalizes it for `eth_signTypedData_v4`.

```typescript
export async function prepareSwapIntent(params: {
  chainId: number;
  fromToken: string;
  toToken: string;
  inAmount: string;
  slippage?: number;
  account: string;        // signer address (for quote + approval checks)
}): Promise<SwapIntent>
```

**Returns:**

```typescript
interface SwapIntent {
  /** Normalized EIP-712 data ready for wallet signTypedData */
  eip712: {
    domain: Record<string, unknown>;
    types: Record<string, Array<{ name: string; type: string }>>;
    primaryType: string;
    message: Record<string, unknown>;
  };
  /** Full quote object — pass back to submitSignedSwap */
  quote: {
    sessionId: string;
    inToken: string;
    outToken: string;
    inAmount: string;
    outAmount: string;
    minAmountOut: string;
    user: string;
    [key: string]: unknown;
  };
  /** On-chain approvals the user must complete before signing the permit */
  requiredApprovals: ApprovalStep[];
  /** Chain the swap executes on */
  chainId: number;
}
```

**Behavior:**

1. Validate chain is Liquidity Hub supported via `isLiquidityHubSupported()`
2. Determine effective `fromToken` — if native, resolve to wrapped address (but do NOT wrap)
3. Call `sdk.getQuote()` with `account` as the user address
4. Extract EIP-712 data from `quote.eip712`
5. Normalize via `normalizeEip712ForSigning()`
6. Call `getRequiredApprovals()` to determine pre-signing steps
7. Return `SwapIntent`

**Does NOT:** wrap native tokens, approve Permit2, sign, or submit.

**Error cases:**
- `CHAIN_NOT_SUPPORTED` — chain not in Liquidity Hub set
- `ORBS_QUOTE_ERROR` — quote failed (low value, no liquidity, token not supported)

**File:** `src/api/intents.ts` (new)

---

### 2. `getRequiredApprovals`

Checks what on-chain approvals the user must complete before signing a swap permit. Read-only — makes `eth_call` to check allowances, does not execute transactions.

```typescript
export async function getRequiredApprovals(params: {
  chainId: number;
  fromToken: string;
  inAmount: string;
  account: string;
}): Promise<ApprovalStep[]>
```

**Returns:**

```typescript
interface ApprovalStep {
  /** What this step does */
  type: 'wrap' | 'approve';
  /** Human-readable label */
  label: string;
  /** Transaction fields the consumer must send */
  tx: {
    to: `0x${string}`;
    data?: `0x${string}`;
    value?: string;           // wei as decimal string
  };
}
```

**Behavior:**

1. If `fromToken` is a native token address:
   - Resolve wrapped native address for `chainId` from `WRAPPED_NATIVE` map
   - Add `wrap` step: `{ to: wrappedAddress, data: deposit() selector, value: inAmount }`
   - Set effective `fromToken` to wrapped address for Permit2 check
2. Read Permit2 allowance: `allowance(account, PERMIT2)` on `fromToken` via `eth_call`
3. If allowance < `inAmount`:
   - Add `approve` step: `{ to: fromToken, data: approve(PERMIT2, maxUint256) }`
4. Return array (may be empty if no approvals needed)

**Does NOT:** execute any transactions.

**File:** `src/api/intents.ts`

---

### 3. `prepareTwapIntent`

Prepares unsigned EIP-712 data for a dTWAP order. Thin wrapper around existing `prepareTwapOrder()`.

```typescript
export async function prepareTwapIntent(params: {
  chainId: number;
  srcToken: string;
  dstToken: string;
  srcAmount: string;
  chunks: number;
  fillDelay: number;
  account: string;
}): Promise<TwapIntent>
```

**Returns:**

```typescript
interface TwapIntent {
  /** EIP-712 data ready for wallet signTypedData */
  eip712: {
    domain: Record<string, unknown>;
    types: Record<string, Array<{ name: string; type: string }>>;
    primaryType: string;
    message: Record<string, unknown>;
  };
  /** Raw order — pass back to submitSignedTwapOrder with signature */
  order: RePermitOrder;
  /** Chain the order targets */
  chainId: number;
  /** Computed parameters for UI display */
  meta: {
    chunks: number;
    fillDelaySeconds: number;
    durationSeconds: number;
    srcAmountPerChunk: string;
  };
}
```

**Behavior:**

1. Validate chain via `isTwapSupported()`
2. Compute `durationSeconds = chunks * fillDelay * 2`
3. Call existing `prepareTwapOrder()` — returns `{ domain, types, primaryType, order }`
4. Compute `srcAmountPerChunk` via `getSrcTokenChunkAmount()`
5. Return `TwapIntent` with EIP-712 data and metadata

**File:** `src/api/intents.ts`

---

### 4. `prepareLimitIntent`

Prepares unsigned EIP-712 data for a dLIMIT order. Uses same `prepareTwapOrder()` with `chunks=1, fillDelay=0`.

```typescript
export async function prepareLimitIntent(params: {
  chainId: number;
  srcToken: string;
  dstToken: string;
  srcAmount: string;
  dstMinAmount: string;
  expiry?: number;          // seconds from now, default 86400
  account: string;
}): Promise<LimitIntent>
```

**Returns:**

```typescript
interface LimitIntent {
  /** EIP-712 data ready for wallet signTypedData */
  eip712: {
    domain: Record<string, unknown>;
    types: Record<string, Array<{ name: string; type: string }>>;
    primaryType: string;
    message: Record<string, unknown>;
  };
  /** Raw order — pass back to submitSignedTwapOrder with signature */
  order: RePermitOrder;
  /** Chain the order targets */
  chainId: number;
  /** Display metadata */
  meta: {
    expirySeconds: number;
    dstMinAmount: string;
  };
}
```

**Behavior:**

1. Validate chain via `isTwapSupported()`
2. Call `prepareTwapOrder()` with `chunks=1, fillDelaySeconds=0, durationSeconds=expiry`
3. Return `LimitIntent`

**File:** `src/api/intents.ts`

---

### 5. `prepareBridgeIntent`

Extracts raw transaction data from a LI.FI bridge quote without executing it.

```typescript
export async function prepareBridgeIntent(params: {
  fromChainId: number;
  toChainId: number;
  fromTokenAddress: string;
  toTokenAddress: string;
  fromAmount: string;
  account: string;
}): Promise<BridgeIntent>
```

**Returns:**

```typescript
interface BridgeIntent {
  /** Transaction(s) the consumer must send — usually 1, may include approval */
  steps: BridgeTxStep[];
  /** Quote estimate for UI display */
  estimate: {
    fromToken: string;
    toToken: string;
    fromAmount: string;
    fromAmountUSD?: string;
    toAmount: string;
    toAmountUSD?: string;
    toAmountMin: string;
    gasCostUSD?: string;
    estimatedDurationSeconds?: number;
  };
  /** Source chain */
  fromChainId: number;
  /** Destination chain */
  toChainId: number;
}

interface BridgeTxStep {
  /** Step type */
  type: 'approval' | 'bridge';
  /** Human-readable label */
  label: string;
  /** Raw transaction fields */
  tx: {
    to: `0x${string}`;
    data: `0x${string}`;
    value: string;
    chainId: number;
    gasLimit?: string;
  };
}
```

**Behavior:**

1. Call `getQuote()` from `@lifi/sdk` with `account` as `fromAddress`
2. Call `convertQuoteToRoute()` to get the full route
3. Extract `transactionRequest` from each route step — this contains `{ to, data, value, gasLimit }`
4. If the route includes an approval step, include it as a separate `BridgeTxStep`
5. Return `BridgeIntent` with raw tx data and estimate

**Does NOT:** call `executeRoute()`.

**File:** `src/api/intents.ts`

---

### 6. `simulateTransaction`

Simulates a transaction against the target chain RPC. Returns success/failure, gas estimate, and decoded balance changes (native + ERC-20 token transfers).

```typescript
export async function simulateTransaction(params: {
  chainId: number;
  to: string;
  data: string;
  value?: string;
  from: string;
}): Promise<SimulationResult>
```

**Returns:**

```typescript
interface SimulationResult {
  /** Whether the transaction would succeed */
  success: boolean;
  /** Estimated gas units */
  gasEstimate: string;
  /** Revert reason if failed */
  error?: string;
  /** All token movements affecting `from` address */
  balanceChanges: BalanceChange[];
}

interface BalanceChange {
  /** Token contract address. Native asset = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE */
  token: `0x${string}`;
  /** Resolved symbol (if available via resolveToken, otherwise null) */
  symbol: string | null;
  /** Token decimals (if resolved, otherwise null) */
  decimals: number | null;
  /** Absolute amount as decimal string (in token's smallest unit) */
  amount: string;
  /** Direction relative to `from` address */
  direction: 'in' | 'out';
}
```

**Behavior:**

**Primary path** (`debug_traceCall` available):

1. Call `eth_estimateGas` with tx params — if reverts, return `{ success: false, error: revertReason }`
2. Call `debug_traceCall` with `{ tracer: "callTracer", tracerConfig: { withLog: true } }` to get full call trace with event logs
3. Parse all `Transfer(address,address,uint256)` events (topic0 = `0xddf252ad...`) from the trace logs
4. Filter transfers where `from` param address appears as sender or recipient
5. Detect native value transfers from the call trace (internal calls with value)
6. For each unique token address in the transfers, attempt `resolveToken()` to get symbol and decimals
7. For native asset changes: compute from `value` field + any internal calls returning/sending ETH
8. Return `SimulationResult`

**Fallback path** (`debug_traceCall` not available — 403/method not found):

1. Call `eth_estimateGas` — if reverts, return failure
2. Call `eth_call` to execute the transaction without committing
3. Decode the transaction `data` against known ABI signatures:
   - ERC-20: `transfer(address,uint256)`, `transferFrom(address,address,uint256)`, `approve(address,uint256)`
   - WETH: `deposit()`, `withdraw(uint256)`
   - Permit2: `permitTransferFrom(...)`, `permit(...)`
   - Uniswap-style: `exactInputSingle(...)`, `exactInput(...)`
4. Infer balance changes from decoded calldata (less accurate — does not capture internal transfers)
5. For native: use `value` field
6. Return `SimulationResult` with `balanceChanges` from static analysis

**Implementation notes:**

- Use existing `getTransportForChain()` / `createPublicClient()` infrastructure for RPC calls
- `debug_traceCall` detection: try once per chain, cache whether it's available. If the first call returns a method-not-found error, fall back to static decoding for all subsequent calls on that chain.
- The `Transfer` event signature is constant: `keccak256("Transfer(address,address,uint256)")` = `0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef`
- Token resolution should be best-effort — if `resolveToken()` fails, return the balance change with `symbol: null, decimals: null`. The consumer can resolve later.

**Error cases:**
- `SIMULATION_REVERT` — transaction would revert (include decoded revert reason)
- `SIMULATION_ERROR` — RPC error during simulation (network issue, malformed tx)
- `CHAIN_NOT_SUPPORTED` — chain not in registry

**File:** `src/api/simulation.ts` (new)

---

### 7. `submitSignedSwap`

Submits a signed Liquidity Hub swap. Thin export of existing `submitSwap()`.

```typescript
export async function submitSignedSwap(params: {
  chainId: number;
  quote: Record<string, unknown>;
  signature: string;
}): Promise<SwapSubmissionResult>
```

**Returns:**

```typescript
interface SwapSubmissionResult {
  sessionId: string;
  txHash?: string;
  status: 'submitted' | 'completed' | 'failed';
  error?: string;
}
```

**Behavior:** Calls existing `submitSwap()` from `orbs/liquidity-hub.ts`. If status is `submitted` (not yet filled), the consumer can poll with existing `getSwapStatus()`.

**File:** `src/api/intents.ts`

---

### 8. `submitSignedTwapOrder`

Submits a signed dTWAP or dLIMIT order. Thin export of existing `submitSignedOrder()`.

```typescript
export async function submitSignedTwapOrder(params: {
  order: RePermitOrder;
  signature: {
    v: number;
    r: `0x${string}`;
    s: `0x${string}`;
  };
}): Promise<TwapOrderResult>
```

**Returns:**

```typescript
interface TwapOrderResult {
  orderId: string;
  status: string;
  txHash?: string;
}
```

**Behavior:** Calls existing `submitSignedOrder()` from `orbs/twap.ts`.

**File:** `src/api/intents.ts`

---

## New Types

All new types go in `src/api/types.ts` (additive):

```typescript
// --- Intent types ---

export interface SwapIntent { ... }       // see prepareSwapIntent above
export interface TwapIntent { ... }       // see prepareTwapIntent above
export interface LimitIntent { ... }      // see prepareLimitIntent above
export interface BridgeIntent { ... }     // see prepareBridgeIntent above

export interface ApprovalStep { ... }     // see getRequiredApprovals above
export interface BridgeTxStep { ... }     // see prepareBridgeIntent above

// --- Simulation types ---

export interface SimulationResult { ... } // see simulateTransaction above
export interface BalanceChange { ... }    // see simulateTransaction above

// --- Submission types ---

export interface SwapSubmissionResult { ... }  // see submitSignedSwap above
export interface TwapOrderResult { ... }       // see submitSignedTwapOrder above
```

---

## New Exports

Add to `src/index.ts`:

```typescript
// Intent preparation (browser wallet flow)
export {
  prepareBridgeIntent,
  prepareLimitIntent,
  prepareSwapIntent,
  prepareTwapIntent,
  getRequiredApprovals,
  submitSignedSwap,
  submitSignedTwapOrder,
} from "./api/intents.js";

// Transaction simulation
export { simulateTransaction } from "./api/simulation.js";

// Utility re-exports for advanced consumers
export { normalizeEip712ForSigning } from "./orbs/liquidity-hub.js";

// New types
export type {
  ApprovalStep,
  BalanceChange,
  BridgeIntent,
  BridgeTxStep,
  LimitIntent,
  SimulationResult,
  SwapIntent,
  SwapSubmissionResult,
  TwapIntent,
  TwapOrderResult,
} from "./api/types.js";
```

---

## New Files

| File | Purpose | Estimated Lines |
|---|---|---|
| `src/api/intents.ts` | `prepareSwapIntent`, `prepareTwapIntent`, `prepareLimitIntent`, `prepareBridgeIntent`, `getRequiredApprovals`, `submitSignedSwap`, `submitSignedTwapOrder` | ~180 |
| `src/api/simulation.ts` | `simulateTransaction` with trace-based + fallback balance change decoding | ~200 |

---

## Files Modified (Additive Only)

| File | Change |
|---|---|
| `src/index.ts` | Add new exports (~20 lines) |
| `src/api/types.ts` | Add new interface definitions (~60 lines) |

---

## What Does NOT Change

- All existing tool handlers in `src/tools/`
- `executeWrite()` / confirmation queue
- `getActiveAccount()` / wallet persistence
- CLI entry point and MCP server
- Existing public API functions (`executeSameChainSwap`, `placeTwapOrder`, etc.)
- Test suite (new tests added, existing unchanged)

---

## Consumer Flow (Orbzy)

```
User: "Swap 1 ETH for USDC on Base"

1. Mastra agent calls Orbzy tool → tool calls web3agent.prepareSwapIntent({
     chainId: 8453, fromToken: "0x0...0", toToken: "0x833...USDC",
     inAmount: "1000000000000000000", account: connectedWalletAddress
   })

2. Returns SwapIntent with:
   - requiredApprovals: [{ type: 'wrap', tx: { to: WETH, value: "1000000000000000000" } },
                          { type: 'approve', tx: { to: WETH, data: "0x095ea7b3..." } }]
   - eip712: { domain, types, primaryType, message }
   - quote: { sessionId, outAmount: "3200000000", ... }

3. Orbzy calls web3agent.simulateTransaction({
     chainId: 8453, to: ..., data: ..., from: walletAddress
   })
   → Returns: { success: true, gasEstimate: "145000",
                 balanceChanges: [
                   { token: "0x0...0", symbol: "ETH", amount: "1000000000000000000", direction: "out" },
                   { token: "0x833...USDC", symbol: "USDC", amount: "3200000000", direction: "in" }
                 ]}

4. TxCard renders: "Send 1 ETH → Receive ~3,200 USDC" + simulation badge ✓

5. User clicks Approve → wagmi sends wrap tx → approval tx → signTypedData for EIP-712

6. Orbzy calls web3agent.submitSignedSwap({ chainId, quote, signature })
   → Returns: { txHash: "0xabc...", status: "completed" }

7. Agent receives tx result, provides summary in chat
```

---

## Test Plan

| Test | Type |
|---|---|
| `prepareSwapIntent` returns valid EIP-712 for each supported chain | Unit (mock Orbs API) |
| `getRequiredApprovals` detects wrap + Permit2 needs correctly | Unit (mock RPC) |
| `prepareTwapIntent` produces signable typed data | Unit |
| `prepareLimitIntent` with custom expiry | Unit |
| `prepareBridgeIntent` extracts tx data from LI.FI route | Unit (mock LI.FI) |
| `simulateTransaction` primary path with trace logs | Unit (mock `debug_traceCall`) |
| `simulateTransaction` fallback path with ABI decoding | Unit (mock `eth_call` only) |
| `simulateTransaction` handles revert with reason | Unit |
| `submitSignedSwap` forwards to Orbs API correctly | Unit (mock API) |
| `submitSignedTwapOrder` with split signature | Unit (mock API) |
| End-to-end: prepare → simulate → submit on testnet | Integration (Base Sepolia) |
