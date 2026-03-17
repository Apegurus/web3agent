import { zodToJsonSchema } from "zod-to-json-schema";
import type { ToolDefinition } from "../register.js";
import { createToolHandler } from "../shared/handler-factory.js";
import {
  getAirdrops,
  getFundRaises,
  getGovernance,
  getHackHistory,
  getNews,
  getTokenUnlocks,
  getWhaleTransfers,
} from "./defillama.js";
import {
  researchAirdropsSchema,
  researchCompareYieldsSchema,
  researchContractSecuritySchema,
  researchFundRaisesSchema,
  researchGovernanceSchema,
  researchHackHistorySchema,
  researchNewsSchema,
  researchProtocolInfoSchema,
  researchTokenDueDiligenceSchema,
  researchTokenHoldersSchema,
  researchTokenUnlocksSchema,
  researchWhaleTransfersSchema,
  researchYieldOpportunitiesSchema,
} from "./schemas.js";
import { getContractSecurity, getTokenDueDiligence, getTokenHolders } from "./security.js";
import { getCompareYields, getProtocolInfo, getYieldOpportunities } from "./yields.js";

const RESEARCH_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const;

export function getResearchToolDefinitions(): ToolDefinition[] {
  return [
    {
      name: "research_contract_security",
      category: "research",
      description:
        "Analyze the security posture of a smart contract by querying GoPlus Security. " +
        "Returns audit flags such as honeypot detection, proxy patterns, ownership renouncement, " +
        "trading restrictions, and other risk indicators for the given contract address.",
      inputSchema: zodToJsonSchema(researchContractSecuritySchema) as Record<string, unknown>,
      handler: createToolHandler(
        researchContractSecuritySchema,
        getContractSecurity,
        "RESEARCH_CONTRACT_SECURITY_ERROR"
      ),
      annotations: RESEARCH_ANNOTATIONS,
    },
    {
      name: "research_token_due_diligence",
      category: "research",
      description:
        "Perform comprehensive due diligence on a token by aggregating security, holder distribution, " +
        "and market data from multiple sources. Returns a structured risk assessment covering contract " +
        "safety flags, top holder concentration, and liquidity metrics to support informed investment decisions.",
      inputSchema: zodToJsonSchema(researchTokenDueDiligenceSchema) as Record<string, unknown>,
      handler: createToolHandler(
        researchTokenDueDiligenceSchema,
        getTokenDueDiligence,
        "RESEARCH_TOKEN_DUE_DILIGENCE_ERROR"
      ),
      annotations: RESEARCH_ANNOTATIONS,
    },
    {
      name: "research_token_holders",
      category: "research",
      description:
        "Retrieve the top token holders for a given contract address using GoPlus Security data. " +
        "Returns a ranked list of holder addresses with their balance and percentage share of the total supply, " +
        "enabling analysis of holder concentration and whale exposure.",
      inputSchema: zodToJsonSchema(researchTokenHoldersSchema) as Record<string, unknown>,
      handler: createToolHandler(
        researchTokenHoldersSchema,
        getTokenHolders,
        "RESEARCH_TOKEN_HOLDERS_ERROR"
      ),
      annotations: RESEARCH_ANNOTATIONS,
    },
    {
      name: "research_yield_opportunities",
      category: "research",
      description:
        "Discover DeFi yield farming and liquidity pool opportunities from DefiLlama's yields API. " +
        "Returns a filtered and ranked list of pools with APY, TVL, chain, protocol, and pool metadata " +
        "to help identify the best yield strategies across the ecosystem.",
      inputSchema: zodToJsonSchema(researchYieldOpportunitiesSchema) as Record<string, unknown>,
      handler: createToolHandler(
        researchYieldOpportunitiesSchema,
        getYieldOpportunities,
        "RESEARCH_YIELD_OPPORTUNITIES_ERROR"
      ),
      annotations: RESEARCH_ANNOTATIONS,
    },
    {
      name: "research_compare_yields",
      category: "research",
      description:
        "Compare yield opportunities for a specific token across multiple DeFi protocols and chains. " +
        "Returns matching pools sorted by APY so you can quickly identify where a given token earns the most yield, " +
        "including TVL and protocol information for each option.",
      inputSchema: zodToJsonSchema(researchCompareYieldsSchema) as Record<string, unknown>,
      handler: createToolHandler(
        researchCompareYieldsSchema,
        getCompareYields,
        "RESEARCH_COMPARE_YIELDS_ERROR"
      ),
      annotations: RESEARCH_ANNOTATIONS,
    },
    {
      name: "research_protocol_info",
      category: "research",
      description:
        "Fetch detailed information about a DeFi protocol from DefiLlama's yields database. " +
        "Returns the protocol's available pools with their current APY, TVL, chain, and reward token details, " +
        "providing a comprehensive view of the protocol's yield offerings.",
      inputSchema: zodToJsonSchema(researchProtocolInfoSchema) as Record<string, unknown>,
      handler: createToolHandler(
        researchProtocolInfoSchema,
        getProtocolInfo,
        "RESEARCH_PROTOCOL_INFO_ERROR"
      ),
      annotations: RESEARCH_ANNOTATIONS,
    },
    {
      name: "research_token_unlocks",
      category: "research",
      description:
        "Retrieve upcoming token unlock events from DefiLlama's vesting tracker. " +
        "Returns a list of tokens with their next unlock date, USD value to be unlocked, current price, " +
        "and estimated price impact percentage — useful for anticipating supply-side selling pressure.",
      inputSchema: zodToJsonSchema(researchTokenUnlocksSchema) as Record<string, unknown>,
      handler: createToolHandler(
        researchTokenUnlocksSchema,
        getTokenUnlocks,
        "RESEARCH_TOKEN_UNLOCKS_ERROR"
      ),
      annotations: RESEARCH_ANNOTATIONS,
    },
    {
      name: "research_hack_history",
      category: "research",
      description:
        "Query the history of DeFi hacks and exploits tracked by DefiLlama. " +
        "Returns a list of incidents with the protocol name, date, USD amount lost, attack technique, " +
        "and source URL — enabling security research and risk assessment of protocols.",
      inputSchema: zodToJsonSchema(researchHackHistorySchema) as Record<string, unknown>,
      handler: createToolHandler(
        researchHackHistorySchema,
        getHackHistory,
        "RESEARCH_HACK_HISTORY_ERROR"
      ),
      annotations: RESEARCH_ANNOTATIONS,
    },
    {
      name: "research_fund_raises",
      category: "research",
      description:
        "Fetch fundraising and investment round data for crypto projects from DefiLlama. " +
        "Returns project name, date, USD amount raised, funding round type, and lead investors, " +
        "providing insight into which projects are attracting institutional capital.",
      inputSchema: zodToJsonSchema(researchFundRaisesSchema) as Record<string, unknown>,
      handler: createToolHandler(
        researchFundRaisesSchema,
        getFundRaises,
        "RESEARCH_FUND_RAISES_ERROR"
      ),
      annotations: RESEARCH_ANNOTATIONS,
    },
    {
      name: "research_whale_transfers",
      category: "research",
      description:
        "Track large on-chain token transfers (whale movements) using DefiLlama's large transactions feed. " +
        "Returns recent high-value transfers with sender, receiver, USD amount, token symbol, chain, and timestamp " +
        "to monitor smart money flows and potential market-moving activity.",
      inputSchema: zodToJsonSchema(researchWhaleTransfersSchema) as Record<string, unknown>,
      handler: createToolHandler(
        researchWhaleTransfersSchema,
        getWhaleTransfers,
        "RESEARCH_WHALE_TRANSFERS_ERROR"
      ),
      annotations: RESEARCH_ANNOTATIONS,
    },
    {
      name: "research_governance",
      category: "research",
      description:
        "Fetch active and recent governance proposals for DeFi protocols from DefiLlama's governance tracker. " +
        "Returns proposal title, current status, vote counts (for/against/abstain), start and end dates, " +
        "and discussion links to stay informed about protocol governance decisions.",
      inputSchema: zodToJsonSchema(researchGovernanceSchema) as Record<string, unknown>,
      handler: createToolHandler(
        researchGovernanceSchema,
        getGovernance,
        "RESEARCH_GOVERNANCE_ERROR"
      ),
      annotations: RESEARCH_ANNOTATIONS,
    },
    {
      name: "research_news",
      category: "research",
      description:
        "Retrieve the latest crypto and DeFi news headlines from DefiLlama's news aggregator. " +
        "Returns article titles, publication dates, source names, and URLs, providing a curated feed of " +
        "relevant industry news to support market research and situational awareness.",
      inputSchema: zodToJsonSchema(researchNewsSchema) as Record<string, unknown>,
      handler: createToolHandler(researchNewsSchema, getNews, "RESEARCH_NEWS_ERROR"),
      annotations: RESEARCH_ANNOTATIONS,
    },
    {
      name: "research_airdrops",
      category: "research",
      description:
        "Discover active and upcoming token airdrop opportunities tracked by DefiLlama. " +
        "Returns airdrop name, protocol, eligibility criteria, estimated value, claim deadline, and status " +
        "to help users identify and act on airdrop opportunities before they expire.",
      inputSchema: zodToJsonSchema(researchAirdropsSchema) as Record<string, unknown>,
      handler: createToolHandler(researchAirdropsSchema, getAirdrops, "RESEARCH_AIRDROPS_ERROR"),
      annotations: RESEARCH_ANNOTATIONS,
    },
  ];
}
