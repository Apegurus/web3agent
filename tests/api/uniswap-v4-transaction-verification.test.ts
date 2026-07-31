import { keccak256 } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getConfirmedReceipt } from "../../src/api/operations/shared.js";
import { verifyTransaction } from "../../src/api/operations/uniswap-v4-transaction-verification.js";
import type { PreparedTransactionAction } from "../../src/api/types.js";
import { ACCOUNT, POSITION_MANAGER, plan } from "./uniswap-v4-lifecycle-fixtures.js";

const client = vi.hoisted(() => ({
  getTransaction: vi.fn(),
  getTransactionReceipt: vi.fn(),
}));

vi.mock("../../src/operations/chain-access.js", () => ({
  createPublicClientForRuntimeChain: () => client,
}));

const TX_HASH = `0x${"12".repeat(32)}` as const;

describe("Uniswap v4 confirmed transaction verification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client.getTransactionReceipt.mockResolvedValue({
      status: "success",
      to: POSITION_MANAGER,
      transactionHash: TX_HASH,
    });
  });

  it("Given signature-derived calldata without a prepared data field When checking its receipt Then non-empty input is left for specialized verification", async () => {
    const action: PreparedTransactionAction = {
      id: "dynamic-submit",
      label: "Submit signed permit",
      tx: { chainId: 4663, from: ACCOUNT, to: POSITION_MANAGER, value: "0" },
      type: "transaction",
    };
    client.getTransaction.mockResolvedValue({
      from: ACCOUNT,
      input: "0xdeadbeef",
      to: POSITION_MANAGER,
      value: 0n,
    });

    await expect(
      getConfirmedReceipt(action, { status: "confirmed", txHash: TX_HASH, type: "transaction" })
    ).resolves.toMatchObject({ status: "success" });
  });

  it("Given a confirmed hash submitted by another account When checking its receipt Then generic verification rejects the sender mismatch", async () => {
    const action: PreparedTransactionAction = {
      id: "sender-bound",
      label: "Submit sender-bound transaction",
      tx: { chainId: 4663, from: ACCOUNT, to: POSITION_MANAGER, value: "0" },
      type: "transaction",
    };
    client.getTransaction.mockResolvedValue({
      from: "0x9999999999999999999999999999999999999999",
      input: "0x",
      to: POSITION_MANAGER,
      value: 0n,
    });

    await expect(
      getConfirmedReceipt(action, { status: "confirmed", txHash: TX_HASH, type: "transaction" })
    ).rejects.toThrow("prepared sender");
  });

  it("Given a canonical PositionManager action When confirming real calldata Then the verifier accepts its sender, target, value, and input", async () => {
    const persisted = plan("collect");
    const planned = persisted.actions[0];
    if (planned?.kind !== "positionManager") throw new Error("expected PositionManager action");
    const canonical = {
      ...persisted,
      actions: [{ ...planned, dataHash: keccak256(planned.data) }],
    };
    client.getTransaction.mockResolvedValue({
      from: ACCOUNT,
      input: planned.data,
      to: POSITION_MANAGER,
      value: 0n,
    });

    await expect(
      verifyTransaction(canonical, "uniswap-v4:collect:0", {
        status: "confirmed",
        txHash: TX_HASH,
        type: "transaction",
      })
    ).resolves.toMatchObject({ status: "success" });
  });
});
