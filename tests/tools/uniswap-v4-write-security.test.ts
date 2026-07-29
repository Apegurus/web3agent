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

import { getUniswapV4ToolDefinitions } from "../../src/tools/uniswap-v4/index.js";
import { executeUniswapV4WritePlan } from "../../src/tools/uniswap-v4/write-executor.js";
import { getUniswapV4Deployment } from "../../src/uniswap-v4/deployments.js";
import { executeWrite } from "../../src/utils/write.js";
import { appendAuditLog } from "../../src/wallet/audit.js";
import { confirmationQueue } from "../../src/wallet/confirmation.js";
import { createWriteSecurityPlan } from "./uniswap-v4-write-security-fixtures.js";

function json(result: CallToolResult): Record<string, unknown> {
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

describe("Uniswap v4 write security boundaries", () => {
  beforeEach(async () => {
    confirmationQueue.flushAll();
    await confirmationQueue.flushPendingPersists();
    confirmationQueue.enabled = true;
    confirmationQueue.ttlMs = 30 * 60 * 1000;
    vi.clearAllMocks();
    wallet.waitForTransactionReceipt.mockResolvedValue({ status: "success" });
    wallet.getTransactionReceipt.mockResolvedValue({
      blockHash: `0x${"aa".repeat(32)}`,
      blockNumber: 16437583n,
      logs: [],
      status: "success",
      to: getUniswapV4Deployment(4663).positionManager,
      transactionHash: `0x${"01".repeat(32)}`,
    });
    reconciliation.reconcile.mockResolvedValue({});
  });

  it("Given a queued burn, when denied, then it records no signer or PositionManager activity", async () => {
    const queued = await executeWrite({
      description: "Burn Uniswap v4 position",
      executor: executeUniswapV4WritePlan,
      params: createWriteSecurityPlan("burn"),
      riskLevel: "financial",
      toolName: "uniswap_v4_burn_position",
    });
    const id = json(queued).id;
    if (typeof id !== "string") throw new Error("Expected confirmation ID");

    expect(confirmationQueue.deny(id)).toBe(true);
    expect(wallet.signTypedData).not.toHaveBeenCalled();
    expect(wallet.sendTransaction).not.toHaveBeenCalled();
    expect(confirmationQueue.list()).toHaveLength(0);
    expect(appendAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "DENIED", operationType: "uniswap_v4_burn_position" })
    );
  });

  it("Given a queued burn past its TTL, when expired instead of executed, then it preserves the no-wallet boundary", async () => {
    confirmationQueue.ttlMs = -1;
    const queued = await executeWrite({
      description: "Burn Uniswap v4 position",
      executor: executeUniswapV4WritePlan,
      params: createWriteSecurityPlan("burn"),
      riskLevel: "financial",
      toolName: "uniswap_v4_burn_position",
    });
    const id = json(queued).id;
    if (typeof id !== "string") throw new Error("Expected confirmation ID");
    const confirmation = confirmationQueue.confirm(id);
    if (confirmation === null) throw new Error("Expected queued burn confirmation");

    expect(confirmation.stale).toBe(true);
    confirmationQueue.expire(id);
    expect(wallet.signTypedData).not.toHaveBeenCalled();
    expect(wallet.sendTransaction).not.toHaveBeenCalled();
    expect(appendAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "EXPIRED", operationType: "uniswap_v4_burn_position" })
    );
  });

  it("Given confirmations disabled, when a burn is requested, then existing immediate-execution semantics run its persisted plan", async () => {
    confirmationQueue.enabled = false;
    wallet.sendTransaction.mockResolvedValueOnce(`0x${"01".repeat(32)}`);

    const result = await executeWrite({
      description: "Burn Uniswap v4 position",
      executor: executeUniswapV4WritePlan,
      params: createWriteSecurityPlan("burn"),
      riskLevel: "financial",
      toolName: "uniswap_v4_burn_position",
    });

    expect(result.isError).toBe(false);
    expect(json(result).status).toBe("completed");
    expect(wallet.sendTransaction).toHaveBeenCalledTimes(1);
  });

  it("Given an approval revert, when executing a confirmed mint plan, then reports the failed stage and omits the final call", async () => {
    wallet.sendTransaction.mockResolvedValueOnce(`0x${"01".repeat(32)}`);
    wallet.waitForTransactionReceipt.mockResolvedValueOnce({ status: "reverted" });

    const result = await executeUniswapV4WritePlan(createWriteSecurityPlan("mint", true));

    expect(result.isError).toBe(true);
    expect(json(result)).toMatchObject({
      details: {
        receipts: [{ stage: "erc20Approval", status: "reverted" }],
        stage: "erc20Approval",
      },
      error: "UNISWAP_V4_EXECUTION_FAILED",
    });
    expect(wallet.sendTransaction).toHaveBeenCalledTimes(1);
  });

  it("Given malformed tool input, when a write handler is invoked, then validation rejects it before it can queue or call a wallet", async () => {
    const tool = getUniswapV4ToolDefinitions().find(
      (entry) => entry.name === "uniswap_v4_mint_position"
    );
    if (tool === undefined) throw new Error("Expected mint tool definition");

    const result = await tool.handler({ chainId: 4663 });

    expect(result.isError).toBe(true);
    expect(json(result).error).toBe("INVALID_PARAMS");
    expect(wallet.sendTransaction).not.toHaveBeenCalled();
    expect(wallet.signTypedData).not.toHaveBeenCalled();
  });
});
