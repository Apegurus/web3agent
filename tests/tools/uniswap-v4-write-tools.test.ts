import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const wallet = vi.hoisted(() => ({
  getTransactionReceipt: vi.fn(),
  sendTransaction: vi.fn(),
  signTypedData: vi.fn(),
  waitForTransactionReceipt: vi.fn(),
}));
const reconciliation = vi.hoisted(() => ({ reconcile: vi.fn() }));

vi.mock("../../src/utils/atomic-write.js", () => ({
  atomicWriteJson: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../src/wallet/audit.js", () => ({
  appendAuditLog: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../src/wallet/persistence.js", () => ({
  getActiveAccount: vi.fn().mockReturnValue({
    address: "0x1111111111111111111111111111111111111111",
  }),
  getWalletState: vi.fn().mockReturnValue({
    accountIndex: 0,
    address: "0x1111111111111111111111111111111111111111",
    addressIndex: 0,
    chainId: 4663,
    mode: "private-key",
  }),
}));

vi.mock("../../src/tools/shared/write-context.js", () => ({
  buildWriteContext: vi.fn(() => ({
    account: { address: "0x1111111111111111111111111111111111111111" },
    chain: { id: 4663 },
    chainId: 4663,
    publicClient: {
      getTransactionReceipt: wallet.getTransactionReceipt,
      waitForTransactionReceipt: wallet.waitForTransactionReceipt,
    },
    walletClient: {
      sendTransaction: wallet.sendTransaction,
      signTypedData: wallet.signTypedData,
    },
  })),
  isWriteContext: vi.fn(() => true),
}));
vi.mock("../../src/uniswap-v4/reconcile-confirmed.js", () => ({
  assertUniswapV4ReconciliationComplete: () => undefined,
  reconcileUniswapV4ConfirmedReceipt: (...args: unknown[]) => reconciliation.reconcile(...args),
}));

import { executeUniswapV4WritePlan } from "../../src/tools/uniswap-v4/write-executor.js";
import { toPublicUniswapV4Deployment } from "../../src/tools/uniswap-v4/write-planner.js";
import { hashUniswapV4WritePlan } from "../../src/tools/uniswap-v4/write-plans.js";
import { getUniswapV4Deployment } from "../../src/uniswap-v4/deployments.js";
import { atomicWriteJson } from "../../src/utils/atomic-write.js";
import { executeWrite } from "../../src/utils/write.js";
import { appendAuditLog } from "../../src/wallet/audit.js";
import { confirmationQueue } from "../../src/wallet/confirmation.js";
import { mintPlan } from "./uniswap-v4-write-tools-fixtures.js";

function text(result: CallToolResult): Record<string, unknown> {
  const entry = result.content[0];
  if (entry === undefined || !("text" in entry)) throw new Error("Expected text tool result");
  const parsed: unknown = JSON.parse(entry.text);
  if (!isRecord(parsed)) {
    throw new Error("Expected object tool payload");
  }
  return parsed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

describe("Uniswap v4 server-wallet writes", () => {
  beforeEach(async () => {
    confirmationQueue.flushAll();
    await confirmationQueue.flushPendingPersists();
    confirmationQueue.enabled = true;
    confirmationQueue.ttlMs = 30 * 60 * 1000;
    vi.clearAllMocks();
    wallet.sendTransaction.mockResolvedValueOnce(`0x${"01".repeat(32)}`);
    wallet.sendTransaction.mockResolvedValueOnce(`0x${"02".repeat(32)}`);
    wallet.sendTransaction.mockResolvedValueOnce(`0x${"03".repeat(32)}`);
    wallet.signTypedData.mockResolvedValue(`0x${"44".repeat(65)}`);
    wallet.waitForTransactionReceipt.mockResolvedValue({ status: "success" });
    wallet.getTransactionReceipt.mockResolvedValue({
      blockHash: `0x${"aa".repeat(32)}`,
      blockNumber: 16437583n,
      logs: [],
      status: "success",
      to: getUniswapV4Deployment(4663).positionManager,
      transactionHash: `0x${"03".repeat(32)}`,
    });
    reconciliation.reconcile.mockResolvedValue({
      postState: {
        pool: { status: "available" },
        position: { status: "available" },
      },
      status: "matched",
    });
  });

  it("Given a provenance-rich deployment, when persisting a write plan, then it stores only canonical deployment facts", () => {
    const canonical = getUniswapV4Deployment(4663);
    const persisted = mintPlan(toPublicUniswapV4Deployment(canonical));

    expect(persisted.deployment).toEqual({
      chainId: canonical.chainId,
      permit2: canonical.permit2,
      poolManager: canonical.poolManager,
      positionManager: canonical.positionManager,
      stateView: canonical.stateView,
    });
  });

  it("Given a persisted mint plan, when queued, inspected, and confirmed, then it executes the exact plan only after confirmation", async () => {
    const plan = mintPlan();

    const queued = await executeWrite({
      description: "Mint Uniswap v4 position",
      executor: executeUniswapV4WritePlan,
      params: plan,
      riskLevel: "financial",
      toolName: "uniswap_v4_mint_position",
    });
    const queuedPayload = text(queued);
    const id = queuedPayload.id;
    if (typeof id !== "string") throw new Error("Expected confirmation ID");

    expect(queuedPayload.status).toBe("pending_confirmation");
    expect(wallet.sendTransaction).not.toHaveBeenCalled();
    expect(wallet.signTypedData).not.toHaveBeenCalled();
    expect(confirmationQueue.list()).toHaveLength(1);
    expect(confirmationQueue.list()[0]?.params).toEqual(plan);
    await confirmationQueue.flushPendingPersists();
    expect(atomicWriteJson).toHaveBeenCalledWith(
      expect.any(String),
      expect.arrayContaining([expect.objectContaining({ params: plan })])
    );

    const confirmation = confirmationQueue.confirm(id);
    if (confirmation === null) throw new Error("Expected queued mint confirmation");
    const completed = await confirmation.operation.executor(confirmation.operation.params);
    confirmationQueue.complete(id);

    expect(completed.isError).toBe(false);
    expect(wallet.sendTransaction).toHaveBeenCalledTimes(3);
    expect(wallet.signTypedData).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(text(completed))).not.toContain("44".repeat(65));
    expect(confirmationQueue.list()).toHaveLength(0);
    expect(appendAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "CONFIRMED", operationType: "uniswap_v4_mint_position" })
    );
  });

  it("Given a minimal final executor receipt, when executing a persisted plan, then it reports reconciliation as incomplete instead of completing", async () => {
    wallet.getTransactionReceipt.mockResolvedValueOnce({ status: "success" });

    const result = await executeUniswapV4WritePlan(mintPlan());

    expect(result.isError).toBe(true);
    expect(text(result).error).toBe("UNISWAP_V4_RECONCILIATION_INCOMPLETE");
    expect(wallet.getTransactionReceipt).toHaveBeenCalledWith({
      hash: `0x${"03".repeat(32)}`,
    });
  });

  it("Given a canonical persisted plan, when its hash is tampered, then it rejects before wallet interaction", async () => {
    const plan = mintPlan();
    const tampered = { ...plan, planHash: `0x${"ff".repeat(32)}` };

    const result = await executeUniswapV4WritePlan(tampered);

    expect(result.isError).toBe(true);
    expect(text(result).error).toBe("UNISWAP_V4_PLAN_HASH_MISMATCH");
    expect(wallet.sendTransaction).not.toHaveBeenCalled();
    expect(wallet.signTypedData).not.toHaveBeenCalled();
  });

  it("Given a plan with a rehashed stale deadline, when its executor starts, then it rejects without signing or submitting", async () => {
    const plan = mintPlan();
    const stale = { ...plan, operation: { ...plan.operation, deadline: "1" } };
    const expired = { ...stale, planHash: hashUniswapV4WritePlan(stale) };

    const result = await executeUniswapV4WritePlan(expired);

    expect(result.isError).toBe(true);
    expect(text(result).error).toBe("UNISWAP_V4_DEADLINE_EXPIRED");
    expect(wallet.sendTransaction).not.toHaveBeenCalled();
    expect(wallet.signTypedData).not.toHaveBeenCalled();
  });
});
