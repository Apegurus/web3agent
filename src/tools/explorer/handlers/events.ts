import type { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { EtherscanEventLog } from "../../../api/explorer/etherscan/types.js";
import { normalizeEtherscanEventLog } from "../../../api/explorer/events.js";
import type { ToolDefinition } from "../../register.js";
import { createToolHandler } from "../../shared/handler-factory.js";
import { explorerGetEventLogsByTopicsSchema, explorerGetEventLogsSchema } from "../schemas.js";
import { ETHERSCAN_MAX_LOG_RESULTS } from "./shared.js";
import type { ExplorerDeps } from "./shared.js";
import { requireEtherscan } from "./shared.js";

type EventLogsInput = z.infer<typeof explorerGetEventLogsSchema>;
type EventLogsByTopicsInput = z.infer<typeof explorerGetEventLogsByTopicsSchema>;

export function getEventToolDefinitions(deps: ExplorerDeps): ToolDefinition[] {
  const { etherscan } = deps;

  return [
    {
      name: "explorer_get_event_logs",
      category: "explorer",
      description:
        "Get event logs emitted by a specific contract address, optionally filtered by topics and block range.",
      inputSchema: zodToJsonSchema(explorerGetEventLogsSchema) as Record<string, unknown>,
      handler: createToolHandler(
        explorerGetEventLogsSchema,
        async (input: EventLogsInput) => {
          const eth = requireEtherscan(etherscan);
          const params: Record<string, string> = {
            address: input.address,
          };
          if (input.startBlock != null) params.fromBlock = String(input.startBlock);
          if (input.endBlock != null) params.toBlock = String(input.endBlock);
          if (input.topic0) params.topic0 = input.topic0;
          if (input.topic1) {
            params.topic1 = input.topic1;
            params.topic0_1_opr = "and";
          }
          if (input.topic2) {
            params.topic2 = input.topic2;
            params.topic0_2_opr = "and";
            if (input.topic1) params.topic1_2_opr = "and";
          }
          if (input.topic3) {
            params.topic3 = input.topic3;
            params.topic0_3_opr = "and";
            if (input.topic2) params.topic2_3_opr = "and";
          }
          const raw = await eth.call<EtherscanEventLog[]>(input.chainId, "logs", "getLogs", params);
          return {
            logs: raw.map(normalizeEtherscanEventLog),
            hasMore: raw.length === ETHERSCAN_MAX_LOG_RESULTS,
          };
        },
        "EXPLORER_EVENT_LOGS_ERROR"
      ),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    {
      name: "explorer_get_event_logs_by_topics",
      category: "explorer",
      description:
        "Get event logs across all contracts filtered by topics and block range (no address required).",
      inputSchema: zodToJsonSchema(explorerGetEventLogsByTopicsSchema) as Record<string, unknown>,
      handler: createToolHandler(
        explorerGetEventLogsByTopicsSchema,
        async (input: EventLogsByTopicsInput) => {
          const eth = requireEtherscan(etherscan);
          const params: Record<string, string> = {
            topic0: input.topic0,
          };
          if (input.startBlock != null) params.fromBlock = String(input.startBlock);
          if (input.endBlock != null) params.toBlock = String(input.endBlock);
          if (input.topic1) {
            params.topic1 = input.topic1;
            params.topic0_1_opr = "and";
          }
          if (input.topic2) {
            params.topic2 = input.topic2;
            params.topic0_2_opr = "and";
            if (input.topic1) params.topic1_2_opr = "and";
          }
          if (input.topic3) {
            params.topic3 = input.topic3;
            params.topic0_3_opr = "and";
            if (input.topic2) params.topic2_3_opr = "and";
          }
          const raw = await eth.call<EtherscanEventLog[]>(input.chainId, "logs", "getLogs", params);
          return {
            logs: raw.map(normalizeEtherscanEventLog),
            hasMore: raw.length === ETHERSCAN_MAX_LOG_RESULTS,
          };
        },
        "EXPLORER_EVENT_LOGS_BY_TOPICS_ERROR"
      ),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
  ];
}
