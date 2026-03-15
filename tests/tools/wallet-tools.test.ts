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
  confirm: vi.fn(),
  complete: vi.fn(),
  deny: vi.fn(),
  list: vi.fn(),
  pruneExpired: vi.fn(),
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
}));

vi.mock("../../src/config/env.js", () => ({
  getConfig: (...args: unknown[]) => configMocks.getConfig(...args),
  tryGetConfig: (...args: unknown[]) => configMocks.tryGetConfig(...args),
}));

describe("wallet tool handlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    confirmationQueueMock.enabled = true;
    persistenceMocks.getWalletState.mockReturnValue({
      mode: "read-only",
      chainId: 8453,
      address: null,
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

  it("walletSetConfirmation toggles confirmationQueue.enabled", async () => {
    confirmationQueueMock.enabled = true;

    const { walletSetConfirmation } = await import("../../src/tools/wallet/index.js");
    const result = await walletSetConfirmation({ enabled: false });

    expect(result.isError).toBe(false);
    expect(confirmationQueueMock.enabled).toBe(false);
    const payload = JSON.parse((result.content[0] as { text: string }).text);
    expect(payload.confirmationRequired).toBe(false);
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
