import { describe, expect, it, vi } from "vitest";

const POOL_MANAGER_CODE_HASH = "0xbd3881180b547f5fe817545743cfb4343e96b1bc6640dcd70c106b0066e95626";

describe("Uniswap v4 example read mode", () => {
  it("Given a deterministic Robinhood RPC read, when --read runs, then it never touches runtime, wallet, or confirmation state", async () => {
    const { runUniswapV4Example } = await import("../../examples/uniswap-v4.mjs");
    const getChainId = vi.fn().mockResolvedValue(4663);
    const getCode = vi.fn().mockResolvedValue("0x6000");
    const createPublicClient = vi.fn(() => ({ getChainId, getCode }));
    const getRuntime = vi.fn(() => {
      throw new Error("--read must not initialize the managed runtime");
    });
    const getWallet = vi.fn(() => {
      throw new Error("--read must not access a wallet");
    });
    const getConfirmationQueue = vi.fn(() => {
      throw new Error("--read must not access the confirmation queue");
    });
    const write = vi.fn();

    await runUniswapV4Example({
      args: ["--read"],
      dependencies: {
        createPublicClient,
        getConfirmationQueue,
        getRuntime,
        getWallet,
        hashCode: () => POOL_MANAGER_CODE_HASH,
      },
      env: {},
      write,
    });

    expect(getChainId).toHaveBeenCalledTimes(1);
    expect(getCode).toHaveBeenCalledTimes(1);
    expect(getRuntime).not.toHaveBeenCalled();
    expect(getWallet).not.toHaveBeenCalled();
    expect(getConfirmationQueue).not.toHaveBeenCalled();
    expect(write).toHaveBeenCalledWith(
      expect.objectContaining({
        chainId: 4663,
        poolManagerCodeHash: POOL_MANAGER_CODE_HASH,
      })
    );
  });
});
