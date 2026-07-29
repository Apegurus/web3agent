import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getConfig: vi.fn(),
  getWalletState: vi.fn(),
  getActiveAccount: vi.fn(),
  sendTransaction: vi.fn(),
  enqueue: vi.fn(),
  registerExecutor: vi.fn(),
  getZeroExQuote: vi.fn(),
  classifyZeroExError: vi.fn(),
  executeLifiRoute: vi.fn(),
  prepareLifiRoute: vi.fn(),
  executePreparedLifiRoute: vi.fn(),
  createPublicClient: vi.fn(),
}));

vi.mock("../../src/config/env.js", () => ({ getConfig: mocks.getConfig }));
vi.mock("../../src/wallet/persistence.js", () => ({
  getWalletState: mocks.getWalletState,
  getActiveAccount: mocks.getActiveAccount,
}));
vi.mock("../../src/config/wallet-factory.js", () => ({
  createWalletClientForChain: vi.fn(() => ({ sendTransaction: mocks.sendTransaction })),
  getTransportForChain: vi.fn(),
}));
vi.mock("../../src/wallet/confirmation.js", () => ({
  confirmationQueue: { enabled: true, enqueue: mocks.enqueue },
  registerExecutor: mocks.registerExecutor,
}));
vi.mock("../../src/zerox/client.js", () => ({
  getZeroExQuote: mocks.getZeroExQuote,
  classifyZeroExError: mocks.classifyZeroExError,
}));
vi.mock("../../src/lifi/route-execution.js", () => ({
  executeLifiRoute: mocks.executeLifiRoute,
  prepareLifiRoute: mocks.prepareLifiRoute,
  executePreparedLifiRoute: mocks.executePreparedLifiRoute,
}));
vi.mock("viem", async (importOriginal) => {
  const viem = await importOriginal<typeof import("viem")>();
  return { ...viem, createPublicClient: mocks.createPublicClient };
});

import { Web3AgentError } from "../../src/api/errors.js";
import { executeZeroExSwapNow, zeroExGetQuote, zeroExSwap } from "../../src/tools/zerox/index.js";

const params = {
  chainId: 4663,
  fromToken: "0x1111111111111111111111111111111111111111",
  toToken: "0x2222222222222222222222222222222222222222",
  fromAmount: "1000000",
};

const allowanceHolder = "0x0000000000001fF3684f28c67538d4D072C22734";
const settler = "0x4444444444444444444444444444444444444444";
const previousSettler = "0x6666666666666666666666666666666666666666";
const preparedLifiRoute = {
  id: "lifi-route",
  steps: [
    {
      id: "lifi-step",
      action: {
        fromChainId: 4663,
        toChainId: 4663,
        fromToken: { address: "0x1111111111111111111111111111111111111111" },
        toToken: { address: "0x2222222222222222222222222222222222222222" },
        fromAmount: "1000000",
        toAmount: "950000",
      },
      transactionRequest: {
        to: "0x7777777777777777777777777777777777777777",
        data: "0x1234",
        value: "0",
      },
    },
  ],
};

let queuedParams: Record<string, unknown> | undefined;
let queuedExecutor: ((params: Record<string, unknown>) => Promise<unknown>) | undefined;

function getQueuedParams(): Record<string, unknown> {
  if (!queuedParams) throw new Error("Expected a confirmed execution payload to be queued");
  return queuedParams;
}

function getQueuedExecutor(): (params: Record<string, unknown>) => Promise<unknown> {
  if (!queuedExecutor) throw new Error("Expected a confirmation executor to be queued");
  return queuedExecutor;
}

describe("Robinhood native 0x tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getConfig.mockReturnValue({ chainId: 4663, chainRpcUrls: {}, zeroxApiKey: "test-key" });
    mocks.getWalletState.mockReturnValue({
      mode: "private-key",
      address: "0x3333333333333333333333333333333333333333",
      chainId: 4663,
    });
    mocks.getActiveAccount.mockReturnValue({
      address: "0x3333333333333333333333333333333333333333",
    });
    mocks.enqueue.mockReturnValue({ queued: true, id: "queued-0x", summary: "queued" });
    mocks.enqueue.mockImplementation(
      (
        _toolName: string,
        _description: string,
        queued: Record<string, unknown>,
        executor: (params: Record<string, unknown>) => Promise<unknown>
      ) => {
        queuedParams = queued;
        queuedExecutor = executor;
        return { queued: true, id: "queued-0x", summary: "queued" };
      }
    );
    mocks.createPublicClient.mockReturnValue({
      getBlockNumber: vi.fn().mockResolvedValue(123n),
      readContract: vi.fn().mockResolvedValueOnce(settler).mockResolvedValueOnce(previousSettler),
    });
    mocks.getZeroExQuote.mockResolvedValue({
      provider: "0x",
      chainId: 4663,
      adapterSource: "native",
      capabilityDecisionId: "zeroex-goat-v2-admission-v1",
      capabilityReason: "goat-chain-4663-unavailable",
      buyAmount: "950000",
      sellAmount: "1000000",
      transaction: {
        to: settler,
        data: "0x1234",
        value: "0",
      },
      allowance: {
        target: allowanceHolder,
        amount: "1000000",
      },
    });
    mocks.classifyZeroExError.mockReturnValue({ kind: "unknown", fallbackAllowed: false });
    mocks.sendTransaction.mockResolvedValueOnce("0xapprove").mockResolvedValueOnce("0xswap");
  });

  it("fetches and validates immutable 0x execution facts before queueing without a wallet send", async () => {
    // Given: confirmation is enabled for a 0x swap
    const result = await zeroExSwap(params);

    // When: the request enters the write gate
    const data = result.structuredContent;

    // Then: the queue receives the exact quote facts and no wallet send occurs
    expect(data).toEqual({
      ok: true,
      data: { status: "pending_confirmation", id: "queued-0x", summary: "queued" },
    });
    expect(mocks.enqueue).toHaveBeenCalledWith(
      "zeroex_swap",
      expect.stringContaining("0x swap"),
      expect.objectContaining({
        ...params,
        execution: expect.objectContaining({
          provider: "0x",
          sellAmount: params.fromAmount,
          transaction: expect.objectContaining({ to: settler, data: "0x1234", value: "0" }),
          allowance: expect.objectContaining({
            target: allowanceHolder,
            amount: params.fromAmount,
          }),
          settler: expect.objectContaining({
            blockNumber: "123",
            owner: settler,
            previousOwner: previousSettler,
          }),
        }),
      }),
      executeZeroExSwapNow,
      "0x3333333333333333333333333333333333333333",
      "financial"
    );
    expect(mocks.getZeroExQuote).toHaveBeenCalledTimes(1);
    expect(mocks.sendTransaction).not.toHaveBeenCalled();
  });

  it("executes only the persisted approval and v2 transaction after confirmation", async () => {
    // Given: a confirmed payload prepared from an executable 0x quote
    await zeroExSwap(params);

    // When: the queued executor receives those persisted facts
    const result = await executeZeroExSwapNow(getQueuedParams());
    const data = result.structuredContent;

    // Then: no quote is refetched and approval then swap use only the persisted facts
    expect(mocks.getZeroExQuote).toHaveBeenCalledTimes(1);
    expect(mocks.sendTransaction).toHaveBeenCalledTimes(2);
    expect(mocks.sendTransaction).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        to: settler,
        data: "0x1234",
        value: 0n,
      })
    );
    expect(data).toEqual({
      ok: true,
      data: {
        status: "completed",
        txHash: "0xswap",
        provider: "0x",
        chainId: 4663,
        adapterSource: "native",
        capabilityDecisionId: "zeroex-goat-v2-admission-v1",
        capabilityReason: "goat-chain-4663-unavailable",
      },
    });
  });

  it("rejects a tampered confirmed sell amount before any wallet call", async () => {
    // Given: an attacker-controlled payload whose sell amount no longer matches the confirmed intent
    const result = await executeZeroExSwapNow({
      ...params,
      execution: {
        provider: "0x",
        chainId: 4663,
        taker: "0x3333333333333333333333333333333333333333",
        sellAmount: "1000001",
        transaction: { to: settler, data: "0x1234", value: "0" },
        allowance: { target: allowanceHolder, amount: "1000001" },
        settler: { blockNumber: "123", owner: settler, previousOwner: previousSettler },
      },
    });

    // When: the executor parses the persisted facts
    const data = result.structuredContent;

    // Then: it rejects before quote, provider, or wallet execution can run
    expect(data).toEqual(expect.objectContaining({ ok: false }));
    expect(mocks.getZeroExQuote).not.toHaveBeenCalled();
    expect(mocks.executeLifiRoute).not.toHaveBeenCalled();
    expect(mocks.sendTransaction).not.toHaveBeenCalled();
  });

  it("rejects a tampered allowance target, Settler target, calldata, value, or provider before wallet execution", async () => {
    // Given: persisted facts with each independently dangerous mutation
    await zeroExSwap(params);
    const originalExecution = getQueuedParams().execution;
    if (typeof originalExecution !== "object" || originalExecution === null) {
      throw new Error("Expected confirmed execution facts");
    }
    const integrityHash = Reflect.get(originalExecution, "integrityHash");
    if (typeof integrityHash !== "string")
      throw new Error("Expected confirmed execution integrity hash");
    const adapterSource = Reflect.get(originalExecution, "adapterSource");
    const capabilityDecisionId = Reflect.get(originalExecution, "capabilityDecisionId");
    const capabilityReason = Reflect.get(originalExecution, "capabilityReason");
    if (
      typeof adapterSource !== "string" ||
      typeof capabilityDecisionId !== "string" ||
      typeof capabilityReason !== "string"
    ) {
      throw new Error("Expected confirmed adapter provenance");
    }
    mocks.getZeroExQuote.mockClear();
    const baseExecution = {
      provider: "0x",
      chainId: 4663,
      adapterSource,
      capabilityDecisionId,
      capabilityReason,
      taker: "0x3333333333333333333333333333333333333333",
      sellAmount: params.fromAmount,
      transaction: { to: settler, data: "0x1234", value: "0" },
      allowance: { target: allowanceHolder, amount: params.fromAmount },
      settler: { blockNumber: "123", owner: settler, previousOwner: previousSettler },
      integrityHash,
    };
    const mutatedExecutions = [
      { ...baseExecution, allowance: { target: previousSettler, amount: params.fromAmount } },
      {
        ...baseExecution,
        transaction: {
          ...baseExecution.transaction,
          to: "0x7777777777777777777777777777777777777777",
        },
      },
      { ...baseExecution, transaction: { ...baseExecution.transaction, data: "0xdead" } },
      { ...baseExecution, transaction: { ...baseExecution.transaction, value: "1" } },
      { ...baseExecution, provider: "lifi" },
    ];

    // When: the executor receives each altered payload
    const results = await Promise.all(
      mutatedExecutions.map((execution) => executeZeroExSwapNow({ ...params, execution }))
    );

    // Then: none can reach a quote, provider switch, approval, or transaction submission
    for (const result of results) {
      expect(result.structuredContent).toEqual(expect.objectContaining({ ok: false }));
    }
    expect(mocks.getZeroExQuote).not.toHaveBeenCalled();
    expect(mocks.executeLifiRoute).not.toHaveBeenCalled();
    expect(mocks.sendTransaction).not.toHaveBeenCalled();
  });

  it("queues an exact prepared LI.FI route when 0x fails with an allowed fallback class", async () => {
    // Given: a 0x no-route error before any confirmation is issued
    mocks.getZeroExQuote.mockRejectedValue(
      new Web3AgentError({ code: "ZEROEX_NO_ROUTE", message: "stable" })
    );
    mocks.classifyZeroExError.mockReturnValue({ kind: "no-route", fallbackAllowed: true });
    mocks.prepareLifiRoute.mockResolvedValue(preparedLifiRoute);

    // When: the 0x tool prepares the fallback
    const result = await zeroExSwap(params);

    // Then: route preparation occurs before queueing and only the exact route is persisted
    expect(result.structuredContent).toEqual({
      ok: true,
      data: { status: "pending_confirmation", id: "queued-0x", summary: "queued" },
    });
    expect(mocks.prepareLifiRoute).toHaveBeenCalledWith({
      fromChainId: 4663,
      toChainId: 4663,
      fromToken: params.fromToken,
      toToken: params.toToken,
      fromAmount: params.fromAmount,
    });
    expect(mocks.enqueue).toHaveBeenCalledWith(
      "zeroex_lifi_fallback",
      expect.stringContaining("LI.FI fallback"),
      expect.objectContaining({ preparedRoute: preparedLifiRoute, fallbackReason: "no-route" }),
      expect.any(Function),
      "0x3333333333333333333333333333333333333333",
      "financial"
    );
    expect(mocks.executeLifiRoute).not.toHaveBeenCalled();
    expect(mocks.executePreparedLifiRoute).not.toHaveBeenCalled();
    expect(mocks.sendTransaction).not.toHaveBeenCalled();
    mocks.executePreparedLifiRoute.mockResolvedValue({
      status: "completed",
      message: "LI.FI complete",
    });
    const executionResult = await getQueuedExecutor()(getQueuedParams());
    expect(mocks.prepareLifiRoute).toHaveBeenCalledTimes(1);
    expect(mocks.executePreparedLifiRoute).toHaveBeenCalledWith(preparedLifiRoute);
    expect(executionResult).toEqual(
      expect.objectContaining({
        structuredContent: {
          ok: true,
          data: {
            status: "completed",
            message: "LI.FI complete",
            provider: "lifi",
            adapterSource: "lifi",
            fallbackReason: "no-route",
            fallbackHistory: [{ provider: "0x", reason: "no-route" }],
          },
        },
      })
    );
  });

  it("rejects a tampered prepared LI.FI route before provider execution", async () => {
    // Given: an automatically prepared fallback route with an attacker-altered transaction request
    mocks.getZeroExQuote.mockRejectedValue(
      new Web3AgentError({ code: "ZEROEX_NO_ROUTE", message: "stable" })
    );
    mocks.classifyZeroExError.mockReturnValue({ kind: "no-route", fallbackAllowed: true });
    mocks.prepareLifiRoute.mockResolvedValue(preparedLifiRoute);
    await zeroExSwap(params);
    const fallback = getQueuedParams();
    const routeIntegrityHash = fallback.routeIntegrityHash;

    // When: the fallback executor receives the original hash with altered route calldata
    const result = await getQueuedExecutor()({
      ...fallback,
      preparedRoute: {
        ...preparedLifiRoute,
        steps: [
          {
            ...preparedLifiRoute.steps[0],
            transactionRequest: {
              ...preparedLifiRoute.steps[0].transactionRequest,
              data: "0xdead",
            },
          },
        ],
      },
      routeIntegrityHash,
    });

    // Then: no fresh quote, conversion, or provider execution can occur
    expect(result).toEqual(
      expect.objectContaining({
        structuredContent: {
          ok: false,
          error: {
            code: "ZEROEX_LIFI_ROUTE_TAMPERED",
            message: "Confirmed LI.FI route no longer matches the approved payload",
          },
        },
      })
    );
    expect(mocks.prepareLifiRoute).toHaveBeenCalledTimes(1);
    expect(mocks.executePreparedLifiRoute).not.toHaveBeenCalled();
    expect(mocks.executeLifiRoute).not.toHaveBeenCalled();
  });

  it("rejects an empty LI.FI route before queueing confirmation", async () => {
    // Given: 0x is unavailable and LI.FI returned an invalid route with no executable steps
    mocks.getZeroExQuote.mockRejectedValue(
      new Web3AgentError({ code: "ZEROEX_PROVIDER_UNAVAILABLE", message: "stable" })
    );
    mocks.classifyZeroExError.mockReturnValue({
      kind: "provider-unavailable",
      fallbackAllowed: true,
    });
    mocks.prepareLifiRoute.mockResolvedValue({ ...preparedLifiRoute, steps: [] });

    // When: the fallback route is prepared
    const result = await zeroExSwap(params);

    // Then: invalid execution facts never reach the approval queue
    expect(result.structuredContent).toEqual({
      ok: false,
      error: {
        code: "ZEROEX_LIFI_FALLBACK_ERROR",
        message: expect.any(String),
      },
    });
    expect(mocks.enqueue).not.toHaveBeenCalled();
    expect(mocks.executePreparedLifiRoute).not.toHaveBeenCalled();
  });

  it("rejects a LI.FI route that does not match the approved swap intent", async () => {
    // Given: LI.FI returns an executable route for a different source amount
    mocks.getZeroExQuote.mockRejectedValue(
      new Web3AgentError({ code: "ZEROEX_NO_ROUTE", message: "stable" })
    );
    mocks.classifyZeroExError.mockReturnValue({ kind: "no-route", fallbackAllowed: true });
    mocks.prepareLifiRoute.mockResolvedValue({
      ...preparedLifiRoute,
      steps: [
        {
          ...preparedLifiRoute.steps[0],
          action: {
            ...preparedLifiRoute.steps[0].action,
            fromAmount: "2000000",
          },
        },
      ],
    });

    // When: the fallback route is prepared
    const result = await zeroExSwap(params);

    // Then: mismatched execution facts never reach the approval queue
    expect(result.structuredContent).toEqual({
      ok: false,
      error: {
        code: "ZEROEX_LIFI_FALLBACK_ERROR",
        message: expect.any(String),
      },
    });
    expect(mocks.enqueue).not.toHaveBeenCalled();
    expect(mocks.executePreparedLifiRoute).not.toHaveBeenCalled();
  });

  it("rejects a missing key without allowing LI.FI fallback", async () => {
    // Given: a Robinhood quote request without credentials
    mocks.getConfig.mockReturnValue({ chainId: 4663, zeroxApiKey: undefined });

    // When: the quote is requested
    const result = await zeroExGetQuote(params);

    // Then: the auth error is stable and LI.FI remains untouched
    expect(result.structuredContent).toEqual({
      ok: false,
      error: {
        code: "ZEROEX_AUTHENTICATION",
        message: "ZEROX_API_KEY is required for Robinhood 0x swaps",
      },
    });
    expect(mocks.executeLifiRoute).not.toHaveBeenCalled();
  });
});
