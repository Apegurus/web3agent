import type { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import {
  normalizeBlockscoutBlock,
  normalizeEtherscanBlockRewards,
} from "../../../api/explorer/blocks.js";
import type { EtherscanBlock } from "../../../api/explorer/etherscan/types.js";
import type { ToolDefinition } from "../../register.js";
import { createToolHandler } from "../../shared/handler-factory.js";
import {
  explorerGetBlockByTimestampSchema,
  explorerGetBlockRewardsSchema,
  explorerGetBlockSchema,
  explorerGetBlocksByValidatorSchema,
} from "../schemas.js";
import { ETHERSCAN_DEFAULT_PAGE_SIZE } from "./shared.js";
import type { ExplorerDeps } from "./shared.js";
import { requireEtherscan, withFallback } from "./shared.js";

type BlockInput = z.infer<typeof explorerGetBlockSchema>;
type BlockByTimestampInput = z.infer<typeof explorerGetBlockByTimestampSchema>;
type BlockRewardsInput = z.infer<typeof explorerGetBlockRewardsSchema>;
type BlocksByValidatorInput = z.infer<typeof explorerGetBlocksByValidatorSchema>;

export function getBlockToolDefinitions(deps: ExplorerDeps): ToolDefinition[] {
  const { blockscout, etherscan } = deps;

  return [
    {
      name: "explorer_get_block",
      category: "explorer",
      description:
        "Get block information including gas consumption, rewards, and optionally full transaction list.",
      inputSchema: zodToJsonSchema(explorerGetBlockSchema) as Record<string, unknown>,
      handler: createToolHandler(
        explorerGetBlockSchema,
        async (input: BlockInput) => {
          return withFallback(deps, input.chainId, "blocks", async (backend) => {
            if (backend === "blockscout") {
              const raw = await blockscout.getBlock(input.chainId, input.blockNumber);
              return normalizeBlockscoutBlock(raw);
            }
            // Etherscan: use proxy eth_getBlockByNumber for full block data
            const eth = requireEtherscan(etherscan);
            const raw = await eth.call<Record<string, unknown>>(
              input.chainId,
              "proxy",
              "eth_getBlockByNumber",
              {
                tag: `0x${input.blockNumber.toString(16)}`,
                boolean: input.includeTxs ? "true" : "false",
              }
            );
            const txs = raw.transactions as unknown[] | undefined;
            return {
              number: input.blockNumber,
              hash: (raw.hash as string) ?? "",
              timestamp: raw.timestamp
                ? new Date(Number.parseInt(raw.timestamp as string, 16) * 1000).toISOString()
                : "",
              parentHash: (raw.parentHash as string) ?? "",
              miner: (raw.miner as string) ?? "",
              gasUsed: raw.gasUsed ? BigInt(raw.gasUsed as string).toString() : "0",
              gasLimit: raw.gasLimit ? BigInt(raw.gasLimit as string).toString() : "0",
              txCount: txs ? txs.length : 0,
            };
          });
        },
        "EXPLORER_BLOCK_ERROR"
      ),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    {
      name: "explorer_get_block_by_timestamp",
      category: "explorer",
      description: "Find the block number closest to a given Unix timestamp (before or after).",
      inputSchema: zodToJsonSchema(explorerGetBlockByTimestampSchema) as Record<string, unknown>,
      handler: createToolHandler(
        explorerGetBlockByTimestampSchema,
        async (input: BlockByTimestampInput) => {
          const eth = requireEtherscan(etherscan);
          const blockNo = await eth.call<string>(input.chainId, "block", "getblocknobytime", {
            timestamp: String(input.timestamp),
            closest: input.closest,
          });
          return {
            blockNumber: Number(blockNo),
          };
        },
        "EXPLORER_BLOCK_BY_TIMESTAMP_ERROR"
      ),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    {
      name: "explorer_get_block_rewards",
      category: "explorer",
      description:
        "Get block reward details including miner reward, uncle inclusion reward, and uncle blocks.",
      inputSchema: zodToJsonSchema(explorerGetBlockRewardsSchema) as Record<string, unknown>,
      handler: createToolHandler(
        explorerGetBlockRewardsSchema,
        async (input: BlockRewardsInput) => {
          const eth = requireEtherscan(etherscan);
          const raw = await eth.call<EtherscanBlock>(input.chainId, "block", "getblockreward", {
            blockno: String(input.blockNumber),
          });
          return normalizeEtherscanBlockRewards(raw);
        },
        "EXPLORER_BLOCK_REWARDS_ERROR"
      ),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    {
      name: "explorer_get_blocks_by_validator",
      category: "explorer",
      description: "Get blocks mined/validated by a specific address.",
      inputSchema: zodToJsonSchema(explorerGetBlocksByValidatorSchema) as Record<string, unknown>,
      handler: createToolHandler(
        explorerGetBlocksByValidatorSchema,
        async (input: BlocksByValidatorInput) => {
          const eth = requireEtherscan(etherscan);
          const params: Record<string, string> = {
            address: input.address,
            blocktype: "blocks",
          };
          if (input.page) params.page = String(input.page);
          if (input.pageSize) params.offset = String(input.pageSize);
          const raw = await eth.call<
            Array<{ blockNumber: string; timeStamp: string; blockReward: string }>
          >(input.chainId, "account", "getminedblocks", params);
          return {
            blocks: raw.map((b) => ({
              number: Number(b.blockNumber),
              hash: "",
              timestamp: new Date(Number(b.timeStamp) * 1000).toISOString(),
              parentHash: "",
              miner: input.address,
              gasUsed: "0",
              gasLimit: "0",
              txCount: 0,
              reward: b.blockReward,
            })),
            hasMore: raw.length === (input.pageSize ?? ETHERSCAN_DEFAULT_PAGE_SIZE),
          };
        },
        "EXPLORER_BLOCKS_BY_VALIDATOR_ERROR"
      ),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
  ];
}
