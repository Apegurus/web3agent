import { resilientFetch } from "../../../utils/resilient-fetch.js";
import { getEtherscanApiUrl, getEtherscanSupportedChainIds } from "./chains.js";
import type { EtherscanResponse } from "./types.js";

export class EtherscanClient {
  constructor(
    private readonly apiKey: string,
    private readonly baseUrlOverride?: string
  ) {}

  async call<T = unknown>(
    chainId: number,
    module: string,
    action: string,
    params: Record<string, string> = {}
  ): Promise<T> {
    const baseUrl = getEtherscanApiUrl(chainId, this.baseUrlOverride);
    if (!baseUrl) {
      throw new Error(`Etherscan API not supported for chain ${chainId}`);
    }

    const url = new URL("/api", baseUrl);
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
      }
    );

    if (!response.ok) {
      throw new Error(`Etherscan HTTP ${response.status}: ${await response.text()}`);
    }

    const body = (await response.json()) as EtherscanResponse<T>;

    if (body.status === "0") {
      const msg = typeof body.result === "string" ? body.result : body.message;
      if (/rate limit/i.test(msg)) {
        throw new Error(`Etherscan rate limited: ${msg}`);
      }
      throw new Error(`Etherscan error: ${msg}`);
    }

    return body.result;
  }

  getSupportedChainIds(): number[] {
    return getEtherscanSupportedChainIds();
  }
}
