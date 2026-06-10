import { resilientFetch } from "../../../utils/resilient-fetch.js";
import { getEtherscanApiUrl, getEtherscanSupportedChainIds } from "./chains.js";
import type {
  EtherscanApiResponse,
  EtherscanProxyResponse,
  EtherscanStandardResponse,
} from "./types.js";

export class EtherscanClient {
  constructor(private readonly apiKey: string) {}

  async call<T = unknown>(
    chainId: number,
    module: string,
    action: string,
    params: Record<string, string> = {},
  ): Promise<T> {
    const baseUrl = getEtherscanApiUrl(chainId);
    if (!baseUrl) {
      throw new Error(`Etherscan API not supported for chain ${chainId}`);
    }

    const url = new URL(baseUrl);
    url.searchParams.set("chainid", String(chainId));
    url.searchParams.set("module", module);
    url.searchParams.set("action", action);
    url.searchParams.set("apikey", this.apiKey);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== "") {
        url.searchParams.set(key, value);
      }
    }

    const response = await resilientFetch(
      url.toString(),
      {
        method: "GET",
        headers: { Accept: "application/json" },
      },
      {
        retry: { maxRetries: 3, baseDelayMs: 200 },
        label: `etherscan:${module}.${action}`,
      },
    );

    if (!response.ok) {
      const text = await response.text();
      if (response.status === 429) {
        throw new Error(`Etherscan rate limited (HTTP 429): ${text}`);
      }
      throw new Error(`Etherscan HTTP ${response.status}: ${text}`);
    }

    const body = (await response.json()) as EtherscanApiResponse<T>;

    // Proxy endpoints (module=proxy) return JSON-RPC format
    if ("jsonrpc" in body) {
      const proxy = body as EtherscanProxyResponse<T>;
      if (proxy.error) {
        throw new Error(
          `Etherscan proxy error: ${proxy.error.message ?? JSON.stringify(proxy.error)}`,
        );
      }
      if (proxy.result == null) {
        throw new Error("Etherscan proxy returned null (resource not found)");
      }
      return proxy.result;
    }

    // Standard endpoints return { status, message, result }
    const standard = body as EtherscanStandardResponse<T>;
    if (standard.status === "0") {
      const msg =
        typeof standard.result === "string"
          ? standard.result
          : standard.message;
      // "No transactions/records found" is a normal empty result, not an error
      if (/no (?:transactions|records|token|data) found/i.test(msg)) {
        return [] as unknown as T;
      }
      if (/rate limit/i.test(msg)) {
        throw new Error(`Etherscan rate limited: ${msg}`);
      }
      throw new Error(`Etherscan error: ${msg}`);
    }

    return standard.result;
  }

  getSupportedChainIds(): number[] {
    return getEtherscanSupportedChainIds();
  }
}
