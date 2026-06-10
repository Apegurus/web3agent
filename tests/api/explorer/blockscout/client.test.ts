import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../src/utils/resilient-fetch.js", () => ({
  resilientFetch: vi.fn(),
}));

import { BlockscoutClient } from "../../../../src/api/explorer/blockscout/client.js";
import { resilientFetch } from "../../../../src/utils/resilient-fetch.js";

const mockFetch = vi.mocked(resilientFetch);

function mockJsonResponse(data: unknown) {
  mockFetch.mockResolvedValueOnce(
    new Response(JSON.stringify(data), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

describe("BlockscoutClient", () => {
  let client: BlockscoutClient;

  beforeEach(() => {
    client = new BlockscoutClient();
    vi.clearAllMocks();
  });

  describe("URL construction", () => {
    it("constructs correct URL for Ethereum mainnet", async () => {
      mockJsonResponse({ hash: "0xabc", coin_balance: "1000" });
      await client.getAddress(1, "0xabc");
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toBe("https://eth.blockscout.com/api/v2/addresses/0xabc");
    });

    it("constructs correct URL for Arbitrum", async () => {
      mockJsonResponse({ hash: "0xabc", coin_balance: "1000" });
      await client.getAddress(42161, "0xabc");
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain("arbitrum.blockscout.com");
    });

    it("throws for unsupported chain", async () => {
      await expect(client.getAddress(56, "0xabc")).rejects.toThrow(
        /not supported/,
      );
    });

    it("does not append page params for address transactions", async () => {
      mockJsonResponse({ items: [], next_page_params: null });

      await client.getAddressTransactions(8453, "0xabc");

      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toBe(
        "https://base.blockscout.com/api/v2/addresses/0xabc/transactions",
      );
    });
  });

  describe("response handling", () => {
    it("returns parsed JSON on success", async () => {
      const data = { hash: "0xabc", coin_balance: "1000", is_contract: false };
      mockJsonResponse(data);
      const result = await client.getAddress(1, "0xabc");
      expect(result).toEqual(data);
    });

    it("throws on HTTP error", async () => {
      mockFetch.mockResolvedValueOnce(
        new Response("Not Found", { status: 404 }),
      );
      await expect(client.getAddress(1, "0xabc")).rejects.toThrow(/404/);
    });
  });
});
