import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listWallets } from "@open-wallet-standard/core";
import { mnemonicToAccount, privateKeyToAccount } from "viem/accounts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const TEST_PASSPHRASE = "test-passphrase";
const TEST_PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const TEST_MNEMONIC = "test test test test test test test test test test test junk";

function createVaultPath(): string {
  return mkdtempSync(join(tmpdir(), "ows-test-"));
}

describe("OwsWalletBackend", () => {
  let originalHome: string | undefined;
  let originalPassphrase: string | undefined;
  let vaultPaths: string[];

  beforeEach(() => {
    originalHome = process.env.HOME;
    originalPassphrase = process.env.OWS_PASSPHRASE;
    vaultPaths = [];
    const homePath = createVaultPath();
    vaultPaths.push(homePath);
    process.env.HOME = homePath;
  });

  afterEach(() => {
    if (originalHome === undefined) {
      Reflect.deleteProperty(process.env, "HOME");
    } else {
      process.env.HOME = originalHome;
    }

    if (originalPassphrase === undefined) {
      Reflect.deleteProperty(process.env, "OWS_PASSPHRASE");
    } else {
      process.env.OWS_PASSPHRASE = originalPassphrase;
    }

    for (const vaultPath of vaultPaths) {
      rmSync(vaultPath, { recursive: true, force: true });
    }

    vi.doUnmock("@open-wallet-standard/core");
    vi.resetModules();
  });

  it("rejects missing or empty passphrase", async () => {
    const { OwsWalletBackend } = await import("../../src/wallet/ows-backend.js");

    expect(() => new OwsWalletBackend({ passphrase: "" })).toThrow(/passphrase/i);
    expect(() => new OwsWalletBackend({ passphrase: "   " })).toThrow(/passphrase/i);

    Reflect.deleteProperty(process.env, "OWS_PASSPHRASE");
    expect(() => new OwsWalletBackend()).toThrow(/passphrase/i);
  });

  it("initialize without secrets uses an ephemeral read-only account without creating OWS wallet material", async () => {
    const { OwsWalletBackend } = await import("../../src/wallet/ows-backend.js");
    const vaultPath = createVaultPath();
    vaultPaths.push(vaultPath);

    const backend = new OwsWalletBackend({ passphrase: TEST_PASSPHRASE, vaultPath });

    await backend.initialize({ chainId: 8453, accountIndex: 0, addressIndex: 0 });

    const state = backend.getState();
    expect(state.mode).toBe("read-only");
    expect(state.chainId).toBe(8453);
    expect(state.address).toMatch(/^0x[a-fA-F0-9]{40}$/);
    expect(listWallets(vaultPath)).toHaveLength(0);
  });

  it("activate with private key imports wallet and exposes a signing viem account", async () => {
    const { OwsWalletBackend } = await import("../../src/wallet/ows-backend.js");
    const vaultPath = createVaultPath();
    vaultPaths.push(vaultPath);

    const backend = new OwsWalletBackend({ passphrase: TEST_PASSPHRASE, vaultPath });
    await backend.initialize({ chainId: 8453, accountIndex: 0, addressIndex: 0 });

    const state = await backend.activate({ privateKey: TEST_PRIVATE_KEY });
    const expectedAccount = privateKeyToAccount(TEST_PRIVATE_KEY);

    expect(state.mode).toBe("private-key");
    expect(state.address).toBe(expectedAccount.address);
    expect(typeof backend.getAccount().signMessage).toBe("function");
  });

  it("activate with mnemonic respects account and address indices", async () => {
    const { OwsWalletBackend } = await import("../../src/wallet/ows-backend.js");
    const vaultPath = createVaultPath();
    vaultPaths.push(vaultPath);

    const backend = new OwsWalletBackend({ passphrase: TEST_PASSPHRASE, vaultPath });
    await backend.initialize({ chainId: 1, accountIndex: 0, addressIndex: 0 });

    const state = await backend.activate({
      mnemonic: TEST_MNEMONIC,
      accountIndex: 1,
      addressIndex: 2,
    });
    const expectedAccount = mnemonicToAccount(TEST_MNEMONIC, {
      accountIndex: 1,
      addressIndex: 2,
    });

    expect(state.mode).toBe("mnemonic");
    expect(state.accountIndex).toBe(1);
    expect(state.addressIndex).toBe(2);
    expect(state.address).toBe(expectedAccount.address);
  });

  it("deactivate returns to read-only without creating extra persistent wallets", async () => {
    const { OwsWalletBackend, OWS_ACTIVE_WALLET_NAME } = await import(
      "../../src/wallet/ows-backend.js"
    );
    const vaultPath = createVaultPath();
    vaultPaths.push(vaultPath);

    const backend = new OwsWalletBackend({ passphrase: TEST_PASSPHRASE, vaultPath });
    await backend.initialize({ chainId: 8453, accountIndex: 0, addressIndex: 0 });
    await backend.activate({ privateKey: TEST_PRIVATE_KEY });

    const walletsBeforeDeactivate = listWallets(vaultPath);
    await backend.deactivate();

    expect(backend.getState().mode).toBe("read-only");
    expect(listWallets(vaultPath)).toEqual(walletsBeforeDeactivate);
    expect(walletsBeforeDeactivate.some((wallet) => wallet.name === OWS_ACTIVE_WALLET_NAME)).toBe(
      true
    );
  });

  it("getKeyForSubprocess returns null in read-only mode without logging a raw-key warning", async () => {
    const { OwsWalletBackend } = await import("../../src/wallet/ows-backend.js");
    const vaultPath = createVaultPath();
    vaultPaths.push(vaultPath);
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    try {
      const backend = new OwsWalletBackend({ passphrase: TEST_PASSPHRASE, vaultPath });
      await backend.initialize({ chainId: 8453, accountIndex: 0, addressIndex: 0 });

      await expect(backend.getKeyForSubprocess()).resolves.toBeNull();
      expect(stderrSpy.mock.calls.flat().join("\n")).not.toContain(
        "WARNING: Raw key exported for subprocess"
      );
    } finally {
      stderrSpy.mockRestore();
    }
  });

  it("getKeyForSubprocess warns without logging the key and returns normalized private key", async () => {
    const { OwsWalletBackend } = await import("../../src/wallet/ows-backend.js");
    const vaultPath = createVaultPath();
    vaultPaths.push(vaultPath);
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    try {
      const backend = new OwsWalletBackend({ passphrase: TEST_PASSPHRASE, vaultPath });
      await backend.initialize({ chainId: 8453, accountIndex: 0, addressIndex: 0 });
      await backend.activate({ privateKey: TEST_PRIVATE_KEY });

      const exportedKey = await backend.getKeyForSubprocess();
      const loggedOutput = stderrSpy.mock.calls.flat().join("");

      expect(exportedKey).toBe(TEST_PRIVATE_KEY);
      expect(loggedOutput).toContain("[wallet] WARNING: Raw key exported for subprocess");
      expect(loggedOutput).not.toContain(TEST_PRIVATE_KEY);
    } finally {
      stderrSpy.mockRestore();
    }
  });

  it("getKeyForSubprocess derives the expected indexed key for mnemonic wallets", async () => {
    const { OwsWalletBackend } = await import("../../src/wallet/ows-backend.js");
    const vaultPath = createVaultPath();
    vaultPaths.push(vaultPath);
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    try {
      const backend = new OwsWalletBackend({ passphrase: TEST_PASSPHRASE, vaultPath });
      await backend.initialize({ chainId: 1, accountIndex: 0, addressIndex: 0 });
      await backend.activate({ mnemonic: TEST_MNEMONIC, accountIndex: 1, addressIndex: 2 });

      const exportedKey = await backend.getKeyForSubprocess();
      const expectedAccount = mnemonicToAccount(TEST_MNEMONIC, {
        accountIndex: 1,
        addressIndex: 2,
      });
      const hdKey = expectedAccount.getHdKey();

      expect(hdKey.privateKey).not.toBeNull();
      expect(exportedKey).toBe(`0x${Buffer.from(hdKey.privateKey as Uint8Array).toString("hex")}`);
      expect(stderrSpy.mock.calls.flat().join("\n")).toContain(
        "WARNING: Raw key exported for subprocess"
      );
    } finally {
      stderrSpy.mockRestore();
    }
  });

  it("parses pretty-printed private-key JSON exports without treating them as mnemonic", async () => {
    const exportWalletMock = vi.fn(() => `\n{\n  "secp256k1": "${TEST_PRIVATE_KEY}"\n}\n`);
    vi.doMock("@open-wallet-standard/core", async () => {
      const actual = await vi.importActual<typeof import("@open-wallet-standard/core")>(
        "@open-wallet-standard/core"
      );
      return {
        ...actual,
        exportWallet: exportWalletMock,
      };
    });

    const { OwsWalletBackend } = await import("../../src/wallet/ows-backend.js");
    const vaultPath = createVaultPath();
    vaultPaths.push(vaultPath);

    const backend = new OwsWalletBackend({ passphrase: TEST_PASSPHRASE, vaultPath });
    await backend.initialize({ chainId: 8453, accountIndex: 0, addressIndex: 0 });
    await backend.activate({ privateKey: TEST_PRIVATE_KEY });

    await expect(backend.getKeyForSubprocess()).resolves.toBe(TEST_PRIVATE_KEY);
    expect(exportWalletMock).toHaveBeenCalled();
  });

  it("does not return malformed private-key JSON export material", async () => {
    vi.doMock("@open-wallet-standard/core", async () => {
      const actual = await vi.importActual<typeof import("@open-wallet-standard/core")>(
        "@open-wallet-standard/core"
      );
      return {
        ...actual,
        exportWallet: vi.fn(() => '{"secp256k1":"0x1234"}'),
      };
    });

    const { OwsWalletBackend } = await import("../../src/wallet/ows-backend.js");
    const vaultPath = createVaultPath();
    vaultPaths.push(vaultPath);

    const backend = new OwsWalletBackend({ passphrase: TEST_PASSPHRASE, vaultPath });
    await backend.initialize({ chainId: 8453, accountIndex: 0, addressIndex: 0 });
    await backend.activate({ privateKey: TEST_PRIVATE_KEY });

    await expect(backend.getKeyForSubprocess()).resolves.toBeNull();
  });
});
