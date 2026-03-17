# Spot Integration Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `@orbs-network/twap-sdk` and `@orbs-network/twap-ui` with a direct Spot API integration, unifying all order types (market, limit, TWAP, stop-loss, take-profit, delayed) into a single tool surface.

**Architecture:** Pure TypeScript port of the Spot `order.sh` prepare logic (~100 lines), building EIP-712 typed data from an embedded skeleton template and chain config. HTTP client for submit (POST) and query (GET) to `agents-sink-dev.orbs.network`. Cancel via onchain `RePermit.cancel([digest])`. Approval flow extended to check RePermit allowance for orders alongside Permit2 for LH swaps. Old TWAP SDK kept temporarily as query fallback only.

**Tech Stack:** TypeScript, Zod, viem (signTypedData, writeContract, readContract), existing shared schemas and handler patterns.

---

## File Structure

### New files

| File | Responsibility |
|------|---------------|
| `src/orbs/spot-config.ts` | Embedded Spot contract addresses, chain adapters, skeleton template, API URL constants |
| `src/orbs/spot-prepare.ts` | Pure `prepareSpotOrder()` function: param validation, defaults, chunk math, EIP-712 typed data construction, approval calldata generation. Uses `fromToken`/`toToken`/`fromAmount`/`fromMaxAmount` convention |
| `src/orbs/spot-client.ts` | HTTP client: `submitOrder()` (POST), `queryOrders()` (GET), response types |
| `tests/orbs/spot-config.test.ts` | Tests for config lookup, chain support checks |
| `tests/orbs/spot-prepare.test.ts` | Tests for prepare logic: defaults, chunking, validation, typed data output |
| `tests/orbs/spot-client.test.ts` | Tests for submit/query HTTP calls (mocked fetch) |
| `tests/tools/orbs/spot-tools.test.ts` | Tests for new tool handlers (mocked dependencies) |

### Modified files

| File | Changes |
|------|---------|
| `src/orbs/chains.ts` | Add `isSpotSupported()`, `getSpotError()`, `SPOT_CHAINS` from config. Remove `isTwapSupported()` import of `Configs` from twap-sdk |
| `src/api/schemas/orbs.ts` | Add unified `orbsPlaceOrderSchema`, `orbsPrepareOrderIntentSchema`, `orbsSubmitSignedOrderSchema`, `orbsQueryOrdersSchema`, `orbsCancelOrderSchema`. Keep old schemas temporarily for compatibility |
| `src/api/schemas/outputs.ts` | Add `spotOrderIntentSchema`, `spotQueryResultSchema`. Replace `twapIntentSchema`/`limitIntentSchema` references |
| `src/api/types.ts` | Add new types derived from new schemas. Keep old types as aliases during transition |
| `src/tools/orbs/index.ts` | Replace 5 old order tools with 5 new ones. Wire new handlers and executors |
| `src/tools/orbs/schemas.ts` | Re-export new schemas |
| `src/api/intents.ts` | Add `prepareOrderIntent()`, `submitSignedOrderViaSpot()`. Keep old functions for compatibility |
| `src/api/operations/orbs.ts` | Add `prepareOrderOperation()`, `resumeSpotOrderOperation()`. Update `getRequiredApprovals()` to support RePermit spender |
| `src/api/operations.ts` | Wire new `kind: "order"` dispatch in `prepareOperation()` and `resumeOperation()` |
| `src/orbs/dsltp.ts` | Remove entirely (stop-loss/take-profit are now params on unified order) |
| `package.json` | Remove `@orbs-network/twap-sdk`, `@orbs-network/twap-ui` |

### Files kept for fallback (modified minimally)

| File | Changes |
|------|---------|
| `src/orbs/twap.ts` | Keep `listOrders()` and `getChainConfig()` for query fallback. Remove `prepareTwapOrder()`, `submitSignedOrder()`, `getTwapDurationSeconds()` |

---

## Chunk 1: Spot Core Library

Foundation: config, prepare logic, HTTP client. No tool changes yet.

### Task 1: Spot Config

**Files:**
- Create: `src/orbs/spot-config.ts`
- Create: `tests/orbs/spot-config.test.ts`

- [ ] **Step 1: Write failing tests for config**

```typescript
// tests/orbs/spot-config.test.ts
import { describe, expect, it } from "vitest";
import {
  getSpotAdapter,
  getSpotApiUrl,
  getSpotContracts,
  getSupportedSpotChainIds,
  isSpotChainSupported,
  SPOT_SKELETON,
} from "../../src/orbs/spot-config.js";

describe("spot-config", () => {
  describe("getSpotContracts", () => {
    it("returns universal contract addresses", () => {
      const contracts = getSpotContracts();
      expect(contracts.repermit).toBe("0x00002a9C4D9497df5Bd31768eC5d30eEf5405000");
      expect(contracts.reactor).toBe("0x000000b33fE4fB9d999Dd684F79b110731c3d000");
      expect(contracts.executor).toBe("0x000642A0966d9bd49870D9519f76b5cf823f3000");
      expect(contracts.zero).toBe("0x0000000000000000000000000000000000000000");
    });
  });

  describe("isSpotChainSupported", () => {
    it("returns true for supported chains", () => {
      expect(isSpotChainSupported(42161)).toBe(true); // Arbitrum
      expect(isSpotChainSupported(137)).toBe(true); // Polygon
      expect(isSpotChainSupported(1)).toBe(true); // Ethereum
    });

    it("returns false for unsupported chains", () => {
      expect(isSpotChainSupported(999999)).toBe(false);
    });
  });

  describe("getSpotAdapter", () => {
    it("returns adapter address for supported chain", () => {
      const adapter = getSpotAdapter(42161);
      expect(adapter).toBe("0x026B8977319F67078e932a08feAcB59182B5380f");
    });

    it("throws for unsupported chain", () => {
      expect(() => getSpotAdapter(999999)).toThrow("unsupported");
    });
  });

  describe("getSupportedSpotChainIds", () => {
    it("returns all supported chain IDs sorted", () => {
      const ids = getSupportedSpotChainIds();
      expect(ids).toContain(42161);
      expect(ids).toContain(137);
      expect(ids).toContain(1);
      expect(ids.length).toBeGreaterThanOrEqual(8);
      // Verify sorted
      for (let i = 1; i < ids.length; i++) {
        expect(ids[i]).toBeGreaterThan(ids[i - 1]);
      }
    });
  });

  describe("getSpotApiUrl", () => {
    it("returns the sink API base URL", () => {
      const url = getSpotApiUrl();
      expect(url).toMatch(/^https:\/\//);
      expect(url).toContain("agents-sink");
    });
  });

  describe("SPOT_SKELETON", () => {
    it("has correct EIP-712 structure", () => {
      expect(SPOT_SKELETON.primaryType).toBe("RePermitWitnessTransferFrom");
      expect(SPOT_SKELETON.types).toHaveProperty("RePermitWitnessTransferFrom");
      expect(SPOT_SKELETON.types).toHaveProperty("Order");
      expect(SPOT_SKELETON.types).toHaveProperty("Input");
      expect(SPOT_SKELETON.types).toHaveProperty("Output");
      expect(SPOT_SKELETON.types).toHaveProperty("Exchange");
      expect(SPOT_SKELETON.types).toHaveProperty("TokenPermissions");
    });

    it("Order type has all required fields", () => {
      const orderFields = SPOT_SKELETON.types.Order.map((f: { name: string }) => f.name);
      expect(orderFields).toContain("reactor");
      expect(orderFields).toContain("executor");
      expect(orderFields).toContain("exchange");
      expect(orderFields).toContain("swapper");
      expect(orderFields).toContain("epoch");
      expect(orderFields).toContain("slippage");
      expect(orderFields).toContain("input");
      expect(orderFields).toContain("output");
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- --run tests/orbs/spot-config.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement spot-config**

```typescript
// src/orbs/spot-config.ts
// Spot API configuration — contract addresses, chain adapters, EIP-712 skeleton.
// Source of truth: https://github.com/orbs-network/spot/blob/master/skills/advanced-swap-orders/scripts/skill.config.json

const SPOT_API_URL = "https://agents-sink-dev.orbs.network";

const SPOT_CONTRACTS = {
  zero: "0x0000000000000000000000000000000000000000" as const,
  repermit: "0x00002a9C4D9497df5Bd31768eC5d30eEf5405000" as const,
  reactor: "0x000000b33fE4fB9d999Dd684F79b110731c3d000" as const,
  executor: "0x000642A0966d9bd49870D9519f76b5cf823f3000" as const,
};

const SPOT_CHAIN_ADAPTERS: Record<number, { name: string; adapter: `0x${string}` }> = {
  1: { name: "Ethereum", adapter: "0xC1bB4d5071Fe7109ae2D67AE05826A3fe9116cfc" },
  56: { name: "BNB Chain", adapter: "0x67Feba015c968c76cCB2EEabf197b4578640BE2C" },
  137: { name: "Polygon", adapter: "0x75A3d70Fa6d054d31C896b9Cf8AB06b1c1B829B8" },
  146: { name: "Sonic", adapter: "0x58fD209C81D84739BaD9c72C082350d67E713EEa" },
  8453: { name: "Base", adapter: "0x5906C4dD71D5afFe1a8f0215409E912eB5d593AD" },
  42161: { name: "Arbitrum One", adapter: "0x026B8977319F67078e932a08feAcB59182B5380f" },
  43114: { name: "Avalanche", adapter: "0x4F48041842827823D3750399eCa2832fC2E29201" },
  59144: { name: "Linea", adapter: "0x55E4da2cd634729064bEb294EC682Dc94f5c3f24" },
};

// EIP-712 type definitions for RePermit orders.
// Source: https://github.com/orbs-network/spot/blob/master/skills/advanced-swap-orders/assets/repermit.skeleton.json
const SPOT_EIP712_TYPES = {
  RePermitWitnessTransferFrom: [
    { name: "permitted", type: "TokenPermissions" },
    { name: "spender", type: "address" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
    { name: "witness", type: "Order" },
  ],
  Exchange: [
    { name: "adapter", type: "address" },
    { name: "ref", type: "address" },
    { name: "share", type: "uint32" },
    { name: "data", type: "bytes" },
  ],
  Input: [
    { name: "token", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "maxAmount", type: "uint256" },
  ],
  Order: [
    { name: "reactor", type: "address" },
    { name: "executor", type: "address" },
    { name: "exchange", type: "Exchange" },
    { name: "swapper", type: "address" },
    { name: "nonce", type: "uint256" },
    { name: "start", type: "uint256" },
    { name: "deadline", type: "uint256" },
    { name: "chainid", type: "uint256" },
    { name: "exclusivity", type: "uint32" },
    { name: "epoch", type: "uint32" },
    { name: "slippage", type: "uint32" },
    { name: "freshness", type: "uint32" },
    { name: "input", type: "Input" },
    { name: "output", type: "Output" },
  ],
  Output: [
    { name: "token", type: "address" },
    { name: "limit", type: "uint256" },
    { name: "triggerLower", type: "uint256" },
    { name: "triggerUpper", type: "uint256" },
    { name: "recipient", type: "address" },
  ],
  TokenPermissions: [
    { name: "token", type: "address" },
    { name: "amount", type: "uint256" },
  ],
} as const;

export interface SpotSkeleton {
  primaryType: "RePermitWitnessTransferFrom";
  types: typeof SPOT_EIP712_TYPES;
}

export const SPOT_SKELETON: SpotSkeleton = {
  primaryType: "RePermitWitnessTransferFrom",
  types: SPOT_EIP712_TYPES,
};

export function getSpotContracts(): typeof SPOT_CONTRACTS {
  return SPOT_CONTRACTS;
}

export function isSpotChainSupported(chainId: number): boolean {
  return chainId in SPOT_CHAIN_ADAPTERS;
}

export function getSpotAdapter(chainId: number): `0x${string}` {
  const entry = SPOT_CHAIN_ADAPTERS[chainId];
  if (!entry) {
    const supported = getSupportedSpotChainIds().join(", ");
    throw new Error(`Unsupported Spot chainId: ${chainId} (supported: ${supported})`);
  }
  return entry.adapter;
}

export function getSupportedSpotChainIds(): number[] {
  return Object.keys(SPOT_CHAIN_ADAPTERS)
    .map(Number)
    .sort((a, b) => a - b);
}

export function getSpotApiUrl(): string {
  return SPOT_API_URL;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- --run tests/orbs/spot-config.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add src/orbs/spot-config.ts tests/orbs/spot-config.test.ts
git commit -m "feat(spot): add Spot config with contract addresses, chain adapters, and EIP-712 skeleton"
```

---

### Task 2: Spot Prepare Logic

**Files:**
- Create: `src/orbs/spot-prepare.ts`
- Create: `tests/orbs/spot-prepare.test.ts`

- [ ] **Step 1: Write failing tests for prepare**

```typescript
// tests/orbs/spot-prepare.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SpotOrderParams, SpotPreparedOrder } from "../../src/orbs/spot-prepare.js";

describe("spot-prepare", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-01T00:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("prepareSpotOrder", () => {
    const baseParams: SpotOrderParams = {
      chainId: 42161,
      swapper: "0x1111111111111111111111111111111111111111",
      fromToken: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
      fromAmount: "1000000",
      toToken: "0x82af49447d8a07e3bd95bd0d56f35241523fbab1",
    };

    it("builds a minimal market order with defaults", async () => {
      const { prepareSpotOrder } = await import("../../src/orbs/spot-prepare.js");
      const result = prepareSpotOrder(baseParams);

      // Check typed data structure
      expect(result.typedData.primaryType).toBe("RePermitWitnessTransferFrom");
      expect(result.typedData.domain.chainId).toBe(42161);
      expect(result.typedData.domain.name).toBe("RePermit");
      expect(result.typedData.domain.version).toBe("1");

      // Check message fields
      const msg = result.typedData.message;
      expect(msg.permitted.token).toBe(baseParams.fromToken);
      expect(msg.permitted.amount).toBe("1000000");
      expect(msg.spender).toBe("0x000000b33fE4fB9d999Dd684F79b110731c3d000"); // reactor

      // Check witness (order) fields
      const witness = msg.witness;
      expect(witness.swapper).toBe(baseParams.swapper);
      expect(witness.input.token).toBe(baseParams.fromToken);
      expect(witness.input.amount).toBe("1000000");
      expect(witness.input.maxAmount).toBe("1000000"); // defaults to amount
      expect(witness.output.token).toBe(baseParams.toToken);
      expect(witness.output.limit).toBe("0"); // market order default
      expect(witness.output.triggerLower).toBe("0");
      expect(witness.output.triggerUpper).toBe("0");
      expect(witness.output.recipient).toBe(baseParams.swapper); // defaults to swapper
      expect(witness.epoch).toBe(0); // single order
      expect(witness.slippage).toBe(500); // default
      expect(witness.freshness).toBe(30);
      expect(witness.exclusivity).toBe(0);

      // Check meta
      expect(result.meta.kind).toBe("single");
      expect(result.meta.chunkCount).toBe(1);
    });

    it("applies defaults: nonce=now, start=now, deadline=start+300", async () => {
      const { prepareSpotOrder } = await import("../../src/orbs/spot-prepare.js");
      const nowSec = Math.floor(Date.now() / 1000);
      const result = prepareSpotOrder(baseParams);
      const witness = result.typedData.message.witness;

      expect(Number(witness.nonce)).toBe(nowSec);
      expect(Number(witness.start)).toBe(nowSec);
      expect(Number(witness.deadline)).toBe(nowSec + 300); // single order, no epoch
    });

    it("builds a chunked order with epoch > 0", async () => {
      const { prepareSpotOrder } = await import("../../src/orbs/spot-prepare.js");
      const result = prepareSpotOrder({
        ...baseParams,
        fromAmount: "200000",
        fromMaxAmount: "1000000",
        epoch: 3600,
      });

      const witness = result.typedData.message.witness;
      expect(witness.input.amount).toBe("200000");
      expect(witness.input.maxAmount).toBe("1000000");
      expect(witness.epoch).toBe(3600);
      expect(result.meta.kind).toBe("chunked");
      expect(result.meta.chunkCount).toBe(5);

      // deadline = start + 300 + 5 * 3600
      const nowSec = Math.floor(Date.now() / 1000);
      expect(Number(witness.deadline)).toBe(nowSec + 300 + 5 * 3600);
    });

    it("defaults epoch to 60 for chunked orders when not specified", async () => {
      const { prepareSpotOrder } = await import("../../src/orbs/spot-prepare.js");
      const result = prepareSpotOrder({
        ...baseParams,
        fromAmount: "200000",
        fromMaxAmount: "1000000",
      });
      expect(result.typedData.message.witness.epoch).toBe(60);
    });

    it("rounds down maxAmount when not divisible by amount", async () => {
      const { prepareSpotOrder } = await import("../../src/orbs/spot-prepare.js");
      const result = prepareSpotOrder({
        ...baseParams,
        fromAmount: "300000",
        fromMaxAmount: "1000000", // 1000000 / 300000 = 3 chunks, remainder 100000
        epoch: 60,
      });

      expect(result.typedData.message.witness.input.maxAmount).toBe("900000");
      expect(result.meta.chunkCount).toBe(3);
      expect(result.warnings).toContain(
        expect.stringContaining("rounding down")
      );
    });

    it("builds a limit order with output.limit > 0", async () => {
      const { prepareSpotOrder } = await import("../../src/orbs/spot-prepare.js");
      const result = prepareSpotOrder({
        ...baseParams,
        outputLimit: "500000000000000", // limit price per chunk
      });
      expect(result.typedData.message.witness.output.limit).toBe("500000000000000");
    });

    it("builds a stop-loss order with triggerLower", async () => {
      const { prepareSpotOrder } = await import("../../src/orbs/spot-prepare.js");
      const result = prepareSpotOrder({
        ...baseParams,
        outputTriggerLower: "400000000000000",
      });
      expect(result.typedData.message.witness.output.triggerLower).toBe("400000000000000");
    });

    it("includes approval calldata for RePermit", async () => {
      const { prepareSpotOrder } = await import("../../src/orbs/spot-prepare.js");
      const result = prepareSpotOrder(baseParams);

      expect(result.approval.token).toBe(baseParams.fromToken);
      expect(result.approval.spender).toBe("0x00002a9C4D9497df5Bd31768eC5d30eEf5405000"); // repermit
      expect(result.approval.amount).toBe("1000000");
      // ERC-20 approve(address,uint256) selector = 0x095ea7b3
      expect(result.approval.tx.data).toMatch(/^0x095ea7b3/);
    });

    it("includes submit URL and body template", async () => {
      const { prepareSpotOrder } = await import("../../src/orbs/spot-prepare.js");
      const result = prepareSpotOrder(baseParams);

      expect(result.submit.url).toContain("/orders/new");
      expect(result.submit.body.status).toBe("pending");
      expect(result.submit.body.order).toBeDefined();
      expect(result.submit.body.signature).toBeNull();
    });

    // --- Validation ---

    it("throws when chainId is unsupported", async () => {
      const { prepareSpotOrder } = await import("../../src/orbs/spot-prepare.js");
      expect(() => prepareSpotOrder({ ...baseParams, chainId: 999999 })).toThrow("unsupported");
    });

    it("throws when fromAmount is 0", async () => {
      const { prepareSpotOrder } = await import("../../src/orbs/spot-prepare.js");
      expect(() => prepareSpotOrder({ ...baseParams, fromAmount: "0" })).toThrow("non-zero");
    });

    it("throws when fromAmount > fromMaxAmount", async () => {
      const { prepareSpotOrder } = await import("../../src/orbs/spot-prepare.js");
      expect(() =>
        prepareSpotOrder({ ...baseParams, fromAmount: "2000000", fromMaxAmount: "1000000" })
      ).toThrow("exceed");
    });

    it("throws when input and output token are the same", async () => {
      const { prepareSpotOrder } = await import("../../src/orbs/spot-prepare.js");
      expect(() =>
        prepareSpotOrder({ ...baseParams, toToken: baseParams.fromToken })
      ).toThrow("differ");
    });

    it("throws when chunked order has epoch = 0", async () => {
      const { prepareSpotOrder } = await import("../../src/orbs/spot-prepare.js");
      expect(() =>
        prepareSpotOrder({
          ...baseParams,
          fromAmount: "200000",
          fromMaxAmount: "1000000",
          epoch: 0,
        })
      ).toThrow("epoch");
    });

    it("throws when slippage exceeds max (5000)", async () => {
      const { prepareSpotOrder } = await import("../../src/orbs/spot-prepare.js");
      expect(() => prepareSpotOrder({ ...baseParams, slippage: 6000 })).toThrow("slippage");
    });

    it("throws when triggerLower > triggerUpper", async () => {
      const { prepareSpotOrder } = await import("../../src/orbs/spot-prepare.js");
      expect(() =>
        prepareSpotOrder({
          ...baseParams,
          outputTriggerLower: "500",
          outputTriggerUpper: "400",
        })
      ).toThrow("triggerLower");
    });

    it("warns when slippage is below default 500", async () => {
      const { prepareSpotOrder } = await import("../../src/orbs/spot-prepare.js");
      const result = prepareSpotOrder({ ...baseParams, slippage: 100 });
      expect(result.warnings.some((w) => w.includes("slippage"))).toBe(true);
    });

    it("throws when fromToken is native zero address", async () => {
      const { prepareSpotOrder } = await import("../../src/orbs/spot-prepare.js");
      expect(() =>
        prepareSpotOrder({
          ...baseParams,
          fromToken: "0x0000000000000000000000000000000000000000",
        })
      ).toThrow("native input");
    });

    it("throws when freshness >= epoch", async () => {
      const { prepareSpotOrder } = await import("../../src/orbs/spot-prepare.js");
      expect(() =>
        prepareSpotOrder({
          ...baseParams,
          fromAmount: "200000",
          fromMaxAmount: "1000000",
          epoch: 25, // freshness=30 >= epoch=25
        })
      ).toThrow("freshness");
    });

    it("warns when recipient differs from swapper", async () => {
      const { prepareSpotOrder } = await import("../../src/orbs/spot-prepare.js");
      const result = prepareSpotOrder({
        ...baseParams,
        outputRecipient: "0x2222222222222222222222222222222222222222",
      });
      expect(result.warnings.some((w) => w.includes("recipient"))).toBe(true);
    });

    it("respects explicit deadline", async () => {
      const { prepareSpotOrder } = await import("../../src/orbs/spot-prepare.js");
      const result = prepareSpotOrder({ ...baseParams, deadline: 1735700000 });
      expect(Number(result.typedData.message.witness.deadline)).toBe(1735700000);
    });

    it("respects explicit nonce", async () => {
      const { prepareSpotOrder } = await import("../../src/orbs/spot-prepare.js");
      const result = prepareSpotOrder({ ...baseParams, nonce: 42 });
      expect(Number(result.typedData.message.witness.nonce)).toBe(42);
    });

    it("respects future start time", async () => {
      const { prepareSpotOrder } = await import("../../src/orbs/spot-prepare.js");
      const futureStart = Math.floor(Date.now() / 1000) + 3600;
      const result = prepareSpotOrder({ ...baseParams, start: futureStart });
      expect(Number(result.typedData.message.witness.start)).toBe(futureStart);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- --run tests/orbs/spot-prepare.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement spot-prepare**

```typescript
// src/orbs/spot-prepare.ts
// Pure prepare logic for Spot orders. No network calls.
// Port of: https://github.com/orbs-network/spot/blob/master/skills/advanced-swap-orders/scripts/order.sh

import { encodeFunctionData } from "viem";
import {
  SPOT_SKELETON,
  getSpotAdapter,
  getSpotApiUrl,
  getSpotContracts,
  isSpotChainSupported,
} from "./spot-config.js";

const MAX_SLIPPAGE = 5000;
const DEF_SLIPPAGE = 500;
const EXCLUSIVITY = 0;
const FRESHNESS = 30;
const TTL = 300;

// Minimal ABI for ERC-20 approve
const APPROVE_ABI = [
  {
    type: "function",
    name: "approve",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
    stateMutability: "nonpayable",
  },
] as const;

// Uses from/to convention per CLAUDE.md. Maps to Spot wire format inside prepareSpotOrder.
export interface SpotOrderParams {
  chainId: number;
  swapper: string;
  fromToken: string;
  fromAmount: string;
  toToken: string;
  fromMaxAmount?: string;
  nonce?: number;
  start?: number;
  deadline?: number;
  epoch?: number;
  slippage?: number;
  outputLimit?: string;
  outputTriggerLower?: string;
  outputTriggerUpper?: string;
  outputRecipient?: string;
}

export interface SpotTypedDataMessage {
  permitted: { token: string; amount: string };
  spender: string;
  nonce: string;
  deadline: string;
  witness: {
    reactor: string;
    executor: string;
    exchange: { adapter: string; ref: string; share: number; data: string };
    swapper: string;
    nonce: string;
    start: string;
    deadline: string;
    chainid: number;
    exclusivity: number;
    epoch: number;
    slippage: number;
    freshness: number;
    input: { token: string; amount: string; maxAmount: string };
    output: {
      token: string;
      limit: string;
      triggerLower: string;
      triggerUpper: string;
      recipient: string;
    };
  };
}

export interface SpotTypedData {
  domain: {
    name: string;
    version: string;
    chainId: number;
    verifyingContract: string;
  };
  primaryType: "RePermitWitnessTransferFrom";
  types: typeof SPOT_SKELETON.types;
  message: SpotTypedDataMessage;
}

export interface SpotPreparedOrder {
  meta: {
    kind: "single" | "chunked";
    chunkCount: number;
    chunkInputAmount: string;
    start: number;
    deadline: number;
    epoch: number;
    limit: string;
  };
  warnings: string[];
  approval: {
    token: string;
    spender: string;
    amount: string;
    tx: { to: string; data: `0x${string}`; value: string };
  };
  typedData: SpotTypedData;
  submit: {
    url: string;
    body: {
      order: SpotTypedDataMessage["witness"];
      signature: null;
      status: "pending";
    };
  };
  query: { url: string };
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

export function prepareSpotOrder(params: SpotOrderParams): SpotPreparedOrder {
  const warnings: string[] = [];
  const contracts = getSpotContracts();

  // --- Validate chain ---
  if (!isSpotChainSupported(params.chainId)) {
    throw new Error(`Unsupported Spot chainId: ${params.chainId}`);
  }
  const adapter = getSpotAdapter(params.chainId);

  // --- Parse & default params ---
  const now = nowSeconds();
  const nonce = params.nonce ?? now;
  const start = params.start ?? now;
  const slippage = params.slippage ?? DEF_SLIPPAGE;
  const fromAmount = params.fromAmount;
  let fromMaxAmount = params.fromMaxAmount ?? fromAmount;
  const outputLimit = params.outputLimit ?? "0";
  const triggerLower = params.outputTriggerLower ?? "0";
  const triggerUpper = params.outputTriggerUpper ?? "0";
  const recipient = params.outputRecipient ?? params.swapper;

  // --- Validate ---
  if (params.fromToken.toLowerCase() === contracts.zero.toLowerCase()) {
    throw new Error("native input token not supported; wrap to WNATIVE first");
  }
  if (fromAmount === "0" || BigInt(fromAmount) === 0n) throw new Error("input.amount must be non-zero");
  if (BigInt(fromAmount) > BigInt(fromMaxAmount)) throw new Error("input.amount cannot exceed input.maxAmount");
  if (params.fromToken.toLowerCase() === params.toToken.toLowerCase()) {
    throw new Error("input.token and output.token must differ");
  }
  if (BigInt(triggerUpper) > 0n && BigInt(triggerLower) > BigInt(triggerUpper)) {
    throw new Error("output.triggerLower cannot exceed output.triggerUpper");
  }
  if (slippage > MAX_SLIPPAGE) throw new Error(`slippage cannot exceed ${MAX_SLIPPAGE}`);

  // --- Chunk math ---
  const amountBig = BigInt(fromAmount);
  const maxBig = BigInt(fromMaxAmount);
  const remainder = maxBig % amountBig;
  if (remainder !== 0n) {
    fromMaxAmount = (maxBig - remainder).toString();
    warnings.push(
      `input.maxAmount is not divisible by input.amount; rounding down from ${params.fromMaxAmount} to ${fromMaxAmount}`
    );
  }
  const chunkCount = Number(BigInt(fromMaxAmount) / amountBig);
  const isSingle = fromAmount === fromMaxAmount;

  // --- Epoch ---
  let epoch: number;
  if (params.epoch !== undefined) {
    epoch = params.epoch;
  } else {
    epoch = isSingle ? 0 : 60;
  }

  if (!isSingle && epoch === 0) {
    throw new Error("chunked orders require epoch > 0");
  }
  if (epoch !== 0 && FRESHNESS >= epoch) {
    throw new Error("freshness must be < epoch when epoch != 0");
  }

  // --- Deadline ---
  let deadline: number;
  if (params.deadline !== undefined) {
    deadline = params.deadline;
  } else {
    deadline = start + TTL;
    if (epoch > 0) {
      deadline += chunkCount * epoch;
    }
  }

  // --- Warnings ---
  if (slippage < DEF_SLIPPAGE) {
    warnings.push("slippage below 5% can reduce fill probability");
  }
  if (recipient.toLowerCase() !== params.swapper.toLowerCase()) {
    warnings.push("recipient differs from swapper and is dangerous to change");
  }

  // --- Build typed data ---
  const witness = {
    reactor: contracts.reactor,
    executor: contracts.executor,
    exchange: {
      adapter,
      ref: contracts.zero,
      share: 0,
      data: "0x",
    },
    swapper: params.swapper,
    nonce: String(nonce),
    start: String(start),
    deadline: String(deadline),
    chainid: params.chainId,
    exclusivity: EXCLUSIVITY,
    epoch,
    slippage,
    freshness: FRESHNESS,
    input: {
      token: params.fromToken,
      amount: fromAmount,
      maxAmount: fromMaxAmount,
    },
    output: {
      token: params.toToken,
      limit: outputLimit,
      triggerLower,
      triggerUpper,
      recipient,
    },
  };

  const typedData: SpotTypedData = {
    domain: {
      name: "RePermit",
      version: "1",
      chainId: params.chainId,
      verifyingContract: contracts.repermit,
    },
    primaryType: SPOT_SKELETON.primaryType,
    types: SPOT_SKELETON.types,
    message: {
      permitted: {
        token: params.fromToken,
        amount: fromMaxAmount,
      },
      spender: contracts.reactor,
      nonce: String(nonce),
      deadline: String(deadline),
      witness,
    },
  };

  // --- Approval calldata ---
  const approvalData = encodeFunctionData({
    abi: APPROVE_ABI,
    functionName: "approve",
    args: [contracts.repermit, BigInt(fromMaxAmount)],
  });

  const apiUrl = getSpotApiUrl();

  return {
    meta: {
      kind: isSingle ? "single" : "chunked",
      chunkCount,
      chunkInputAmount: fromAmount,
      start,
      deadline,
      epoch,
      limit: outputLimit,
    },
    warnings,
    approval: {
      token: params.fromToken,
      spender: contracts.repermit,
      amount: fromMaxAmount,
      tx: { to: params.fromToken, data: approvalData, value: "0x0" },
    },
    typedData,
    submit: {
      url: `${apiUrl}/orders/new`,
      body: {
        order: witness,
        signature: null,
        status: "pending",
      },
    },
    query: { url: `${apiUrl}/orders` },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- --run tests/orbs/spot-prepare.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add src/orbs/spot-prepare.ts tests/orbs/spot-prepare.test.ts
git commit -m "feat(spot): add pure prepare logic for Spot orders with param validation and EIP-712 typed data"
```

---

### Task 3: Spot HTTP Client

**Files:**
- Create: `src/orbs/spot-client.ts`
- Create: `tests/orbs/spot-client.test.ts`

- [ ] **Step 1: Write failing tests for client**

```typescript
// tests/orbs/spot-client.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("spot-client", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("submitSpotOrder", () => {
    it("POSTs order with signature to /orders/new", async () => {
      const { submitSpotOrder } = await import("../../src/orbs/spot-client.js");
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ hash: "0xabc", status: "pending" }),
      });

      const result = await submitSpotOrder({
        url: "https://agents-sink-dev.orbs.network/orders/new",
        order: { swapper: "0x1111", input: { token: "0xA", amount: "1000", maxAmount: "1000" } },
        signature: { r: "0x" + "aa".repeat(32), s: "0x" + "bb".repeat(32), v: "0x1b" },
      });

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toBe("https://agents-sink-dev.orbs.network/orders/new");
      expect(opts.method).toBe("POST");
      expect(opts.headers["content-type"]).toBe("application/json");
      const body = JSON.parse(opts.body);
      expect(body.status).toBe("pending");
      expect(body.signature.r).toBe("0x" + "aa".repeat(32));
      expect(result.ok).toBe(true);
    });

    it("returns error on non-2xx response", async () => {
      const { submitSpotOrder } = await import("../../src/orbs/spot-client.js");
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => "bad request",
      });

      const result = await submitSpotOrder({
        url: "https://agents-sink-dev.orbs.network/orders/new",
        order: {},
        signature: { r: "0x" + "aa".repeat(32), s: "0x" + "bb".repeat(32), v: "0x1b" },
      });

      expect(result.ok).toBe(false);
      expect(result.status).toBe(400);
    });
  });

  describe("querySpotOrders", () => {
    it("GETs orders by swapper", async () => {
      const { querySpotOrders } = await import("../../src/orbs/spot-client.js");
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => [{ hash: "0xabc", status: "filled" }],
      });

      const result = await querySpotOrders({ swapper: "0x1111" });

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain("/orders?swapper=0x1111");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.orders).toHaveLength(1);
      }
    });

    it("GETs orders by hash", async () => {
      const { querySpotOrders } = await import("../../src/orbs/spot-client.js");
      const hash = "0x" + "ab".repeat(32);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => [{ hash, status: "pending" }],
      });

      const result = await querySpotOrders({ hash });

      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain(`hash=${encodeURIComponent(hash)}`);
      expect(result.ok).toBe(true);
    });

    it("returns error on non-2xx", async () => {
      const { querySpotOrders } = await import("../../src/orbs/spot-client.js");
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => "internal error",
      });

      const result = await querySpotOrders({ swapper: "0x1111" });
      expect(result.ok).toBe(false);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- --run tests/orbs/spot-client.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement spot-client**

```typescript
// src/orbs/spot-client.ts
// HTTP client for Spot order submit and query.

import { getSpotApiUrl } from "./spot-config.js";

export interface SpotSubmitParams {
  url: string;
  order: Record<string, unknown>;
  signature: { r: string; s: string; v: string };
}

export interface SpotSubmitResult {
  ok: boolean;
  status: number;
  response: unknown;
}

export interface SpotQueryParams {
  swapper?: string;
  hash?: string;
}

export type SpotQueryResult =
  | { ok: true; status: number; orders: unknown[] }
  | { ok: false; status: number; error: string };

export async function submitSpotOrder(params: SpotSubmitParams): Promise<SpotSubmitResult> {
  const body = JSON.stringify({
    order: params.order,
    signature: params.signature,
    status: "pending",
  });

  const response = await fetch(params.url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });

  if (!response.ok) {
    const text = await response.text();
    return { ok: false, status: response.status, response: text };
  }

  const json = await response.json();
  return { ok: true, status: response.status, response: json };
}

export async function querySpotOrders(params: SpotQueryParams): Promise<SpotQueryResult> {
  const baseUrl = getSpotApiUrl();
  const searchParams = new URLSearchParams();
  if (params.swapper) searchParams.set("swapper", params.swapper);
  if (params.hash) searchParams.set("hash", params.hash);

  const url = `${baseUrl}/orders?${searchParams.toString()}`;
  const response = await fetch(url);

  if (!response.ok) {
    const text = await response.text();
    return { ok: false, status: response.status, error: text };
  }

  const json = await response.json();
  const orders = Array.isArray(json) ? json : [];
  return { ok: true, status: response.status, orders };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- --run tests/orbs/spot-client.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Run lint + typecheck**

Run: `pnpm run lint && pnpm run typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/orbs/spot-client.ts tests/orbs/spot-client.test.ts
git commit -m "feat(spot): add HTTP client for order submit and query"
```

---

## Chunk 2: Schemas, Chain Support, and Approval Extension

Update schemas, chain support checks, and approval logic to support Spot.

### Task 4: Update Chain Support

**Files:**
- Modify: `src/orbs/chains.ts`
- Modify: `tests/orbs/chains.test.ts`

- [ ] **Step 1: Write failing tests for new chain functions**

Add tests to `tests/orbs/chains.test.ts` for `isSpotSupported()` and `getSpotError()`:

```typescript
// Add to existing tests/orbs/chains.test.ts
import { getSpotError, isSpotSupported } from "../../src/orbs/chains.js";

describe("isSpotSupported", () => {
  it("returns true for Spot-supported chains", () => {
    expect(isSpotSupported(42161)).toBe(true);
    expect(isSpotSupported(1)).toBe(true);
  });

  it("returns false for unsupported chains", () => {
    expect(isSpotSupported(999999)).toBe(false);
  });
});

describe("getSpotError", () => {
  it("returns error message with chain ID", () => {
    const msg = getSpotError(999999);
    expect(msg).toContain("999999");
    expect(msg).toContain("Spot");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- --run tests/orbs/chains.test.ts`
Expected: FAIL — functions not exported

- [ ] **Step 3: Implement chain support changes**

In `src/orbs/chains.ts`, add `isSpotSupported` and `getSpotError` using `spot-config.ts`. Keep `isTwapSupported` for now (used by query fallback), but change its import from the SDK to only rely on chain IDs we know:

```typescript
// Add to src/orbs/chains.ts
import {
  getSupportedSpotChainIds,
  isSpotChainSupported,
} from "./spot-config.js";

export function isSpotSupported(chainId: number): boolean {
  return isSpotChainSupported(chainId);
}

export function getSpotError(chainId: number): string {
  const supported = getSupportedSpotChainIds()
    .map((id) => `${getChainById(id)?.name ?? String(id)} (${id})`)
    .join(", ");
  return `Spot orders are not available on chain ${chainId}. Supported: ${supported}`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- --run tests/orbs/chains.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add src/orbs/chains.ts tests/orbs/chains.test.ts
git commit -m "feat(spot): add isSpotSupported and getSpotError to chain support module"
```

---

### Task 5: Add Unified Order Schemas

**Files:**
- Modify: `src/api/schemas/orbs.ts`
- Modify: `src/api/schemas/outputs.ts`
- Modify: `src/api/types.ts`
- Modify: `src/tools/orbs/schemas.ts`

- [ ] **Step 1: Add new schemas to `src/api/schemas/orbs.ts`**

```typescript
// Add to src/api/schemas/orbs.ts

export const orbsPlaceOrderSchema = tokenAmountSchema.extend({
  chainId: chainIdOptionalSchema,
  fromMaxAmount: z.string().optional().describe("Total input amount for chunked orders (defaults to fromAmount for single orders)"),
  epoch: z.number().optional().describe("Seconds between chunk fills. 0 for single orders, 60 default for chunked"),
  slippage: z.number().optional().describe("Slippage tolerance in BPS (default 500 = 5%)"),
  outputLimit: z.string().optional().describe("Minimum output per chunk in output token units (0 = market order)"),
  outputTriggerLower: z.string().optional().describe("Lower trigger price per chunk for stop-loss orders"),
  outputTriggerUpper: z.string().optional().describe("Upper trigger price per chunk for take-profit orders"),
  start: z.number().optional().describe("Order start time as Unix timestamp (default: now)"),
  deadline: z.number().optional().describe("Order deadline as Unix timestamp (default: auto-calculated)"),
});

export const orbsPrepareOrderIntentSchema = orbsPlaceOrderSchema.extend({
  account: addressSchema.describe("Swapper wallet address"),
});

export const orbsSubmitSignedOrderSchema = z.object({
  submitUrl: z.string().describe("Submit URL from prepare step"),
  order: z.record(z.unknown()).describe("Order witness object from prepare step"),
  signature: hexSchema
    .refine((v) => v.length >= 132, {
      message: "signature must be at least 65 bytes (132 hex characters + 0x prefix)",
    })
    .describe("Hex-encoded EIP-712 signature"),
});

export const orbsQueryOrdersSchema = z.object({
  swapper: addressSchema.optional().describe("Filter orders by swapper address"),
  hash: z.string().optional().describe("Filter orders by order hash (0x-prefixed 32 bytes)"),
  chainId: chainIdOptionalSchema,
}).refine((data) => data.swapper || data.hash, {
  message: "At least one of swapper or hash is required",
});

export const orbsCancelOrderSchema = z.object({
  chainId: chainIdOptionalSchema,
  digest: hexSchema.describe("RePermit digest to cancel (from prepare step or query)"),
});
```

- [ ] **Step 2: Add output schema to `src/api/schemas/outputs.ts`**

```typescript
// Add to src/api/schemas/outputs.ts

export const spotOrderIntentSchema = z.object({
  typedData: typedDataPayloadSchema.describe("EIP-712 typed data for signing"),
  approval: z.object({
    token: z.string().describe("Token to approve"),
    spender: z.string().describe("RePermit contract address"),
    amount: z.string().describe("Approval amount"),
    tx: z.object({
      to: z.string().describe("Token contract address"),
      data: hexSchema.describe("Approval calldata"),
      value: z.string().describe("Native value (always 0x0)"),
    }).describe("Approval transaction"),
  }).describe("Token approval for RePermit"),
  submit: z.object({
    url: z.string().describe("URL to POST the signed order"),
    body: z.object({
      order: z.record(z.unknown()).describe("Order witness to submit"),
      signature: z.null().describe("Placeholder — fill with actual signature after signing"),
      status: z.literal("pending").describe("Order status"),
    }).describe("Submit request body template"),
  }).describe("Submit endpoint and payload template"),
  query: z.object({
    url: z.string().describe("Base URL for querying order status"),
  }).describe("Query endpoint"),
  meta: z.object({
    kind: z.enum(["single", "chunked"]).describe("Order kind"),
    chunkCount: z.number().describe("Number of chunks"),
    chunkInputAmount: z.string().describe("Input amount per chunk"),
    start: z.number().describe("Start timestamp"),
    deadline: z.number().describe("Deadline timestamp"),
    epoch: z.number().describe("Epoch seconds between chunks"),
    limit: z.string().describe("Output limit per chunk"),
  }).describe("Order metadata"),
  warnings: z.array(z.string()).describe("Validation warnings"),
  chainId: z.number().describe("Chain ID"),
});
```

- [ ] **Step 3: Add types to `src/api/types.ts`**

```typescript
// Add to src/api/types.ts
import type {
  orbsCancelOrderSchema,
  orbsPlaceOrderSchema,
  orbsPrepareOrderIntentSchema,
  orbsQueryOrdersSchema,
  orbsSubmitSignedOrderSchema,
} from "./schemas.js";
import { spotOrderIntentSchema } from "./schemas/outputs.js";

export type PlaceOrderInput = z.infer<typeof orbsPlaceOrderSchema>;
export type PrepareOrderIntentInput = z.infer<typeof orbsPrepareOrderIntentSchema>;
export type SubmitSignedOrderInput = z.infer<typeof orbsSubmitSignedOrderSchema>;
export type QueryOrdersInput = z.infer<typeof orbsQueryOrdersSchema>;
export type CancelOrderInput = z.infer<typeof orbsCancelOrderSchema>;
export type SpotOrderIntent = z.infer<typeof spotOrderIntentSchema>;
```

- [ ] **Step 4: Update `src/tools/orbs/schemas.ts`**

Add re-exports for new schemas:

```typescript
// Add to src/tools/orbs/schemas.ts
export {
  orbsCancelOrderSchema,
  orbsPlaceOrderSchema,
  orbsPrepareOrderIntentSchema,
  orbsQueryOrdersSchema,
  orbsSubmitSignedOrderSchema,
} from "../../api/schemas.js";
```

- [ ] **Step 5: Run lint + typecheck + tests**

Run: `pnpm run lint && pnpm run typecheck && pnpm test`
Expected: ALL PASS (new schemas are just additions, no breaking changes)

- [ ] **Step 6: Commit**

```bash
git add src/api/schemas/orbs.ts src/api/schemas/outputs.ts src/api/types.ts src/tools/orbs/schemas.ts
git commit -m "feat(spot): add unified order schemas, output schema, and derived types"
```

---

### Task 6: Extend Approval Flow for RePermit

**Files:**
- Modify: `src/api/operations/orbs.ts`
- Modify: `src/api/schemas/orbs.ts` (add `mode` to approval schema)

- [ ] **Step 1: Update `orbsGetRequiredApprovalsSchema` to accept `mode`**

In `src/api/schemas/orbs.ts`:

```typescript
export const orbsGetRequiredApprovalsSchema = z.object({
  chainId: chainIdOptionalSchema,
  fromToken: z.string({ required_error: "fromToken is required" }).describe("Source token address"),
  fromAmount: z
    .string({ required_error: "fromAmount is required" })
    .describe("Amount in smallest token units"),
  account: addressSchema.describe("User wallet address"),
  mode: z
    .enum(["swap", "order"])
    .optional()
    .default("swap")
    .describe("Approval mode: 'swap' checks Permit2, 'order' checks RePermit"),
});
```

- [ ] **Step 2: Update `getRequiredApprovals` in `src/api/operations/orbs.ts`**

Modify the existing function to check RePermit when `mode === "order"`:

```typescript
// In getRequiredApprovals, after the existing Permit2 allowance check:
import { getSpotContracts } from "../../orbs/spot-config.js";

// Determine spender based on mode
const mode = input.mode ?? "swap";
const spender = mode === "order"
  ? (getSpotContracts().repermit as `0x${string}`)
  : PERMIT2_ADDRESS;

// Then use `spender` in the allowance check and approve step label
```

The full change is: replace the hardcoded `PERMIT2_ADDRESS` in the allowance check and approval step with the mode-aware `spender`.

- [ ] **Step 3: Add test for order mode approval**

Add to `tests/orbs/` or the appropriate test file:

```typescript
it("checks RePermit allowance when mode is 'order'", async () => {
  // Mock publicClient.readContract to return 0 allowance
  // Call getRequiredApprovals with mode: "order"
  // Assert approval step targets RePermit address
  // Assert label mentions "RePermit"
});
```

- [ ] **Step 4: Run tests**

Run: `pnpm test`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add src/api/schemas/orbs.ts src/api/operations/orbs.ts tests/
git commit -m "feat(spot): extend approval flow to check RePermit allowance for order mode"
```

---

## Chunk 3: Tool Wiring

Wire the new Spot tools into the tool registry, replacing old TWAP/limit tools.

### Task 7: Implement New Tool Handlers

**Files:**
- Modify: `src/tools/orbs/index.ts`

This is the main integration point. Replace old handlers with new ones.

- [ ] **Step 1: Add `orbs_place_order` handler**

```typescript
async function executeSpotOrderNow(params: Record<string, unknown>): Promise<CallToolResult> {
  const chainId = resolveChainId(params);

  try {
    const account = getActiveAccount();

    // Map from unified schema to SpotOrderParams
    const prepared = prepareSpotOrder({
      chainId,
      swapper: account.address,
      fromToken: params.fromToken as string,
      fromAmount: params.fromAmount as string,
      toToken: params.toToken as string,
      fromMaxAmount: params.fromMaxAmount as string | undefined,
      epoch: params.epoch as number | undefined,
      slippage: params.slippage as number | undefined,
      outputLimit: params.outputLimit as string | undefined,
      outputTriggerLower: params.outputTriggerLower as string | undefined,
      outputTriggerUpper: params.outputTriggerUpper as string | undefined,
      start: params.start as number | undefined,
      deadline: params.deadline as number | undefined,
    });

    // Check & execute approval to RePermit
    const requiredApprovals = await getRequiredApprovalsForOperation({
      chainId,
      fromToken: params.fromToken as string,
      fromAmount: prepared.approval.amount,
      account: account.address,
      mode: "order",
    });

    // If approval needed, execute it (same pattern as prepareSwap in LH)
    if (requiredApprovals.length > 0) {
      for (const step of requiredApprovals) {
        if (step.tx.data) {
          const ctx = buildWriteContext(chainId);
          if (!isWriteContext(ctx)) return ctx;
          const hash = await ctx.walletClient.sendTransaction({
            to: step.tx.to as `0x${string}`,
            data: step.tx.data as `0x${string}`,
            value: step.tx.value ? BigInt(step.tx.value) : 0n,
            chain: ctx.chain,
            account: ctx.account,
          });
          await ctx.publicClient.waitForTransactionReceipt({ hash });
          process.stderr.write(`[orbs] ${step.label}: ${hash}\n`);
        }
      }
    }

    // Sign EIP-712
    if (!account.signTypedData) {
      return formatToolError("WALLET_ERROR", "Active account does not support EIP-712 signing");
    }
    const signature = await account.signTypedData({
      domain: prepared.typedData.domain,
      types: prepared.typedData.types,
      primaryType: prepared.typedData.primaryType,
      message: prepared.typedData.message,
    });

    // Submit
    const { v, r, s } = splitSignature(signature);
    const submitResult = await submitSpotOrder({
      url: prepared.submit.url,
      order: prepared.submit.body.order,
      signature: { r, s, v },
    });

    if (!submitResult.ok) {
      return formatToolError("ORBS_ORDER_ERROR", `Submit failed (${submitResult.status}): ${JSON.stringify(submitResult.response)}`);
    }

    return formatToolResponse({
      status: "submitted",
      meta: prepared.meta,
      warnings: prepared.warnings,
      response: submitResult.response,
    });
  } catch (e: unknown) {
    return formatToolError("ORBS_ORDER_ERROR", String(e));
  }
}

async function orbsPlaceOrder(params: Record<string, unknown>): Promise<CallToolResult> {
  const v = validateInput(orbsPlaceOrderSchema, params);
  if (!v.success) return v.error;
  const chainId = resolveToolChainId(v.data.chainId);

  if (!isSpotSupported(chainId)) {
    return formatToolError("CHAIN_NOT_SUPPORTED", getSpotError(chainId));
  }

  const kind = v.data.fromMaxAmount && v.data.fromMaxAmount !== v.data.fromAmount ? "chunked" : "single";
  const limitDesc = v.data.outputLimit ? `, limit ${v.data.outputLimit}` : "";

  return executeWrite({
    toolName: "orbs_place_order",
    description: `Spot ${kind} order: ${v.data.fromAmount} of ${v.data.fromToken} → ${v.data.toToken}${limitDesc} on chain ${chainId}`,
    params: { ...v.data } as Record<string, unknown>,
    executor: executeSpotOrderNow,
  });
}
```

- [ ] **Step 2: Add `orbs_prepare_order_intent` handler**

```typescript
async function orbsPrepareOrderIntent(params: Record<string, unknown>): Promise<CallToolResult> {
  const v = validateInput(orbsPrepareOrderIntentSchema, params);
  if (!v.success) return v.error;
  const chainId = resolveToolChainId(v.data.chainId);

  if (!isSpotSupported(chainId)) {
    return formatToolError("CHAIN_NOT_SUPPORTED", getSpotError(chainId));
  }

  try {
    const prepared = prepareSpotOrder({
      chainId,
      swapper: v.data.account,
      fromToken: v.data.fromToken,
      fromAmount: v.data.fromAmount,
      toToken: v.data.toToken,
      fromMaxAmount: v.data.fromMaxAmount,
      epoch: v.data.epoch,
      slippage: v.data.slippage,
      outputLimit: v.data.outputLimit,
      outputTriggerLower: v.data.outputTriggerLower,
      outputTriggerUpper: v.data.outputTriggerUpper,
      start: v.data.start,
      deadline: v.data.deadline,
    });

    const requiredApprovals = await getRequiredApprovalsForOperation({
      chainId,
      fromToken: v.data.fromToken,
      fromAmount: prepared.approval.amount,
      account: v.data.account,
      mode: "order",
    });

    return formatToolResponse({
      ...prepared,
      requiredApprovals,
      chainId,
    });
  } catch (e: unknown) {
    return formatToolError("ORBS_ORDER_ERROR", String(e));
  }
}
```

- [ ] **Step 3: Add `orbs_submit_signed_order` handler**

```typescript
async function orbsSubmitSignedOrder(params: Record<string, unknown>): Promise<CallToolResult> {
  const v = validateInput(orbsSubmitSignedOrderSchema, params);
  if (!v.success) return v.error;

  try {
    const { r, s, v: sigV } = splitSignature(v.data.signature);
    const result = await submitSpotOrder({
      url: v.data.submitUrl,
      order: v.data.order,
      signature: { r, s, v: sigV },
    });

    if (!result.ok) {
      return formatToolError("ORBS_ORDER_ERROR", `Submit failed (${result.status}): ${JSON.stringify(result.response)}`);
    }

    return formatToolResponse({ status: "submitted", response: result.response });
  } catch (e: unknown) {
    return formatToolError("ORBS_ORDER_ERROR", String(e));
  }
}
```

- [ ] **Step 4: Add `orbs_query_orders` handler**

```typescript
async function orbsQueryOrders(params: Record<string, unknown>): Promise<CallToolResult> {
  const v = validateInput(orbsQueryOrdersSchema, params);
  if (!v.success) return v.error;

  try {
    // Try Spot API first
    const spotResult = await querySpotOrders({
      swapper: v.data.swapper,
      hash: v.data.hash,
    });

    if (spotResult.ok) {
      return formatToolResponse({
        source: "spot",
        count: spotResult.orders.length,
        orders: spotResult.orders,
      });
    }

    // Fallback to TWAP SDK if Spot API fails and we have a swapper
    if (v.data.swapper) {
      const chainId = resolveToolChainId(v.data.chainId);
      try {
        const sdkOrders = await listOrders(chainId, v.data.swapper);
        return formatToolResponse({
          source: "sdk-fallback",
          count: sdkOrders.length,
          orders: sdkOrders.map((o) => ({
            id: o.id,
            type: o.type,
            status: o.status,
            fromToken: o.srcTokenAddress,
            toToken: o.dstTokenAddress,
            fromAmount: o.srcAmount,
            progress: o.progress,
            createdAt: o.createdAt,
          })),
        });
      } catch (sdkErr: unknown) {
        process.stderr.write(`[orbs] SDK fallback query also failed: ${sdkErr}\n`);
      }
    }

    return formatToolError("ORBS_QUERY_ERROR", `Query failed (${spotResult.status}): ${spotResult.error}`);
  } catch (e: unknown) {
    return formatToolError("ORBS_QUERY_ERROR", String(e));
  }
}
```

- [ ] **Step 5: Add `orbs_cancel_order` handler**

```typescript
async function orbsCancelOrder(params: Record<string, unknown>): Promise<CallToolResult> {
  const v = validateInput(orbsCancelOrderSchema, params);
  if (!v.success) return v.error;
  const chainId = resolveToolChainId(v.data.chainId);

  return executeWrite({
    toolName: "orbs_cancel_order",
    description: `Cancel Spot order: digest ${v.data.digest} on chain ${chainId}`,
    params: { ...v.data } as Record<string, unknown>,
    executor: executeSpotCancelNow,
  });
}

async function executeSpotCancelNow(params: Record<string, unknown>): Promise<CallToolResult> {
  const chainId = resolveChainId(params);
  const digest = params.digest as `0x${string}`;

  try {
    const ctx = buildWriteContext(chainId);
    if (!isWriteContext(ctx)) return ctx;

    const contracts = getSpotContracts();
    const hash = await ctx.walletClient.writeContract({
      address: contracts.repermit as `0x${string}`,
      abi: [
        {
          type: "function",
          name: "cancel",
          inputs: [{ name: "digests", type: "bytes32[]" }],
          outputs: [],
          stateMutability: "nonpayable",
        },
      ],
      functionName: "cancel",
      args: [[digest]],
      chain: ctx.chain,
      account: ctx.account,
    });

    const receipt = await ctx.publicClient.waitForTransactionReceipt({ hash });

    return formatToolResponse({
      status: receipt.status === "success" ? "cancelled" : "failed",
      txHash: hash,
    });
  } catch (e: unknown) {
    return formatToolError("ORBS_CANCEL_ERROR", String(e));
  }
}
```

- [ ] **Step 6: Update tool definitions array**

Replace old order tools with new ones in `getOrbsToolDefinitions()`:

```typescript
// Remove these tools:
// - orbs_place_twap
// - orbs_prepare_twap_intent
// - orbs_place_limit
// - orbs_prepare_limit_intent
// - orbs_submit_signed_twap_order
// - orbs_list_orders

// Add these tools:
{
  name: "orbs_place_order",
  category: "orders",
  description:
    "Place a gasless order via Spot protocol. Supports market, limit, TWAP, stop-loss, take-profit, " +
    "and delayed orders. Order type is determined by parameters: limit (outputLimit > 0), " +
    "chunked/TWAP (fromMaxAmount > fromAmount + epoch), stop-loss (outputTriggerLower), " +
    "take-profit (outputTriggerUpper), delayed (future start). Write, confirmation-gated.",
  inputSchema: zodToJsonSchema(orbsPlaceOrderSchema) as Record<string, unknown>,
  handler: orbsPlaceOrder,
  annotations: { destructiveHint: true, openWorldHint: true },
},
{
  name: "orbs_prepare_order_intent",
  category: "orders",
  description:
    "Prepare a Spot order for external wallet signing. Returns EIP-712 typed data, " +
    "approval calldata, submit URL, and order metadata. Supports all order types.",
  inputSchema: zodToJsonSchema(orbsPrepareOrderIntentSchema) as Record<string, unknown>,
  handler: orbsPrepareOrderIntent,
  annotations: { readOnlyHint: true, openWorldHint: true },
},
{
  name: "orbs_submit_signed_order",
  category: "orders",
  description:
    "Submit an externally signed Spot order using the submit URL and order from orbs_prepare_order_intent.",
  inputSchema: zodToJsonSchema(orbsSubmitSignedOrderSchema) as Record<string, unknown>,
  handler: orbsSubmitSignedOrder,
  annotations: { destructiveHint: true, openWorldHint: true },
},
{
  name: "orbs_query_orders",
  category: "orders",
  description:
    "Query Spot orders by swapper address or order hash. Falls back to SDK query if Spot API unavailable.",
  inputSchema: zodToJsonSchema(orbsQueryOrdersSchema) as Record<string, unknown>,
  handler: orbsQueryOrders,
  annotations: { readOnlyHint: true, openWorldHint: true },
},
{
  name: "orbs_cancel_order",
  category: "orders",
  description:
    "Cancel a Spot order onchain by calling RePermit.cancel with the order digest. Write, confirmation-gated.",
  inputSchema: zodToJsonSchema(orbsCancelOrderSchema) as Record<string, unknown>,
  handler: orbsCancelOrder,
  annotations: { destructiveHint: true, openWorldHint: true },
},
```

- [ ] **Step 7: Update `registerOrbsExecutors()`**

```typescript
export function registerOrbsExecutors(): void {
  registerExecutor("orbs_swap", executeOrbsSwapNow);
  registerExecutor("orbs_place_order", executeSpotOrderNow);
  registerExecutor("orbs_cancel_order", executeSpotCancelNow);
}
```

- [ ] **Step 8: Remove dSLTP import**

Remove `import { getDsltpToolDefinitions } from "../../orbs/dsltp.js";` and `...getDsltpToolDefinitions()` from the tools array.

- [ ] **Step 9: Add new imports**

```typescript
import { prepareSpotOrder } from "../../orbs/spot-prepare.js";
import { querySpotOrders, submitSpotOrder } from "../../orbs/spot-client.js";
import { getSpotContracts } from "../../orbs/spot-config.js";
import { getSpotError, isSpotSupported } from "../../orbs/chains.js";
import { buildWriteContext, isWriteContext } from "../shared/write-context.js";
```

- [ ] **Step 10: Run lint + typecheck**

Run: `pnpm run lint && pnpm run typecheck`
Expected: PASS (may have warnings about unused old imports — remove them)

- [ ] **Step 11: Commit**

```bash
git add src/tools/orbs/index.ts
git commit -m "feat(spot): wire unified order tools replacing old TWAP/limit tools"
```

---

### Task 8: Tool Handler Tests

**Files:**
- Create: `tests/tools/orbs/spot-tools.test.ts`

- [ ] **Step 1: Write tests for new tool handlers**

```typescript
// tests/tools/orbs/spot-tools.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock all external dependencies
vi.mock("../../../src/orbs/spot-prepare.js", () => ({
  prepareSpotOrder: vi.fn(),
}));
vi.mock("../../../src/orbs/spot-client.js", () => ({
  submitSpotOrder: vi.fn(),
  querySpotOrders: vi.fn(),
}));
vi.mock("../../../src/orbs/spot-config.js", () => ({
  getSpotContracts: vi.fn().mockReturnValue({
    repermit: "0x00002a9C4D9497df5Bd31768eC5d30eEf5405000",
    reactor: "0x000000b33fE4fB9d999Dd684F79b110731c3d000",
    executor: "0x000642A0966d9bd49870D9519f76b5cf823f3000",
    zero: "0x0000000000000000000000000000000000000000",
  }),
  isSpotChainSupported: vi.fn().mockReturnValue(true),
}));
vi.mock("../../../src/orbs/chains.js", () => ({
  isSpotSupported: vi.fn().mockReturnValue(true),
  getSpotError: vi.fn().mockReturnValue("Spot not supported"),
  isLiquidityHubSupported: vi.fn().mockReturnValue(true),
  getLiquidityHubError: vi.fn(),
  isTwapSupported: vi.fn().mockReturnValue(true),
  getTwapError: vi.fn(),
}));
vi.mock("../../../src/wallet/persistence.js");
vi.mock("../../../src/wallet/confirmation.js");
vi.mock("../../../src/utils/write.js");

describe("spot tool handlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("orbs_place_order validation", () => {
    it("rejects unsupported chain", async () => {
      // Mock isSpotSupported to return false
      // Call handler with chainId: 999999
      // Expect CHAIN_NOT_SUPPORTED error
    });

    it("validates required fields via schema", async () => {
      // Call handler with missing fromToken
      // Expect validation error
    });
  });

  describe("orbs_prepare_order_intent", () => {
    it("returns prepared order with typed data and approval info", async () => {
      // Mock prepareSpotOrder to return a valid prepared order
      // Mock getRequiredApprovals to return empty array
      // Call handler
      // Expect success response with typedData, approval, submit, meta
    });

    it("includes required approvals when allowance is insufficient", async () => {
      // Mock getRequiredApprovals to return approval step
      // Verify response includes requiredApprovals array
    });
  });

  describe("orbs_submit_signed_order", () => {
    it("submits order with parsed signature", async () => {
      // Mock submitSpotOrder to return ok
      // Call handler with valid signature
      // Verify submitSpotOrder called with r/s/v
    });

    it("returns error on submit failure", async () => {
      // Mock submitSpotOrder to return { ok: false }
      // Verify error response
    });
  });

  describe("orbs_query_orders", () => {
    it("queries Spot API by swapper", async () => {
      // Mock querySpotOrders to return orders
      // Verify response
    });

    it("falls back to SDK when Spot API fails", async () => {
      // Mock querySpotOrders to return { ok: false }
      // Mock listOrders to return orders
      // Verify fallback source
    });

    it("rejects when neither swapper nor hash provided", async () => {
      // Call with empty params
      // Expect validation error
    });
  });

  describe("orbs_cancel_order", () => {
    it("calls executeWrite with cancel executor", async () => {
      // Verify executeWrite is called with correct toolName and params
    });
  });
});
```

Note: These tests follow the existing patterns in `tests/orbs/` — mock external dependencies, test both success and error paths, validate schema enforcement. The exact mock setup will depend on the final handler implementations, but the test structure is defined here.

- [ ] **Step 2: Run tests**

Run: `pnpm test -- --run tests/tools/orbs/spot-tools.test.ts`
Expected: ALL PASS

- [ ] **Step 3: Commit**

```bash
git add tests/tools/orbs/spot-tools.test.ts
git commit -m "test(spot): add tool handler tests for unified order tools"
```

---

### Task 9: Update Operations Layer

**Files:**
- Modify: `src/api/operations.ts`
- Modify: `src/api/intents.ts`

- [ ] **Step 1: Add "order" kind to `prepareOperation` dispatch**

In `src/api/operations.ts`, add a case for `kind: "order"` that routes to a new `prepareOrderOperation`:

```typescript
case "orbs":
  if (input.kind === "swap") return prepareSwapOperation(input);
  if (input.kind === "order") return prepareOrderOperation(input);
  // Keep old twap/limit for backward compatibility during transition
  if (input.kind === "twap") return prepareTwapOperation(input);
  return prepareLimitOperation(input);
```

And in `resumeOperation`, add:

```typescript
if (resumeState.integration === "orbs" && resumeState.kind === "order") {
  return resumeSpotOrderOperation(resumeState, actionResults);
}
```

- [ ] **Step 2: Implement `prepareOrderOperation` in `src/api/operations/orbs.ts`**

```typescript
export async function prepareOrderOperation(
  input: PrepareOrderIntentInput
): Promise<PreparedOperation> {
  const chainId = input.chainId ?? getConfig().chainId;

  if (!isSpotSupported(chainId)) {
    throw new Web3AgentError({
      code: "CHAIN_NOT_SUPPORTED",
      message: getSpotError(chainId),
    });
  }

  try {
    const prepared = prepareSpotOrder({
      chainId,
      swapper: input.account,
      fromToken: input.fromToken,
      fromAmount: input.fromAmount,
      toToken: input.toToken,
      fromMaxAmount: input.fromMaxAmount,
      epoch: input.epoch,
      slippage: input.slippage,
      outputLimit: input.outputLimit,
      outputTriggerLower: input.outputTriggerLower,
      outputTriggerUpper: input.outputTriggerUpper,
      start: input.start,
      deadline: input.deadline,
    });

    const eip712: TypedDataPayload = {
      domain: prepared.typedData.domain as TypedDataPayload["domain"],
      types: prepared.typedData.types as TypedDataPayload["types"],
      primaryType: prepared.typedData.primaryType,
      message: prepared.typedData.message as Record<string, unknown>,
    };

    const requiredApprovals = await getRequiredApprovals({
      chainId,
      fromToken: input.fromToken,
      fromAmount: prepared.approval.amount,
      account: input.account,
      mode: "order",
    });

    const approvalActions = createPreparedApprovalActions(chainId, requiredApprovals);
    const signAction = createTypedDataAction(chainId, "Sign Spot order", eip712);

    const intent: SpotOrderIntent = {
      ...prepared,
      requiredApprovals,
      chainId,
    };

    return buildPreparedOperation(
      "orbs",
      "order",
      `Prepare Spot ${prepared.meta.kind} order on chain ${chainId}`,
      approvalActions.length > 0 ? approvalActions : [signAction],
      {
        summary: `Prepare Spot order on chain ${chainId}`,
        intent,
        order: prepared.submit.body.order,
        signAction,
        approvalActions,
        submitUrl: prepared.submit.url,
      },
      { intent }
    );
  } catch (error: unknown) {
    throw Web3AgentError.fromUnknown("ORBS_ORDER_ERROR", error);
  }
}
```

- [ ] **Step 2b: Implement `resumeSpotOrderOperation` in `src/api/operations/orbs.ts`**

```typescript
export async function resumeSpotOrderOperation(
  resumeState: OperationResumeState,
  actionResults: Record<string, OperationActionResult>
): Promise<ResumeOperationCompletedResult | { completed: false; operation: PreparedOperation }> {
  const state = resumeState.state as Record<string, unknown>;
  const approvalActions = state.approvalActions as PreparedAction[] | undefined;

  if (approvalActions && approvalActions.length > 0) {
    const pendingApprovals = await getPendingPreparedActions(approvalActions, actionResults);
    if (pendingApprovals.length > 0) {
      return {
        completed: false,
        operation: toPendingOperation(resumeState, pendingApprovals, "Resume Spot order approvals", actionResults),
      };
    }
  }

  const signAction = state.signAction as PreparedSignTypedDataAction;
  const signatureResult = assertActionResultType(actionResults, signAction.id, "signature");
  if (!signatureResult) {
    return {
      completed: false,
      operation: toPendingOperation(resumeState, [signAction], "Resume Spot order signing", actionResults),
    };
  }

  // Submit via Spot API
  const { r, s, v } = splitSignature(signatureResult.signature);
  const submitResult = await submitSpotOrder({
    url: state.submitUrl as string,
    order: state.order as Record<string, unknown>,
    signature: { r, s, v },
  });

  if (!submitResult.ok) {
    throw new Web3AgentError({
      code: "ORBS_ORDER_ERROR",
      message: `Submit failed (${submitResult.status}): ${JSON.stringify(submitResult.response)}`,
    });
  }

  return {
    completed: true,
    integration: "orbs",
    kind: "order",
    result: { status: "submitted", response: submitResult.response },
  };
}
```

- [ ] **Step 3: Run lint + typecheck + tests**

Run: `pnpm run lint && pnpm run typecheck && pnpm test`
Expected: ALL PASS

- [ ] **Step 4: Commit**

```bash
git add src/api/operations.ts src/api/operations/orbs.ts src/api/intents.ts
git commit -m "feat(spot): add order operation dispatch and resume flow"
```

---

## Chunk 4: Cleanup and Verification

Remove old dependencies, clean up dead code, run full test suite.

### Task 10: Remove dSLTP Module

**Files:**
- Delete: `src/orbs/dsltp.ts`
- Delete: `tests/orbs/orbs-dsltp-flag.test.ts`

- [ ] **Step 1: Delete files**

```bash
rm src/orbs/dsltp.ts tests/orbs/orbs-dsltp-flag.test.ts
```

- [ ] **Step 2: Remove any remaining imports of dsltp**

Search for and remove all references to `dsltp` across the codebase.

- [ ] **Step 3: Run lint + typecheck + tests**

Run: `pnpm run lint && pnpm run typecheck && pnpm test`
Expected: ALL PASS

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor: remove dSLTP feature gate (stop-loss/take-profit now via unified Spot order)"
```

---

### Task 11: Slim Down Old Code to Query Fallback Only

All old handler/operations code removal in a single atomic task to avoid intermediate lint/typecheck failures.

**Files:**
- Modify: `src/orbs/twap.ts`
- Modify: `tests/orbs/twap.test.ts`
- Modify: `src/tools/orbs/index.ts` (remove old handler functions, already replaced in Task 7)
- Modify: `src/api/operations/orbs.ts`
- Modify: `src/api/intents.ts`
- Modify: `src/api/types.ts`
- Modify: `src/api/operations.ts`
- Modify: `src/index.ts` (update public API exports)

- [ ] **Step 1: Remove old code from ALL files atomically**

In `src/orbs/twap.ts`: keep only `listOrders` and `getChainConfig`. Remove `prepareTwapOrder`, `submitSignedOrder`, `getTwapDurationSeconds`, `getSrcTokenChunkAmount` re-export, `TwapOrderParams`, `PreparedOrder` interfaces.

In `src/tools/orbs/index.ts`: remove dead functions `executeOrbsTwapNow`, `executeOrbsLimitNow`, `orbsPlaceTwap`, `orbsPlaceLimit`, and related prepare/submit handlers. Remove unused imports from `twap.ts`.

In `src/api/operations/orbs.ts`: remove `prepareTwapOrLimitIntent`, `prepareTwapOrLimitOperation`, `prepareTwapOperation`, `prepareLimitOperation`, `resumeOrbsOrderOperation`, `submitSignedTwapOrderDirect`, `toRePermitOrder`. Keep `prepareSwapOperation`, `resumeOrbsSwapOperation`, `submitSignedSwapDirect`, `getRequiredApprovals`, and the new `prepareOrderOperation`, `resumeSpotOrderOperation`.

In `src/api/intents.ts`: remove `prepareTwapIntent`, `prepareLimitIntent`, `submitSignedTwapOrder`.

In `src/api/types.ts`: remove unused type aliases (`PlaceTwapOrderInput`, `PrepareTwapIntentInput`, `PlaceLimitOrderInput`, `PrepareLimitIntentInput`, `SubmitSignedTwapOrderInput`). Add new type exports for Spot schemas. Keep `TwapIntent`/`LimitIntent` if still used by output schemas.

In `src/api/operations.ts`: remove old `twap`/`limit` dispatches if fully replaced by `order`.

In `src/index.ts`: add new schema/type exports for Spot tools. Remove old TWAP/limit schema exports that no longer exist.

- [ ] **Step 2: Update `tests/orbs/twap.test.ts`**

Remove tests for `prepareTwapOrder`, `submitSignedOrder`. Keep tests for `listOrders`.

- [ ] **Step 3: Run lint + typecheck + tests**

Run: `pnpm run lint && pnpm run typecheck && pnpm test`
Expected: ALL PASS

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor: remove old TWAP/limit handlers and operations, slim twap.ts to query fallback only"
```

---

### Task 12: Remove SDK Dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Search for remaining imports of `@orbs-network/twap-sdk`**

Run: `grep -r "twap-sdk\|twap-ui" src/ tests/`

If any remain beyond the fallback `listOrders` in `twap.ts`, remove them.

- [ ] **Step 2: Assess if `@orbs-network/twap-sdk` can be removed**

If `listOrders` still uses `getAccountOrders` from the SDK, keep the dependency. Otherwise remove it.

At minimum, remove `@orbs-network/twap-ui` which is unused:

```bash
pnpm remove @orbs-network/twap-ui
```

- [ ] **Step 3: Run full validation**

Run: `pnpm run lint && pnpm run typecheck && pnpm run build && pnpm test`
Expected: ALL PASS

- [ ] **Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: remove @orbs-network/twap-ui dependency"
```

---

### Task 13: Full Validation Pass

- [ ] **Step 1: Run complete validation suite**

```bash
pnpm run lint && pnpm run typecheck && pnpm run build && pnpm test
```

Expected: ALL PASS with 0 lint errors, 0 type errors, build succeeds, all tests pass.

- [ ] **Step 2: Verify schema quality test auto-discovers new schemas**

The `tests/tools/schema-quality.test.ts` auto-discovers all schemas. Verify it includes the new Spot schemas and their `.describe()` annotations pass.

- [ ] **Step 3: Review tool count**

Run the server or grep tool definitions to verify exactly 11 Orbs tools are registered:
1. `orbs_get_quote`
2. `orbs_swap`
3. `orbs_prepare_swap_intent`
4. `orbs_get_required_approvals`
5. `orbs_submit_signed_swap`
6. `orbs_swap_status`
7. `orbs_place_order`
8. `orbs_prepare_order_intent`
9. `orbs_submit_signed_order`
10. `orbs_query_orders`
11. `orbs_cancel_order`

- [ ] **Step 4: Final commit if any cleanup needed**

```bash
git add -A
git commit -m "chore: final cleanup after Spot integration"
```
