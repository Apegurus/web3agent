import { describe, expect, it, vi } from "vitest";

const POOL_MANAGER_CODE_HASH = "0xbd3881180b547f5fe817545743cfb4343e96b1bc6640dcd70c106b0066e95626";

describe("Uniswap v4 example read mode", () => {
  it("Given the example CLI, when --help runs, then it describes every safe mode without loading runtime operations", async () => {
    const { runUniswapV4Example } = await import("../../examples/uniswap-v4.mjs");
    const loadOperations = vi.fn();
    const write = vi.fn();

    await runUniswapV4Example({
      args: ["--help"],
      dependencies: { loadOperations },
      env: {},
      write,
    });

    expect(loadOperations).not.toHaveBeenCalled();
    expect(write).toHaveBeenCalledWith({
      modes: ["--read", "--prepare", "--simulate", "--execute"],
      usage: "node examples/uniswap-v4.mjs [--read|--prepare|--simulate|--execute]",
    });
  });

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

  it("Given live preparation without a real pool token, when --prepare runs, then it fails before loading runtime operations", async () => {
    const { runUniswapV4Example } = await import("../../examples/uniswap-v4.mjs");
    const loadOperations = vi.fn();

    await expect(
      runUniswapV4Example({
        args: ["--prepare"],
        dependencies: { loadOperations },
        env: {
          WEB3AGENT_EXAMPLE_ACCOUNT: "0x1111111111111111111111111111111111111111",
          WEB3AGENT_EXAMPLE_SOURCE_BLOCK_HASH: `0x${"aa".repeat(32)}`,
          WEB3AGENT_EXAMPLE_SOURCE_BLOCK_NUMBER: "1",
        },
      })
    ).rejects.toThrow("WEB3AGENT_EXAMPLE_CURRENCY1_ADDRESS");
    expect(loadOperations).not.toHaveBeenCalled();
  });
});
