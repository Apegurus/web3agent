import { beforeEach, describe, expect, it, vi } from "vitest";

const viemAccountMocks = vi.hoisted(() => ({
  generatePrivateKey: vi.fn(),
  privateKeyToAccount: vi.fn(),
  generateMnemonic: vi.fn(),
  mnemonicToAccount: vi.fn(),
  english: {},
}));

const configMocks = vi.hoisted(() => ({
  getConfig: vi.fn().mockReturnValue({ chainId: 1 }),
  tryGetConfig: vi.fn().mockReturnValue({ chainId: 1 }),
}));

const persistenceMocks = vi.hoisted(() => ({
  activateWallet: vi.fn(),
  deactivateWallet: vi.fn(),
  getWalletState: vi.fn(),
  getActiveAccount: vi.fn(),
}));

const confirmationQueueMock = vi.hoisted(() => ({
  enabled: true,
  enqueue: vi.fn(),
  confirm: vi.fn(),
  complete: vi.fn(),
  deny: vi.fn(),
  list: vi.fn(),
  pruneExpired: vi.fn(),
  registerExecutor: vi.fn(),
}));

vi.mock("viem/accounts", () => ({
  english: viemAccountMocks.english,
  generatePrivateKey: (...args: unknown[]) => viemAccountMocks.generatePrivateKey(...args),
  privateKeyToAccount: (...args: unknown[]) => viemAccountMocks.privateKeyToAccount(...args),
  generateMnemonic: (...args: unknown[]) => viemAccountMocks.generateMnemonic(...args),
  mnemonicToAccount: (...args: unknown[]) => viemAccountMocks.mnemonicToAccount(...args),
}));

vi.mock("../../src/wallet/persistence.js", () => persistenceMocks);

vi.mock("../../src/wallet/confirmation.js", () => ({
  confirmationQueue: confirmationQueueMock,
  registerExecutor: (...args: unknown[]) => confirmationQueueMock.registerExecutor(...args),
}));

vi.mock("../../src/config/env.js", () => ({
  getConfig: (...args: unknown[]) => configMocks.getConfig(...args),
  tryGetConfig: (...args: unknown[]) => configMocks.tryGetConfig(...args),
}));

describe("wallet tool handlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    confirmationQueueMock.enabled = true;
    confirmationQueueMock.enqueue.mockReturnValue({
      queued: true,
      id: "pending-op-id",
      summary: "Queued [wallet_set_confirmation]: Disable write confirmation",
    });
    persistenceMocks.getWalletState.mockReturnValue({
      mode: "private-key",
      chainId: 8453,
      address: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    });
    persistenceMocks.getActiveAccount.mockReturnValue({
      address: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
    });
  });

  it("walletGenerate returns address, privateKey, and warning", async () => {
    viemAccountMocks.generatePrivateKey.mockReturnValue(
      "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    );
    viemAccountMocks.privateKeyToAccount.mockReturnValue({
      address: "0x1111111111111111111111111111111111111111",
    });

    const { walletGenerate } = await import("../../src/tools/wallet/index.js");
    const result = await walletGenerate();

    expect(result.isError).toBe(false);
    const payload = JSON.parse((result.content[0] as { text: string }).text);
    expect(payload.address).toBe("0x1111111111111111111111111111111111111111");
    expect(payload.privateKey).toBe(
      "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    );
    expect(payload.warning).toContain("Private key returned once");
  });

  it("walletGenerateMnemonic returns mnemonic, firstAddress, and warning", async () => {
    viemAccountMocks.generateMnemonic.mockReturnValue(
      "test test test test test test test test test test test junk"
    );
    viemAccountMocks.mnemonicToAccount.mockReturnValue({
      address: "0x2222222222222222222222222222222222222222",
    });

    const { walletGenerateMnemonic } = await import("../../src/tools/wallet/index.js");
    const result = await walletGenerateMnemonic();

    expect(result.isError).toBe(false);
    const payload = JSON.parse((result.content[0] as { text: string }).text);
    expect(payload.mnemonic).toBe("test test test test test test test test test test test junk");
    expect(payload.firstAddress).toBe("0x2222222222222222222222222222222222222222");
    expect(payload.warning).toContain("Mnemonic returned once");
  });

  it("walletFromMnemonic returns derived address and path for valid mnemonic", async () => {
    viemAccountMocks.mnemonicToAccount.mockReturnValue({
      address: "0x3333333333333333333333333333333333333333",
    });

    const { walletFromMnemonic } = await import("../../src/tools/wallet/index.js");
    const result = await walletFromMnemonic({
      mnemonic: "test test test test test test test test test test test junk",
      accountIndex: 1,
      addressIndex: 2,
    });

    expect(result.isError).toBe(false);
    const payload = JSON.parse((result.content[0] as { text: string }).text);
    expect(payload.address).toBe("0x3333333333333333333333333333333333333333");
    expect(payload.derivationPath).toBe("m/44'/60'/1'/0/2");
  });

  it("walletFromMnemonic returns error for invalid mnemonic", async () => {
    viemAccountMocks.mnemonicToAccount.mockImplementation(() => {
      throw new Error("Invalid mnemonic");
    });

    const { walletFromMnemonic } = await import("../../src/tools/wallet/index.js");
    const result = await walletFromMnemonic({ mnemonic: "invalid words" });

    expect(result.isError).toBe(true);
    const payload = JSON.parse((result.content[0] as { text: string }).text);
    expect(payload.error).toBe("MNEMONIC_RESOLVE_FAILED");
  });

  it("walletGetActive returns address, chainId, and mode", async () => {
    persistenceMocks.getWalletState.mockReturnValue({
      mode: "private-key",
      chainId: 1,
      address: "0x4444444444444444444444444444444444444444",
    });

    const { walletGetActive } = await import("../../src/tools/wallet/index.js");
    const result = await walletGetActive();

    expect(result.isError).toBe(false);
    const payload = JSON.parse((result.content[0] as { text: string }).text);
    expect(payload).toEqual({
      address: "0x4444444444444444444444444444444444444444",
      chainId: 1,
      mode: "private-key",
    });
  });

  it("walletActivate returns pending_confirmation when confirmation is enabled", async () => {
    confirmationQueueMock.enabled = true;

    const { walletActivate } = await import("../../src/tools/wallet/index.js");
    const result = await walletActivate({
      privateKey: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    });

    expect(result.isError).toBe(false);
    expect(confirmationQueueMock.enqueue).toHaveBeenCalledTimes(1);
    expect(persistenceMocks.activateWallet).not.toHaveBeenCalled();
    const payload = JSON.parse((result.content[0] as { text: string }).text);
    expect(payload.status).toBe("pending_confirmation");
    expect(payload.id).toBe("pending-op-id");
  });

  it("walletActivate activates directly when confirmation is disabled", async () => {
    confirmationQueueMock.enabled = false;
    confirmationQueueMock.enqueue.mockReturnValue({
      queued: false,
      id: "wallet-activate-direct",
      summary: "Executed [wallet_activate]: Activate wallet from private key",
    });
    persistenceMocks.activateWallet.mockResolvedValue({
      address: "0x5555555555555555555555555555555555555555",
      chainId: 8453,
      mode: "private-key",
    });

    const { walletActivate } = await import("../../src/tools/wallet/index.js");
    const result = await walletActivate({
      privateKey: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    });

    expect(result.isError).toBe(false);
    expect(confirmationQueueMock.enqueue).toHaveBeenCalledTimes(1);
    expect(persistenceMocks.activateWallet).toHaveBeenCalledWith({
      privateKey: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      mnemonic: undefined,
      accountIndex: undefined,
      addressIndex: undefined,
    });
    const payload = JSON.parse((result.content[0] as { text: string }).text);
    expect(payload).toEqual({
      address: "0x5555555555555555555555555555555555555555",
      chainId: 8453,
      mode: "private-key",
    });
  });

  it("walletSetConfirmation enables confirmation directly without queueing", async () => {
    confirmationQueueMock.enabled = false;

    const { walletSetConfirmation } = await import("../../src/tools/wallet/index.js");
    const result = await walletSetConfirmation({ enabled: true });

    expect(result.isError).toBe(false);
    expect(confirmationQueueMock.enabled).toBe(true);
    expect(confirmationQueueMock.enqueue).not.toHaveBeenCalled();
    const payload = JSON.parse((result.content[0] as { text: string }).text);
    expect(payload.confirmationRequired).toBe(true);
    expect(payload.message).toContain("Write confirmation enabled");
  });

  it("walletSetConfirmation returns a no-op response when confirmation is already disabled", async () => {
    confirmationQueueMock.enabled = false;

    const { walletSetConfirmation } = await import("../../src/tools/wallet/index.js");
    const result = await walletSetConfirmation({ enabled: false });

    expect(result.isError).toBe(false);
    expect(confirmationQueueMock.enabled).toBe(false);
    expect(confirmationQueueMock.enqueue).not.toHaveBeenCalled();
    const payload = JSON.parse((result.content[0] as { text: string }).text);
    expect(payload.confirmationRequired).toBe(false);
    expect(payload.message).toContain("already disabled");
  });

  it("walletSetConfirmation queues disabling confirmation when it is currently enabled", async () => {
    confirmationQueueMock.enabled = true;

    const { walletSetConfirmation } = await import("../../src/tools/wallet/index.js");
    const result = await walletSetConfirmation({ enabled: false });

    expect(result.isError).toBe(false);
    expect(confirmationQueueMock.enabled).toBe(true);
    expect(confirmationQueueMock.enqueue).toHaveBeenCalledTimes(1);
    const payload = JSON.parse((result.content[0] as { text: string }).text);
    expect(payload.status).toBe("pending_confirmation");
    expect(payload.id).toBe("pending-op-id");
  });

  it("transactionList returns empty list when there are no pending operations", async () => {
    confirmationQueueMock.list.mockReturnValue([]);

    const { transactionList } = await import("../../src/tools/wallet/index.js");
    const result = await transactionList();

    expect(result.isError).toBe(false);
    const payload = JSON.parse((result.content[0] as { text: string }).text);
    expect(payload.count).toBe(0);
    expect(payload.operations).toEqual([]);
    expect(confirmationQueueMock.pruneExpired).toHaveBeenCalled();
  });

  it("transactionDeny returns NOT_FOUND for unknown ID", async () => {
    confirmationQueueMock.deny.mockReturnValue(false);

    const { transactionDeny } = await import("../../src/tools/wallet/index.js");
    const result = await transactionDeny({ id: "unknown-id" });

    expect(result.isError).toBe(true);
    const payload = JSON.parse((result.content[0] as { text: string }).text);
    expect(payload.error).toBe("NOT_FOUND");
  });
});
