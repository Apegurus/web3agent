import type { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import type {
  EtherscanNftTransfer,
  EtherscanTokenHolder,
  EtherscanTokenInfo,
  EtherscanTokenTransfer,
} from "../../../api/explorer/etherscan/types.js";
import {
  normalizeBlockscoutNfts,
  normalizeBlockscoutTokenTransfers,
  normalizeEtherscanNftTransfers,
  normalizeEtherscanTokenHolders,
  normalizeEtherscanTokenInfo,
  normalizeEtherscanTokenTransfers,
} from "../../../api/explorer/tokens.js";
import type { ToolDefinition } from "../../register.js";
import { createToolHandler } from "../../shared/handler-factory.js";
import {
  explorerGetNftInventorySchema,
  explorerGetNftTransfersSchema,
  explorerGetTokenHoldersSchema,
  explorerGetTokenInfoSchema,
  explorerGetTokenSupplySchema,
  explorerGetTokenTransfersSchema,
  explorerGetTopTokenHoldersSchema,
} from "../schemas.js";
import type { ExplorerDeps } from "./shared.js";
import { requireEtherscan, withFallback } from "./shared.js";

type TokenTransfersInput = z.infer<typeof explorerGetTokenTransfersSchema>;
type NftInventoryInput = z.infer<typeof explorerGetNftInventorySchema>;
type NftTransfersInput = z.infer<typeof explorerGetNftTransfersSchema>;
type TokenInfoInput = z.infer<typeof explorerGetTokenInfoSchema>;
type TokenSupplyInput = z.infer<typeof explorerGetTokenSupplySchema>;
type TokenHoldersInput = z.infer<typeof explorerGetTokenHoldersSchema>;
type TopTokenHoldersInput = z.infer<typeof explorerGetTopTokenHoldersSchema>;

export function getTokenToolDefinitions(deps: ExplorerDeps): ToolDefinition[] {
  const { blockscout, etherscan } = deps;

  return [
    {
      name: "explorer_get_token_transfers",
      category: "explorer",
      description:
        "Get ERC-20 token transfer history for an address, optionally filtered by token contract.",
      inputSchema: zodToJsonSchema(explorerGetTokenTransfersSchema) as Record<string, unknown>,
      handler: createToolHandler(
        explorerGetTokenTransfersSchema,
        async (input: TokenTransfersInput) => {
          return withFallback(deps, input.chainId, "tokens", async (backend) => {
            if (backend === "blockscout") {
              const raw = await blockscout.getAddressTokenTransfers(input.chainId, input.address, {
                token: input.tokenContract,
                page: input.page,
              });
              return normalizeBlockscoutTokenTransfers(raw);
            }
            const eth = requireEtherscan(etherscan);
            const params: Record<string, string> = {
              address: input.address,
              sort: "desc",
            };
            if (input.tokenContract) params.contractaddress = input.tokenContract;
            if (input.startBlock) params.startblock = String(input.startBlock);
            if (input.endBlock) params.endblock = String(input.endBlock);
            if (input.page) params.page = String(input.page);
            if (input.pageSize) params.offset = String(input.pageSize);
            const raw = await eth.call<EtherscanTokenTransfer[]>(
              input.chainId,
              "account",
              "tokentx",
              params
            );
            return normalizeEtherscanTokenTransfers(raw);
          });
        },
        "EXPLORER_TOKEN_TRANSFERS_ERROR"
      ),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    {
      name: "explorer_get_nft_transfers",
      category: "explorer",
      description:
        "Get NFT transfer history (ERC-721 and ERC-1155) for an address, merged and sorted by time.",
      inputSchema: zodToJsonSchema(explorerGetNftTransfersSchema) as Record<string, unknown>,
      handler: createToolHandler(
        explorerGetNftTransfersSchema,
        async (input: NftTransfersInput) => {
          const eth = requireEtherscan(etherscan);
          const params: Record<string, string> = {
            address: input.address,
            sort: "desc",
          };
          if (input.tokenContract) params.contractaddress = input.tokenContract;
          if (input.startBlock) params.startblock = String(input.startBlock);
          if (input.endBlock) params.endblock = String(input.endBlock);
          if (input.page) params.page = String(input.page);
          if (input.pageSize) params.offset = String(input.pageSize);
          const [erc721, erc1155] = await Promise.all([
            eth.call<EtherscanNftTransfer[]>(input.chainId, "account", "tokennfttx", params),
            eth.call<EtherscanNftTransfer[]>(input.chainId, "account", "token1155tx", params),
          ]);
          return normalizeEtherscanNftTransfers(erc721, erc1155);
        },
        "EXPLORER_NFT_TRANSFERS_ERROR"
      ),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    {
      name: "explorer_get_nft_inventory",
      category: "explorer",
      description: "List NFT collections and token IDs owned by an address.",
      inputSchema: zodToJsonSchema(explorerGetNftInventorySchema) as Record<string, unknown>,
      handler: createToolHandler(
        explorerGetNftInventorySchema,
        async (input: NftInventoryInput) => {
          return withFallback(deps, input.chainId, "tokens", async (backend) => {
            if (backend === "blockscout") {
              const raw = await blockscout.getAddressNfts(input.chainId, input.address, {
                page: input.page,
                pageSize: input.pageSize,
              });
              return normalizeBlockscoutNfts(input.address, raw);
            }
            throw new Error(
              "NFT inventory not available via Etherscan -- use Blockscout-supported chains"
            );
          });
        },
        "EXPLORER_NFT_INVENTORY_ERROR"
      ),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    {
      name: "explorer_get_token_info",
      category: "explorer",
      description:
        "Get token metadata including name, symbol, decimals, total supply, and social profiles.",
      inputSchema: zodToJsonSchema(explorerGetTokenInfoSchema) as Record<string, unknown>,
      handler: createToolHandler(
        explorerGetTokenInfoSchema,
        async (input: TokenInfoInput) => {
          const eth = requireEtherscan(etherscan);
          const raw = await eth.call<EtherscanTokenInfo>(input.chainId, "token", "tokeninfo", {
            contractaddress: input.contractAddress,
          });
          return normalizeEtherscanTokenInfo(raw);
        },
        "EXPLORER_TOKEN_INFO_ERROR"
      ),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    {
      name: "explorer_get_token_supply",
      category: "explorer",
      description:
        "Get the total supply of a token, optionally at a specific historical block number.",
      inputSchema: zodToJsonSchema(explorerGetTokenSupplySchema) as Record<string, unknown>,
      handler: createToolHandler(
        explorerGetTokenSupplySchema,
        async (input: TokenSupplyInput) => {
          const eth = requireEtherscan(etherscan);
          if (input.blockNumber != null) {
            const supply = await eth.call<string>(input.chainId, "token", "tokensupplyhistory", {
              contractaddress: input.contractAddress,
              blockno: String(input.blockNumber),
            });
            return {
              contractAddress: input.contractAddress,
              totalSupply: supply,
            };
          }
          const supply = await eth.call<string>(input.chainId, "token", "tokensupply", {
            contractaddress: input.contractAddress,
          });
          return {
            contractAddress: input.contractAddress,
            totalSupply: supply,
          };
        },
        "EXPLORER_TOKEN_SUPPLY_ERROR"
      ),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    {
      name: "explorer_get_token_holders",
      category: "explorer",
      description: "Get a paginated list of token holders for a given token contract.",
      inputSchema: zodToJsonSchema(explorerGetTokenHoldersSchema) as Record<string, unknown>,
      handler: createToolHandler(
        explorerGetTokenHoldersSchema,
        async (input: TokenHoldersInput) => {
          const eth = requireEtherscan(etherscan);
          const params: Record<string, string> = {
            contractaddress: input.contractAddress,
          };
          if (input.page) params.page = String(input.page);
          if (input.pageSize) params.offset = String(input.pageSize);
          const raw = await eth.call<EtherscanTokenHolder[]>(
            input.chainId,
            "token",
            "tokenholderlist",
            params
          );
          return normalizeEtherscanTokenHolders(raw, input.pageSize);
        },
        "EXPLORER_TOKEN_HOLDERS_ERROR"
      ),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    {
      name: "explorer_get_top_token_holders",
      category: "explorer",
      description: "Get the top N token holders by balance for a given token contract.",
      inputSchema: zodToJsonSchema(explorerGetTopTokenHoldersSchema) as Record<string, unknown>,
      handler: createToolHandler(
        explorerGetTopTokenHoldersSchema,
        async (input: TopTokenHoldersInput) => {
          const eth = requireEtherscan(etherscan);
          const count = input.count ?? 10;
          const raw = await eth.call<EtherscanTokenHolder[]>(
            input.chainId,
            "token",
            "toptokenholders",
            {
              contractaddress: input.contractAddress,
              page: "1",
              offset: String(count),
            }
          );
          return normalizeEtherscanTokenHolders(raw);
        },
        "EXPLORER_TOP_TOKEN_HOLDERS_ERROR"
      ),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
  ];
}
