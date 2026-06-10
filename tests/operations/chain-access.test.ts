import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RuntimeConfig } from "../../src/types/config.js";

const envMocks = vi.hoisted(() => ({
  tryGetConfig: vi.fn(),
  parseEnv: vi.fn(),
}));

const walletFactoryMocks = vi.hoisted(() => ({
  getTransportForChain: vi.fn(),
}));

vi.mock("../../src/config/env.js", () => ({
  tryGetConfig: (...args: unknown[]) => envMocks.tryGetConfig(...(args as [])),
  parseEnv: (...args: unknown[]) =>
    envMocks.parseEnv(...(args as [Partial<Record<string, string>>])),
}));

vi.mock("../../src/config/wallet-factory.js", () => ({
  getTransportForChain: (...args: unknown[]) => walletFactoryMocks.getTransportForChain(...args),
  createWalletClientForChain: vi.fn(),
}));

import { getRuntimeConfigForChain } from "../../src/operations/chain-access.js";

const baseConfig: RuntimeConfig = {
  chainId: 8453,
  privateKey: undefined,
  mnemonic: undefined,
  walletAccountIndex: 0,
  walletAddressIndex: 0,
  rpcUrl: "https://base.example",
  chainRpcUrls: { 1: "https://eth.example" },
  confirmWrites: true,
  confirmTtlMinutes: 30,
  etherscanApiKey: undefined,
  lifiApiKey: undefined,
  zeroxApiKey: undefined,
  coingeckoApiKey: undefined,
  orbsPartner: undefined,
  acpContractAddress: undefined,
  acpPaymentToken: undefined,
  pinataJwt: undefined,
  erc8004AgentUri: undefined,
  agdpApiUrl: "https://agdp.example",
};

describe("resolveRuntimeConfig", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    walletFactoryMocks.getTransportForChain.mockReturnValue({ transport: "ok" });
  });

  it("prefers the explicit runtime config when provided", () => {
    const result = getRuntimeConfigForChain(1, baseConfig);

    expect(result).toBe(baseConfig);
    expect(envMocks.tryGetConfig).not.toHaveBeenCalled();
    expect(envMocks.parseEnv).not.toHaveBeenCalled();
  });

  it("uses initialized runtime config when available", () => {
    envMocks.tryGetConfig.mockReturnValue(baseConfig);

    const result = getRuntimeConfigForChain(8453);

    expect(envMocks.tryGetConfig).toHaveBeenCalled();
    expect(result).toBe(baseConfig);
  });

  it("falls back to parseEnv(process.env) when config is not initialized", () => {
    envMocks.tryGetConfig.mockReturnValue(undefined);
    envMocks.parseEnv.mockReturnValue({ ...baseConfig, chainId: 1 });

    const result = getRuntimeConfigForChain(1);

    expect(envMocks.parseEnv).toHaveBeenCalledWith(
      expect.objectContaining({
        CHAIN_ID: "1",
      })
    );
    expect(result.chainId).toBe(1);
  });
});
