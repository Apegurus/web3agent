import { constructSDK } from "@orbs-network/liquidity-hub-sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getConfig } from "../../src/config/env.js";

type MockSdk = {
  getQuote: ReturnType<typeof vi.fn>;
  swap: ReturnType<typeof vi.fn>;
};

const sdkInstances = new Map<string, MockSdk>();

function findSdkForChain(chainId: number): MockSdk | undefined {
  return Array.from(sdkInstances.entries()).find(([key]) => key.startsWith(`${chainId}:`))?.[1];
}

vi.mock("../../src/config/env.js", () => ({
  getConfig: vi.fn().mockReturnValue({ orbsPartner: undefined }),
}));

vi.mock("@orbs-network/liquidity-hub-sdk", () => ({
  constructSDK: vi.fn((options: { partner: string; chainId: number }) => {
    const instance: MockSdk = {
      getQuote: vi.fn(),
      swap: vi.fn(),
    };
    sdkInstances.set(`${options.chainId}:${options.partner}`, instance);
    return instance;
  }),
}));

describe("orbs/liquidity-hub", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    sdkInstances.clear();
    vi.mocked(getConfig).mockReset();
    vi.mocked(getConfig).mockReturnValue({ orbsPartner: undefined });
    const { clearLiquidityHubSdkCacheForTests } = await import("../../src/orbs/liquidity-hub.js");
    clearLiquidityHubSdkCacheForTests();
  });

  it("getQuote returns normalized quote for valid params", async () => {
    const { getQuote, getSdk } = await import("../../src/orbs/liquidity-hub.js");

    getSdk(8453);

    const createdSdk = findSdkForChain(8453);
    if (!createdSdk) {
      throw new Error("SDK instance not created for chain 8453");
    }

    createdSdk.getQuote.mockResolvedValue({
      inToken: "0xTokenA",
      outToken: "0xTokenB",
      inAmount: "1000000000000000000",
      outAmount: "2000000000",
      minAmountOut: "1990000000",
      exchange: "paraswap",
      error: undefined,
    });

    const result = await getQuote(8453, {
      fromToken: "0xTokenA",
      toToken: "0xTokenB",
      inAmount: "1000000000000000000",
      account: "0xAccount",
    });

    expect(createdSdk.getQuote).toHaveBeenCalledWith({
      fromToken: "0xTokenA",
      toToken: "0xTokenB",
      inAmount: "1000000000000000000",
      slippage: 0.5,
      account: "0xAccount",
    });
    expect(result).toEqual({
      inToken: "0xTokenA",
      outToken: "0xTokenB",
      inAmount: "1000000000000000000",
      outAmount: "2000000000",
      minAmountOut: "1990000000",
      exchange: "paraswap",
    });
  });

  it("getSdk caches sdk instances per chain", async () => {
    const { getSdk } = await import("../../src/orbs/liquidity-hub.js");

    const baseFirst = getSdk(8453);
    const baseSecond = getSdk(8453);
    const polygon = getSdk(137);

    expect(baseFirst).toBe(baseSecond);
    expect(baseFirst).not.toBe(polygon);
    expect(constructSDK).toHaveBeenCalledTimes(2);
    expect(constructSDK).toHaveBeenNthCalledWith(1, { partner: "intentx", chainId: 8453 });
    expect(constructSDK).toHaveBeenNthCalledWith(2, { partner: "quickswap", chainId: 137 });
  });

  it("falls back to process env when config is not initialized", async () => {
    const getConfigMock = vi.mocked(getConfig);
    const previousPartner = process.env.ORBS_PARTNER;
    process.env.ORBS_PARTNER = "orbzy";
    getConfigMock.mockImplementation(() => {
      throw new Error("Config not initialized — call setConfig() during startup");
    });

    try {
      const { getSdk } = await import("../../src/orbs/liquidity-hub.js");
      getSdk(8453);

      expect(constructSDK).toHaveBeenCalledWith({ partner: "orbzy", chainId: 8453 });
    } finally {
      if (previousPartner === undefined) {
        process.env.ORBS_PARTNER = undefined;
      } else {
        process.env.ORBS_PARTNER = previousPartner;
      }
    }
  });

  it("creates distinct cached SDK instances when the partner override changes", async () => {
    const getConfigMock = vi.mocked(getConfig);
    const { getSdk } = await import("../../src/orbs/liquidity-hub.js");

    getConfigMock.mockReturnValue({ orbsPartner: "orbzy" });
    const orbzySdk = getSdk(8453);

    getConfigMock.mockReturnValue({ orbsPartner: "widget" });
    const widgetSdk = getSdk(8453);

    expect(orbzySdk).not.toBe(widgetSdk);
    expect(constructSDK).toHaveBeenNthCalledWith(1, { partner: "orbzy", chainId: 8453 });
    expect(constructSDK).toHaveBeenNthCalledWith(2, { partner: "widget", chainId: 8453 });
  });

  it("getQuote surfaces network failures", async () => {
    const { getQuote, getSdk } = await import("../../src/orbs/liquidity-hub.js");

    getSdk(8453);

    const createdSdk = findSdkForChain(8453);
    if (!createdSdk) {
      throw new Error("SDK instance not created for chain 8453");
    }
    createdSdk.getQuote.mockRejectedValue(new Error("network unavailable"));

    await expect(
      getQuote(8453, {
        fromToken: "0xTokenA",
        toToken: "0xTokenB",
        inAmount: "1000",
      })
    ).rejects.toThrow("network unavailable");
  });

  it("getQuote throws when SDK returns quote error", async () => {
    const { getQuote, getSdk } = await import("../../src/orbs/liquidity-hub.js");

    getSdk(8453);

    const createdSdk = findSdkForChain(8453);
    if (!createdSdk) {
      throw new Error("SDK instance not created for chain 8453");
    }
    createdSdk.getQuote.mockResolvedValue({
      inToken: "0xTokenA",
      outToken: "0xTokenB",
      inAmount: "1000",
      outAmount: "0",
      minAmountOut: "0",
      exchange: "none",
      error: "no route",
    });

    await expect(
      getQuote(8453, {
        fromToken: "0xTokenA",
        toToken: "0xTokenB",
        inAmount: "1000",
        slippage: 1,
      })
    ).rejects.toThrow("Liquidity Hub quote error: no route");
    expect(createdSdk.getQuote).toHaveBeenCalledWith({
      fromToken: "0xTokenA",
      toToken: "0xTokenB",
      inAmount: "1000",
      slippage: 1,
      account: undefined,
    });
  });

  it("creates independent SDK instances for different chain ids", async () => {
    const { getQuote, getSdk } = await import("../../src/orbs/liquidity-hub.js");

    getSdk(8453);
    getSdk(137);

    const baseSdk = findSdkForChain(8453);
    const polygonSdk = findSdkForChain(137);
    if (!baseSdk || !polygonSdk) {
      throw new Error("SDK instance not created for one of the requested chains");
    }

    const payload = {
      inToken: "0xA",
      outToken: "0xB",
      inAmount: "1",
      outAmount: "2",
      minAmountOut: "2",
      exchange: "mock",
      error: undefined,
    };
    baseSdk.getQuote.mockResolvedValue(payload);
    polygonSdk.getQuote.mockResolvedValue(payload);

    const [baseQuote, polygonQuote] = await Promise.all([
      getQuote(8453, {
        fromToken: "0xA",
        toToken: "0xB",
        inAmount: "1",
      }),
      getQuote(137, {
        fromToken: "0xA",
        toToken: "0xB",
        inAmount: "1",
      }),
    ]);

    expect(constructSDK).toHaveBeenCalledTimes(2);
    expect(baseSdk.getQuote).toHaveBeenCalledTimes(1);
    expect(polygonSdk.getQuote).toHaveBeenCalledTimes(1);
    expect(baseQuote.exchange).toBe("mock");
    expect(polygonQuote.exchange).toBe("mock");
  });
});
