import { existsSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listWallets } from "@open-wallet-standard/core";
import { mnemonicToAccount, privateKeyToAccount } from "viem/accounts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const TEST_PASSPHRASE = "migration-passphrase";
const TEST_PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const TEST_MNEMONIC = "test test test test test test test test test test test junk";

async function writeLegacyWallet(
  homePath: string,
  wallet: Record<string, unknown>
): Promise<string> {
  const walletDir = join(homePath, ".web3agent");
  await mkdir(walletDir, { recursive: true });
  const walletPath = join(walletDir, "wallet.json");
  await writeFile(walletPath, JSON.stringify(wallet, null, 2), { mode: 0o600 });
  return walletPath;
}

function createTempPath(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

describe("legacy wallet migration to OWS", () => {
  let tempPaths: string[];
  let originalHome: string | undefined;
  let originalPassphrase: string | undefined;

  beforeEach(() => {
    tempPaths = [];
    originalHome = process.env.HOME;
    originalPassphrase = process.env.OWS_PASSPHRASE;
    process.env.OWS_PASSPHRASE = TEST_PASSPHRASE;
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

    for (const tempPath of tempPaths) {
      rmSync(tempPath, { recursive: true, force: true });
    }

    vi.doUnmock("@open-wallet-standard/core");
    vi.doUnmock("../../src/utils/atomic-write.js");
    vi.resetModules();
  });

  it("imports a legacy private-key wallet into OWS and renames wallet.json", async () => {
    const homePath = createTempPath("wallet-migration-home-");
    const vaultPath = createTempPath("wallet-migration-vault-");
    tempPaths.push(homePath, vaultPath);
    const walletPath = await writeLegacyWallet(homePath, {
      type: "private-key",
      privateKey: TEST_PRIVATE_KEY,
      address: privateKeyToAccount(TEST_PRIVATE_KEY).address,
    });
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    try {
      const { migrateLegacyWalletToOws } = await import("../../src/wallet/migration.js");
      const migrated = await migrateLegacyWalletToOws({
        legacyWalletPath: walletPath,
        passphrase: TEST_PASSPHRASE,
        vaultPath,
      });

      expect(migrated).toBe(true);
      expect(existsSync(walletPath)).toBe(false);
      expect(existsSync(`${walletPath}.migrated`)).toBe(true);
      expect(listWallets(vaultPath).some((wallet) => wallet.name === "web3agent-active")).toBe(
        true
      );
      const { OwsWalletBackend } = await import("../../src/wallet/ows-backend.js");
      const backend = new OwsWalletBackend({ passphrase: TEST_PASSPHRASE, vaultPath });
      await backend.initialize({ chainId: 8453, accountIndex: 0, addressIndex: 0 });
      expect(backend.getState()).toMatchObject({
        mode: "private-key",
        address: privateKeyToAccount(TEST_PRIVATE_KEY).address,
      });
      const migratedRaw = await readFile(`${walletPath}.migrated`, "utf-8");
      expect(migratedRaw).toContain(TEST_PRIVATE_KEY);
      const loggedOutput = stderrSpy.mock.calls.flat().join("");
      expect(loggedOutput).toContain("Found legacy wallet.json");
      expect(loggedOutput).toContain("Migration complete");
      expect(loggedOutput).toContain(
        `After verifying OWS wallet access, delete ${walletPath}.migrated to remove the plaintext backup.`
      );
      expect(loggedOutput).not.toContain(TEST_PRIVATE_KEY);
    } finally {
      stderrSpy.mockRestore();
    }
  });

  it("treats corrupted wallet.json as non-migratable without leaking file contents", async () => {
    const homePath = createTempPath("wallet-migration-home-");
    const vaultPath = createTempPath("wallet-migration-vault-");
    tempPaths.push(homePath, vaultPath);
    const walletDir = join(homePath, ".web3agent");
    await mkdir(walletDir, { recursive: true });
    const walletPath = join(walletDir, "wallet.json");
    await writeFile(walletPath, `{ "privateKey": "${TEST_PRIVATE_KEY}",`, { mode: 0o600 });
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    try {
      const { migrateLegacyWalletToOws } = await import("../../src/wallet/migration.js");
      const migrated = await migrateLegacyWalletToOws({
        legacyWalletPath: walletPath,
        passphrase: TEST_PASSPHRASE,
        vaultPath,
      });

      expect(migrated).toBe(false);
      expect(existsSync(walletPath)).toBe(true);
      expect(listWallets(vaultPath)).toHaveLength(0);
      const loggedOutput = stderrSpy.mock.calls.flat().join("");
      expect(loggedOutput).toContain("Could not parse legacy wallet.json");
      expect(loggedOutput).not.toContain(TEST_PRIVATE_KEY);
    } finally {
      stderrSpy.mockRestore();
    }
  });

  it("creates the OWS vault directory before importing a legacy private key", async () => {
    const homePath = createTempPath("wallet-migration-home-");
    const vaultRoot = createTempPath("wallet-migration-vault-root-");
    const vaultPath = join(vaultRoot, "nested", "ows");
    tempPaths.push(homePath, vaultRoot);
    const walletPath = await writeLegacyWallet(homePath, {
      type: "private-key",
      privateKey: TEST_PRIVATE_KEY,
      address: privateKeyToAccount(TEST_PRIVATE_KEY).address,
    });
    let vaultExistedBeforeImport = false;

    vi.doMock("@open-wallet-standard/core", async () => {
      const actual = await vi.importActual<typeof import("@open-wallet-standard/core")>(
        "@open-wallet-standard/core"
      );
      return {
        ...actual,
        importWalletPrivateKey: (
          ...args: Parameters<typeof actual.importWalletPrivateKey>
        ): ReturnType<typeof actual.importWalletPrivateKey> => {
          vaultExistedBeforeImport = existsSync(vaultPath);
          return actual.importWalletPrivateKey(...args);
        },
      };
    });

    const { migrateLegacyWalletToOws } = await import("../../src/wallet/migration.js");
    await migrateLegacyWalletToOws({
      legacyWalletPath: walletPath,
      passphrase: TEST_PASSPHRASE,
      vaultPath,
    });

    expect(vaultExistedBeforeImport).toBe(true);
  });

  it("does not re-migrate when only wallet.json.migrated exists", async () => {
    const homePath = createTempPath("wallet-migration-home-");
    const vaultPath = createTempPath("wallet-migration-vault-");
    tempPaths.push(homePath, vaultPath);
    const walletPath = await writeLegacyWallet(homePath, {
      type: "mnemonic",
      mnemonic: TEST_MNEMONIC,
      accountIndex: 1,
      addressIndex: 2,
    });
    await writeFile(`${walletPath}.migrated`, await readFile(walletPath, "utf-8"));
    rmSync(walletPath, { force: true });

    const { migrateLegacyWalletToOws } = await import("../../src/wallet/migration.js");
    const migrated = await migrateLegacyWalletToOws({
      legacyWalletPath: walletPath,
      passphrase: TEST_PASSPHRASE,
      vaultPath,
    });

    expect(migrated).toBe(false);
    expect(listWallets(vaultPath)).toHaveLength(0);
    expect(existsSync(`${walletPath}.migrated`)).toBe(true);
  });

  it("migrates mnemonic wallets with account and address index metadata", async () => {
    const homePath = createTempPath("wallet-migration-home-");
    const vaultPath = createTempPath("wallet-migration-vault-");
    tempPaths.push(homePath, vaultPath);
    const walletPath = await writeLegacyWallet(homePath, {
      type: "mnemonic",
      mnemonic: TEST_MNEMONIC,
      accountIndex: 1,
      addressIndex: 2,
    });

    const { migrateLegacyWalletToOws } = await import("../../src/wallet/migration.js");
    await migrateLegacyWalletToOws({
      legacyWalletPath: walletPath,
      passphrase: TEST_PASSPHRASE,
      vaultPath,
    });

    const { OwsWalletBackend } = await import("../../src/wallet/ows-backend.js");
    const backend = new OwsWalletBackend({ passphrase: TEST_PASSPHRASE, vaultPath });
    await backend.initialize({ chainId: 1, accountIndex: 0, addressIndex: 0 });

    expect(backend.getState()).toMatchObject({
      mode: "mnemonic",
      address: mnemonicToAccount(TEST_MNEMONIC, { accountIndex: 1, addressIndex: 2 }).address,
      accountIndex: 1,
      addressIndex: 2,
    });
  });

  it("keeps wallet.json in place when OWS import fails", async () => {
    const homePath = createTempPath("wallet-migration-home-");
    const vaultPath = createTempPath("wallet-migration-vault-");
    tempPaths.push(homePath, vaultPath);
    const walletPath = await writeLegacyWallet(homePath, {
      type: "private-key",
      privateKey: TEST_PRIVATE_KEY,
      address: privateKeyToAccount(TEST_PRIVATE_KEY).address,
    });

    vi.doMock("@open-wallet-standard/core", async () => {
      const actual = await vi.importActual<typeof import("@open-wallet-standard/core")>(
        "@open-wallet-standard/core"
      );
      return {
        ...actual,
        importWalletPrivateKey: vi.fn(() => {
          throw new Error("import failed");
        }),
      };
    });

    const { migrateLegacyWalletToOws } = await import("../../src/wallet/migration.js");

    await expect(
      migrateLegacyWalletToOws({
        legacyWalletPath: walletPath,
        passphrase: TEST_PASSPHRASE,
        vaultPath,
      })
    ).rejects.toThrow("import failed");
    expect(existsSync(walletPath)).toBe(true);
    expect(existsSync(`${walletPath}.migrated`)).toBe(false);
  });

  it("keeps wallet.json in place when metadata write fails", async () => {
    const homePath = createTempPath("wallet-migration-home-");
    const vaultPath = createTempPath("wallet-migration-vault-");
    tempPaths.push(homePath, vaultPath);
    const walletPath = await writeLegacyWallet(homePath, {
      type: "private-key",
      privateKey: TEST_PRIVATE_KEY,
      address: privateKeyToAccount(TEST_PRIVATE_KEY).address,
    });

    vi.doMock("../../src/utils/atomic-write.js", () => ({
      atomicWriteJson: vi.fn(async () => {
        throw new Error("metadata failed");
      }),
    }));

    const { migrateLegacyWalletToOws } = await import("../../src/wallet/migration.js");

    await expect(
      migrateLegacyWalletToOws({
        legacyWalletPath: walletPath,
        passphrase: TEST_PASSPHRASE,
        vaultPath,
      })
    ).rejects.toThrow("metadata failed");
    expect(existsSync(walletPath)).toBe(true);
    expect(existsSync(`${walletPath}.migrated`)).toBe(false);
    expect(listWallets(vaultPath).some((wallet) => wallet.name === "web3agent-active")).toBe(false);
  });

  it("refuses to overwrite an existing migrated backup", async () => {
    const homePath = createTempPath("wallet-migration-home-");
    const vaultPath = createTempPath("wallet-migration-vault-");
    tempPaths.push(homePath, vaultPath);
    const walletPath = await writeLegacyWallet(homePath, {
      type: "private-key",
      privateKey: TEST_PRIVATE_KEY,
      address: privateKeyToAccount(TEST_PRIVATE_KEY).address,
    });
    await writeFile(`${walletPath}.migrated`, "already migrated", { mode: 0o600 });

    const { migrateLegacyWalletToOws } = await import("../../src/wallet/migration.js");

    await expect(
      migrateLegacyWalletToOws({
        legacyWalletPath: walletPath,
        passphrase: TEST_PASSPHRASE,
        vaultPath,
      })
    ).rejects.toThrow("wallet.json.migrated");
    expect(await readFile(`${walletPath}.migrated`, "utf-8")).toBe("already migrated");
    expect(existsSync(walletPath)).toBe(true);
  });

  it.skipIf(process.platform === "win32")(
    "creates wallet.json.migrated with mode 0o600 even when wallet.json was 0o644",
    async () => {
      const homePath = createTempPath("wallet-migration-home-");
      const vaultPath = createTempPath("wallet-migration-vault-");
      tempPaths.push(homePath, vaultPath);
      const legacyDir = join(homePath, ".web3agent");
      await mkdir(legacyDir, { recursive: true });
      const walletPath = join(legacyDir, "wallet.json");
      await writeFile(
        walletPath,
        JSON.stringify({
          type: "private-key",
          privateKey: TEST_PRIVATE_KEY,
          address: privateKeyToAccount(TEST_PRIVATE_KEY).address,
        }),
        { mode: 0o644 }
      );
      const { migrateLegacyWalletToOws } = await import("../../src/wallet/migration.js");
      await migrateLegacyWalletToOws({ legacyWalletPath: walletPath, passphrase: "p", vaultPath });
      const mode = statSync(`${walletPath}.migrated`).mode & 0o777;
      expect(mode).toBe(0o600);
    }
  );

  it("OwsWalletBackend.initialize migrates a legacy wallet before loading state", async () => {
    const homePath = createTempPath("wallet-migration-home-");
    const vaultPath = join(homePath, ".web3agent", "ows");
    tempPaths.push(homePath);
    process.env.HOME = homePath;
    const walletPath = await writeLegacyWallet(homePath, {
      type: "private-key",
      privateKey: TEST_PRIVATE_KEY,
      address: privateKeyToAccount(TEST_PRIVATE_KEY).address,
    });

    const { OwsWalletBackend } = await import("../../src/wallet/ows-backend.js");
    const backend = new OwsWalletBackend({ passphrase: TEST_PASSPHRASE, vaultPath });
    await backend.initialize({ chainId: 8453, accountIndex: 0, addressIndex: 0 });

    expect(backend.getState()).toMatchObject({
      mode: "private-key",
      address: privateKeyToAccount(TEST_PRIVATE_KEY).address,
      chainId: 8453,
    });
    expect(existsSync(walletPath)).toBe(false);
    expect(existsSync(`${walletPath}.migrated`)).toBe(true);
  });

  it("OwsWalletBackend.initialize does not migrate when an active OWS wallet already exists", async () => {
    const homePath = createTempPath("wallet-migration-home-");
    const vaultPath = join(homePath, ".web3agent", "ows");
    tempPaths.push(homePath);
    process.env.HOME = homePath;
    const existingKey = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";

    const { OwsWalletBackend } = await import("../../src/wallet/ows-backend.js");
    const setupBackend = new OwsWalletBackend({ passphrase: TEST_PASSPHRASE, vaultPath });
    await setupBackend.initialize({ chainId: 8453, accountIndex: 0, addressIndex: 0 });
    await setupBackend.activate({ privateKey: existingKey });
    const walletPath = await writeLegacyWallet(homePath, {
      type: "private-key",
      privateKey: TEST_PRIVATE_KEY,
      address: privateKeyToAccount(TEST_PRIVATE_KEY).address,
    });

    const backend = new OwsWalletBackend({ passphrase: TEST_PASSPHRASE, vaultPath });
    await backend.initialize({ chainId: 8453, accountIndex: 0, addressIndex: 0 });

    expect(backend.getState()).toMatchObject({
      mode: "private-key",
      address: privateKeyToAccount(existingKey).address,
    });
    expect(existsSync(walletPath)).toBe(true);
    expect(existsSync(`${walletPath}.migrated`)).toBe(false);
  });

  it("OwsWalletBackend.initialize does not migrate when explicit startup private key is supplied", async () => {
    const homePath = createTempPath("wallet-migration-home-");
    const vaultPath = join(homePath, ".web3agent", "ows");
    tempPaths.push(homePath);
    process.env.HOME = homePath;
    const startupKey = "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a";
    const walletPath = await writeLegacyWallet(homePath, {
      type: "private-key",
      privateKey: TEST_PRIVATE_KEY,
      address: privateKeyToAccount(TEST_PRIVATE_KEY).address,
    });

    const { OwsWalletBackend } = await import("../../src/wallet/ows-backend.js");
    const backend = new OwsWalletBackend({ passphrase: TEST_PASSPHRASE, vaultPath });
    await backend.initialize({
      chainId: 8453,
      accountIndex: 0,
      addressIndex: 0,
      privateKey: startupKey,
    });

    expect(backend.getState()).toMatchObject({
      mode: "private-key",
      address: privateKeyToAccount(startupKey).address,
    });
    expect(existsSync(walletPath)).toBe(true);
    expect(existsSync(`${walletPath}.migrated`)).toBe(false);
  });
});
