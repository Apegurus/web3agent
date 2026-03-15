import { vi } from "vitest";

interface OperationMocks {
  viemMocks: {
    createPublicClient: ReturnType<typeof vi.fn>;
    createClient: ReturnType<typeof vi.fn>;
  };
  twapMocks: {
    getSrcTokenChunkAmount: ReturnType<typeof vi.fn>;
  };
  lifiMocks: {
    getChains: ReturnType<typeof vi.fn>;
    convertQuoteToRoute: ReturnType<typeof vi.fn>;
    setAllowance: ReturnType<typeof vi.fn>;
  };
}

export function setupDefaultOperationMocks(mocks: OperationMocks): void {
  mocks.viemMocks.createPublicClient.mockReturnValue({
    readContract: vi.fn().mockResolvedValue(0n),
  });
  mocks.viemMocks.createClient.mockReturnValue({
    extend: vi.fn().mockReturnValue({
      readContract: vi.fn().mockResolvedValue(9n),
    }),
  });
  mocks.twapMocks.getSrcTokenChunkAmount.mockReturnValue("200");
  mocks.lifiMocks.getChains.mockResolvedValue([{ id: 1 }, { id: 8453 }]);
  mocks.lifiMocks.convertQuoteToRoute.mockImplementation((quote: Record<string, unknown>) => ({
    steps: [{ transactionRequest: quote.transactionRequest }],
  }));
  mocks.lifiMocks.setAllowance.mockImplementation(
    async (_client: unknown, _token: unknown, _spender: unknown, amount: bigint) =>
      amount === 0n ? "0x00" : "0x095ea7b3"
  );
}
