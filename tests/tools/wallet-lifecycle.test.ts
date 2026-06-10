import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockActivateWallet = vi.fn();
const mockDeactivateWallet = vi.fn();
const mockDeletePersistedWallet = vi.fn();
const mockGetWalletState = vi.fn();
const mockGetActiveAccount = vi.fn();
const mockHasPersistedWalletKey = vi.fn().mockReturnValue(false);
const mockConfirmationQueue = {
  enabled: true,
  enqueue: vi.fn(),
};

vi.mock("../../src/wallet/persistence.js", () => ({
  activateWallet: (...args: unknown[]) => mockActivateWallet(...args),
  deactivateWallet: (...args: unknown[]) => mockDeactivateWallet(...args),
  deletePersistedWallet: (...args: unknown[]) => mockDeletePersistedWallet(...args),
  getWalletState: () => mockGetWalletState(),
  getActiveAccount: () => mockGetActiveAccount(),
  hasPersistedWalletKey: () => mockHasPersistedWalletKey(),
}));

vi.mock("../../src/wallet/agent-visible-secrets.js", () => ({
  getAgentVisibleSecretsDisabledMessage: () => "agent-visible secrets disabled",
  isAgentVisibleSecretsEnabled: () => true,
}));

vi.mock("../../src/wallet/confirmation.js", () => ({
  confirmationQueue: mockConfirmationQueue,
  registerExecutor: vi.fn(),
}));

function resetWalletMocks(): void {
  mockActivateWallet.mockReset();
  mockDeactivateWallet.mockReset();
  mockDeletePersistedWallet.mockReset();
  mockGetWalletState.mockReset();
  mockGetActiveAccount.mockReset();
  mockHasPersistedWalletKey.mockReset();
  mockConfirmationQueue.enqueue.mockReset();
  mockHasPersistedWalletKey.mockReturnValue(false);
}

function parseTextPayload(result: CallToolResult): Record<string, unknown> {
  const firstContent = result.content[0];
  if (firstContent.type !== "text") {
    throw new Error(`Expected text response, got ${firstContent.type}`);
  }
  const parsed: unknown = JSON.parse(firstContent.text);
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("Expected object response payload");
  }
  return parsed as Record<string, unknown>;
}

describe("wallet_activate tool handler", () => {
  beforeEach(() => {
    resetWalletMocks();
    mockGetWalletState.mockReturnValue({
      mode: "private-key",
      address: "0xABCD",
      chainId: 1,
    });
    mockConfirmationQueue.enabled = false;
    mockConfirmationQueue.enqueue.mockReturnValue({
      queued: false,
      id: null,
      summary: "",
    });
  });

  it("rejects when neither privateKey nor mnemonic provided", async () => {
    const { walletActivate } = await import("../../src/tools/wallet/index.js");
    const result = await walletActivate({});
    expect(result.isError).toBe(true);
    const payload = parseTextPayload(result);
    expect(payload.error).toBe("INVALID_PARAMS");
  });

  it("calls activateWallet with privateKey and returns state", async () => {
    mockActivateWallet.mockResolvedValueOnce({
      mode: "private-key",
      address: "0xABCD",
      chainId: 1,
    });

    const { walletActivate } = await import("../../src/tools/wallet/index.js");
    const result = await walletActivate({
      privateKey: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
    });

    expect(result.isError).toBe(false);
    const payload = parseTextPayload(result);
    expect(payload.address).toBe("0xABCD");
    expect(payload.mode).toBe("private-key");
    expect(mockActivateWallet).toHaveBeenCalledWith(
      expect.objectContaining({
        privateKey: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
      })
    );
  });

  it("calls activateWallet with mnemonic and optional indices", async () => {
    mockActivateWallet.mockResolvedValueOnce({
      mode: "mnemonic",
      address: "0x1234",
      chainId: 8453,
    });

    const { walletActivate } = await import("../../src/tools/wallet/index.js");
    const result = await walletActivate({
      mnemonic: "test test test test test test test test test test test junk",
      accountIndex: 1,
      addressIndex: 2,
    });

    expect(result.isError).toBe(false);
    expect(mockActivateWallet).toHaveBeenCalledWith(
      expect.objectContaining({
        mnemonic: "test test test test test test test test test test test junk",
        accountIndex: 1,
        addressIndex: 2,
      })
    );
  });

  it("returns error when activateWallet throws", async () => {
    mockActivateWallet.mockRejectedValueOnce(new Error("bad key"));

    const { walletActivate } = await import("../../src/tools/wallet/index.js");
    const result = await walletActivate({ privateKey: "invalid" });

    expect(result.isError).toBe(true);
    const payload = parseTextPayload(result);
    expect(payload.error).toBe("WALLET_ACTIVATE_FAILED");
  });
});

describe("wallet_deactivate tool handler", () => {
  beforeEach(() => {
    resetWalletMocks();
    mockGetWalletState.mockReturnValue({
      mode: "private-key",
      address: "0xABCD",
      chainId: 1,
    });
    mockConfirmationQueue.enabled = false;
    mockConfirmationQueue.enqueue.mockReturnValue({
      queued: false,
      id: null,
      summary: "",
    });
  });

  it("calls deactivateWallet and returns read-only state", async () => {
    mockDeactivateWallet.mockResolvedValueOnce(undefined);
    mockGetWalletState.mockReturnValue({ mode: "read-only", chainId: 1 });

    const { walletDeactivate } = await import("../../src/tools/wallet/index.js");
    const result = await walletDeactivate();

    expect(result.isError).toBe(false);
    const payload = parseTextPayload(result);
    expect(payload.mode).toBe("read-only");
    expect(mockDeactivateWallet).toHaveBeenCalled();
  });

  it("does not queue session-local deactivation when confirmation is enabled", async () => {
    mockConfirmationQueue.enabled = true;
    mockDeactivateWallet.mockResolvedValueOnce(undefined);
    mockGetWalletState.mockReturnValue({ mode: "read-only", chainId: 1 });

    const { walletDeactivate } = await import("../../src/tools/wallet/index.js");
    const result = await walletDeactivate();

    expect(result.isError).toBe(false);
    const payload = parseTextPayload(result);
    expect(payload.mode).toBe("read-only");
    expect(mockConfirmationQueue.enqueue).not.toHaveBeenCalled();
  });

  it("returns error when deactivateWallet throws", async () => {
    mockDeactivateWallet.mockRejectedValueOnce(new Error("fs error"));

    const { walletDeactivate } = await import("../../src/tools/wallet/index.js");
    const result = await walletDeactivate();

    expect(result.isError).toBe(true);
    const payload = parseTextPayload(result);
    expect(payload.error).toBe("WALLET_DEACTIVATE_FAILED");
  });
});

describe("wallet_delete tool handler", () => {
  beforeEach(() => {
    resetWalletMocks();
    mockGetWalletState.mockReturnValue({
      mode: "private-key",
      address: "0xABCD",
      chainId: 1,
    });
    mockConfirmationQueue.enabled = false;
    mockConfirmationQueue.enqueue.mockReturnValue({
      queued: false,
      id: null,
      summary: "",
    });
  });

  it("queues permanent deletion when confirmation is enabled", async () => {
    mockConfirmationQueue.enabled = true;
    mockConfirmationQueue.enqueue.mockReturnValueOnce({
      queued: true,
      id: "delete-op",
      summary: "Permanently delete wallet",
    });

    const { walletDelete } = await import("../../src/tools/wallet/index.js");
    const result = await walletDelete();

    expect(result.isError).toBe(false);
    const payload = parseTextPayload(result);
    expect(payload.status).toBe("pending_confirmation");
    expect(payload.id).toBe("delete-op");
    expect(mockDeletePersistedWallet).not.toHaveBeenCalled();
  });

  it("deletes persisted wallet material and returns read-only state", async () => {
    mockDeletePersistedWallet.mockResolvedValueOnce(undefined);
    mockGetWalletState.mockReturnValue({ mode: "read-only", chainId: 1 });

    const { walletDelete } = await import("../../src/tools/wallet/index.js");
    const result = await walletDelete();

    expect(result.isError).toBe(false);
    const payload = parseTextPayload(result);
    expect(payload.mode).toBe("read-only");
    expect(payload.message).toContain("Permanently deleted");
    expect(mockDeletePersistedWallet).toHaveBeenCalled();
  });

  it("returns error when deletePersistedWallet throws", async () => {
    mockDeletePersistedWallet.mockRejectedValueOnce(new Error("fs error"));

    const { walletDelete } = await import("../../src/tools/wallet/index.js");
    const result = await walletDelete();

    expect(result.isError).toBe(true);
    const payload = parseTextPayload(result);
    expect(payload.error).toBe("WALLET_DELETE_FAILED");
  });
});

describe("wallet_set_confirmation tool handler", () => {
  it("rejects non-boolean enabled param", async () => {
    const { walletSetConfirmation } = await import("../../src/tools/wallet/index.js");
    const result = await walletSetConfirmation({ enabled: "yes" });

    expect(result.isError).toBe(true);
    const payload = parseTextPayload(result);
    expect(payload.error).toBe("INVALID_PARAMS");
  });

  it("queues disable-confirmation when confirmation is currently enabled", async () => {
    mockConfirmationQueue.enabled = true;
    mockGetWalletState.mockReturnValue({
      mode: "private-key",
      address: "0xABCD",
      chainId: 1,
    });
    mockConfirmationQueue.enqueue.mockReturnValue({
      queued: true,
      id: "test-op-id",
      summary: "Disable write confirmation",
    });

    const { walletSetConfirmation } = await import("../../src/tools/wallet/index.js");
    const result = await walletSetConfirmation({ enabled: false });

    expect(result.isError).toBe(false);
    const payload = parseTextPayload(result);
    expect(payload.status).toBe("pending_confirmation");
    expect(payload.id).toBe("test-op-id");
  });

  it("toggles confirmationQueue.enabled to true", async () => {
    mockConfirmationQueue.enabled = false;

    const { walletSetConfirmation } = await import("../../src/tools/wallet/index.js");
    const result = await walletSetConfirmation({ enabled: true });

    expect(result.isError).toBe(false);
    expect(mockConfirmationQueue.enabled).toBe(true);
    const payload = parseTextPayload(result);
    expect(payload.confirmationRequired).toBe(true);
  });
});
