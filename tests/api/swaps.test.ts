import { beforeEach, describe, expect, it, vi } from "vitest";
import { Web3AgentError } from "../../src/api/errors.js";
import { TimeoutError } from "../../src/utils/timeout.js";

const mocks = vi.hoisted(() => ({
  getRuntime: vi.fn(),
  invokeAndRequireData: vi.fn(),
  getConfig: vi.fn(),
  parseInput: vi.fn(),
  getWalletState: vi.fn(),
  readAuditLog: vi.fn(),
  confirmationQueue: {
    list: vi.fn(),
  },
}));

vi.mock("../../src/api/shared.js", () => ({
  getRuntime: mocks.getRuntime,
  invokeAndRequireData: mocks.invokeAndRequireData,
}));

vi.mock("../../src/config/env.js", () => ({
  getConfig: mocks.getConfig,
}));

vi.mock("../../src/api/validation.js", () => ({
  parseInput: mocks.parseInput,
}));

vi.mock("../../src/wallet/persistence.js", () => ({
  getWalletState: mocks.getWalletState,
}));

vi.mock("../../src/wallet/audit.js", () => ({
  readAuditLog: mocks.readAuditLog,
}));

vi.mock("../../src/wallet/confirmation.js", () => ({
  confirmationQueue: mocks.confirmationQueue,
}));

import {
  executeBridge,
  executeSameChainSwap,
  getSwapHistory,
  getSwapQuote,
  isTokenSwappable,
} from "../../src/api/swaps.js";

describe("api/swaps", () => {
  const runtime = { invokeTool: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getRuntime.mockResolvedValue(runtime);
    mocks.getConfig.mockReturnValue({ chainId: 8453 });
    mocks.getWalletState.mockReturnValue({ address: "0x1234567890123456789012345678901234567890" });
    mocks.readAuditLog.mockResolvedValue([]);
    mocks.confirmationQueue.list.mockReturnValue([]);
    mocks.parseInput.mockImplementation((_schema: unknown, input: unknown) => input);
  });

  it("getSwapQuote uses lifi_get_quote for cross-chain params", async () => {
    const params = {
      fromChainId: 1,
      toChainId: 8453,
      fromToken: "0x1111111111111111111111111111111111111111",
      toToken: "0x2222222222222222222222222222222222222222",
      fromAmount: "100",
    };
    const quote = { routeId: "route-1" };
    mocks.invokeAndRequireData.mockResolvedValue(quote);

    const result = await getSwapQuote(params as never);

    expect(mocks.invokeAndRequireData).toHaveBeenCalledWith(runtime, "lifi_get_quote", params);
    expect(result).toEqual({
      kind: "cross-chain",
      provider: "lifi",
      quote,
    });
  });

  it("getSwapQuote uses orbs_get_quote for same-chain params", async () => {
    const params = {
      chainId: 8453,
      fromToken: "0x1111111111111111111111111111111111111111",
      toToken: "0x2222222222222222222222222222222222222222",
      fromAmount: "100",
    };
    const quote = { outAmount: "95" };
    mocks.invokeAndRequireData.mockResolvedValue(quote);

    const result = await getSwapQuote(params as never);

    expect(mocks.invokeAndRequireData).toHaveBeenCalledWith(runtime, "orbs_get_quote", params);
    expect(result).toEqual({
      kind: "same-chain",
      provider: "orbs",
      chainId: 8453,
      quote,
    });
  });

  it("getSwapQuote selects the native 0x adapter for Robinhood", async () => {
    // Given: a Robinhood request and an executable native 0x quote
    const params = {
      chainId: 4663,
      fromToken: "0x1111111111111111111111111111111111111111",
      toToken: "0x2222222222222222222222222222222222222222",
      fromAmount: "100",
      referencePrice: "1",
    };
    const quote = {
      adapterSource: "native",
      buyAmount: "95",
      capabilityDecisionId: "zeroex-goat-v2-admission-v1",
      capabilityReason: "goat-chain-4663-unavailable",
      sellAmount: "100",
    };
    mocks.invokeAndRequireData.mockResolvedValue(quote);

    // When: the SDK requests a same-chain quote
    const result = await getSwapQuote(params as never);

    // Then: 0x is invoked without sending the request through Orbs
    expect(mocks.invokeAndRequireData).toHaveBeenCalledWith(runtime, "zeroex_get_quote", params);
    expect(result).toEqual({
      kind: "same-chain",
      provider: "0x",
      chainId: 4663,
      quote,
      adapterSource: "native",
      capabilityDecisionId: "zeroex-goat-v2-admission-v1",
      capabilityReason: "goat-chain-4663-unavailable",
    });
  });

  it("rejects an adapter quote whose actual provenance disagrees with the selected native gate", async () => {
    // Given: the native gate is selected but the invoked adapter reports a different source
    const params = {
      chainId: 4663,
      fromToken: "0x1111111111111111111111111111111111111111",
      toToken: "0x2222222222222222222222222222222222222222",
      fromAmount: "100",
    };
    mocks.invokeAndRequireData.mockResolvedValue({
      adapterSource: "goat",
      buyAmount: "95",
      capabilityDecisionId: "zeroex-goat-v2-admission-v1",
      capabilityReason: "goat-capability-verified",
      sellAmount: "100",
    });

    // When: the stale/misleading adapter response reaches the router
    const result = getSwapQuote(params as never);

    // Then: it cannot be decorated as native or fall through to LI.FI
    await expect(result).rejects.toMatchObject({ code: "ZEROEX_ADAPTER_PROVENANCE_MISMATCH" });
    expect(mocks.invokeAndRequireData).toHaveBeenCalledTimes(1);
  });

  it("rejects an adapter quote that omits its actual provenance", async () => {
    // Given: a Robinhood adapter result without its required source fields
    const params = {
      chainId: 4663,
      fromToken: "0x1111111111111111111111111111111111111111",
      toToken: "0x2222222222222222222222222222222222222222",
      fromAmount: "100",
    };
    mocks.invokeAndRequireData.mockResolvedValue({ buyAmount: "95", sellAmount: "100" });

    // When: the SDK receives the incomplete adapter result
    const result = getSwapQuote(params as never);

    // Then: it fails before LI.FI can be considered
    await expect(result).rejects.toMatchObject({ code: "ZEROEX_ADAPTER_PROVENANCE_MISMATCH" });
    expect(mocks.invokeAndRequireData).toHaveBeenCalledTimes(1);
  });

  it("getSwapQuote falls back once to a same-chain LI.FI route for an exact 0x no-route error", async () => {
    // Given: a 0x no-route failure followed by a LI.FI same-chain quote
    const params = {
      chainId: 4663,
      fromToken: "0x1111111111111111111111111111111111111111",
      toToken: "0x2222222222222222222222222222222222222222",
      fromAmount: "100",
    };
    const lifiQuote = { routeId: "same-chain-fallback" };
    mocks.invokeAndRequireData
      .mockRejectedValueOnce(new Web3AgentError({ code: "ZEROEX_NO_ROUTE", message: "stable" }))
      .mockResolvedValueOnce(lifiQuote);

    // When: the primary provider reports a documented no-route class
    const result = await getSwapQuote(params as never);

    // Then: LI.FI is attempted exactly once with identical source and destination chains
    expect(mocks.invokeAndRequireData).toHaveBeenNthCalledWith(
      1,
      runtime,
      "zeroex_get_quote",
      params
    );
    expect(mocks.invokeAndRequireData).toHaveBeenNthCalledWith(2, runtime, "lifi_get_quote", {
      fromChainId: 4663,
      toChainId: 4663,
      fromToken: params.fromToken,
      toToken: params.toToken,
      fromAmount: params.fromAmount,
    });
    expect(result).toEqual({
      kind: "same-chain",
      provider: "lifi",
      chainId: 4663,
      quote: lifiQuote,
      adapterSource: "lifi",
      fallbackReason: "no-route",
      fallbackHistory: [{ provider: "0x", reason: "no-route" }],
    });
  });

  it("falls back once to LI.FI for the exact 0x provider-unavailable class", async () => {
    // Given: the only other documented fallback-eligible primary error
    const params = {
      chainId: 4663,
      fromToken: "0x1111111111111111111111111111111111111111",
      toToken: "0x2222222222222222222222222222222222222222",
      fromAmount: "100",
    };
    mocks.invokeAndRequireData
      .mockRejectedValueOnce(
        new Web3AgentError({ code: "ZEROEX_PROVIDER_UNAVAILABLE", message: "stable" })
      )
      .mockResolvedValueOnce({ routeId: "provider-unavailable-fallback" });

    // When: the provider explicitly reports temporary unavailability
    const result = await getSwapQuote(params as never);

    // Then: exactly one LI.FI fallback is recorded with the exact machine class
    expect(result).toMatchObject({
      adapterSource: "lifi",
      fallbackReason: "provider-unavailable",
      provider: "lifi",
    });
    expect(mocks.invokeAndRequireData).toHaveBeenCalledTimes(2);
  });

  it("getSwapQuote does not fall back when 0x authentication fails", async () => {
    // Given: a Robinhood request with an invalid 0x API key
    const params = {
      chainId: 4663,
      fromToken: "0x1111111111111111111111111111111111111111",
      toToken: "0x2222222222222222222222222222222222222222",
      fromAmount: "100",
    };
    mocks.invokeAndRequireData.mockRejectedValue(
      new Web3AgentError({ code: "ZEROEX_AUTHENTICATION", message: "stable" })
    );

    // When: the quote is requested
    const result = getSwapQuote(params as never);

    // Then: the typed auth failure propagates and LI.FI is never called
    await expect(result).rejects.toMatchObject({ code: "ZEROEX_AUTHENTICATION" });
    expect(mocks.invokeAndRequireData).toHaveBeenCalledTimes(1);
  });

  it.each([
    new TimeoutError("0x request interrupted"),
    new Web3AgentError({ code: "ZEROEX_RATE_LIMIT", message: "stable" }),
    new Web3AgentError({ code: "ZEROEX_REQUEST_FAILED", message: "retry exhausted" }),
  ])("does not fall back when the 0x adapter fails with %s", async (error) => {
    // Given: a non-fallbackable interruption, rate limit, or retry-exhausted error
    const params = {
      chainId: 4663,
      fromToken: "0x1111111111111111111111111111111111111111",
      toToken: "0x2222222222222222222222222222222222222222",
      fromAmount: "100",
    };
    mocks.invokeAndRequireData.mockRejectedValue(error);

    // When: the primary adapter rejects
    const result = getSwapQuote(params as never);

    // Then: its classification propagates without a LI.FI call
    await expect(result).rejects.toBe(error);
    expect(mocks.invokeAndRequireData).toHaveBeenCalledTimes(1);
  });

  it("normalizes history from actual 0x, LI.FI, and Orbs execution provenance", async () => {
    // Given: confirmed audit records whose actual execution differs from the queued tool name
    mocks.readAuditLog.mockResolvedValue([
      {
        action: "CONFIRMED",
        description: "0x fallback",
        metadata: {
          adapterSource: "lifi",
          fallbackReason: "no-route",
          provider: "lifi",
        },
        operationId: "fallback",
        operationType: "zeroex_lifi_fallback",
        timestamp: "2026-07-24T10:00:00.000Z",
        walletAddress: "0x1234567890123456789012345678901234567890",
      },
      {
        action: "CONFIRMED",
        description: "0x native",
        metadata: {
          adapterSource: "native",
          capabilityDecisionId: "zeroex-goat-v2-admission-v1",
          capabilityReason: "goat-chain-4663-unavailable",
          provider: "0x",
        },
        operationId: "native",
        operationType: "zeroex_swap",
        timestamp: "2026-07-24T09:00:00.000Z",
        walletAddress: "0x1234567890123456789012345678901234567890",
      },
      {
        action: "CONFIRMED",
        description: "orbs swap",
        metadata: { adapterSource: "orbs", provider: "orbs" },
        operationId: "orbs",
        operationType: "orbs_swap",
        timestamp: "2026-07-24T08:00:00.000Z",
        walletAddress: "0x1234567890123456789012345678901234567890",
      },
    ]);

    // When: the SDK reads swap history
    const result = await getSwapHistory();

    // Then: every provider reports the recorded execution source rather than current configuration
    expect(result.entries).toEqual([
      expect.objectContaining({
        adapterSource: "lifi",
        fallbackReason: "no-route",
        id: "fallback",
        provider: "lifi",
      }),
      expect.objectContaining({
        adapterSource: "native",
        id: "native",
        provider: "0x",
      }),
      expect.objectContaining({ adapterSource: "orbs", id: "orbs", provider: "orbs" }),
    ]);
  });

  it("reports a quarantined execution claim as failed swap history", async () => {
    // Given: restart recovery quarantined a swap whose submission outcome is uncertain
    mocks.readAuditLog.mockResolvedValue([
      {
        action: "EXECUTION_UNCERTAIN",
        description: "Claimed swap",
        operationId: "uncertain",
        operationType: "zeroex_swap",
        timestamp: "2026-07-24T10:00:00.000Z",
        walletAddress: "0x1234567890123456789012345678901234567890",
      },
    ]);

    // When: the SDK reads swap history
    const result = await getSwapHistory();

    // Then: the operation is not presented as pending or successfully executed
    expect(result.entries).toEqual([
      expect.objectContaining({ id: "uncertain", provider: "0x", status: "failed" }),
    ]);
  });

  it("keeps concurrent Robinhood fallback and legacy Orbs requests isolated", async () => {
    // Given: concurrent requests whose providers take different route decisions
    mocks.invokeAndRequireData.mockImplementation(
      async (_runtime: unknown, toolName: string): Promise<Record<string, unknown>> => {
        if (toolName === "zeroex_get_quote") {
          throw new Web3AgentError({ code: "ZEROEX_NO_ROUTE", message: "stable" });
        }
        if (toolName === "lifi_get_quote") return { routeId: "lifi-fallback" };
        if (toolName === "orbs_get_quote") return { outAmount: "95" };
        throw new Error(`Unexpected tool ${toolName}`);
      }
    );

    // When: both requests are evaluated without serialized global state
    const [robinhood, base] = await Promise.all([
      getSwapQuote({
        chainId: 4663,
        fromToken: "0x1111111111111111111111111111111111111111",
        toToken: "0x2222222222222222222222222222222222222222",
        fromAmount: "100",
      } as never),
      getSwapQuote({
        chainId: 8453,
        fromToken: "0x1111111111111111111111111111111111111111",
        toToken: "0x2222222222222222222222222222222222222222",
        fromAmount: "100",
      } as never),
    ]);

    // Then: the LI.FI fallback is confined to Robinhood and Base remains Orbs
    expect(robinhood).toMatchObject({ provider: "lifi", fallbackReason: "no-route" });
    expect(base).toMatchObject({ provider: "orbs", chainId: 8453 });
    expect(mocks.invokeAndRequireData).toHaveBeenCalledTimes(3);
  });

  it("isTokenSwappable returns swappable=true when quote succeeds", async () => {
    mocks.invokeAndRequireData.mockResolvedValue({ quote: "ok" });

    const result = await isTokenSwappable({
      chainId: 8453,
      fromToken: "0x1111111111111111111111111111111111111111",
      toToken: "0x2222222222222222222222222222222222222222",
      fromAmount: "100",
    } as never);

    expect(result).toEqual({
      swappable: true,
      provider: "orbs",
      kind: "same-chain",
    });
  });

  it("isTokenSwappable returns swappable=false with reason when quote fails", async () => {
    mocks.invokeAndRequireData.mockRejectedValue(new Error("no route available"));

    const result = await isTokenSwappable({
      chainId: 8453,
      fromToken: "0x1111111111111111111111111111111111111111",
      toToken: "0x2222222222222222222222222222222222222222",
      fromAmount: "100",
    } as never);

    expect(result).toEqual({
      swappable: false,
      provider: "orbs",
      kind: "same-chain",
      reason: "no route available",
    });
  });

  it("executeSameChainSwap invokes orbs_swap", async () => {
    const params = {
      chainId: 8453,
      fromToken: "0x1111111111111111111111111111111111111111",
      toToken: "0x2222222222222222222222222222222222222222",
      fromAmount: "100",
    };
    const pending = {
      status: "pending_confirmation",
      id: "op-1",
      summary: "Awaiting confirmation",
    };
    mocks.invokeAndRequireData.mockResolvedValue(pending);

    const result = await executeSameChainSwap(params as never);

    expect(mocks.invokeAndRequireData).toHaveBeenCalledWith(runtime, "orbs_swap", params);
    expect(result).toEqual(pending);
  });

  it("executeSameChainSwap invokes the native 0x queue tool on Robinhood", async () => {
    // Given: a queued Robinhood swap
    const params = {
      chainId: 4663,
      fromToken: "0x1111111111111111111111111111111111111111",
      toToken: "0x2222222222222222222222222222222222222222",
      fromAmount: "100",
    };
    const pending = {
      status: "pending_confirmation",
      id: "op-0x",
      summary: "Awaiting confirmation",
    };
    mocks.invokeAndRequireData.mockResolvedValue(pending);

    // When: the server-wallet swap is requested
    const result = await executeSameChainSwap(params as never);

    // Then: it uses the 0x confirmation queue driver rather than Orbs
    expect(mocks.invokeAndRequireData).toHaveBeenCalledWith(runtime, "zeroex_swap", params);
    expect(result).toEqual(pending);
  });

  it("rejects a completed 0x execution whose actual source disagrees with the selected adapter", async () => {
    // Given: an immediate 0x completion that falsely claims GOAT provenance
    const params = {
      chainId: 4663,
      fromToken: "0x1111111111111111111111111111111111111111",
      toToken: "0x2222222222222222222222222222222222222222",
      fromAmount: "100",
    };
    mocks.invokeAndRequireData.mockResolvedValue({
      adapterSource: "goat",
      capabilityDecisionId: "zeroex-goat-v2-admission-v1",
      capabilityReason: "goat-capability-verified",
      provider: "0x",
      status: "completed",
    });

    // When: confirmation is bypassed and the result reaches the SDK
    const result = executeSameChainSwap(params as never);

    // Then: it fails without a LI.FI execution retry
    await expect(result).rejects.toMatchObject({ code: "ZEROEX_ADAPTER_PROVENANCE_MISMATCH" });
    expect(mocks.invokeAndRequireData).toHaveBeenCalledTimes(1);
  });

  it("executeBridge invokes lifi_execute_bridge", async () => {
    const params = {
      fromChainId: 1,
      toChainId: 8453,
      fromToken: "0x1111111111111111111111111111111111111111",
      toToken: "0x2222222222222222222222222222222222222222",
      fromAmount: "100",
      walletAddress: "0x1234567890123456789012345678901234567890",
    };
    const resultData = { status: "submitted", txHash: "0xabc" };
    mocks.invokeAndRequireData.mockResolvedValue(resultData);

    const result = await executeBridge(params as never);

    expect(mocks.invokeAndRequireData).toHaveBeenCalledWith(runtime, "lifi_execute_bridge", params);
    expect(result).toEqual(resultData);
  });
});
