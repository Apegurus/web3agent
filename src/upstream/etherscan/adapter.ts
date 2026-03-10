import { ETHERSCAN_DEFAULT_URL } from "../../config/env.js";
import { RemoteMcpAdapter } from "../remote-mcp-adapter.js";

export class EtherscanAdapter extends RemoteMcpAdapter {
  private readonly apiKey: string | undefined;

  constructor(url = ETHERSCAN_DEFAULT_URL, apiKey?: string) {
    super({
      name: "etherscan",
      prefix: "etherscan",
      url,
      initialStatus: apiKey ? "unavailable" : "not_configured",
      initialMessage: apiKey ? "Not initialized" : "No API key provided (ETHERSCAN_API_KEY)",
    });
    this.apiKey = apiKey;
  }

  protected override shouldSkipInit(): boolean {
    return !this.apiKey;
  }

  protected override getTransportOptions(): RequestInit | undefined {
    if (!this.apiKey) return undefined;
    return { headers: { Authorization: `Bearer ${this.apiKey}` } };
  }
}
