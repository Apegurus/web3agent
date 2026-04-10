import { mkdirSync, writeFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

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
        hasPassword: true,
        hasUid: true,
        hasWalletAddress: true,
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
