import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getChainById: vi.fn(),
  getActiveAccount: vi.fn(),
  createWalletClientForChain: vi.fn(),
  createPublicClient: vi.fn(),
  getTransportForChain: vi.fn(),
}));

vi.mock("../../../src/chains/registry.js", () => ({
  getChainById: mocks.getChainById,
}));

vi.mock("../../../src/wallet/persistence.js", () => ({
  getActiveAccount: mocks.getActiveAccount,
}));

vi.mock("../../../src/config/wallet-factory.js", () => ({
  createWalletClientForChain: mocks.createWalletClientForChain,
  getTransportForChain: mocks.getTransportForChain,
}));

vi.mock("viem", async (importOriginal) => {
  const actual = await importOriginal<typeof import("viem")>();
  return {
    ...actual,
    createPublicClient: (...args: unknown[]) => mocks.createPublicClient(...args),
  };
});

import { buildWriteContext, isWriteContext } from "../../../src/tools/shared/write-context.js";

describe("write-context", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("buildWriteContext returns full context for a supported chain", () => {
    const chain = { id: 8453, name: "Base" };
    const account = { address: "0x1234567890123456789012345678901234567890" };
    const walletClient = { signMessage: vi.fn() };
    const publicClient = { readContract: vi.fn() };
    const transport = { type: "mock-transport" };

    mocks.getChainById.mockReturnValue(chain);
    mocks.getActiveAccount.mockReturnValue(account);
    mocks.createWalletClientForChain.mockReturnValue(walletClient);
    mocks.getTransportForChain.mockReturnValue(transport);
    mocks.createPublicClient.mockReturnValue(publicClient);

    const result = buildWriteContext(8453);

    expect(mocks.getChainById).toHaveBeenCalledWith(8453);
    expect(mocks.getActiveAccount).toHaveBeenCalled();
    expect(mocks.createWalletClientForChain).toHaveBeenCalledWith(account, 8453);
    expect(mocks.getTransportForChain).toHaveBeenCalledWith(8453);
    expect(mocks.createPublicClient).toHaveBeenCalledWith({ chain, transport });

    expect(isWriteContext(result)).toBe(true);
    if (!isWriteContext(result)) {
      expect.unreachable("expected WriteContext");
    }

    expect(result).toEqual({
      chainId: 8453,
      chain,
      account,
      walletClient,
      publicClient,
    });
  });

  it("buildWriteContext returns a tool error for unsupported chain", () => {
    mocks.getChainById.mockReturnValue(undefined);

    const result = buildWriteContext(99999);

    expect(isWriteContext(result)).toBe(false);
    expect(result).toMatchObject({
      isError: true,
      structuredContent: {
        ok: false,
        error: {
          code: "UNSUPPORTED_CHAIN",
          message: "Chain 99999 not supported",
        },
      },
    });
    expect(mocks.createWalletClientForChain).not.toHaveBeenCalled();
    expect(mocks.createPublicClient).not.toHaveBeenCalled();
  });

  it("isWriteContext discriminates between WriteContext and CallToolResult", () => {
    const writeContext = {
      chainId: 1,
      chain: { id: 1, name: "Ethereum" },
      account: { address: "0x1234567890123456789012345678901234567890" },
      walletClient: {},
      publicClient: {},
    } as unknown as Parameters<typeof isWriteContext>[0];
    const callToolResult = {
      content: [{ type: "text" as const, text: "error" }],
      isError: true,
      structuredContent: {
        ok: false,
        error: { code: "ERR", message: "failure" },
      },
    } as Parameters<typeof isWriteContext>[0];

    expect(isWriteContext(writeContext)).toBe(true);
    expect(isWriteContext(callToolResult)).toBe(false);
  });
});
