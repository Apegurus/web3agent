import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { isHex } from "viem";
import type { Hex } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { plan } from "../api/uniswap-v4-lifecycle-fixtures.js";

const boundary = vi.hoisted(() => ({
  getBalanceClient: vi.fn(),
  getReceipt: vi.fn(),
  readContract: vi.fn(),
  readPoolSnapshot: vi.fn(),
  readPositionSnapshot: vi.fn(),
  sendTransaction: vi.fn(),
  signTypedData: vi.fn(),
  waitForReceipt: vi.fn(),
}));

vi.mock("../../src/tools/shared/write-context.js", () => ({
  buildWriteContext: vi.fn(() => ({
    account: { address: "0x1111111111111111111111111111111111111111" },
    chain: { id: 4663 },
    publicClient: {
      getTransactionReceipt: boundary.getReceipt,
      waitForTransactionReceipt: boundary.waitForReceipt,
    },
    walletClient: {
      sendTransaction: boundary.sendTransaction,
      signTypedData: boundary.signTypedData,
    },
  })),
  isWriteContext: vi.fn(() => true),
}));
vi.mock("../../src/operations/chain-access.js", () => ({
  createPublicClientForRuntimeChain: vi.fn(() => ({ getTransactionReceipt: boundary.getReceipt })),
}));
vi.mock("../../src/uniswap-v4/deployments.js", () => ({
  getUniswapV4Deployment: vi.fn(() => ({
    chainId: 4663,
    permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
    poolManager: "0x4444444444444444444444444444444444444444",
    positionManager: "0x3333333333333333333333333333333333333333",
    stateView: "0x5555555555555555555555555555555555555555",
  })),
}));
vi.mock("../../src/uniswap-v4/state.js", () => ({
  createUniswapV4StateReader: vi.fn(() => ({
    readPoolSnapshot: boundary.readPoolSnapshot,
    readPositionSnapshot: boundary.readPositionSnapshot,
  })),
}));
vi.mock("../../src/evm/services.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/evm/services.js")>()),
  getPublicClientCached: boundary.getBalanceClient,
}));

import { completed } from "../../src/api/operations/uniswap-v4-resume-state.js";
import { uniswapV4PoolIdSchema } from "../../src/api/schemas/uniswap-v4/primitives.js";
import { uniswapV4ReconciliationSchema } from "../../src/api/schemas/uniswap-v4/simulation.js";
import { executeUniswapV4WritePlan } from "../../src/tools/uniswap-v4/write-executor.js";
import { hashUniswapV4WritePlan } from "../../src/tools/uniswap-v4/write-plans.js";
import { uniswapV4PersistedWritePlanSchema } from "../../src/tools/uniswap-v4/write-schemas.js";
import { getPoolIdentity } from "../../src/uniswap-v4/sdk-adapter-api.js";
import {
  EVENT_FIXTURE_ZERO_ADDRESS,
  createModifyLiquidityEvent,
  createTransferEvent,
} from "./event-fixtures.js";
import {
  BLOCK_NUMBER,
  createFixtureReadClient,
  poolKey,
  sourceBlock,
  deployment as stateDeployment,
} from "./state-fixtures.js";

const HASH = `0x${"33".repeat(32)}` as const;

function receiptPoolId(value: string): Hex {
  const poolId = uniswapV4PoolIdSchema.parse(value);
  if (!isHex(poolId, { strict: true })) throw new Error("receipt pool ID must be hex");
  return poolId;
}

function canonicalPlan() {
  const base = plan("mint");
  const candidate = uniswapV4PersistedWritePlanSchema.parse({
    ...base,
    expectedDeltas: {
      ...base.expectedDeltas,
      liquidityDelta: "4",
    },
    operation: { ...base.operation, poolKey, sourceBlock },
    poolId: getPoolIdentity(poolKey).poolId,
    sourceBlock,
  });
  return uniswapV4PersistedWritePlanSchema.parse({
    ...candidate,
    planHash: hashUniswapV4WritePlan(candidate),
  });
}

function canonicalReceipt(
  persistedPlan: ReturnType<typeof canonicalPlan>,
  status: "reverted" | "success" = "success"
) {
  const deployment = {
    chainId: persistedPlan.deployment.chainId,
    poolManager: persistedPlan.deployment.poolManager,
    positionManager: persistedPlan.deployment.positionManager,
  };
  return {
    blockHash: sourceBlock.blockHash,
    blockNumber: BLOCK_NUMBER,
    logs:
      status === "success"
        ? [
            createModifyLiquidityEvent({
              blockNumber: BLOCK_NUMBER,
              deployment,
              logIndex: 0,
              poolId: receiptPoolId(persistedPlan.poolId),
              salt: `0x${"00".repeat(32)}`,
              sender: persistedPlan.account,
              transactionHash: HASH,
            }),
            createTransferEvent({
              blockNumber: BLOCK_NUMBER,
              deployment,
              from: EVENT_FIXTURE_ZERO_ADDRESS,
              logIndex: 1,
              to: persistedPlan.account,
              tokenId: 1n,
              transactionHash: HASH,
            }),
          ]
        : [],
    status,
    to: persistedPlan.deployment.positionManager,
    transactionHash: HASH,
  };
}

function finalProgress(persistedPlan: ReturnType<typeof canonicalPlan>) {
  return {
    completed: {
      final: {
        dataHash: `0x${"aa".repeat(32)}`,
        kind: "transaction" as const,
        to: persistedPlan.deployment.positionManager,
        txHash: HASH,
        value: "0",
      },
    },
    nextActionIndex: 3,
  };
}

function payload(result: CallToolResult): {
  readonly error?: unknown;
  readonly reconciliation?: unknown;
} {
  const entry = result.content[0];
  if (entry === undefined || !("text" in entry)) throw new Error("expected text result");
  const parsed: unknown = JSON.parse(entry.text);
  if (!isPayload(parsed)) throw new Error("expected object payload");
  return parsed;
}

function isPayload(
  value: unknown
): value is { readonly error?: unknown; readonly reconciliation?: unknown } {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

describe("Uniswap v4 direct/prepared completion parity", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const state = await vi.importActual<typeof import("../../src/uniswap-v4/state.js")>(
      "../../src/uniswap-v4/state.js"
    );
    const reader = state.createUniswapV4StateReader({
      deployment: stateDeployment,
      readClient: createFixtureReadClient(),
    });
    boundary.readPoolSnapshot.mockImplementation(reader.readPoolSnapshot);
    boundary.readPositionSnapshot.mockImplementation(reader.readPositionSnapshot);
    boundary.getBalanceClient.mockReturnValue({ readContract: boundary.readContract });
    boundary.readContract.mockResolvedValue(10n);
    boundary.sendTransaction.mockResolvedValueOnce(`0x${"01".repeat(32)}`);
    boundary.sendTransaction.mockResolvedValueOnce(`0x${"02".repeat(32)}`);
    boundary.sendTransaction.mockResolvedValueOnce(HASH);
    boundary.signTypedData.mockResolvedValue(`0x${"11".repeat(65)}`);
    boundary.waitForReceipt.mockResolvedValue({ status: "success" });
  });

  it("Given schema-derived receipt, state, and balance boundaries, when direct and prepared entries complete, then both parse and preserve the same reconciliation facts", async () => {
    const persistedPlan = canonicalPlan();
    boundary.getReceipt.mockResolvedValue(canonicalReceipt(persistedPlan));

    const direct = payload(await executeUniswapV4WritePlan(persistedPlan));
    const prepared = await completed(persistedPlan, finalProgress(persistedPlan));
    if (!prepared.completed) throw new Error("expected completed prepared operation");
    const directReconciliation = uniswapV4ReconciliationSchema.parse(direct.reconciliation);
    const preparedReconciliation = uniswapV4ReconciliationSchema.parse(
      prepared.result.reconciliation
    );

    expect(directReconciliation).toEqual(preparedReconciliation);
    expect(directReconciliation).toMatchObject({
      actualDeltas: {
        liquidityDelta: { status: "available", value: "4" },
        nativeValueDelta: { status: "unavailable" },
        token0Delta: { status: "unavailable" },
        token1Delta: { status: "available", value: "0" },
      },
      decodedEvents: [
        { kind: "modifyLiquidity", liquidityDelta: "4" },
        { action: "mint", kind: "positionLifecycle", tokenId: "1" },
      ],
      matchesExpected: {
        matchesExpected: null,
        status: "unavailable",
        unavailable: ["token0Delta", "nativeValueDelta"],
      },
      postState: {
        pool: { status: "available", value: { sourceBlock } },
        position: { status: "available", value: { sourceBlock, tokenId: "1" } },
      },
      receipt: { block: sourceBlock, transactionHash: HASH },
      receiptBlock: sourceBlock,
    });
  });

  it("Given unavailable required post-state or a reverted receipt, when either real completion entry runs, then both expose the same typed reconciliation error", async () => {
    const persistedPlan = canonicalPlan();
    boundary.getReceipt.mockResolvedValue(canonicalReceipt(persistedPlan));
    boundary.readPoolSnapshot.mockRejectedValueOnce(new Error("unavailable"));
    const directUnavailable = payload(await executeUniswapV4WritePlan(persistedPlan));
    boundary.readPoolSnapshot.mockRejectedValueOnce(new Error("unavailable"));
    const preparedUnavailable = completed(persistedPlan, finalProgress(persistedPlan));

    expect(directUnavailable.error).toBe("UNISWAP_V4_RECONCILIATION_INCOMPLETE");
    await expect(preparedUnavailable).rejects.toMatchObject({
      code: "UNISWAP_V4_RECONCILIATION_INCOMPLETE",
    });

    boundary.getReceipt.mockResolvedValue(canonicalReceipt(persistedPlan, "reverted"));
    boundary.sendTransaction.mockResolvedValueOnce(`0x${"01".repeat(32)}`);
    boundary.sendTransaction.mockResolvedValueOnce(`0x${"02".repeat(32)}`);
    boundary.sendTransaction.mockResolvedValueOnce(HASH);
    const directReverted = payload(await executeUniswapV4WritePlan(persistedPlan));
    const preparedReverted = completed(persistedPlan, finalProgress(persistedPlan));

    expect(directReverted.error).toBe("UNISWAP_V4_RECEIPT_REVERTED");
    await expect(preparedReverted).rejects.toMatchObject({
      code: "UNISWAP_V4_RECEIPT_REVERTED",
    });
  });
});
