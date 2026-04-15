import { mkdirSync, writeFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const fsMockState = vi.hoisted(() => ({
  statSync: vi.fn<typeof import("node:fs").statSync>(),
}));

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  fsMockState.statSync.mockImplementation(actual.statSync);
  return {
    ...actual,
    statSync: fsMockState.statSync,
  };
});

vi.mock("ccxt", () => ({
  default: {
    exchanges: ["binance", "bybit", "kraken"],
  },
}));

import {
  getAccountByName,
  listAccountSummaries,
  resolveExchangeIdFromAccount,
} from "../../src/ccxt/accounts.js";
import { loadCcxtAccountRegistry } from "../../src/ccxt/config.js";

const TEST_DIR = join(tmpdir(), `web3agent-ccxt-config-test-${process.pid}`);

afterEach(async () => {
  await rm(TEST_DIR, { recursive: true, force: true });
});

function writeConfigFile(name: string, data: unknown): string {
  mkdirSync(TEST_DIR, { recursive: true });
  const filePath = join(TEST_DIR, name);
  writeFileSync(filePath, JSON.stringify(data, null, 2));
  return filePath;
}

describe("loadCcxtAccountRegistry", () => {
  it("loads valid named accounts from CCXT_CONFIG_PATH", () => {
    const configPath = writeConfigFile("valid.json", {
      accounts: [
        {
          name: "bybit_main",
          exchangeId: "bybit",
          apiKey: "key",
          secret: "secret",
          defaultType: "spot",
        },
      ],
    });

    const registry = loadCcxtAccountRegistry({ ccxtConfigPath: configPath });

    expect(registry.accounts).toHaveLength(1);
    expect(registry.accounts[0]).toMatchObject({
      name: "bybit_main",
      exchangeId: "bybit",
      defaultType: "spot",
    });
    expect(registry.warnings).toEqual([]);
  });

  it("skips invalid accounts but preserves valid ones", () => {
    const configPath = writeConfigFile("mixed.json", {
      accounts: [
        {
          name: "good_account",
          exchangeId: "kraken",
          apiKey: "key",
          secret: "secret",
        },
        {
          name: "bad_exchange",
          exchangeId: "not-real",
          apiKey: "key",
          secret: "secret",
        },
      ],
    });

    const registry = loadCcxtAccountRegistry({ ccxtConfigPath: configPath });

    expect(registry.accounts).toHaveLength(1);
    expect(registry.accounts[0]?.name).toBe("good_account");
    expect(registry.warnings).toEqual([
      expect.stringContaining("Unsupported exchange ID 'not-real'"),
    ]);
  });

  it("warns when the CCXT config file is readable by other users", () => {
    const configPath = writeConfigFile("permissions.json", {
      accounts: [
        {
          name: "binance_main",
          exchangeId: "binance",
          apiKey: "key",
          secret: "secret",
        },
      ],
    });
    const stderrSpy = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    fsMockState.statSync.mockReturnValueOnce({ mode: 0o644 } as import("node:fs").Stats);

    const registry = loadCcxtAccountRegistry({ ccxtConfigPath: configPath });

    expect(registry.accounts).toHaveLength(1);
    expect(registry.warnings).toEqual([]);
    expect(fsMockState.statSync).toHaveBeenCalledWith(configPath);
    expect(stderrSpy).toHaveBeenCalledWith(
      `[ccxt] WARNING: ${configPath} is readable by other users (mode 644). ` +
        `This file contains exchange credentials. Run: chmod 600 ${configPath}\n`
    );
  });

  it("sets insecurePermissions when config file is world-readable", () => {
    const configPath = writeConfigFile("insecure.json", {
      accounts: [
        {
          name: "binance_main",
          exchangeId: "binance",
          apiKey: "key",
          secret: "secret",
        },
      ],
    });
    const stderrSpy = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    fsMockState.statSync.mockReturnValueOnce({ mode: 0o644 } as import("node:fs").Stats);

    const registry = loadCcxtAccountRegistry({ ccxtConfigPath: configPath });

    expect(registry.insecurePermissions).toBe(true);
    stderrSpy.mockRestore();
  });

  it("sets insecurePermissions to false when permissions are secure", () => {
    const configPath = writeConfigFile("secure.json", {
      accounts: [
        {
          name: "binance_main",
          exchangeId: "binance",
          apiKey: "key",
          secret: "secret",
        },
      ],
    });
    fsMockState.statSync.mockReturnValueOnce({ mode: 0o600 } as import("node:fs").Stats);

    const registry = loadCcxtAccountRegistry({ ccxtConfigPath: configPath });

    expect(registry.insecurePermissions).toBe(false);
  });

  it("rejects duplicate account names", () => {
    const configPath = writeConfigFile("dupes.json", {
      accounts: [
        {
          name: "shared_name",
          exchangeId: "binance",
          apiKey: "key1",
          secret: "secret1",
        },
        {
          name: "shared_name",
          exchangeId: "bybit",
          apiKey: "key2",
          secret: "secret2",
        },
      ],
    });

    const registry = loadCcxtAccountRegistry({ ccxtConfigPath: configPath });

    expect(registry.accounts).toHaveLength(1);
    expect(registry.accounts[0]?.exchangeId).toBe("binance");
    expect(registry.warnings).toEqual([
      expect.stringContaining("Duplicate account name 'shared_name'"),
    ]);
  });

  it("returns an empty registry when no config path is set", () => {
    const registry = loadCcxtAccountRegistry({});

    expect(registry.accounts).toEqual([]);
    expect(registry.warnings).toEqual([]);
  });
});

describe("ccxt account helpers", () => {
  it("redacts secrets when listing account summaries", () => {
    const configPath = writeConfigFile("summary.json", {
      accounts: [
        {
          name: "bybit_main",
          exchangeId: "bybit",
          apiKey: "key",
          secret: "secret",
          password: "password",
          uid: "uid-123",
          walletAddress: "0xabc",
          sandbox: true,
          defaultType: "swap",
        },
      ],
    });

    const registry = loadCcxtAccountRegistry({ ccxtConfigPath: configPath });
    const summaries = listAccountSummaries(registry);

    expect(summaries).toEqual([
      {
        name: "bybit_main",
        exchangeId: "bybit",
        defaultType: "swap",
        sandbox: true,
      },
    ]);
  });

  it("resolves account lookups and exchange IDs by name", () => {
    const configPath = writeConfigFile("lookup.json", {
      accounts: [
        {
          name: "kraken_main",
          exchangeId: "kraken",
          apiKey: "key",
          secret: "secret",
        },
      ],
    });

    const registry = loadCcxtAccountRegistry({ ccxtConfigPath: configPath });

    expect(getAccountByName(registry, "kraken_main")).toMatchObject({
      exchangeId: "kraken",
    });
    expect(resolveExchangeIdFromAccount(registry, "kraken_main")).toBe("kraken");
    expect(resolveExchangeIdFromAccount(registry, "missing")).toBeUndefined();
  });
});
