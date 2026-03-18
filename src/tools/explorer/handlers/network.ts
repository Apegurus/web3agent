import type { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import type {
  EtherscanHistoricalPrice,
  EtherscanPrice,
  EtherscanSupply,
} from "../../../api/explorer/etherscan/types.js";
import {
  normalizeEtherscanDailyStats,
  normalizeEtherscanHistoricalPrice,
  normalizeEtherscanNativePrice,
  normalizeEtherscanNativeSupply,
} from "../../../api/explorer/network.js";
import type { ToolDefinition } from "../../register.js";
import { createToolHandler } from "../../shared/handler-factory.js";
import {
  explorerGetDailyStatsSchema,
  explorerGetHistoricalPriceSchema,
  explorerGetNativePriceSchema,
  explorerGetNativeSupplySchema,
} from "../schemas.js";
import type { ExplorerDeps } from "./shared.js";
import { requireEtherscan } from "./shared.js";

type DailyStatsInput = z.infer<typeof explorerGetDailyStatsSchema>;
type NativePriceInput = z.infer<typeof explorerGetNativePriceSchema>;
type HistoricalPriceInput = z.infer<typeof explorerGetHistoricalPriceSchema>;
type NativeSupplyInput = z.infer<typeof explorerGetNativeSupplySchema>;

/** Factory for daily stats tools — all share the same schema and handler shape */
function makeDailyStatsTool(config: {
  name: string;
  description: string;
  action: string;
  metric: string;
  errorCode: string;
  etherscan: ExplorerDeps["etherscan"];
}): ToolDefinition {
  const { name, description, action, metric, errorCode, etherscan } = config;
  return {
    name,
    category: "explorer",
    description,
    inputSchema: zodToJsonSchema(explorerGetDailyStatsSchema) as Record<string, unknown>,
    handler: createToolHandler(
      explorerGetDailyStatsSchema,
      async (input: DailyStatsInput) => {
        const eth = requireEtherscan(etherscan);
        const params: Record<string, string> = {
          startdate: input.startDate,
          enddate: input.endDate,
          sort: input.sort ?? "asc",
        };
        const raw = await eth.call<Record<string, string>[]>(
          input.chainId,
          "stats",
          action,
          params
        );
        return normalizeEtherscanDailyStats(raw, metric);
      },
      errorCode
    ),
    annotations: { readOnlyHint: true, openWorldHint: true },
  };
}

export function getNetworkToolDefinitions(deps: ExplorerDeps): ToolDefinition[] {
  const { etherscan } = deps;

  return [
    makeDailyStatsTool({
      name: "explorer_get_daily_tx_count",
      description: "Get daily transaction count for a date range.",
      action: "dailytx",
      metric: "dailyTxCount",
      errorCode: "EXPLORER_DAILY_TX_COUNT_ERROR",
      etherscan,
    }),
    makeDailyStatsTool({
      name: "explorer_get_daily_gas_used",
      description: "Get daily average gas used for a date range.",
      action: "dailyavggasused",
      metric: "dailyGasUsed",
      errorCode: "EXPLORER_DAILY_GAS_USED_ERROR",
      etherscan,
    }),
    makeDailyStatsTool({
      name: "explorer_get_daily_new_addresses",
      description: "Get daily new address count for a date range.",
      action: "dailynewaddress",
      metric: "dailyNewAddresses",
      errorCode: "EXPLORER_DAILY_NEW_ADDRESSES_ERROR",
      etherscan,
    }),
    makeDailyStatsTool({
      name: "explorer_get_daily_block_rewards",
      description: "Get daily block rewards for a date range.",
      action: "dailyblockrewards",
      metric: "dailyBlockRewards",
      errorCode: "EXPLORER_DAILY_BLOCK_REWARDS_ERROR",
      etherscan,
    }),
    makeDailyStatsTool({
      name: "explorer_get_network_utilization",
      description: "Get daily network utilization percentage for a date range.",
      action: "dailynetutilization",
      metric: "networkUtilization",
      errorCode: "EXPLORER_NETWORK_UTILIZATION_ERROR",
      etherscan,
    }),
    {
      name: "explorer_get_native_price",
      category: "explorer",
      description: "Get the current native token price in USD and BTC.",
      inputSchema: zodToJsonSchema(explorerGetNativePriceSchema) as Record<string, unknown>,
      handler: createToolHandler(
        explorerGetNativePriceSchema,
        async (input: NativePriceInput) => {
          const eth = requireEtherscan(etherscan);
          const raw = await eth.call<EtherscanPrice>(input.chainId, "stats", "ethprice", {});
          return normalizeEtherscanNativePrice(raw);
        },
        "EXPLORER_NATIVE_PRICE_ERROR"
      ),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    {
      name: "explorer_get_historical_price",
      category: "explorer",
      description: "Get historical daily native token prices for a date range.",
      inputSchema: zodToJsonSchema(explorerGetHistoricalPriceSchema) as Record<string, unknown>,
      handler: createToolHandler(
        explorerGetHistoricalPriceSchema,
        async (input: HistoricalPriceInput) => {
          const eth = requireEtherscan(etherscan);
          const raw = await eth.call<EtherscanHistoricalPrice[]>(
            input.chainId,
            "stats",
            "ethdailyprice",
            {
              startdate: input.startDate,
              enddate: input.endDate,
              sort: input.sort ?? "asc",
            }
          );
          return normalizeEtherscanHistoricalPrice(raw);
        },
        "EXPLORER_HISTORICAL_PRICE_ERROR"
      ),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    {
      name: "explorer_get_native_supply",
      category: "explorer",
      description:
        "Get the native token supply including staking, burned fees, and withdrawal totals.",
      inputSchema: zodToJsonSchema(explorerGetNativeSupplySchema) as Record<string, unknown>,
      handler: createToolHandler(
        explorerGetNativeSupplySchema,
        async (input: NativeSupplyInput) => {
          const eth = requireEtherscan(etherscan);
          const raw = await eth.call<EtherscanSupply>(input.chainId, "stats", "ethsupply2", {});
          return normalizeEtherscanNativeSupply(raw);
        },
        "EXPLORER_NATIVE_SUPPLY_ERROR"
      ),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
  ];
}
