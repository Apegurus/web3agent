export type BackendId = "blockscout" | "etherscan";

export type ExplorerCapability =
  | "transactions"
  | "tokens"
  | "blocks"
  | "contracts"
  | "accounts"
  | "contract_source"
  | "internal_txs"
  | "event_logs"
  | "network_stats"
  | "price"
  | "nft_transfers"
  | "token_holders"
  | "historical_balance";

const BLOCKSCOUT_CAPABILITIES: Set<ExplorerCapability> = new Set([
  "transactions",
  "tokens",
  "blocks",
  "contracts",
  "accounts",
  "contract_source",
]);

const ETHERSCAN_CAPABILITIES: Set<ExplorerCapability> = new Set([
  "transactions",
  "tokens",
  "blocks",
  "contracts",
  "accounts",
  "contract_source",
  "internal_txs",
  "event_logs",
  "network_stats",
  "price",
  "nft_transfers",
  "token_holders",
  "historical_balance",
]);

export class ExplorerRouter {
  private readonly blockscoutChains: Set<number>;
  private readonly etherscanChains: Set<number>;

  constructor(blockscoutChainIds: number[], etherscanChainIds: number[]) {
    this.blockscoutChains = new Set(blockscoutChainIds);
    this.etherscanChains = new Set(etherscanChainIds);
  }

  resolve(chainId: number, capability: ExplorerCapability): BackendId {
    const hasBlockscout =
      this.blockscoutChains.has(chainId) && BLOCKSCOUT_CAPABILITIES.has(capability);
    const hasEtherscan =
      this.etherscanChains.has(chainId) && ETHERSCAN_CAPABILITIES.has(capability);

    if (!hasBlockscout && !hasEtherscan) {
      if (!this.isChainSupported(chainId)) {
        throw new Error(`Explorer data not available for chain ${chainId}`);
      }
      throw new Error(`Capability "${capability}" not supported on chain ${chainId}`);
    }

    // Prefer Blockscout: richer data (decoded params, token transfers), no API key required.
    // Etherscan is fallback for shared chains, primary only for chains Blockscout doesn't cover.
    if (hasBlockscout) return "blockscout";
    return "etherscan";
  }

  getFallback(chainId: number, capability: ExplorerCapability): BackendId | undefined {
    const primary = this.resolve(chainId, capability);
    if (
      primary === "blockscout" &&
      this.etherscanChains.has(chainId) &&
      ETHERSCAN_CAPABILITIES.has(capability)
    ) {
      return "etherscan";
    }
    if (
      primary === "etherscan" &&
      this.blockscoutChains.has(chainId) &&
      BLOCKSCOUT_CAPABILITIES.has(capability)
    ) {
      return "blockscout";
    }
    return undefined;
  }

  isChainSupported(chainId: number): boolean {
    return this.blockscoutChains.has(chainId) || this.etherscanChains.has(chainId);
  }
}
