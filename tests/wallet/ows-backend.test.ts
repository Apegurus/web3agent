import { existsSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { chmod, mkdir, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { exportWallet, importWalletPrivateKey, listWallets } from "@open-wallet-standard/core";
import { mnemonicToAccount, privateKeyToAccount } from "viem/accounts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OWS_METADATA_FILE_NAME } from "../../src/wallet/ows-constants.js";

const TEST_PASSPHRASE = "test-passphrase";
const TEST_PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const TEST_REPLACEMENT_PRIVATE_KEY =
  "0x59c6995e998f97a5a0044966f0945382d25e72839cf0b37d4a4dffdebd5a6a2b";
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

  it("preserves the old active wallet when replacement import fails", async () => {
    type ImportWalletPrivateKey = typeof import(
      "@open-wallet-standard/core"
    ).importWalletPrivateKey;
    const unexpectedImportWalletPrivateKey: ImportWalletPrivateKey = (name) => {
      throw new Error(`Unexpected call before mock setup: ${name}`);
    };
    let importWalletPrivateKeyImplementation = unexpectedImportWalletPrivateKey;
    const importWalletPrivateKeyMock = vi.fn(
      (...args: Parameters<ImportWalletPrivateKey>): ReturnType<ImportWalletPrivateKey> =>
        importWalletPrivateKeyImplementation(...args)
    );

    vi.doMock("@open-wallet-standard/core", async () => {
      const actual = await vi.importActual<typeof import("@open-wallet-standard/core")>(
        "@open-wallet-standard/core"
      );
      importWalletPrivateKeyImplementation = actual.importWalletPrivateKey;
      return {
        ...actual,
        importWalletPrivateKey: importWalletPrivateKeyMock,
      };
    });

    const { OwsWalletBackend, OWS_ACTIVE_WALLET_NAME } = await import(
      "../../src/wallet/ows-backend.js"
    );
    const vaultPath = createVaultPath();
    vaultPaths.push(vaultPath);

    const backend = new OwsWalletBackend({ passphrase: TEST_PASSPHRASE, vaultPath });
    await backend.initialize({ chainId: 8453, accountIndex: 0, addressIndex: 0 });
    await backend.activate({ privateKey: TEST_PRIVATE_KEY });
    const oldAddress = backend.getState().address;

    importWalletPrivateKeyMock.mockImplementationOnce(() => {
      throw new Error("replacement import failed");
    });

    await expect(backend.activate({ privateKey: TEST_REPLACEMENT_PRIVATE_KEY })).rejects.toThrow(
      "replacement import failed"
    );

    expect(listWallets(vaultPath).some((wallet) => wallet.name === OWS_ACTIVE_WALLET_NAME)).toBe(
      true
    );
    expect(backend.getState().address).toBe(oldAddress);
    await expect(backend.getKeyForSubprocess()).resolves.toBe(TEST_PRIVATE_KEY);
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

  it.each([
    { accountIndex: 0, addressIndex: 0 },
    { accountIndex: 0, addressIndex: 1 },
    { accountIndex: 1, addressIndex: 0 },
    { accountIndex: 1, addressIndex: 2 },
  ])(
    "matches viem mnemonic derivation for account $accountIndex address $addressIndex",
    async ({ accountIndex, addressIndex }) => {
      const { OwsWalletBackend } = await import("../../src/wallet/ows-backend.js");
      const vaultPath = createVaultPath();
      vaultPaths.push(vaultPath);

      const backend = new OwsWalletBackend({ passphrase: TEST_PASSPHRASE, vaultPath });
      await backend.initialize({ chainId: 1, accountIndex: 0, addressIndex: 0 });

      const state = await backend.activate({
        mnemonic: TEST_MNEMONIC,
        accountIndex,
        addressIndex,
      });
      const expectedAccount = mnemonicToAccount(TEST_MNEMONIC, { accountIndex, addressIndex });

      expect(state.mode).toBe("mnemonic");
      expect(state.accountIndex).toBe(accountIndex);
      expect(state.addressIndex).toBe(addressIndex);
      expect(state.address).toBe(expectedAccount.address);
    }
  );

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

  it("deletePersistedWallet removes the active OWS wallet, clears metadata, and returns read-only state", async () => {
    const { OwsWalletBackend, OWS_ACTIVE_WALLET_NAME } = await import(
      "../../src/wallet/ows-backend.js"
    );
    const vaultPath = createVaultPath();
    vaultPaths.push(vaultPath);

    const backend = new OwsWalletBackend({ passphrase: TEST_PASSPHRASE, vaultPath });
    await backend.initialize({ chainId: 8453, accountIndex: 0, addressIndex: 0 });
    await backend.activate({ mnemonic: TEST_MNEMONIC, accountIndex: 1, addressIndex: 2 });

    const metadataPath = join(vaultPath, OWS_METADATA_FILE_NAME);
    expect(listWallets(vaultPath).some((wallet) => wallet.name === OWS_ACTIVE_WALLET_NAME)).toBe(
      true
    );
    expect(existsSync(metadataPath)).toBe(true);

    await backend.deletePersistedWallet();

    expect(backend.getState().mode).toBe("read-only");
    expect(listWallets(vaultPath).some((wallet) => wallet.name === OWS_ACTIVE_WALLET_NAME)).toBe(
      false
    );
    expect(JSON.parse(await readFile(metadataPath, "utf-8"))).toEqual({});
  });

  it("deletePersistedWallet is a no-op-safe read-only transition when no OWS wallet is persisted", async () => {
    const { OwsWalletBackend } = await import("../../src/wallet/ows-backend.js");
    const vaultPath = createVaultPath();
    vaultPaths.push(vaultPath);

    const backend = new OwsWalletBackend({ passphrase: TEST_PASSPHRASE, vaultPath });
    await backend.initialize({ chainId: 8453, accountIndex: 0, addressIndex: 0 });

    await expect(backend.deletePersistedWallet()).resolves.toBeUndefined();
    expect(backend.getState().mode).toBe("read-only");
    expect(listWallets(vaultPath)).toHaveLength(0);
  });

  it.skipIf(process.platform === "win32")(
    "creates the OWS vault directory with mode 0o700 on first activate",
    async () => {
      let modeDuringImport: number | null = null;
      vi.doMock("@open-wallet-standard/core", async () => {
        const actual = await vi.importActual<typeof import("@open-wallet-standard/core")>(
          "@open-wallet-standard/core"
        );
        return {
          ...actual,
          importWalletPrivateKey: (
            ...args: Parameters<typeof actual.importWalletPrivateKey>
          ): ReturnType<typeof actual.importWalletPrivateKey> => {
            modeDuringImport = statSync(args[3]).mode & 0o777;
            return actual.importWalletPrivateKey(...args);
          },
        };
      });
      const { OwsWalletBackend } = await import("../../src/wallet/ows-backend.js");
      const vaultPath = join(await mkdtemp(join(tmpdir(), "ows-")), "ows-vault");
      vaultPaths.push(vaultPath);
      expect(existsSync(vaultPath)).toBe(false);
      const backend = new OwsWalletBackend({ passphrase: "p", vaultPath });
      await backend.activate({ privateKey: TEST_PRIVATE_KEY });
      const mode = statSync(vaultPath).mode & 0o777;
      expect(modeDuringImport).toBe(0o700);
      expect(mode).toBe(0o700);
    }
  );

  it.skipIf(process.platform === "win32")(
    "repairs a pre-existing 0o755 vault dir to 0o700 on activate",
    async () => {
      let modeDuringImport: number | null = null;
      vi.doMock("@open-wallet-standard/core", async () => {
        const actual = await vi.importActual<typeof import("@open-wallet-standard/core")>(
          "@open-wallet-standard/core"
        );
        return {
          ...actual,
          importWalletPrivateKey: (
            ...args: Parameters<typeof actual.importWalletPrivateKey>
          ): ReturnType<typeof actual.importWalletPrivateKey> => {
            modeDuringImport = statSync(args[3]).mode & 0o777;
            return actual.importWalletPrivateKey(...args);
          },
        };
      });
      const { OwsWalletBackend } = await import("../../src/wallet/ows-backend.js");
      const vaultPath = join(await mkdtemp(join(tmpdir(), "ows-")), "ows-vault");
      vaultPaths.push(vaultPath);
      await mkdir(vaultPath, { recursive: true });
      await chmod(vaultPath, 0o755);
      const backend = new OwsWalletBackend({ passphrase: "p", vaultPath });
      await backend.activate({ privateKey: TEST_PRIVATE_KEY });
      const mode = statSync(vaultPath).mode & 0o777;
      expect(modeDuringImport).toBe(0o700);
      expect(mode).toBe(0o700);
    }
  );

  describe("startup PRIVATE_KEY under OWS", () => {
    it("does not call importWalletPrivateKey", async () => {
      type ImportWalletPrivateKey = typeof import(
        "@open-wallet-standard/core"
      ).importWalletPrivateKey;
      const unexpectedImportWalletPrivateKey: ImportWalletPrivateKey = (name) => {
        throw new Error(`Unexpected call before mock setup: ${name}`);
      };
      let importWalletPrivateKeyImplementation = unexpectedImportWalletPrivateKey;
      const importWalletPrivateKeyMock = vi.fn(
        (...args: Parameters<ImportWalletPrivateKey>): ReturnType<ImportWalletPrivateKey> =>
          importWalletPrivateKeyImplementation(...args)
      );
      vi.doMock("@open-wallet-standard/core", async () => {
        const actual = await vi.importActual<typeof import("@open-wallet-standard/core")>(
          "@open-wallet-standard/core"
        );
        importWalletPrivateKeyImplementation = actual.importWalletPrivateKey;
        return {
          ...actual,
          importWalletPrivateKey: importWalletPrivateKeyMock,
        };
      });
      const { OwsWalletBackend } = await import("../../src/wallet/ows-backend.js");
      const tmpVault = createVaultPath();
      vaultPaths.push(tmpVault);
      const backend = new OwsWalletBackend({ passphrase: "p", vaultPath: tmpVault });
      await backend.initialize({
        chainId: 8453,
        accountIndex: 0,
        addressIndex: 0,
        privateKey: TEST_PRIVATE_KEY,
      });
      expect(importWalletPrivateKeyMock).not.toHaveBeenCalled();
    });

    it("does not create a wallet in the vault", async () => {
      const { OwsWalletBackend } = await import("../../src/wallet/ows-backend.js");
      const tmpVault = createVaultPath();
      vaultPaths.push(tmpVault);
      const backend = new OwsWalletBackend({ passphrase: "p", vaultPath: tmpVault });
      await backend.initialize({
        chainId: 8453,
        accountIndex: 0,
        addressIndex: 0,
        privateKey: TEST_PRIVATE_KEY,
      });
      expect(listWallets(tmpVault)).toHaveLength(0);
    });

    it("preserves an existing vault wallet", async () => {
      const { OwsWalletBackend, OWS_ACTIVE_WALLET_NAME } = await import(
        "../../src/wallet/ows-backend.js"
      );
      const tmpVault = createVaultPath();
      vaultPaths.push(tmpVault);
      importWalletPrivateKey(
        OWS_ACTIVE_WALLET_NAME,
        TEST_REPLACEMENT_PRIVATE_KEY,
        "p",
        tmpVault,
        "evm"
      );
      const before = exportWallet(OWS_ACTIVE_WALLET_NAME, "p", tmpVault);
      const backend = new OwsWalletBackend({ passphrase: "p", vaultPath: tmpVault });
      await backend.initialize({
        chainId: 8453,
        accountIndex: 0,
        addressIndex: 0,
        privateKey: TEST_PRIVATE_KEY,
      });
      const after = exportWallet(OWS_ACTIVE_WALLET_NAME, "p", tmpVault);
      expect(after).toBe(before);
    });

    it("getKeyForSubprocess returns the startup private key", async () => {
      const { OwsWalletBackend } = await import("../../src/wallet/ows-backend.js");
      const tmpVault = createVaultPath();
      vaultPaths.push(tmpVault);
      const backend = new OwsWalletBackend({ passphrase: "p", vaultPath: tmpVault });
      await backend.initialize({
        chainId: 8453,
        accountIndex: 0,
        addressIndex: 0,
        privateKey: TEST_PRIVATE_KEY,
      });
      expect(await backend.getKeyForSubprocess()).toBe(TEST_PRIVATE_KEY);
    });

    it("getState returns mode=private-key with the correct address", async () => {
      const { OwsWalletBackend } = await import("../../src/wallet/ows-backend.js");
      const tmpVault = createVaultPath();
      vaultPaths.push(tmpVault);
      const backend = new OwsWalletBackend({ passphrase: "p", vaultPath: tmpVault });
      await backend.initialize({
        chainId: 8453,
        accountIndex: 0,
        addressIndex: 0,
        privateKey: TEST_PRIVATE_KEY,
      });
      const state = backend.getState();
      expect(state.mode).toBe("private-key");
      expect(state.address).toBe(privateKeyToAccount(TEST_PRIVATE_KEY).address);
    });
  });

  describe("startup MNEMONIC under OWS", () => {
    it("does not call importWalletMnemonic", async () => {
      type ImportWalletMnemonic = typeof import("@open-wallet-standard/core").importWalletMnemonic;
      const unexpectedImportWalletMnemonic: ImportWalletMnemonic = (name) => {
        throw new Error(`Unexpected call before mock setup: ${name}`);
      };
      let importWalletMnemonicImplementation = unexpectedImportWalletMnemonic;
      const importWalletMnemonicMock = vi.fn(
        (...args: Parameters<ImportWalletMnemonic>): ReturnType<ImportWalletMnemonic> =>
          importWalletMnemonicImplementation(...args)
      );
      vi.doMock("@open-wallet-standard/core", async () => {
        const actual = await vi.importActual<typeof import("@open-wallet-standard/core")>(
          "@open-wallet-standard/core"
        );
        importWalletMnemonicImplementation = actual.importWalletMnemonic;
        return {
          ...actual,
          importWalletMnemonic: importWalletMnemonicMock,
        };
      });
      const { OwsWalletBackend } = await import("../../src/wallet/ows-backend.js");
      const tmpVault = createVaultPath();
      vaultPaths.push(tmpVault);
      const backend = new OwsWalletBackend({ passphrase: "p", vaultPath: tmpVault });
      await backend.initialize({
        chainId: 8453,
        accountIndex: 1,
        addressIndex: 2,
        mnemonic: TEST_MNEMONIC,
      });
      expect(importWalletMnemonicMock).not.toHaveBeenCalled();
    });

    it("getKeyForSubprocess returns the derived key for indices", async () => {
      const { OwsWalletBackend } = await import("../../src/wallet/ows-backend.js");
      const tmpVault = createVaultPath();
      vaultPaths.push(tmpVault);
      const backend = new OwsWalletBackend({ passphrase: "p", vaultPath: tmpVault });
      await backend.initialize({
        chainId: 8453,
        accountIndex: 1,
        addressIndex: 2,
        mnemonic: TEST_MNEMONIC,
      });
      const expected = mnemonicToAccount(TEST_MNEMONIC, {
        accountIndex: 1,
        addressIndex: 2,
      }).getHdKey().privateKey;
      if (expected === null) {
        throw new Error("Expected derived private key");
      }
      expect(await backend.getKeyForSubprocess()).toBe(
        `0x${Buffer.from(expected).toString("hex")}`
      );
    });
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

  it("getKeyForSubprocess does not warn when private-key export has no secp256k1 key", async () => {
    const exportWalletMock = vi.fn(() => JSON.stringify({ ed25519: "not-an-evm-key" }));
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
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    try {
      const backend = new OwsWalletBackend({ passphrase: TEST_PASSPHRASE, vaultPath });
      await backend.initialize({ chainId: 8453, accountIndex: 0, addressIndex: 0 });
      await backend.activate({ privateKey: TEST_PRIVATE_KEY });

      await expect(backend.getKeyForSubprocess()).resolves.toBeNull();
      expect(stderrSpy.mock.calls.flat().join("\n")).not.toContain(
        "WARNING: Raw key exported for subprocess"
      );
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
