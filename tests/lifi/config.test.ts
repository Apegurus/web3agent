import type {} from "vitest/globals";

vi.mock("@lifi/sdk", () => ({
  createConfig: vi.fn(),
  EVM: vi.fn((provider: unknown) => ({ provider })),
}));

vi.mock("../../src/config/wallet-factory.js", () => ({
  createWalletClientForChain: vi.fn(),
}));

vi.mock("../../src/wallet/persistence.js", () => ({
  getActiveAccount: vi.fn(),
  getWalletState: vi.fn(),
}));

describe("LI.FI config initialization", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("calls createConfig with integrator, provider, and API key when provided", async () => {
    const { createConfig, EVM } = await import("@lifi/sdk");
    const { getActiveAccount, getWalletState } = await import("../../src/wallet/persistence.js");
    const { createWalletClientForChain } = await import("../../src/config/wallet-factory.js");
    const { initializeLifi } = await import("../../src/lifi/config.js");

    const account = { address: "0x1111111111111111111111111111111111111111", type: "json-rpc" };
    const walletClient = { id: "wallet-client" };

    vi.mocked(getActiveAccount).mockReturnValue(account as never);
    vi.mocked(getWalletState).mockReturnValue({
      mode: "private-key",
      address: "0x1111111111111111111111111111111111111111",
      chainId: 8453,
      accountIndex: 0,
      addressIndex: 0,
    });
    vi.mocked(createWalletClientForChain).mockReturnValue(walletClient as never);

    initializeLifi("lifi-key");

    expect(EVM).toHaveBeenCalledTimes(1);
    expect(createConfig).toHaveBeenCalledTimes(1);
    expect(createConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        integrator: "web3agent",
        apiKey: "lifi-key",
      })
    );

    const providerConfig = vi.mocked(EVM).mock.calls[0][0] as {
      getWalletClient: () => Promise<unknown>;
      switchChain: (chainId: number) => Promise<unknown>;
    };

    await expect(providerConfig.getWalletClient()).resolves.toEqual(walletClient);
    expect(createWalletClientForChain).toHaveBeenCalledWith(account, 8453);

    await expect(providerConfig.switchChain(10)).resolves.toEqual(walletClient);
    expect(createWalletClientForChain).toHaveBeenLastCalledWith(account, 10);
  });

  it("does not pass API key when omitted", async () => {
    const { createConfig } = await import("@lifi/sdk");
    const { initializeLifi } = await import("../../src/lifi/config.js");

    initializeLifi();

    expect(createConfig).toHaveBeenCalledTimes(1);
    expect(createConfig).toHaveBeenCalledWith(
      expect.not.objectContaining({
        apiKey: expect.anything(),
      })
    );
  });

  it("is idempotent and only configures once", async () => {
    const { createConfig, EVM } = await import("@lifi/sdk");
    const { initializeLifi } = await import("../../src/lifi/config.js");

    initializeLifi("first-key");
    initializeLifi("second-key");

    expect(EVM).toHaveBeenCalledTimes(1);
    expect(createConfig).toHaveBeenCalledTimes(1);
    expect(createConfig).toHaveBeenCalledWith(expect.objectContaining({ apiKey: "first-key" }));
  });

  it("propagates errors from wallet client creation in provider callbacks", async () => {
    const { EVM } = await import("@lifi/sdk");
    const { getActiveAccount, getWalletState } = await import("../../src/wallet/persistence.js");
    const { createWalletClientForChain } = await import("../../src/config/wallet-factory.js");
    const { initializeLifi } = await import("../../src/lifi/config.js");

    const account = { address: "0x2222222222222222222222222222222222222222", type: "json-rpc" };
    const failure = new Error("wallet unavailable");

    vi.mocked(getActiveAccount).mockReturnValue(account as never);
    vi.mocked(getWalletState).mockReturnValue({
      mode: "mnemonic",
      address: "0x2222222222222222222222222222222222222222",
      chainId: 1,
      accountIndex: 0,
      addressIndex: 0,
    });
    vi.mocked(createWalletClientForChain).mockImplementation(() => {
      throw failure;
    });

    initializeLifi();

    const providerConfig = vi.mocked(EVM).mock.calls[0][0] as {
      getWalletClient: () => Promise<unknown>;
      switchChain: (chainId: number) => Promise<unknown>;
    };

    await expect(providerConfig.getWalletClient()).rejects.toThrow("wallet unavailable");
    await expect(providerConfig.switchChain(8453)).rejects.toThrow("wallet unavailable");
  });
});
