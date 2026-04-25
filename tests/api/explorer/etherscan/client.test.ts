import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../src/utils/resilient-fetch.js", () => ({
  resilientFetch: vi.fn(),
}));

import { EtherscanClient } from "../../../../src/api/explorer/etherscan/client.js";
import { resilientFetch } from "../../../../src/utils/resilient-fetch.js";

const mockFetch = vi.mocked(resilientFetch);

function mockEtherscanResponse(result: unknown, status: "0" | "1" = "1") {
  mockFetch.mockResolvedValueOnce(
    new Response(JSON.stringify({ status, message: "OK", result }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  );
}

describe("EtherscanClient", () => {
  let client: EtherscanClient;

  beforeEach(() => {
    client = new EtherscanClient("test-api-key");
    vi.clearAllMocks();
  });

  describe("URL construction", () => {
    it("constructs correct URL for Ethereum mainnet", async () => {
      mockEtherscanResponse("12345");
      await client.call(1, "account", "balance", { address: "0xabc", tag: "latest" });
      const url = new URL(mockFetch.mock.calls[0][0] as string);
      expect(url.origin).toBe("https://api.etherscan.io");
      expect(url.pathname).toBe("/v2/api");
      expect(url.searchParams.get("chainid")).toBe("1");
      expect(url.searchParams.get("module")).toBe("account");
      expect(url.searchParams.get("action")).toBe("balance");
      expect(url.searchParams.get("apikey")).toBe("test-api-key");
      expect(url.searchParams.get("address")).toBe("0xabc");
    });

    it("constructs correct V2 URL for Arbitrum", async () => {
      mockEtherscanResponse("12345");
      await client.call(42161, "account", "balance", { address: "0xabc" });
      const url = new URL(mockFetch.mock.calls[0][0] as string);
      expect(url.origin).toBe("https://api.etherscan.io");
      expect(url.pathname).toBe("/v2/api");
      expect(url.searchParams.get("chainid")).toBe("42161");
    });

    it("constructs correct V2 URL for BNB chain tx history", async () => {
      mockEtherscanResponse([]);
      await client.call(56, "account", "txlist", {
        address: "0xabc",
        page: "1",
        offset: "5",
        sort: "desc",
      });
      const url = new URL(mockFetch.mock.calls[0][0] as string);
      expect(url.origin).toBe("https://api.etherscan.io");
      expect(url.pathname).toBe("/v2/api");
      expect(url.searchParams.get("chainid")).toBe("56");
      expect(url.searchParams.get("module")).toBe("account");
      expect(url.searchParams.get("action")).toBe("txlist");
      expect(url.searchParams.get("offset")).toBe("5");
    });

    it("uses V2 endpoint for chain 1 (no special-case override)", async () => {
      const clientWithKey = new EtherscanClient("my-key");
      mockEtherscanResponse("99");
      await clientWithKey.call(1, "account", "balance", { address: "0xdef" });
      const url = new URL(mockFetch.mock.calls[0][0] as string);
      expect(url.origin).toBe("https://api.etherscan.io");
      expect(url.pathname).toBe("/v2/api");
      expect(url.searchParams.get("chainid")).toBe("1");
    });

    it("throws for unsupported chain", async () => {
      await expect(client.call(999999, "account", "balance", {})).rejects.toThrow(/not supported/);
    });
  });

  describe("response parsing", () => {
    it("returns result on success", async () => {
      mockEtherscanResponse([{ hash: "0x123" }]);
      const result = await client.call(1, "account", "txlist", {});
      expect(result).toEqual([{ hash: "0x123" }]);
    });

    it("throws on NOTOK response", async () => {
      mockEtherscanResponse("Max rate limit reached", "0");
      await expect(client.call(1, "account", "balance", {})).rejects.toThrow(/rate limit/i);
    });

    it("throws on non-200 HTTP status", async () => {
      mockFetch.mockResolvedValueOnce(new Response("Server Error", { status: 500 }));
      await expect(client.call(1, "account", "balance", {})).rejects.toThrow();
    });
  });
});
