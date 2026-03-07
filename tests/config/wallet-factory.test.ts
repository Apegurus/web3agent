import { http, createWalletClient } from "viem";
import type {} from "vitest/globals";
import { getChainById } from "../../src/chains/registry.js";
import { getConfig } from "../../src/config/env.js";
import { createWalletClientForChain } from "../../src/config/wallet-factory.js";

vi.mock("viem", () => ({
  http: vi.fn((url?: string) => ({ transport: "http", url })),
  createWalletClient: vi.fn((params: unknown) => ({ kind: "wallet-client", params })),
}));

vi.mock("../../src/chains/registry.js", () => ({
  getChainById: vi.fn(),
}));

vi.mock("../../src/config/env.js", () => ({
  getConfig: vi.fn(() => ({
    chainId: 8453,
    rpcUrl: "https://rpc.base.local",
  })),
}));

describe("wallet factory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getConfig).mockReturnValue({
      chainId: 8453,
      rpcUrl: "https://rpc.base.local",
      privateKey: undefined,
      mnemonic: undefined,
      walletAccountIndex: 0,
      walletAddressIndex: 0,
      confirmWrites: true,
      blockscoutMcpUrl: "https://mcp.blockscout.com/mcp",
      etherscanApiKey: undefined,
      lifiApiKey: undefined,
      zeroxApiKey: undefined,
      coingeckoApiKey: undefined,
    });
  });

  it("returns a wallet client for supported default chain using configured RPC", () => {
    const chain = { id: 8453, name: "Base" };
    vi.mocked(getChainById).mockReturnValue(chain as never);
    const account = { address: "0x1111111111111111111111111111111111111111", type: "json-rpc" };

    const client = createWalletClientForChain(account as never, 8453);

    expect(http).toHaveBeenCalledWith("https://rpc.base.local");
    expect(createWalletClient).toHaveBeenCalledWith({
      account,
      chain,
      transport: { transport: "http", url: "https://rpc.base.local" },
    });
    expect(client).toEqual({
      kind: "wallet-client",
      params: {
        account,
        chain,
        transport: { transport: "http", url: "https://rpc.base.local" },
      },
    });
  });

  it("returns a wallet client for non-default chain using fallback transport", () => {
    const chain = { id: 1, name: "Ethereum" };
    vi.mocked(getChainById).mockReturnValue(chain as never);
    const account = {
      address: "0x2222222222222222222222222222222222222222",
      type: "local",
      publicKey: "0x03",
      source: "privateKey",
    };

    createWalletClientForChain(account as never, 1);

    expect(http).toHaveBeenCalledWith();
    expect(createWalletClient).toHaveBeenCalledWith({
      account,
      chain,
      transport: { transport: "http", url: undefined },
    });
  });

  it("supports different account shapes across chain IDs", () => {
    vi.mocked(getChainById).mockImplementation(
      (chainId) => ({ id: chainId, name: `chain-${chainId}` }) as never
    );
    const accounts = [
      { address: "0x3333333333333333333333333333333333333333", type: "json-rpc" },
      {
        address: "0x4444444444444444444444444444444444444444",
        type: "local",
        publicKey: "0x02",
        source: "mnemonic",
      },
    ];

    createWalletClientForChain(accounts[0] as never, 8453);
    createWalletClientForChain(accounts[1] as never, 42161);

    expect(createWalletClient).toHaveBeenCalledTimes(2);
    expect(createWalletClient).toHaveBeenNthCalledWith(1, {
      account: accounts[0],
      chain: { id: 8453, name: "chain-8453" },
      transport: { transport: "http", url: "https://rpc.base.local" },
    });
    expect(createWalletClient).toHaveBeenNthCalledWith(2, {
      account: accounts[1],
      chain: { id: 42161, name: "chain-42161" },
      transport: { transport: "http", url: undefined },
    });
  });

  it("throws for unsupported chain IDs", () => {
    vi.mocked(getChainById).mockReturnValue(undefined);

    expect(() => {
      createWalletClientForChain(
        { address: "0x5555555555555555555555555555555555555555" } as never,
        9999999
      );
    }).toThrow("Unsupported chain ID: 9999999");
    expect(createWalletClient).not.toHaveBeenCalled();
  });
});
