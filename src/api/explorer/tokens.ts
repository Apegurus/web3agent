import type { ExplorerNftInventory, ExplorerTokenTransfers } from "../types.js";
import type { BlockscoutNftList, BlockscoutTokenTransferList } from "./blockscout/types.js";
import type { EtherscanNftTransfer, EtherscanTokenTransfer } from "./etherscan/types.js";

function parseDecimals(raw: string | null): number | undefined {
  if (raw == null) return undefined;
  const d = Number.parseInt(raw, 10);
  return Number.isNaN(d) ? undefined : d;
}

export function normalizeBlockscoutTokenTransfers(
  raw: BlockscoutTokenTransferList
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
      decimals: parseDecimals(t.token.decimals),
      value: t.total.value,
      type: t.token.type,
    })),
    hasMore: raw.next_page_params != null,
  };
}

export function normalizeEtherscanTokenTransfers(
  raw: EtherscanTokenTransfer[]
): ExplorerTokenTransfers {
  return {
    transfers: raw.map((t) => {
      return {
        hash: t.hash,
        blockNumber: Number(t.blockNumber),
        timestamp: new Date(Number(t.timeStamp) * 1000).toISOString(),
        from: t.from,
        to: t.to,
        token: t.contractAddress,
        symbol: t.tokenSymbol || undefined,
        decimals: parseDecimals(t.tokenDecimal),
        value: t.value,
      };
    }),
  };
}

export function normalizeEtherscanNftTransfers(
  erc721: EtherscanNftTransfer[],
  erc1155: EtherscanNftTransfer[]
): ExplorerTokenTransfers {
  const all = [
    ...erc721.map((t) => ({ ...t, _type: "ERC-721" as const })),
    ...erc1155.map((t) => ({ ...t, _type: "ERC-1155" as const })),
  ].sort((a, b) => Number(b.timeStamp) - Number(a.timeStamp));

  return {
    transfers: all.map((t) => {
      const decimals = parseDecimals(t.tokenDecimal);
      return {
        hash: t.hash,
        blockNumber: Number(t.blockNumber),
        timestamp: new Date(Number(t.timeStamp) * 1000).toISOString(),
        from: t.from,
        to: t.to,
        token: t.contractAddress,
        symbol: t.tokenSymbol || undefined,
        decimals,
        value: t.tokenID,
        type: t._type,
      };
    }),
  };
}

export function normalizeBlockscoutNfts(
  address: string,
  raw: BlockscoutNftList
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
