import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/wallet/persistence.js", () => ({
  getWalletState: vi.fn(),
}));

vi.mock("../../src/wallet/confirmation.js", () => ({
  confirmationQueue: {
    enqueue: vi.fn(),
  },
}));

import { executeWrite } from "../../src/utils/write.js";
import { confirmationQueue } from "../../src/wallet/confirmation.js";
import { getWalletState } from "../../src/wallet/persistence.js";

const mockGetWalletState = vi.mocked(getWalletState);
const mockEnqueue = vi.mocked(confirmationQueue.enqueue);

describe("executeWrite", () => {
  const dummyExecutor = vi.fn<(params: Record<string, unknown>) => Promise<CallToolResult>>();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns WALLET_READ_ONLY error when wallet is in read-only mode", async () => {
    mockGetWalletState.mockReturnValue({
      mode: "read-only",
      chainId: 1,
      accountIndex: 0,
      addressIndex: 0,
    });

    const result = await executeWrite({
      toolName: "send_tx",
      description: "Send 1 ETH",
      params: { to: "0xabc", value: "1" },
      executor: dummyExecutor,
    });

    expect(result.isError).toBe(true);
    const text = (result.content[0] as { text: string }).text;
    const parsed = JSON.parse(text);
    expect(parsed.error).toBe("WALLET_READ_ONLY");
    expect(mockEnqueue).not.toHaveBeenCalled();
    expect(dummyExecutor).not.toHaveBeenCalled();
  });

  it("enqueues operation and returns pending_confirmation when confirmation is enabled", async () => {
    mockGetWalletState.mockReturnValue({
      mode: "private-key",
      address: "0xWALLET",
      chainId: 1,
      accountIndex: 0,
      addressIndex: 0,
    });

    mockEnqueue.mockReturnValue({
      queued: true,
      id: "op-123",
      summary: "send_tx: Send 1 ETH",
    });

    const result = await executeWrite({
      toolName: "send_tx",
      description: "Send 1 ETH",
      params: { to: "0xabc", value: "1" },
      executor: dummyExecutor,
    });

    expect(result.isError).toBe(false);
    const text = (result.content[0] as { text: string }).text;
    const parsed = JSON.parse(text);
    expect(parsed.status).toBe("pending_confirmation");
    expect(parsed.id).toBe("op-123");
    expect(dummyExecutor).not.toHaveBeenCalled();
  });

  it("calls executor directly when confirmation is disabled (bypassed)", async () => {
    mockGetWalletState.mockReturnValue({
      mode: "private-key",
      address: "0xWALLET",
      chainId: 1,
      accountIndex: 0,
      addressIndex: 0,
    });

    mockEnqueue.mockReturnValue({
      queued: false,
      id: null,
      summary: "Confirmation bypassed: Send 1 ETH",
    });

    const executorResult: CallToolResult = {
      content: [{ type: "text", text: "tx_hash: 0xdef" }],
      isError: false,
    };
    dummyExecutor.mockResolvedValue(executorResult);

    const result = await executeWrite({
      toolName: "send_tx",
      description: "Send 1 ETH",
      params: { to: "0xabc", value: "1" },
      executor: dummyExecutor,
    });

    expect(dummyExecutor).toHaveBeenCalledWith({ to: "0xabc", value: "1" });
    expect(result).toEqual(executorResult);
  });

  it("passes walletAddress from wallet state to confirmationQueue.enqueue", async () => {
    const walletAddress = "0xMyWalletAddress";
    mockGetWalletState.mockReturnValue({
      mode: "private-key",
      address: walletAddress,
      chainId: 1,
      accountIndex: 0,
      addressIndex: 0,
    });

    mockEnqueue.mockReturnValue({
      queued: true,
      id: "op-456",
      summary: "swap: Swap tokens",
    });

    await executeWrite({
      toolName: "swap",
      description: "Swap tokens",
      params: { amount: "100" },
      executor: dummyExecutor,
    });

    expect(mockEnqueue).toHaveBeenCalledWith(
      "swap",
      "Swap tokens",
      { amount: "100" },
      dummyExecutor,
      walletAddress
    );
  });
});
