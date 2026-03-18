import type {
  ContractSecurityResult,
  TokenDueDiligenceResult,
  TokenHolderEntry,
} from "../../api/types.js";
import { resolveToken } from "../../tokens/resolver.js";
import { resilientFetch } from "../../utils/resilient-fetch.js";
import { ttlCache } from "../shared/cache.js";
import { resolveToolChainId } from "../shared/chain-context.js";

const GOPLUS_TTL = 60_000;
const GOPLUS_FETCH_CONFIG = {
  label: "goplus",
  retry: { baseDelayMs: 2000 },
};

// ── Shared helpers ────────────────────────────────────────────────

function parseFlag(value: string | undefined): boolean {
  return value === "1";
}

function goplusHeaders(): Record<string, string> {
  const key = process.env.GOPLUS_API_KEY;
  return key ? { Authorization: key } : {};
}

// ── getContractSecurity ───────────────────────────────────────────

interface GoPlusContractData {
  is_open_source?: string;
  is_proxy?: string;
  owner_address?: string;
  is_mintable?: string;
  can_take_back_ownership?: string;
  is_honeypot?: string;
  is_blacklisted?: string;
  is_whitelisted?: string;
  is_anti_whale?: string;
  owner_change_balance?: string;
  selfdestruct?: string;
  external_call?: string;
}

export async function getContractSecurity(input: {
  address: string;
  chainId?: number;
}): Promise<ContractSecurityResult> {
  const chainId = resolveToolChainId(input.chainId);
  const url = `https://api.gopluslabs.io/api/v1/contract_security/${chainId}?contract_addresses=${input.address}`;

  const data = await ttlCache(url, GOPLUS_TTL, async () => {
    const res = await resilientFetch(url, { headers: goplusHeaders() }, GOPLUS_FETCH_CONFIG);
    if (!res.ok) {
      throw new Error(`GoPlus API returned ${res.status}`);
    }
    return (await res.json()) as { result: Record<string, GoPlusContractData> };
  });

  const addressKey = input.address.toLowerCase();
  const contractData = data.result[addressKey] ?? data.result[input.address];

  if (!contractData) {
    throw new Error(
      `No contract security data found for address ${input.address} on chain ${chainId}`
    );
  }

  const verified = parseFlag(contractData.is_open_source);
  const isProxy = parseFlag(contractData.is_proxy);
  const ownerAddress = contractData.owner_address ?? null;
  const canMint =
    parseFlag(contractData.is_mintable) || parseFlag(contractData.can_take_back_ownership);
  const canChangeBalance = parseFlag(contractData.owner_change_balance);
  const canBlacklist = parseFlag(contractData.is_blacklisted);
  const isHoneypot = parseFlag(contractData.is_honeypot);

  const maliciousFlags: string[] = [];
  if (isHoneypot) maliciousFlags.push("honeypot");
  if (!verified) maliciousFlags.push("unverified_source");
  if (parseFlag(contractData.selfdestruct)) maliciousFlags.push("selfdestruct");
  if (parseFlag(contractData.external_call)) maliciousFlags.push("external_call");

  return {
    verified,
    isProxy,
    ownerAddress,
    canMint,
    canChangeBalance,
    canBlacklist,
    isHoneypot,
    maliciousFlags,
  };
}

// ── getTokenDueDiligence ──────────────────────────────────────────

interface GoPlusLpHolder {
  address: string;
  balance: string;
  percent: string;
  is_locked?: number;
}

interface GoPlusTokenData {
  is_honeypot?: string;
  buy_tax?: string;
  sell_tax?: string;
  holder_count?: string;
  lp_holder_count?: string;
  is_open_source?: string;
  creator_address?: string;
  lp_holders?: GoPlusLpHolder[];
  holders?: Array<{ address: string; balance: string; percent: string }>;
}

interface DexScreenerPair {
  pairAddress?: string;
  baseToken?: { address: string; name: string; symbol: string };
  quoteToken?: { address: string; name: string; symbol: string };
  liquidity?: { usd?: number };
  pairCreatedAt?: number;
  fdv?: number;
}

export async function getTokenDueDiligence(input: {
  token: string;
  chainId?: number;
}): Promise<TokenDueDiligenceResult> {
  const chainId = resolveToolChainId(input.chainId);

  // Step 1: Resolve token symbol to address if needed
  let address: string;
  if (input.token.startsWith("0x")) {
    address = input.token;
  } else {
    const resolved = await resolveToken(input.token, chainId);
    if (!resolved) {
      throw new Error(`Could not resolve token "${input.token}" on chain ${chainId}`);
    }
    address = resolved.address;
  }

  // Step 2: Fetch from all sources in parallel
  const goplusUrl = `https://api.gopluslabs.io/api/v1/token_security/${chainId}?contract_addresses=${address}`;
  const dexscreenerUrl = `https://api.dexscreener.com/latest/dex/tokens/${address}`;

  const [goplusSettled, dexscreenerSettled] = await Promise.allSettled([
    resilientFetch(goplusUrl, { headers: goplusHeaders() }, GOPLUS_FETCH_CONFIG).then(
      (res) => res.json() as Promise<{ result: Record<string, GoPlusTokenData> }>
    ),
    resilientFetch(dexscreenerUrl, undefined, {
      label: "dexscreener",
      retry: { baseDelayMs: 1000 },
    }).then((res) => res.json() as Promise<{ pairs?: DexScreenerPair[] }>),
  ]);

  const warnings: string[] = [];
  const sources: string[] = [];

  // Step 3: Extract GoPlus data
  let isHoneypot: boolean | null = null;
  let buyTax: number | null = null;
  let sellTax: number | null = null;
  let holderCount: number | null = null;
  let lpLocked: boolean | null = null;
  let topHolderPercent: number | null = null;

  if (goplusSettled.status === "fulfilled") {
    sources.push("goplus");
    const addressKey = address.toLowerCase();
    const tokenData = goplusSettled.value.result[addressKey] ?? goplusSettled.value.result[address];
    if (tokenData) {
      isHoneypot = parseFlag(tokenData.is_honeypot);
      buyTax = tokenData.buy_tax != null ? Number(tokenData.buy_tax) : null;
      sellTax = tokenData.sell_tax != null ? Number(tokenData.sell_tax) : null;
      holderCount = tokenData.holder_count != null ? Number(tokenData.holder_count) : null;

      if (tokenData.lp_holders != null) {
        lpLocked = tokenData.lp_holders.some((lp) => lp.is_locked === 1);
      }

      if (tokenData.holders != null && tokenData.holders.length > 0) {
        topHolderPercent = Math.max(...tokenData.holders.map((h) => Number(h.percent)));
      }
    }
  } else {
    warnings.push("goplus");
  }

  // Step 4: Extract DexScreener data
  let liquidityUsd: number | null = null;
  let createdAt: string | null = null;

  if (dexscreenerSettled.status === "fulfilled") {
    sources.push("dexscreener");
    const pair = dexscreenerSettled.value.pairs?.[0];
    if (pair) {
      liquidityUsd = pair.liquidity?.usd ?? null;
      createdAt = pair.pairCreatedAt != null ? new Date(pair.pairCreatedAt).toISOString() : null;
    }
  } else {
    warnings.push("dexscreener");
  }

  // All sources failed
  if (sources.length === 0) {
    throw new Error(`All data sources failed for token ${address}`);
  }

  // Step 5: Compute risk level
  let riskLevel: "low" | "medium" | "high" = "low";

  if (
    isHoneypot === true ||
    (buyTax != null && buyTax > 0.1) ||
    (sellTax != null && sellTax > 0.1)
  ) {
    riskLevel = "high";
  } else if (
    (buyTax != null && buyTax > 0.01) ||
    (sellTax != null && sellTax > 0.01) ||
    (liquidityUsd != null && liquidityUsd < 10_000)
  ) {
    riskLevel = "medium";
  }

  return {
    isHoneypot,
    buyTax,
    sellTax,
    liquidityUsd,
    holderCount,
    lpLocked,
    topHolderPercent,
    // On-chain totalSupply read deferred — requires chain-specific publicClient setup
    totalSupply: null as string | null,
    createdAt,
    riskLevel,
    warnings,
    sources,
  };
}

// ── getTokenHolders ───────────────────────────────────────────────

interface GoPlusHolder {
  address: string;
  balance: string;
  percent: string;
  is_contract: string;
  tag?: string;
}

export async function getTokenHolders(input: {
  token: string;
  chainId?: number;
  limit?: number;
}): Promise<TokenHolderEntry[]> {
  const chainId = resolveToolChainId(input.chainId);
  const limit = input.limit ?? 10;
  const url = `https://api.gopluslabs.io/api/v1/token_security/${chainId}?contract_addresses=${input.token}`;

  const data = await ttlCache(url, GOPLUS_TTL, async () => {
    const res = await resilientFetch(url, { headers: goplusHeaders() }, GOPLUS_FETCH_CONFIG);
    if (!res.ok) {
      throw new Error(`GoPlus API returned ${res.status}`);
    }
    return (await res.json()) as {
      result: Record<string, { holders?: GoPlusHolder[] }>;
    };
  });

  const addressKey = input.token.toLowerCase();
  const tokenData = data.result[addressKey] ?? data.result[input.token];

  if (!tokenData) {
    throw new Error(`No token data found for address ${input.token} on chain ${chainId}`);
  }

  const holders = tokenData.holders ?? [];

  return holders.slice(0, limit).map((holder) => ({
    address: holder.address,
    balance: holder.balance,
    percentOfSupply: Number(holder.percent),
    label: holder.tag && holder.tag.length > 0 ? holder.tag : null,
  }));
}
