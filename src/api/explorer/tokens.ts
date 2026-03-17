import type {
  ExplorerNftInventory,
  ExplorerTokenTransfers,
} from "../types.js";
import type {
  BlockscoutNftList,
  BlockscoutTokenTransferList,
} from "./blockscout/types.js";
import type { EtherscanTokenTransfer } from "./etherscan/types.js";

export function normalizeBlockscoutTokenTransfers(
  raw: BlockscoutTokenTransferList,
): ExplorerTokenTransfers {
  return {
    transfers: raw.items.map((t) => ({
      hash: t.tx_hash,
      blockNumber: t.block_number,
      timestamp: t.timestamp,
      from: t.from.hash,
      to: t.to.hash,
      token: t.token.address,
      symbol: t.token.symbol ?? undefined,
      decimals:
        t.token.decimals != null
          ? (() => {
              const d = Number.parseInt(t.token.decimals as string, 10);
              return Number.isNaN(d) ? undefined : d;
            })()
          : undefined,
      value: t.total.value,
      type: t.token.type,
    })),
    hasMore: raw.next_page_params != null,
  };
}

export function normalizeEtherscanTokenTransfers(
  raw: EtherscanTokenTransfer[],
): ExplorerTokenTransfers {
  return {
    transfers: raw.map((t) => {
      const decimals = Number.parseInt(t.tokenDecimal, 10);
      return {
        hash: t.hash,
        blockNumber: Number(t.blockNumber),
        timestamp: new Date(Number(t.timeStamp) * 1000).toISOString(),
        from: t.from,
        to: t.to,
        token: t.contractAddress,
        symbol: t.tokenSymbol || undefined,
        decimals: Number.isNaN(decimals) ? undefined : decimals,
        value: t.value,
      };
    }),
  };
}

export function normalizeBlockscoutNfts(
  address: string,
  raw: BlockscoutNftList,
): ExplorerNftInventory {
  return {
    address,
    nfts: raw.items.map((n) => {
      const tokenType = n.token.type as "ERC-721" | "ERC-1155";
      return {
        contractAddress: n.token.address,
        name: n.token.name ?? undefined,
        symbol: n.token.symbol ?? undefined,
        tokenId: n.id,
        tokenType,
        balance: n.value,
        metadata: n.metadata ?? undefined,
      };
    }),
    hasMore: raw.next_page_params != null,
  };
}
