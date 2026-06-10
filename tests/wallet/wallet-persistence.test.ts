import { existsSync } from "node:fs";
import { mkdir, readFile, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { privateKeyToAccount } from "viem/accounts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WalletState } from "../../src/types/wallet.js";

const TEST_HOME = join(process.cwd(), "tests/tmp/home-wallet");
const VALID_PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const TEST_ACCOUNT = privateKeyToAccount(VALID_PRIVATE_KEY);
const TEST_STATE = {
  mode: "private-key",
  address: TEST_ACCOUNT.address,
  chainId: 8453,
  accountIndex: 0,
  addressIndex: 0,
} satisfies WalletState;

describe("wallet persistence backend delegation", () => {
  afterEach(() => {
    vi.doUnmock("../../src/wallet/backend-selector.js");
    vi.doUnmock("../../src/wallet/persistence-internal.js");
    vi.resetModules();
  });

  it("delegates public persistence APIs to the selected backend after backend selection", async () => {
    const initialize =
      vi.fn<
        (config: {
          chainId: number;
          accountIndex: number;
          addressIndex: number;
          privateKey?: string;
          mnemonic?: string;
        }) => Promise<void>
      >();
    const activate = vi.fn<
      (params: {
        privateKey?: string;
        mnemonic?: string;
        accountIndex?: number;
        addressIndex?: number;
      }) => Promise<WalletState>
    >(async () => TEST_STATE);
    const deactivate = vi.fn<() => Promise<void>>(async () => undefined);
    const deletePersistedWallet = vi.fn<() => Promise<void>>(async () => undefined);
    const getKeyForSubprocess = vi.fn<() => Promise<string | null>>(async () => "0xfeed");

    vi.doMock("../../src/wallet/backend-selector.js", () => {
      let selected = false;
      const backend = {
        info: { type: "legacy" as const, reason: "test backend" },
        initialize,
        getState: vi.fn(() => TEST_STATE),
        getAccount: vi.fn(() => TEST_ACCOUNT),
        activate,
        deactivate,
        deletePersistedWallet,
        getKeyForSubprocess,
      };

      return {
        selectWalletBackend: vi.fn(async () => {
          selected = true;
          return backend;
        }),
        getWalletBackend: vi.fn(() => {
          if (!selected) {
            throw new Error(
              "[wallet] No wallet backend selected. Call selectWalletBackend() first."
            );
          }
          return backend;
        }),
        NO_WALLET_BACKEND_SELECTED_MESSAGE:
          "[wallet] No wallet backend selected. Call selectWalletBackend() first.",
      };
    });

    const selector = await import("../../src/wallet/backend-selector.js");
    const persistence = await import("../../src/wallet/persistence.js");
    const initConfig = {
      chainId: 8453,
      accountIndex: 1,
      addressIndex: 2,
      privateKey: VALID_PRIVATE_KEY,
    };
    const activateParams = {
      mnemonic: "test test",
      accountIndex: 3,
      addressIndex: 4,
    };

    await selector.selectWalletBackend();

    await persistence.initializeWallet(initConfig);
    expect(initialize).toHaveBeenCalledWith(initConfig);

    expect(persistence.getWalletState()).toEqual(TEST_STATE);
    expect(persistence.getActiveAccount()).toBe(TEST_ACCOUNT);
    await expect(persistence.activateWallet(activateParams)).resolves.toEqual(TEST_STATE);
    expect(activate).toHaveBeenCalledWith(activateParams);
    await expect(persistence.getPersistedKeyForSubprocess()).resolves.toBe("0xfeed");
    expect(getKeyForSubprocess).toHaveBeenCalledTimes(1);
    await persistence.deactivateWallet();
    expect(deactivate).toHaveBeenCalledTimes(1);
    await persistence.deletePersistedWallet();
    expect(deletePersistedWallet).toHaveBeenCalledTimes(1);
  });

  it("falls back to internal persistence when no backend has been selected yet", async () => {
    const initializeWalletInternal = vi.fn<
      (config: {
        chainId: number;
        accountIndex: number;
        addressIndex: number;
        privateKey?: string;
        mnemonic?: string;
      }) => Promise<void>
    >(async () => undefined);

    vi.doMock("../../src/wallet/backend-selector.js", () => ({
      NO_WALLET_BACKEND_SELECTED_MESSAGE:
        "[wallet] No wallet backend selected. Call selectWalletBackend() first.",
      getWalletBackend: vi.fn(() => {
        throw new Error("[wallet] No wallet backend selected. Call selectWalletBackend() first.");
      }),
    }));

    vi.doMock("../../src/wallet/persistence-internal.js", () => ({
      initializeWalletInternal,
      activateWalletInternal: vi.fn(),
      deactivateWalletInternal: vi.fn(),
      deletePersistedWalletInternal: vi.fn(),
      getActiveAccountInternal: vi.fn(),
      getPersistedKeyForSubprocessInternal: vi.fn(),
      getWalletStateInternal: vi.fn(() => TEST_STATE),
      hasPersistedWalletKeyInternal: vi.fn(() => false),
    }));

    const persistence = await import("../../src/wallet/persistence.js");
    const initConfig = { chainId: 1, accountIndex: 0, addressIndex: 0 };

    await persistence.initializeWallet(initConfig);

    expect(initializeWalletInternal).toHaveBeenCalledWith(initConfig);
  });

  it("rethrows backend selector errors that are not the no-backend-selected sentinel", async () => {
    vi.doMock("../../src/wallet/backend-selector.js", () => ({
      NO_WALLET_BACKEND_SELECTED_MESSAGE:
        "[wallet] No wallet backend selected. Call selectWalletBackend() first.",
      getWalletBackend: vi.fn(() => {
        throw new Error("backend selector failed");
      }),
    }));

    const persistence = await import("../../src/wallet/persistence.js");

    expect(() => persistence.getWalletState()).toThrow("backend selector failed");
  });
});

describe("wallet persistence", () => {
  let origHome: string | undefined;
  let origPrivateKey: string | undefined;
  let origMnemonic: string | undefined;

  beforeEach(async () => {
    origHome = process.env.HOME;
    origPrivateKey = process.env.PRIVATE_KEY;
    origMnemonic = process.env.MNEMONIC;

    // biome-ignore lint/performance/noDelete: process.env requires delete to truly unset; assignment sets string "undefined"
    delete process.env.PRIVATE_KEY;
    // biome-ignore lint/performance/noDelete: process.env requires delete to truly unset; assignment sets string "undefined"
    delete process.env.MNEMONIC;
    process.env.HOME = TEST_HOME;

    await rm(TEST_HOME, { recursive: true, force: true });
    await mkdir(join(TEST_HOME, ".web3agent"), { recursive: true });
  });

  afterEach(async () => {
    process.env.HOME = origHome;
    if (origPrivateKey !== undefined) process.env.PRIVATE_KEY = origPrivateKey;
    // biome-ignore lint/performance/noDelete: process.env requires delete to truly unset; assignment sets string "undefined"
    else delete process.env.PRIVATE_KEY;
    if (origMnemonic !== undefined) process.env.MNEMONIC = origMnemonic;
    // biome-ignore lint/performance/noDelete: process.env requires delete to truly unset; assignment sets string "undefined"
    else delete process.env.MNEMONIC;

    await rm(TEST_HOME, { recursive: true, force: true });
  });

  it("creates wallet file with 0o600 permissions", async () => {
    const { activateWallet } = await import("../../src/wallet/persistence.js");
    const state = await activateWallet({ privateKey: VALID_PRIVATE_KEY });
    expect(state.mode).toBe("private-key");

    const walletPath = join(TEST_HOME, ".web3agent", "wallet.json");
    expect(existsSync(walletPath)).toBe(true);

    const stats = await stat(walletPath);
    expect(stats.mode & 0o777).toBe(0o600);
  });

  it("persists private key wallet as JSON", async () => {
    const { activateWallet } = await import("../../src/wallet/persistence.js");
    await activateWallet({ privateKey: VALID_PRIVATE_KEY });

    const walletPath = join(TEST_HOME, ".web3agent", "wallet.json");
    const raw = await readFile(walletPath, "utf-8");
    const data = JSON.parse(raw);
    expect(data.type).toBe("private-key");
    expect(data.privateKey).toBe(VALID_PRIVATE_KEY);
    expect(data.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
  });

  it("deactivate keeps wallet file and reverts to read-only", async () => {
    const { activateWallet, deactivateWallet, getWalletState } = await import(
      "../../src/wallet/persistence.js"
    );
    await activateWallet({ privateKey: VALID_PRIVATE_KEY });
    await deactivateWallet();

    const walletPath = join(TEST_HOME, ".web3agent", "wallet.json");
    expect(existsSync(walletPath)).toBe(true);
    expect(getWalletState().mode).toBe("read-only");
  });

  it("deletePersistedWallet removes wallet file and reverts to read-only", async () => {
    const { activateWallet, deletePersistedWallet, getWalletState } = await import(
      "../../src/wallet/persistence.js"
    );
    await activateWallet({ privateKey: VALID_PRIVATE_KEY });
    await deletePersistedWallet();

    const walletPath = join(TEST_HOME, ".web3agent", "wallet.json");
    expect(existsSync(walletPath)).toBe(false);
    expect(getWalletState().mode).toBe("read-only");
  });

  it("startup resolves PRIVATE_KEY env first", async () => {
    const { initializeWallet, getWalletState } = await import("../../src/wallet/persistence.js");
    await initializeWallet({
      chainId: 1,
      accountIndex: 0,
      addressIndex: 0,
      privateKey: VALID_PRIVATE_KEY,
    });

    const state = getWalletState();
    expect(state.mode).toBe("private-key");
    expect(state.address).toMatch(/^0x/);
  });

  it("concurrent activateWallet calls produce valid wallet.json", async () => {
    const { activateWallet } = await import("../../src/wallet/persistence.js");
    const keys = [
      "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
      "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
      "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
    ];

    await Promise.all(keys.map((privateKey) => activateWallet({ privateKey })));

    const walletPath = join(TEST_HOME, ".web3agent", "wallet.json");
    const raw = await readFile(walletPath, "utf-8");
    const data = JSON.parse(raw);
    expect(data.type).toBe("private-key");
    expect(data.privateKey).toMatch(/^0x[0-9a-fA-F]{64}$/);
    expect(keys).toContain(data.privateKey);
  });

  it("startup falls through to read-only when nothing configured", async () => {
    const { initializeWallet, getWalletState } = await import("../../src/wallet/persistence.js");
    await initializeWallet({
      chainId: 42161,
      accountIndex: 0,
      addressIndex: 0,
    });

    const state = getWalletState();
    expect(state.mode).toBe("read-only");
    expect(state.chainId).toBe(42161);
    expect(state.address).toMatch(/^0x/);
  });
});
