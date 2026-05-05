import { privateKeyToAccount } from "viem/accounts";
import { describe, expect, it, vi } from "vitest";
import type { WalletState } from "../../src/types/wallet.js";

const state = {
  mode: "private-key" as const,
  address: "0x0000000000000000000000000000000000000001",
  chainId: 8453,
  accountIndex: 0,
  addressIndex: 0,
} satisfies WalletState;

const account = privateKeyToAccount(
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
);

const initializeWalletInternal =
  vi.fn<
    (config: {
      chainId: number;
      accountIndex: number;
      addressIndex: number;
      privateKey?: string;
      mnemonic?: string;
    }) => Promise<void>
  >();
const getWalletStateInternal = vi.fn(() => state);
const getActiveAccountInternal = vi.fn(() => account);
const activateWalletInternal = vi.fn<
  (params: {
    privateKey?: string;
    mnemonic?: string;
    accountIndex?: number;
    addressIndex?: number;
  }) => Promise<typeof state>
>(async () => state);
const deactivateWalletInternal = vi.fn<() => Promise<void>>(async () => {
  return;
});
const getPersistedKeyForSubprocessInternal = vi.fn<() => Promise<string | null>>(
  async () => "0xfeed"
);

vi.mock("../../src/wallet/persistence-internal.js", () => ({
  initializeWalletInternal,
  getWalletStateInternal,
  getActiveAccountInternal,
  activateWalletInternal,
  deactivateWalletInternal,
  getPersistedKeyForSubprocessInternal,
}));

describe("LegacyWalletBackend", () => {
  it("delegates each method to persistence internals", async () => {
    const { LegacyWalletBackend } = await import("../../src/wallet/legacy-backend.js");

    const backend = new LegacyWalletBackend();
    const initConfig = { chainId: 1, accountIndex: 2, addressIndex: 3, privateKey: "0xabc" };
    const activateParams = { mnemonic: "test test", accountIndex: 4, addressIndex: 5 };

    expect(backend.info.type).toBe("legacy");
    expect(backend.info.reason).toMatch(/fallback|unavailable/i);

    await backend.initialize(initConfig);
    expect(initializeWalletInternal).toHaveBeenCalledWith(initConfig);

    expect(backend.getState()).toBe(state);
    expect(getWalletStateInternal).toHaveBeenCalledTimes(1);

    expect(backend.getAccount()).toBe(account);
    expect(getActiveAccountInternal).toHaveBeenCalledTimes(1);

    await expect(backend.activate(activateParams)).resolves.toBe(state);
    expect(activateWalletInternal).toHaveBeenCalledWith(activateParams);

    await backend.deactivate();
    expect(deactivateWalletInternal).toHaveBeenCalledTimes(1);

    await expect(backend.getKeyForSubprocess()).resolves.toBe("0xfeed");
    expect(getPersistedKeyForSubprocessInternal).toHaveBeenCalledTimes(1);
  });
});
