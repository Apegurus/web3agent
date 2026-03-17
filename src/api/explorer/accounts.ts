import type { ExplorerAddressInfo, ExplorerTokensByAddress } from "../types.js";
import type { BlockscoutAddress, BlockscoutToken } from "./blockscout/types.js";

export function normalizeBlockscoutAddress(raw: BlockscoutAddress): ExplorerAddressInfo {
  const result: ExplorerAddressInfo = {
    address: raw.hash,
    balance: raw.coin_balance ?? "0",
    isContract: raw.is_contract,
  };

  if (raw.exchange_rate != null) {
    result.balanceUsd = raw.exchange_rate;
  }

  if (raw.is_verified) {
    result.isVerified = raw.is_verified;
  }

  if (raw.name != null) {
    result.name = raw.name;
  }

  if (raw.ens_domain_name != null) {
    result.ensDomain = raw.ens_domain_name;
  }

  if (raw.public_tags.length > 0) {
    result.tags = raw.public_tags.map((t) => t.display_name);
  }

  if (raw.has_tokens) {
    // tokenHoldings count not available from address endpoint alone
  }

  return result;
}

export function normalizeBlockscoutTokens(
  address: string,
  tokens: BlockscoutToken[]
): ExplorerTokensByAddress {
  return {
    address,
    tokens: tokens.map((raw) => {
      const decimals = raw.decimals != null ? Number.parseInt(raw.decimals, 10) : undefined;
      const type = raw.type as "ERC-20" | "ERC-721" | "ERC-1155";

      return {
        contractAddress: raw.address,
        symbol: raw.symbol ?? undefined,
        name: raw.name ?? undefined,
        decimals: Number.isNaN(decimals) ? undefined : decimals,
        balance: raw.balance,
        balanceUsd: raw.exchange_rate ?? undefined,
        type,
      };
    }),
  };
}

export function normalizeEtherscanAddress(address: string, balance: string): ExplorerAddressInfo {
  return {
    address,
    balance,
    // Etherscan balance endpoint doesn't return contract status — always false.
    // Consumers needing accurate isContract should use Blockscout-supported chains.
    isContract: false,
  };
}
