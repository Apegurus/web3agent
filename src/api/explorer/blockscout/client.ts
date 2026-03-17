import { resilientFetch } from "../../../utils/resilient-fetch.js";
import { getBlockscoutApiUrl, getBlockscoutSupportedChainIds } from "./chains.js";
import type {
  BlockscoutAddress,
  BlockscoutBlock,
  BlockscoutNftList,
  BlockscoutSmartContract,
  BlockscoutTokenList,
  BlockscoutTokenTransferList,
  BlockscoutTransaction,
  BlockscoutTransactionList,
} from "./types.js";

export class BlockscoutClient {
  private getBaseUrl(chainId: number): string {
    const url = getBlockscoutApiUrl(chainId);
    if (!url) {
      throw new Error(`Blockscout API not supported for chain ${chainId}`);
    }
    return url;
  }

  private async fetch<T>(url: string): Promise<T> {
    const response = await resilientFetch(
      url,
      {
        method: "GET",
        headers: { Accept: "application/json" },
      },
      {
        retry: { maxRetries: 3, baseDelayMs: 200 },
        label: `blockscout:${new URL(url).pathname}`,
      }
    );

    if (!response.ok) {
      throw new Error(`Blockscout HTTP ${response.status}: ${await response.text()}`);
    }

    return (await response.json()) as T;
  }

  async getAddress(chainId: number, address: string): Promise<BlockscoutAddress> {
    const base = this.getBaseUrl(chainId);
    return this.fetch<BlockscoutAddress>(`${base}/api/v2/addresses/${encodeURIComponent(address)}`);
  }

  async getAddressTokens(chainId: number, address: string): Promise<BlockscoutTokenList> {
    const base = this.getBaseUrl(chainId);
    return this.fetch<BlockscoutTokenList>(
      `${base}/api/v2/addresses/${encodeURIComponent(address)}/tokens`
    );
  }

  async getAddressTransactions(
    chainId: number,
    address: string,
    params?: { page?: number }
  ): Promise<BlockscoutTransactionList> {
    const base = this.getBaseUrl(chainId);
    const url = new URL(`${base}/api/v2/addresses/${encodeURIComponent(address)}/transactions`);
    if (params?.page) url.searchParams.set("page", String(params.page));
    return this.fetch<BlockscoutTransactionList>(url.toString());
  }

  async getTransaction(chainId: number, txHash: string): Promise<BlockscoutTransaction> {
    const base = this.getBaseUrl(chainId);
    return this.fetch<BlockscoutTransaction>(
      `${base}/api/v2/transactions/${encodeURIComponent(txHash)}`
    );
  }

  async getAddressTokenTransfers(
    chainId: number,
    address: string,
    params?: { token?: string; page?: number }
  ): Promise<BlockscoutTokenTransferList> {
    const base = this.getBaseUrl(chainId);
    const url = new URL(`${base}/api/v2/addresses/${encodeURIComponent(address)}/token-transfers`);
    if (params?.token) url.searchParams.set("token", params.token);
    if (params?.page) url.searchParams.set("page", String(params.page));
    return this.fetch<BlockscoutTokenTransferList>(url.toString());
  }

  async getAddressNfts(chainId: number, address: string): Promise<BlockscoutNftList> {
    const base = this.getBaseUrl(chainId);
    return this.fetch<BlockscoutNftList>(
      `${base}/api/v2/addresses/${encodeURIComponent(address)}/nft`
    );
  }

  async getSmartContract(chainId: number, address: string): Promise<BlockscoutSmartContract> {
    const base = this.getBaseUrl(chainId);
    return this.fetch<BlockscoutSmartContract>(
      `${base}/api/v2/smart-contracts/${encodeURIComponent(address)}`
    );
  }

  async getBlock(chainId: number, blockNumber: number): Promise<BlockscoutBlock> {
    const base = this.getBaseUrl(chainId);
    return this.fetch<BlockscoutBlock>(`${base}/api/v2/blocks/${blockNumber}`);
  }

  getSupportedChainIds(): number[] {
    return getBlockscoutSupportedChainIds();
  }
}
