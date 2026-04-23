import { beforeEach, describe, expect, it, vi } from "vitest";

const mockActivateWallet = vi.fn();
const mockDeactivateWallet = vi.fn();
const mockGetWalletState = vi.fn();
const mockGetActiveAccount = vi.fn();
const mockConfirmationQueue = {
  enabled: true,
  enqueue: vi.fn(),
};

vi.mock("../../src/wallet/persistence.js", () => ({
  activateWallet: (...args: unknown[]) => mockActivateWallet(...args),
  deactivateWallet: (...args: unknown[]) => mockDeactivateWallet(...args),
  getWalletState: () => mockGetWalletState(),
  getActiveAccount: () => mockGetActiveAccount(),
}));

vi.mock("../../src/wallet/confirmation.js", () => ({
  confirmationQueue: mockConfirmationQueue,
  registerExecutor: vi.fn(),
}));

describe("wallet_activate tool handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetWalletState.mockReturnValue({ mode: "private-key", address: "0xABCD", chainId: 1 });
    mockConfirmationQueue.enabled = false;
    mockConfirmationQueue.enqueue.mockReturnValue({ queued: false, id: null, summary: "" });
  });

  it("rejects when neither privateKey nor mnemonic provided", async () => {
    const { walletActivate } = await import("../../src/tools/wallet/index.js");
    const result = await walletActivate({});
    expect(result.isError).toBe(true);
    const payload = JSON.parse(result.content[0].text as string);
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
    const payload = JSON.parse(result.content[0].text as string);
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
    const payload = JSON.parse(result.content[0].text as string);
    expect(payload.error).toBe("WALLET_ACTIVATE_FAILED");
  });
});

describe("wallet_deactivate tool handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetWalletState.mockReturnValue({ mode: "private-key", address: "0xABCD", chainId: 1 });
    mockConfirmationQueue.enabled = false;
    mockConfirmationQueue.enqueue.mockReturnValue({ queued: false, id: null, summary: "" });
  });

  it("calls deactivateWallet and returns read-only state", async () => {
    mockDeactivateWallet.mockResolvedValueOnce(undefined);
    mockGetWalletState
      .mockReturnValueOnce({ mode: "private-key", address: "0xABCD", chainId: 1 })
      .mockReturnValueOnce({ mode: "private-key", address: "0xABCD", chainId: 1 })
      .mockReturnValueOnce({ mode: "read-only", chainId: 1 });

    const { walletDeactivate } = await import("../../src/tools/wallet/index.js");
    const result = await walletDeactivate();

    expect(result.isError).toBe(false);
    const payload = JSON.parse(result.content[0].text as string);
    expect(payload.mode).toBe("read-only");
    expect(mockDeactivateWallet).toHaveBeenCalled();
  });

  it("returns pending_confirmation when confirmation is enabled", async () => {
    mockConfirmationQueue.enabled = true;
    mockConfirmationQueue.enqueue.mockReturnValueOnce({
      queued: true,
      id: "deactivate-op",
      summary: "Deactivate wallet",
    });

    const { walletDeactivate } = await import("../../src/tools/wallet/index.js");
    const result = await walletDeactivate();

    expect(result.isError).toBe(false);
    const payload = JSON.parse(result.content[0].text as string);
    expect(payload.status).toBe("pending_confirmation");
    expect(payload.id).toBe("deactivate-op");
  });

  it("returns error when deactivateWallet throws", async () => {
    mockDeactivateWallet.mockRejectedValueOnce(new Error("fs error"));

    const { walletDeactivate } = await import("../../src/tools/wallet/index.js");
    const result = await walletDeactivate();

    expect(result.isError).toBe(true);
    const payload = JSON.parse(result.content[0].text as string);
    expect(payload.error).toBe("WALLET_DEACTIVATE_FAILED");
  });
});

describe("wallet_set_confirmation tool handler", () => {
  it("rejects non-boolean enabled param", async () => {
    const { walletSetConfirmation } = await import("../../src/tools/wallet/index.js");
    const result = await walletSetConfirmation({ enabled: "yes" });

    expect(result.isError).toBe(true);
    const payload = JSON.parse(result.content[0].text as string);
    expect(payload.error).toBe("INVALID_PARAMS");
  });

  it("queues disable-confirmation when confirmation is currently enabled", async () => {
    mockConfirmationQueue.enabled = true;
    mockGetWalletState.mockReturnValue({ mode: "private-key", address: "0xABCD", chainId: 1 });
    mockConfirmationQueue.enqueue.mockReturnValue({
      queued: true,
      id: "test-op-id",
      summary: "Disable write confirmation",
    });

    const { walletSetConfirmation } = await import("../../src/tools/wallet/index.js");
    const result = await walletSetConfirmation({ enabled: false });

    expect(result.isError).toBe(false);
    const payload = JSON.parse(result.content[0].text as string);
    expect(payload.status).toBe("pending_confirmation");
    expect(payload.id).toBe("test-op-id");
  });

  it("toggles confirmationQueue.enabled to true", async () => {
    mockConfirmationQueue.enabled = false;

    const { walletSetConfirmation } = await import("../../src/tools/wallet/index.js");
    const result = await walletSetConfirmation({ enabled: true });

    expect(result.isError).toBe(false);
    expect(mockConfirmationQueue.enabled).toBe(true);
    const payload = JSON.parse(result.content[0].text as string);
    expect(payload.confirmationRequired).toBe(true);
  });
});
