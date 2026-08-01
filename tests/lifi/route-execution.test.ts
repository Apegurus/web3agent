import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createPublicClientForRuntimeChain: vi.fn(),
  createWalletClientForChain: vi.fn(),
  executeRoute: vi.fn(),
  getActiveAccount: vi.fn(),
  getWalletState: vi.fn(),
  sendTransaction: vi.fn(),
  waitForTransactionReceipt: vi.fn(),
}));

vi.mock("@lifi/sdk", () => ({
  createConfig: vi.fn(),
  convertQuoteToRoute: vi.fn(),
  EVM: vi.fn().mockReturnValue({}),
  executeRoute: mocks.executeRoute,
  getQuote: vi.fn(),
}));
vi.mock("../../src/operations/chain-access.js", () => ({
  createPublicClientForRuntimeChain: mocks.createPublicClientForRuntimeChain,
}));
vi.mock("../../src/config/wallet-factory.js", () => ({
  createWalletClientForChain: mocks.createWalletClientForChain,
}));
vi.mock("../../src/wallet/persistence.js", () => ({
  getActiveAccount: mocks.getActiveAccount,
  getWalletState: mocks.getWalletState,
}));

import {
  executeLifiRoute,
  executePreparedLifiRoute,
  prepareLifiRoute,
} from "../../src/lifi/route-execution.js";
import { zeroExLifiFallbackSchema } from "../../src/tools/zerox/lifi-confirmation.js";

const account = { address: "0x3333333333333333333333333333333333333333" } as const;
const token = "0x1111111111111111111111111111111111111111";
const spender = "0x000000000022D473030F116dDEE9F6B43aC78BA3";
const target = "0xB477751B76CF82d00a686A1232f5fCD772414Af3";
const approvalHash = `0x${"aa".repeat(32)}`;
const swapHash = `0x${"bb".repeat(32)}`;

function getConfirmedRoute() {
  return zeroExLifiFallbackSchema.parse({
    account: account.address,
    chainId: 4663,
    fallbackReason: "no-route",
    fromAmount: "1000000",
    fromToken: token,
    preparedRoute: {
      id: "lifi-route",
      steps: [
        {
          id: "lifi-step",
          action: {
            fromAmount: "1000000",
            fromChainId: 4663,
            fromToken: { address: token },
            toAmount: "950000",
            toChainId: 4663,
            toToken: { address: "0x2222222222222222222222222222222222222222" },
          },
          estimate: { approvalAddress: spender },
          transactionRequest: { chainId: 4663, data: "0x1234", to: target, value: "0" },
        },
      ],
    },
    routeIntegrityHash: `0x${"11".repeat(32)}`,
    toToken: "0x2222222222222222222222222222222222222222",
  }).preparedRoute;
}

describe("confirmed LI.FI route execution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getActiveAccount.mockReturnValue(account);
    mocks.getWalletState.mockReturnValue({ address: account.address });
    mocks.createWalletClientForChain.mockReturnValue({
      sendTransaction: mocks.sendTransaction,
    });
    mocks.createPublicClientForRuntimeChain.mockReturnValue({
      readContract: vi.fn().mockResolvedValue(0n),
      waitForTransactionReceipt: mocks.waitForTransactionReceipt,
    });
    mocks.sendTransaction.mockResolvedValueOnce(approvalHash).mockResolvedValueOnce(swapHash);
    mocks.waitForTransactionReceipt.mockResolvedValue({ status: "success" });
  });

  it("sends only persisted calldata after the bounded approval is confirmed", async () => {
    // Given: a confirmation-bound same-chain route with insufficient allowance
    const route = getConfirmedRoute();

    // When: the persisted route is executed
    const result = await executePreparedLifiRoute(route);

    // Then: approval confirmation precedes the exact persisted swap transaction
    expect(mocks.executeRoute).not.toHaveBeenCalled();
    expect(mocks.waitForTransactionReceipt).toHaveBeenNthCalledWith(1, { hash: approvalHash });
    expect(mocks.sendTransaction).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ account, chain: expect.any(Object), data: "0x1234", to: target })
    );
    expect(mocks.sendTransaction.mock.invocationCallOrder[1]).toBeGreaterThan(
      mocks.waitForTransactionReceipt.mock.invocationCallOrder[0] ?? 0
    );
    expect(mocks.waitForTransactionReceipt).toHaveBeenNthCalledWith(2, { hash: swapHash });
    expect(result).toEqual({
      status: "completed",
      message: "LI.FI route executed successfully",
      txHash: swapHash,
    });
  });

  it("rejects a persisted transaction chain that differs from the approved action chain", async () => {
    const route = getConfirmedRoute();
    route.steps[0].transactionRequest = {
      ...route.steps[0].transactionRequest,
      chainId: 1,
    };

    await expect(executePreparedLifiRoute(route)).rejects.toMatchObject({
      code: "LIFI_ROUTE_CHAIN_MISMATCH",
    });
    expect(mocks.sendTransaction).not.toHaveBeenCalled();
  });

  it("rejects a same-chain quote whose transaction target is outside pinned LI.FI authority", async () => {
    const route = getConfirmedRoute();
    route.steps[0].transactionRequest = {
      ...route.steps[0].transactionRequest,
      to: "0x8888888888888888888888888888888888888888",
    };
    const { convertQuoteToRoute, getQuote } = await import("@lifi/sdk");
    vi.mocked(getQuote).mockResolvedValueOnce(route.steps[0]);
    vi.mocked(convertQuoteToRoute).mockReturnValueOnce(route);
    await expect(
      prepareLifiRoute({
        account: account.address,
        fromAmount: "1000000",
        fromChainId: 4663,
        fromToken: token,
        toChainId: 4663,
        toToken: "0x2222222222222222222222222222222222222222",
      })
    ).rejects.toMatchObject({ code: "LIFI_ROUTE_AUTHORITY_MISMATCH" });
  });

  it("preserves the transaction hash when receipt polling fails after broadcast", async () => {
    const route = getConfirmedRoute();
    route.steps[0].estimate = { ...route.steps[0].estimate, skipApproval: true };
    mocks.sendTransaction.mockReset().mockResolvedValue(swapHash);
    mocks.waitForTransactionReceipt.mockRejectedValueOnce(new Error("RPC unavailable"));

    await expect(executePreparedLifiRoute(route)).resolves.toEqual({
      status: "submitted",
      stage: "execution",
      message: "LI.FI route transaction submitted; receipt status is uncertain",
      txHash: swapHash,
    });
  });

  it("delegates generic cross-chain routes to the LI.FI SDK executor", async () => {
    const route = getConfirmedRoute();
    route.steps[0].action.fromChainId = 1;
    route.steps[0].action.toChainId = 8453;
    const { convertQuoteToRoute, getQuote } = await import("@lifi/sdk");
    vi.mocked(getQuote).mockResolvedValueOnce(route.steps[0]);
    vi.mocked(convertQuoteToRoute).mockReturnValueOnce(route);

    await expect(
      executeLifiRoute({
        account: account.address,
        fromAmount: "1000000",
        fromChainId: 1,
        fromToken: token,
        toChainId: 8453,
        toToken: "0x2222222222222222222222222222222222222222",
      })
    ).resolves.toEqual({
      message: "LI.FI route executed successfully",
      status: "completed",
    });
    expect(mocks.executeRoute).toHaveBeenCalledWith(route, expect.any(Object));
    expect(mocks.sendTransaction).not.toHaveBeenCalled();
  });

  it("rejects a wallet switch after route preparation before LI.FI SDK execution", async () => {
    const route = getConfirmedRoute();
    route.steps[0].action.fromChainId = 1;
    route.steps[0].action.toChainId = 8453;
    const { convertQuoteToRoute, getQuote } = await import("@lifi/sdk");
    vi.mocked(getQuote).mockResolvedValueOnce(route.steps[0]);
    vi.mocked(convertQuoteToRoute).mockReturnValueOnce(route);
    mocks.getActiveAccount
      .mockReturnValueOnce(account)
      .mockReturnValueOnce({ address: "0x9999999999999999999999999999999999999999" });

    await expect(
      executeLifiRoute({
        account: account.address,
        fromAmount: "1000000",
        fromChainId: 1,
        fromToken: token,
        toChainId: 8453,
        toToken: "0x2222222222222222222222222222222222222222",
      })
    ).rejects.toMatchObject({ code: "LIFI_WALLET_MISMATCH" });
    expect(mocks.executeRoute).not.toHaveBeenCalled();
  });
});
