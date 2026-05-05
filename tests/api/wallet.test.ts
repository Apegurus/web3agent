import { beforeEach, describe, expect, it, vi } from "vitest";

const runtimeMocks = vi.hoisted(() => ({
  invokeTool: vi.fn(),
}));

vi.mock("../../src/runtime/default.js", () => ({
  getDefaultRuntime: vi.fn().mockResolvedValue({
    invokeTool: (...args: unknown[]) => runtimeMocks.invokeTool(...args),
  }),
}));

describe("wallet SDK functions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("getWalletInfo invokes wallet_info through the runtime", async () => {
    const walletInfoResult = {
      backend: "ows",
      backendReason: "OWS wallet backend available with encrypted vault support",
      vaultPath: "~/.web3agent/ows/",
      supportedChains: ["evm"],
      securityPosture: "encrypted-at-rest",
      passphraseConfigured: true,
      state: {
        mode: "read-only",
        address: "0x1111111111111111111111111111111111111111",
        chainId: 8453,
        accountIndex: 0,
        addressIndex: 0,
      },
    };
    runtimeMocks.invokeTool.mockResolvedValueOnce({
      isError: false,
      structuredContent: {
        ok: true,
        data: walletInfoResult,
      },
      content: [{ type: "text", text: JSON.stringify(walletInfoResult) }],
    });

    const { getWalletInfo } = await import("../../src/api/wallet.js");
    const result = await getWalletInfo();

    expect(result).toEqual(walletInfoResult);
    expect(runtimeMocks.invokeTool).toHaveBeenCalledWith("wallet_info", {});
  });

  it("root index exports wallet_info SDK function and schemas", async () => {
    const root = await import("../../src/index.js");

    expect(typeof root.getWalletInfo).toBe("function");
    expect(root.walletInfoSchema).toBeDefined();
    expect(root.walletInfoOutputSchema).toBeDefined();
  });
});
