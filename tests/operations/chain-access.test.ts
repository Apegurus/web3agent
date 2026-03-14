import { beforeEach, describe, expect, it, vi } from "vitest";

const envMocks = vi.hoisted(() => ({
  getConfig: vi.fn(),
  parseEnv: vi.fn(),
}));

const walletFactoryMocks = vi.hoisted(() => ({
  getTransportForChain: vi.fn(),
}));

vi.mock("../../src/config/env.js", () => ({
  getConfig: (...args: unknown[]) => envMocks.getConfig(...args),
  parseEnv: (...args: unknown[]) => envMocks.parseEnv(...args),
}));

vi.mock("../../src/config/wallet-factory.js", () => ({
  getTransportForChain: (...args: unknown[]) => walletFactoryMocks.getTransportForChain(...args),
  createWalletClientForChain: vi.fn(),
}));

describe("ChainAccess", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    walletFactoryMocks.getTransportForChain.mockReturnValue({ transport: "ok" });
  });

  it("prefers the explicit runtime config when provided", async () => {
    const { ChainAccess } = await import("../../src/operations/chain-access.js");
    const config = {
      chainId: 8453,
      privateKey: undefined,
      mnemonic: undefined,
      walletAccountIndex: 0,
      walletAddressIndex: 0,
      rpcUrl: "https://base.example",
      chainRpcUrls: { 1: "https://eth.example" },
      confirmWrites: true,
      confirmTtlMinutes: 30,
      blockscoutMcpUrl: "https://blockscout.example",
      etherscanMcpUrl: "https://etherscan.example",
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

    const access = new ChainAccess(config);
    access.getTransport(1);

    expect(walletFactoryMocks.getTransportForChain).toHaveBeenCalledWith(1, config);
    expect(envMocks.getConfig).not.toHaveBeenCalled();
    expect(envMocks.parseEnv).not.toHaveBeenCalled();
    expect(access.getRpcUrl(1)).toBe("https://eth.example");
  });

  it("uses initialized runtime config when no explicit config is passed", async () => {
    const cachedConfig = {
      chainId: 8453,
      privateKey: undefined,
      mnemonic: undefined,
      walletAccountIndex: 0,
      walletAddressIndex: 0,
      rpcUrl: "https://base.example",
      chainRpcUrls: {},
      confirmWrites: true,
      confirmTtlMinutes: 30,
      blockscoutMcpUrl: "https://blockscout.example",
      etherscanMcpUrl: "https://etherscan.example",
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
    envMocks.getConfig.mockReturnValue(cachedConfig);

    const { ChainAccess } = await import("../../src/operations/chain-access.js");
    const access = new ChainAccess();
    access.getTransport(8453);

    expect(envMocks.getConfig).toHaveBeenCalled();
    expect(walletFactoryMocks.getTransportForChain).toHaveBeenCalledWith(8453, cachedConfig);
    expect(access.getRpcUrl(8453)).toBe("https://base.example");
  });

  it("falls back to parseEnv(process.env) merged with the requested chainId", async () => {
    envMocks.getConfig.mockImplementation(() => {
      throw new Error("Config not initialized");
    });
    envMocks.parseEnv.mockImplementation((env: Record<string, string | undefined>) => ({
      chainId: Number(env.CHAIN_ID),
      privateKey: undefined,
      mnemonic: undefined,
      walletAccountIndex: 0,
      walletAddressIndex: 0,
      rpcUrl: env.RPC_URL,
      chainRpcUrls: env.RPC_URL_1 ? { 1: env.RPC_URL_1 } : {},
      confirmWrites: true,
      confirmTtlMinutes: 30,
      blockscoutMcpUrl: "https://blockscout.example",
      etherscanMcpUrl: "https://etherscan.example",
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
    }));

    const previousRpcUrl = process.env.RPC_URL;
    const previousChainRpc = process.env.RPC_URL_1;
    process.env.RPC_URL = "https://base.from-env";
    process.env.RPC_URL_1 = "https://eth.from-env";

    try {
      const { ChainAccess } = await import("../../src/operations/chain-access.js");
      const access = new ChainAccess();
      access.getTransport(1);

      expect(envMocks.parseEnv).toHaveBeenCalledWith(
        expect.objectContaining({
          CHAIN_ID: "1",
          RPC_URL: "https://base.from-env",
          RPC_URL_1: "https://eth.from-env",
        })
      );
      expect(walletFactoryMocks.getTransportForChain).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          chainId: 1,
          chainRpcUrls: { 1: "https://eth.from-env" },
        })
      );
    } finally {
      process.env.RPC_URL = previousRpcUrl;
      process.env.RPC_URL_1 = previousChainRpc;
    }
  });
});
