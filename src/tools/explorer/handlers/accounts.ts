import type { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import {
  normalizeBlockscoutAddress,
  normalizeBlockscoutTokens,
  normalizeEtherscanAddress,
} from "../../../api/explorer/accounts.js";
import type { EtherscanTransaction } from "../../../api/explorer/etherscan/types.js";
import { normalizeEtherscanTransaction } from "../../../api/explorer/transactions.js";
import type { ToolDefinition } from "../../register.js";
import { createToolHandler } from "../../shared/handler-factory.js";
import {
  explorerGetAddressFundedBySchema,
  explorerGetAddressInfoSchema,
  explorerGetHistoricalBalanceSchema,
  explorerGetHistoricalTokenBalanceSchema,
  explorerGetTokensByAddressSchema,
} from "../schemas.js";
import type { ExplorerDeps } from "./shared.js";
import { requireEtherscan, withFallback } from "./shared.js";

type AddressInput = z.infer<typeof explorerGetAddressInfoSchema>;
type TokensByAddressInput = z.infer<typeof explorerGetTokensByAddressSchema>;
type HistoricalBalanceInput = z.infer<typeof explorerGetHistoricalBalanceSchema>;
type HistoricalTokenBalanceInput = z.infer<typeof explorerGetHistoricalTokenBalanceSchema>;
type FundedByInput = z.infer<typeof explorerGetAddressFundedBySchema>;

export function getAccountToolDefinitions(deps: ExplorerDeps): ToolDefinition[] {
  const { blockscout, etherscan } = deps;

  return [
    {
      name: "explorer_get_address_info",
      category: "explorer",
      description:
        "Get address overview including balances, ENS name, contract metadata, and public tags.",
      inputSchema: zodToJsonSchema(explorerGetAddressInfoSchema) as Record<string, unknown>,
      handler: createToolHandler(
        explorerGetAddressInfoSchema,
        async (input: AddressInput) => {
          return withFallback(deps, input.chainId, "accounts", async (backend) => {
            if (backend === "blockscout") {
              const raw = await blockscout.getAddress(input.chainId, input.address);
              return normalizeBlockscoutAddress(raw);
            }
            const eth = requireEtherscan(etherscan);
            const balance = await eth.call<string>(input.chainId, "account", "balance", {
              address: input.address,
              tag: "latest",
            });
            return normalizeEtherscanAddress(input.address, balance);
          });
        },
        "EXPLORER_ADDRESS_INFO_ERROR"
      ),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    {
      name: "explorer_get_tokens_by_address",
      category: "explorer",
      description: "List all ERC-20 token holdings with balances and market data for an address.",
      inputSchema: zodToJsonSchema(explorerGetTokensByAddressSchema) as Record<string, unknown>,
      handler: createToolHandler(
        explorerGetTokensByAddressSchema,
        async (input: TokensByAddressInput) => {
          return withFallback(deps, input.chainId, "tokens", async (backend) => {
            if (backend === "blockscout") {
              const raw = await blockscout.getAddressTokens(input.chainId, input.address);
              return normalizeBlockscoutTokens(input.address, raw.items);
            }
            // Etherscan doesn't have a direct "list all tokens" endpoint
            throw new Error("Token listing not available via Etherscan for this chain");
          });
        },
        "EXPLORER_TOKENS_ERROR"
      ),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    {
      name: "explorer_get_historical_balance",
      category: "explorer",
      description:
        "Get the native token balance of an address at a specific historical block number.",
      inputSchema: zodToJsonSchema(explorerGetHistoricalBalanceSchema) as Record<string, unknown>,
      handler: createToolHandler(
        explorerGetHistoricalBalanceSchema,
        async (input: HistoricalBalanceInput) => {
          const eth = requireEtherscan(etherscan);
          const balance = await eth.call<string>(input.chainId, "account", "balance", {
            address: input.address,
            tag: `0x${input.blockNumber.toString(16)}`,
          });
          return {
            address: input.address,
            balance,
            blockNumber: input.blockNumber,
            chainId: input.chainId,
          };
        },
        "EXPLORER_HISTORICAL_BALANCE_ERROR"
      ),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    {
      name: "explorer_get_historical_token_balance",
      category: "explorer",
      description:
        "Get the ERC-20 token balance of an address at a specific historical block number.",
      inputSchema: zodToJsonSchema(explorerGetHistoricalTokenBalanceSchema) as Record<
        string,
        unknown
      >,
      handler: createToolHandler(
        explorerGetHistoricalTokenBalanceSchema,
        async (input: HistoricalTokenBalanceInput) => {
          const eth = requireEtherscan(etherscan);
          const balance = await eth.call<string>(input.chainId, "account", "tokenbalance", {
            address: input.address,
            contractaddress: input.contractAddress,
            tag: `0x${input.blockNumber.toString(16)}`,
          });
          return {
            address: input.address,
            balance,
            blockNumber: input.blockNumber,
            chainId: input.chainId,
          };
        },
        "EXPLORER_HISTORICAL_TOKEN_BALANCE_ERROR"
      ),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    {
      name: "explorer_get_address_funded_by",
      category: "explorer",
      description:
        "Find the first incoming transaction to an address, revealing who initially funded it.",
      inputSchema: zodToJsonSchema(explorerGetAddressFundedBySchema) as Record<string, unknown>,
      handler: createToolHandler(
        explorerGetAddressFundedBySchema,
        async (input: FundedByInput) => {
          const eth = requireEtherscan(etherscan);
          const txs = await eth.call<EtherscanTransaction[]>(input.chainId, "account", "txlist", {
            address: input.address,
            sort: "asc",
            page: "1",
            offset: "1",
          });
          if (txs.length === 0) {
            return {
              transactions: [],
              hasMore: false,
            };
          }
          return {
            transactions: txs.map(normalizeEtherscanTransaction),
            hasMore: false,
          };
        },
        "EXPLORER_FUNDED_BY_ERROR"
      ),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
  ];
}
