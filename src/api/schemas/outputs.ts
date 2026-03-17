import { z } from "zod";
import {
  addressSchema,
  hexSchema,
  preparedActionSchema,
  preparedTransactionRequestSchema,
  tokenEstimateSchema,
  typedDataPayloadSchema,
} from "./common.js";

// --- Swap & Quote ---

export const sameChainSwapQuoteResultSchema = z.object({
  kind: z.literal("same-chain").describe("Quote type"),
  provider: z.literal("orbs").describe("Swap provider"),
  chainId: z.number().describe("Chain ID"),
  quote: z.record(z.unknown()).describe("Raw quote object from Orbs SDK"),
});

// fromToken/toToken are overridden to optional because cross-chain quotes may
// not resolve both tokens (e.g. the destination token on an unsupported chain).
// The parent tokenEstimateSchema requires them, but this summary cannot guarantee them.
export const crossChainSwapQuoteSummarySchema = tokenEstimateSchema.extend({
  fromChainId: z.number().describe("Source chain ID"),
  toChainId: z.number().describe("Destination chain ID"),
  fromToken: z.string().optional().describe("Source token address"),
  toToken: z.string().optional().describe("Destination token address"),
  toAmountMin: z.string().optional().describe("Minimum output after slippage"),
  gasCostUSD: z.string().optional().describe("Estimated gas cost in USD"),
  estimatedDurationSeconds: z.number().optional().describe("Estimated time to complete"),
  includedSteps: z
    .array(
      z.object({
        type: z.string().optional().describe("Step type"),
        tool: z.string().optional().describe("Tool/protocol used"),
      })
    )
    .optional()
    .describe("Route steps"),
});

export const crossChainSwapQuoteResultSchema = z.object({
  kind: z.literal("cross-chain").describe("Quote type"),
  provider: z.literal("lifi").describe("Bridge provider"),
  quote: crossChainSwapQuoteSummarySchema.describe("Quote summary"),
});

export const swapQuoteResultSchema = z.discriminatedUnion("kind", [
  sameChainSwapQuoteResultSchema,
  crossChainSwapQuoteResultSchema,
]);

// --- Intents ---

export const approvalStepSchema = z.object({
  type: z.enum(["wrap", "approve"]).describe("Approval type"),
  label: z.string().describe("Human-readable description"),
  tx: z
    .object({
      to: addressSchema.describe("Target contract address"),
      data: hexSchema.optional().describe("Transaction calldata"),
      value: z.string().optional().describe("Native value to send"),
    })
    .describe("Transaction to execute"),
});

export const swapIntentSchema = z.object({
  eip712: typedDataPayloadSchema.describe("EIP-712 typed data for signing"),
  // inToken/outToken/inAmount mirror the Orbs SDK response shape. These are not
  // user-facing input fields, so they are exempt from the from/to naming convention.
  quote: z
    .object({
      sessionId: z.string().describe("Orbs session ID"),
      inToken: z.string().describe("Input token address"),
      outToken: z.string().describe("Output token address"),
      inAmount: z.string().describe("Input amount"),
      outAmount: z.string().describe("Expected output amount"),
      minAmountOut: z.string().describe("Minimum output after slippage"),
      user: z.string().describe("User wallet address"),
    })
    .passthrough()
    .describe("Quote data from Orbs SDK"),
  requiredApprovals: z
    .array(approvalStepSchema)
    .describe("Approval transactions needed before swap"),
  chainId: z.number().describe("Chain ID"),
});

/** @deprecated Kept for migration reference. Will be removed in v0.4.0. Use spotOrderIntentSchema instead. */
export const twapIntentSchema = z.object({
  eip712: typedDataPayloadSchema.describe("EIP-712 typed data for signing"),
  order: z.record(z.unknown()).describe("TWAP order data"),
  chainId: z.number().describe("Chain ID"),
  meta: z
    .object({
      chunks: z.number().describe("Number of TWAP intervals"),
      fillDelaySeconds: z.number().describe("Delay between fills"),
      durationSeconds: z.number().describe("Total order duration"),
      srcAmountPerChunk: z.string().describe("Amount per chunk in smallest units"),
    })
    .describe("TWAP order metadata"),
});

/** @deprecated Kept for migration reference. Will be removed in v0.4.0. Use spotOrderIntentSchema instead. */
export const limitIntentSchema = z.object({
  eip712: typedDataPayloadSchema.describe("EIP-712 typed data for signing"),
  order: z.record(z.unknown()).describe("Limit order data"),
  chainId: z.number().describe("Chain ID"),
  meta: z
    .object({
      expirySeconds: z.number().describe("Order expiry duration"),
      toMinAmount: z.string().describe("Minimum output amount"),
    })
    .describe("Limit order metadata"),
});

// --- Bridge ---

export const bridgeTxStepSchema = z.object({
  type: z.enum(["approval", "bridge"]).describe("Step type"),
  label: z.string().describe("Human-readable description"),
  tx: preparedTransactionRequestSchema.describe("Transaction to execute"),
});

export const bridgeIntentEstimateSchema = tokenEstimateSchema.extend({
  toAmountMin: z.string().describe("Minimum output after slippage"),
  gasCostUSD: z.string().optional().describe("Estimated gas cost in USD"),
  estimatedDurationSeconds: z.number().optional().describe("Estimated bridge time"),
});

export const bridgeIntentSchema = z.object({
  steps: z.array(bridgeTxStepSchema).describe("Transaction steps (approvals + bridge)"),
  actions: z.array(preparedActionSchema).describe("Prepared actions for staged execution"),
  estimate: bridgeIntentEstimateSchema.describe("Bridge cost and output estimate"),
  fromChainId: z.number().describe("Source chain ID"),
  toChainId: z.number().describe("Destination chain ID"),
});

// --- Operations ---

export const preparedOperationSchema = z.object({
  integration: z.enum(["orbs", "lifi", "goat"]).describe("Integration provider"),
  kind: z.string().describe("Operation type"),
  summary: z.string().describe("Human-readable summary"),
  actions: z.array(preparedActionSchema).describe("Actions for the caller to execute"),
  resumeState: z
    .object({
      version: z.literal(1),
      integration: z.enum(["orbs", "lifi", "goat"]),
      kind: z.string(),
      state: z.record(z.unknown()),
    })
    .describe("Opaque state to pass to resumeOperation"),
  meta: z.record(z.unknown()).optional().describe("Additional metadata"),
});

// --- Simulation ---

export const balanceChangeSchema = z.object({
  token: addressSchema.describe("Token contract address"),
  symbol: z.string().nullable().describe("Token symbol"),
  decimals: z.number().nullable().describe("Token decimals"),
  amount: z.string().describe("Change amount (signed)"),
  direction: z.enum(["in", "out"]).describe("Direction of balance change"),
});

export const simulationResultSchema = z.object({
  success: z.literal(true).describe("Simulation succeeded"),
  gasEstimate: z.string().describe("Estimated gas usage"),
  balanceChanges: z.array(balanceChangeSchema).describe("Token balance changes"),
});

// --- Spot Order Intent ---

export const spotOrderIntentSchema = z.object({
  typedData: typedDataPayloadSchema.describe("EIP-712 typed data for signing"),
  approval: z
    .object({
      token: z.string().describe("Token to approve"),
      spender: z.string().describe("RePermit contract address"),
      amount: z.string().describe("Approval amount"),
      exactApproval: z.boolean().describe("Whether approval is for exact amount or unlimited"),
      tx: z
        .object({
          to: z.string().describe("Token contract address"),
          data: hexSchema.describe("Approval calldata"),
          value: z.string().describe("Native value (always 0x0)"),
        })
        .describe("Approval transaction"),
    })
    .describe("Token approval for RePermit"),
  submit: z
    .object({
      url: z.string().describe("URL to POST the signed order"),
      body: z
        .object({
          order: z.record(z.unknown()).describe("Order witness to submit"),
          signature: z.null().describe("Placeholder for signature after signing"),
          status: z.literal("pending").describe("Order status"),
        })
        .describe("Submit request body template"),
    })
    .describe("Submit endpoint and payload template"),
  query: z
    .object({
      url: z.string().describe("Base URL for querying order status"),
    })
    .describe("Query endpoint"),
  meta: z
    .object({
      kind: z.enum(["single", "chunked"]).describe("Order kind"),
      chunkCount: z.number().describe("Number of chunks"),
      chunkInputAmount: z.string().describe("Input amount per chunk"),
      start: z.number().describe("Start timestamp"),
      deadline: z.number().describe("Deadline timestamp"),
      epoch: z.number().describe("Epoch seconds between chunks"),
      limit: z.string().describe("Output limit per chunk"),
    })
    .describe("Order metadata"),
  requiredApprovals: z
    .array(approvalStepSchema)
    .describe("Approval transactions needed before signing"),
  warnings: z.array(z.string()).describe("Validation warnings"),
  chainId: z.number().describe("Chain ID"),
});

// ── Market output schemas ────────────────────────────────────────────────────

export const protocolTvlResultSchema = z.object({
  name: z.string().describe("Protocol name"),
  tvl: z.number().describe("Total value locked in USD"),
  tvlChange1d: z.number().optional().describe("TVL change over 1 day (%)"),
  tvlChange7d: z.number().optional().describe("TVL change over 7 days (%)"),
  tvlChange30d: z.number().optional().describe("TVL change over 30 days (%)"),
  chainTvls: z.record(z.number()).describe("TVL broken down by chain"),
  category: z.string().describe("Protocol category"),
  url: z.string().describe("Protocol website URL"),
});

export const topProtocolEntrySchema = z.object({
  name: z.string().describe("Protocol name"),
  tvl: z.number().describe("Total value locked in USD"),
  tvlChange1d: z.number().describe("TVL change over 1 day (%)"),
  chain: z.string().describe("Primary chain"),
  category: z.string().describe("Protocol category"),
  slug: z.string().describe("Protocol slug identifier"),
});

export const chainTvlEntrySchema = z.object({
  date: z.string().describe("ISO 8601 date string"),
  tvl: z.number().describe("Total value locked in USD at this date"),
});

export const tokenPriceEntrySchema = z.object({
  price: z.number().describe("Current token price in USD"),
  symbol: z.string().describe("Token symbol"),
  decimals: z.number().describe("Token decimals"),
  confidence: z.number().describe("Price confidence score"),
  timestamp: z.number().describe("Unix timestamp of the price"),
});

export const tokenPriceResultSchema = z.object({
  coins: z.record(tokenPriceEntrySchema).describe("Price data keyed by coin identifier"),
});

export const gainerLoserEntrySchema = z.object({
  symbol: z.string().describe("Token symbol or identifier"),
  priceChange: z.number().describe("Price change percentage"),
  price: z.number().nullable().describe("Current price in USD, if available"),
});

export const gainersLosersResultSchema = z.object({
  gainers: z.array(gainerLoserEntrySchema).describe("Top gaining tokens"),
  losers: z.array(gainerLoserEntrySchema).describe("Top losing tokens"),
});

export const dexProtocolEntrySchema = z.object({
  name: z.string().describe("DEX protocol name"),
  volume24h: z.number().describe("24-hour trading volume in USD"),
  change1d: z.number().describe("Volume change over 1 day (%)"),
});

export const dexVolumeResultSchema = z.object({
  totalVolume24h: z.number().describe("Total 24-hour DEX volume in USD"),
  totalVolume7d: z.number().nullable().describe("Total 7-day DEX volume in USD, if available"),
  protocols: z.array(dexProtocolEntrySchema).describe("Per-protocol volume breakdown"),
});

export const stablecoinEntrySchema = z.object({
  name: z.string().describe("Stablecoin name"),
  symbol: z.string().describe("Stablecoin symbol"),
  totalCirculating: z.number().describe("Total circulating supply in USD"),
  pegDeviation: z.number().describe("Current deviation from peg (%)"),
  dominance: z.number().describe("Share of total stablecoin market (%)"),
});

export const globalStatsResultSchema = z.object({
  totalMarketCap: z.number().describe("Total crypto market cap in USD"),
  totalVolume24h: z.number().describe("Total 24-hour trading volume in USD"),
  btcDominance: z.number().describe("Bitcoin market cap dominance (%)"),
  ethDominance: z.number().describe("Ethereum market cap dominance (%)"),
  defiMarketCap: z.number().describe("Total DeFi market cap in USD"),
  defiDominance: z.number().describe("DeFi share of total market cap (%)"),
  marketCapChange24h: z.number().describe("Market cap change over 24 hours (%)"),
});

export const cexFundFlowEntrySchema = z.object({
  symbol: z.string().describe("Token symbol"),
  depositCount: z.number().describe("Number of deposits"),
  withdrawCount: z.number().describe("Number of withdrawals"),
  depositSumUsd: z.number().describe("Total deposit value in USD"),
  withdrawSumUsd: z.number().describe("Total withdrawal value in USD"),
  netFlow: z.number().describe("Net flow (deposits minus withdrawals) in USD"),
  totalUsers: z.number().describe("Total number of users"),
});

export const exchangeRankingEntrySchema = z.object({
  name: z.string().describe("Exchange name"),
  trustScore: z.number().describe("CoinGecko trust score"),
  trustScoreRank: z.number().describe("Trust score rank"),
  volume24hBtc: z.number().describe("24-hour trading volume in BTC"),
  country: z.string().describe("Country of registration"),
  yearEstablished: z.number().describe("Year the exchange was established"),
});

export const sentimentEntrySchema = z.object({
  date: z.string().describe("ISO 8601 date string"),
  value: z.number().describe("Fear and greed index value (0-100)"),
  classification: z.string().describe("Fear and greed classification label"),
});

export const sentimentResultSchema = z.object({
  current: sentimentEntrySchema.describe("Most recent fear and greed reading"),
  history: z.array(sentimentEntrySchema).describe("Historical fear and greed readings"),
});

export const trendingTokenEntrySchema = z.object({
  name: z.string().describe("Token name"),
  symbol: z.string().describe("Token symbol"),
  marketCapRank: z.number().describe("Market cap rank"),
  price: z.number().optional().describe("Current price in USD"),
  priceChange24h: z.number().optional().describe("24-hour price change (%)"),
  marketCap: z.number().optional().describe("Market cap in USD"),
  volume24h: z.number().optional().describe("24-hour trading volume in USD"),
});

export const trendingResultSchema = z.object({
  coins: z.array(trendingTokenEntrySchema).describe("Trending tokens"),
  warnings: z.array(z.string()).optional().describe("Warnings from data enrichment"),
});

export const topTokenEntrySchema = z.object({
  name: z.string().describe("Token name"),
  symbol: z.string().describe("Token symbol"),
  marketCapRank: z.number().describe("Market cap rank"),
  currentPrice: z.number().describe("Current price in USD"),
  priceChange24h: z.number().describe("24-hour price change (%)"),
  priceChange7d: z.number().optional().describe("7-day price change (%)"),
  marketCap: z.number().describe("Market cap in USD"),
  totalVolume: z.number().describe("24-hour trading volume in USD"),
  circulatingSupply: z.number().optional().describe("Circulating supply"),
  ath: z.number().optional().describe("All-time high price in USD"),
  athDate: z.string().optional().describe("Date of all-time high"),
});

export const tokenSearchResultEntrySchema = z.object({
  id: z.string().describe("CoinGecko token ID"),
  name: z.string().describe("Token name"),
  symbol: z.string().describe("Token symbol"),
  marketCapRank: z.number().describe("Market cap rank"),
  thumb: z.string().describe("Thumbnail image URL"),
});

export const categoryEntrySchema = z.object({
  name: z.string().describe("Category name"),
  marketCap: z.number().describe("Total market cap in USD"),
  marketCapChange24h: z.number().describe("24-hour market cap change (%)"),
  volume24h: z.number().describe("24-hour trading volume in USD"),
  topCoins: z.array(z.string()).describe("Thumbnail URLs for top 3 coins in this category"),
  updatedAt: z.string().describe("ISO 8601 timestamp of last update"),
});

export const tokenHistoryEntrySchema = z.object({
  timestamp: z.string().describe("ISO 8601 timestamp"),
  price: z.number().describe("Token price in USD at this timestamp"),
  marketCap: z.number().optional().describe("Market cap in USD at this timestamp"),
  volume: z.number().optional().describe("Trading volume in USD at this timestamp"),
});

export const tickerResultSchema = z.object({
  symbol: z.string().describe("Trading pair symbol"),
  lastPrice: z.string().describe("Last traded price"),
  priceChange: z.string().describe("Absolute price change over 24 hours"),
  priceChangePercent: z.string().describe("Percentage price change over 24 hours"),
  highPrice: z.string().describe("24-hour high price"),
  lowPrice: z.string().describe("24-hour low price"),
  volume: z.string().describe("24-hour base asset volume"),
  quoteVolume: z.string().describe("24-hour quote asset volume"),
  bidPrice: z.string().describe("Current best bid price"),
  askPrice: z.string().describe("Current best ask price"),
});

export const klineEntrySchema = z.object({
  openTime: z.number().describe("Kline open time (Unix ms)"),
  open: z.string().describe("Open price"),
  high: z.string().describe("High price"),
  low: z.string().describe("Low price"),
  close: z.string().describe("Close price"),
  volume: z.string().describe("Base asset volume"),
  quoteVolume: z.string().describe("Quote asset volume"),
  trades: z.number().describe("Number of trades"),
});

export const orderBookLevelSchema = z.object({
  price: z.string().describe("Price level"),
  quantity: z.string().describe("Quantity at this price level"),
});

export const orderBookResultSchema = z.object({
  lastUpdateId: z.number().describe("Last order book update ID"),
  bids: z.array(orderBookLevelSchema).describe("Bid levels (buy orders)"),
  asks: z.array(orderBookLevelSchema).describe("Ask levels (sell orders)"),
});

export const fundingRateEntrySchema = z.object({
  fundingTime: z.number().describe("Funding rate settlement time (Unix ms)"),
  fundingRate: z.string().describe("Funding rate as a decimal string"),
  markPrice: z.string().describe("Mark price at funding time"),
});

// ── Research output schemas ───────────────────────────────────────────────────

export const contractSecurityResultSchema = z.object({
  verified: z.boolean().describe("Whether the contract source is verified"),
  isProxy: z.boolean().describe("Whether the contract is a proxy"),
  ownerAddress: z.string().nullable().describe("Contract owner address, if available"),
  canMint: z.boolean().describe("Whether the contract can mint new tokens"),
  canPause: z.boolean().describe("Whether the owner can pause transfers"),
  canBlacklist: z.boolean().describe("Whether addresses can be blacklisted"),
  isHoneypot: z.boolean().describe("Whether the contract is flagged as a honeypot"),
  maliciousFlags: z.array(z.string()).describe("List of detected malicious flags"),
});

export const tokenDueDiligenceResultSchema = z.object({
  isHoneypot: z.boolean().nullable().describe("Whether the token is flagged as a honeypot"),
  buyTax: z.number().nullable().describe("Buy tax as a decimal (e.g. 0.05 = 5%)"),
  sellTax: z.number().nullable().describe("Sell tax as a decimal (e.g. 0.05 = 5%)"),
  liquidityUsd: z.number().nullable().describe("Total liquidity in USD"),
  holderCount: z.number().nullable().describe("Number of token holders"),
  lpLocked: z.boolean().nullable().describe("Whether liquidity pool tokens are locked"),
  topHolderPercent: z.number().nullable().describe("Percentage held by the top holder"),
  totalSupply: z.string().nullable().describe("Total token supply"),
  createdAt: z.string().nullable().describe("ISO 8601 timestamp of pair creation"),
  riskLevel: z.enum(["low", "medium", "high"]).describe("Computed risk level"),
  warnings: z.array(z.string()).describe("Warnings from data sources"),
  sources: z.array(z.string()).describe("Data sources consulted"),
});

export const tokenHolderEntrySchema = z.object({
  address: z.string().describe("Holder wallet address"),
  balance: z.string().describe("Token balance as a string"),
  percentOfSupply: z.number().describe("Percentage of total supply held"),
  label: z.string().nullable().describe("Known label or tag for this address, if any"),
});

export const yieldPoolEntrySchema = z.object({
  pool: z.string().describe("Pool identifier"),
  project: z.string().describe("Protocol project name"),
  chain: z.string().describe("Blockchain network"),
  symbol: z.string().describe("Pool token symbol"),
  tvlUsd: z.number().describe("Total value locked in USD"),
  apy: z.number().describe("Total APY (%)"),
  apyBase: z.number().describe("Base APY from fees (%)"),
  apyReward: z.number().describe("Reward APY from incentives (%)"),
  ilRisk: z.string().describe("Impermanent loss risk level"),
  rewardTokens: z.array(z.string()).describe("Reward token addresses"),
});

export const yieldComparisonEntrySchema = z.object({
  project: z.string().describe("Protocol project name"),
  chain: z.string().describe("Blockchain network"),
  apy: z.number().describe("Total APY (%)"),
  tvlUsd: z.number().describe("Total value locked in USD"),
  apyBase: z.number().describe("Base APY from fees (%)"),
  apyReward: z.number().describe("Reward APY from incentives (%)"),
});

export const protocolInfoResultSchema = z.object({
  name: z.string().describe("Protocol name"),
  description: z.string().optional().describe("Protocol description"),
  category: z.string().describe("Protocol category"),
  chains: z.array(z.string()).describe("Supported blockchain networks"),
  tvl: z.number().describe("Total value locked in USD"),
  audits: z.string().optional().describe("Audit information"),
  url: z.string().optional().describe("Protocol website URL"),
  raises: z.array(z.unknown()).optional().describe("Fundraising rounds data"),
  twitter: z.string().optional().describe("Twitter handle"),
  governanceLinks: z.array(z.string()).nullable().describe("Governance forum links"),
  devActivity: z.number().optional().describe("GitHub commit count over last 4 weeks"),
  communityScore: z.number().optional().describe("Twitter follower count"),
  categories: z.array(z.string()).optional().describe("CoinGecko categories"),
  sentimentUp: z.number().optional().describe("Percentage of positive sentiment votes"),
  sentimentDown: z.number().optional().describe("Percentage of negative sentiment votes"),
  sources: z.array(z.string()).describe("Data sources consulted"),
  warnings: z.array(z.string()).optional().describe("Warnings from data enrichment"),
});

export const tokenUnlockEntrySchema = z.object({
  name: z.string().describe("Protocol or token name"),
  symbol: z.string().describe("Token symbol"),
  nextEvent: z.string().describe("ISO 8601 timestamp of next unlock event"),
  toUnlockUsd: z.number().describe("USD value of tokens to be unlocked"),
  price: z.number().describe("Current token price in USD"),
  priceImpactPercent: z.number().describe("Estimated price impact of the unlock (%)"),
});

export const hackEntrySchema = z.object({
  name: z.string().describe("Protocol or project name"),
  date: z.string().describe("ISO 8601 date of the hack"),
  amountUsd: z.number().describe("Amount stolen in USD"),
  technique: z.string().describe("Attack technique used"),
  sourceUrl: z.string().describe("Source URL for the incident report"),
});

export const fundRaiseEntrySchema = z.object({
  name: z.string().describe("Project name"),
  date: z.string().describe("ISO 8601 date of the funding round"),
  amountUsd: z.number().describe("Amount raised in USD"),
  round: z.string().describe("Funding round type (e.g. Seed, Series A)"),
  leadInvestor: z.string().describe("Lead investor name"),
  sourceUrl: z.string().describe("Source URL for the announcement"),
});

export const whaleTransferEntrySchema = z.object({
  txHash: z.string().describe("Transaction hash"),
  blockTime: z.string().describe("ISO 8601 timestamp of the block"),
  symbol: z.string().describe("Token symbol"),
  value: z.number().describe("Token amount transferred"),
  valueUsd: z.number().describe("Transfer value in USD"),
  fromEntity: z.string().describe("Sending entity label or address"),
  toEntity: z.string().describe("Receiving entity label or address"),
});

export const governanceProposalEntrySchema = z.object({
  orgName: z.string().describe("Organization or DAO name"),
  title: z.string().describe("Proposal title"),
  status: z.string().describe("Proposal status (e.g. active, closed)"),
  startDate: z.string().describe("ISO 8601 start date of the voting period"),
  endDate: z.string().describe("ISO 8601 end date of the voting period"),
  link: z.string().describe("Link to the governance proposal"),
  quorum: z.number().describe("Required quorum for the proposal"),
  choices: z.array(z.string()).describe("Voting choices"),
  votes: z.array(z.number()).describe("Vote counts per choice"),
  voterCount: z.number().describe("Total number of voters"),
});

export const newsEntrySchema = z.object({
  title: z.string().describe("Article title"),
  summary: z.string().describe("Article summary or content"),
  link: z.string().describe("Article URL"),
  publishedAt: z.string().describe("ISO 8601 publication timestamp"),
  topic: z.string().describe("Article topic or category"),
  sentiment: z.string().describe("Sentiment classification of the article"),
});

export const airdropEntrySchema = z.object({
  name: z.string().describe("Airdrop or project name"),
  symbol: z.string().describe("Token symbol"),
  claimPage: z.string().describe("URL to claim the airdrop"),
  endsAt: z.string().nullable().describe("ISO 8601 end date, or null if ongoing"),
  price: z.number().describe("Current token price in USD"),
  priceChange: z.number().describe("Recent price change (%)"),
});

// --- Swap Status & History ---

export const swapSubmissionResultSchema = z.object({
  sessionId: z.string().describe("Swap session ID"),
  txHash: z.string().optional().describe("Transaction hash if available"),
  status: z.enum(["submitted", "completed", "failed"]).describe("Swap status"),
  error: z.string().optional().describe("Error message if failed"),
});

export const tokenSwappableResultSchema = z.object({
  swappable: z.boolean().describe("Whether the token pair is swappable"),
  provider: z.enum(["orbs", "lifi"]).describe("Available swap provider"),
  kind: z.enum(["same-chain", "cross-chain"]).describe("Swap type"),
  reason: z.string().optional().describe("Reason if not swappable"),
});
