import { describe, expect, it } from "vitest";
import { parseEnv } from "../../src/config/env.js";

describe("runtime config parsing", () => {
  it("defaults to Base (8453) when CHAIN_ID not set", () => {
    const config = parseEnv({});
    expect(config.chainId).toBe(8453);
  });

  it("overrides chainId from CHAIN_ID env", () => {
    const config = parseEnv({ CHAIN_ID: "1" });
    expect(config.chainId).toBe(1);
  });

  it("defaults confirmWrites to true", () => {
    const config = parseEnv({});
    expect(config.confirmWrites).toBe(true);
  });

  it("parses CONFIRM_WRITES=false correctly", () => {
    const config = parseEnv({ CONFIRM_WRITES: "false" });
    expect(config.confirmWrites).toBe(false);
  });

  it("parses CONFIRM_WRITES=0 as false", () => {
    const config = parseEnv({ CONFIRM_WRITES: "0" });
    expect(config.confirmWrites).toBe(false);
  });

  it("parses CONFIRM_WRITES=no as false", () => {
    const config = parseEnv({ CONFIRM_WRITES: "no" });
    expect(config.confirmWrites).toBe(false);
  });

  it("accepts PRIVATE_KEY", () => {
    const config = parseEnv({ PRIVATE_KEY: "0xdeadbeef" });
    expect(config.privateKey).toBe("0xdeadbeef");
  });

  it("accepts optional API keys", () => {
    const config = parseEnv({ LIFI_API_KEY: "abc123" });
    expect(config.lifiApiKey).toBe("abc123");
  });

  it("accepts an optional CCXT_CONFIG_PATH", () => {
    const config = parseEnv({ CHAIN_ID: "8453", CCXT_CONFIG_PATH: "/tmp/ccxt.json" });
    expect(config.ccxtConfigPath).toBe("/tmp/ccxt.json");
  });

  it("defaults CCXT_CONFIG_PATH to undefined", () => {
    const config = parseEnv({ CHAIN_ID: "8453" });
    expect(config.ccxtConfigPath).toBeUndefined();
  });

  it("defaults confirmTtlMinutes to 30", () => {
    const config = parseEnv({});
    expect(config.confirmTtlMinutes).toBe(30);
  });

  it("parses CONFIRM_TTL_MINUTES from env", () => {
    const config = parseEnv({ CONFIRM_TTL_MINUTES: "5" });
    expect(config.confirmTtlMinutes).toBe(5);
  });

  it("defaults wallet indices to 0", () => {
    const config = parseEnv({});
    expect(config.walletAccountIndex).toBe(0);
    expect(config.walletAddressIndex).toBe(0);
  });

  it("parses wallet indices from env", () => {
    const config = parseEnv({
      WALLET_ACCOUNT_INDEX: "2",
      WALLET_ADDRESS_INDEX: "3",
    });
    expect(config.walletAccountIndex).toBe(2);
    expect(config.walletAddressIndex).toBe(3);
  });

  it("rejects Infinity in policy numeric env vars", () => {
    expect(() => parseEnv({ POLICY_MAX_DAILY_USD: "Infinity" })).toThrow();
    expect(() => parseEnv({ POLICY_MAX_DAILY_USD: "-Infinity" })).toThrow();
  });
});
