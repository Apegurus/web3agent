import type { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import {
  normalizeBlockscoutAddress,
  normalizeBlockscoutTokens,
  normalizeEtherscanAddress,
} from "../../api/explorer/accounts.js";
import { normalizeBlockscoutBlock } from "../../api/explorer/blocks.js";
import type { BlockscoutClient } from "../../api/explorer/blockscout/client.js";
import {
  normalizeBlockscoutContractAbi,
  normalizeBlockscoutContractSource,
  normalizeEtherscanContractAbi,
  normalizeEtherscanContractSource,
} from "../../api/explorer/contracts.js";
import type { EtherscanClient } from "../../api/explorer/etherscan/client.js";
import type {
  EtherscanContractSource,
  EtherscanInternalTx,
  EtherscanNftTransfer,
  EtherscanTokenTransfer,
  EtherscanTransaction,
  EtherscanTxStatus,
} from "../../api/explorer/etherscan/types.js";
import type { BackendId, ExplorerCapability, ExplorerRouter } from "../../api/explorer/router.js";
import {
  normalizeBlockscoutNfts,
  normalizeBlockscoutTokenTransfers,
  normalizeEtherscanNftTransfers,
  normalizeEtherscanTokenTransfers,
} from "../../api/explorer/tokens.js";
import {
  normalizeBlockscoutTransaction,
  normalizeBlockscoutTxDetails,
  normalizeBlockscoutTxReceipt,
  normalizeEtherscanInternalTxs,
  normalizeEtherscanTransaction,
} from "../../api/explorer/transactions.js";
import type { ToolDefinition } from "../register.js";
import { createToolHandler } from "../shared/handler-factory.js";
import {
  explorerGetAddressFundedBySchema,
  explorerGetAddressInfoSchema,
  explorerGetBlockSchema,
  explorerGetContractAbiSchema,
  explorerGetContractSourceSchema,
  explorerGetHistoricalBalanceSchema,
  explorerGetHistoricalTokenBalanceSchema,
  explorerGetInternalTxsSchema,
  explorerGetNftInventorySchema,
  explorerGetNftTransfersSchema,
  explorerGetTokenTransfersSchema,
  explorerGetTokensByAddressSchema,
  explorerGetTxDetailsSchema,
  explorerGetTxExecutionStatusSchema,
  explorerGetTxHistorySchema,
  explorerGetTxReceiptSchema,
} from "./schemas.js";

// Derive input types from schemas for handler type annotations
type AddressInput = z.infer<typeof explorerGetAddressInfoSchema>;
type TokensByAddressInput = z.infer<typeof explorerGetTokensByAddressSchema>;
type TxHistoryInput = z.infer<typeof explorerGetTxHistorySchema>;
type TxHashInput = z.infer<typeof explorerGetTxDetailsSchema>;
type TokenTransfersInput = z.infer<typeof explorerGetTokenTransfersSchema>;
type NftInventoryInput = z.infer<typeof explorerGetNftInventorySchema>;
type ContractInput = z.infer<typeof explorerGetContractAbiSchema>;
type BlockInput = z.infer<typeof explorerGetBlockSchema>;
type HistoricalBalanceInput = z.infer<typeof explorerGetHistoricalBalanceSchema>;
type HistoricalTokenBalanceInput = z.infer<typeof explorerGetHistoricalTokenBalanceSchema>;
type FundedByInput = z.infer<typeof explorerGetAddressFundedBySchema>;
type InternalTxsInput = z.infer<typeof explorerGetInternalTxsSchema>;
type TxExecutionStatusInput = z.infer<typeof explorerGetTxExecutionStatusSchema>;
type NftTransfersInput = z.infer<typeof explorerGetNftTransfersSchema>;

export interface ExplorerDeps {
  router: ExplorerRouter;
  blockscout: BlockscoutClient;
  etherscan: EtherscanClient | undefined;
}

// Helper: try primary backend, fall back on failure
async function withFallback<T>(
  deps: ExplorerDeps,
  chainId: number,
  capability: ExplorerCapability,
  primaryFn: (backend: BackendId) => Promise<T>
): Promise<T> {
  const primary = deps.router.resolve(chainId, capability);
  try {
    return await primaryFn(primary);
  } catch (e: unknown) {
    const fallback = deps.router.getFallback(chainId, capability);
    if (!fallback) throw e;
    process.stderr.write(
      `[explorer] ${primary} failed for ${capability} on chain ${chainId}, falling back to ${fallback}: ${e}\n`
    );
    return primaryFn(fallback);
  }
}

export function getExplorerToolDefinitions(deps: ExplorerDeps): ToolDefinition[] {
  const { blockscout, etherscan } = deps;

  // Dispatch helper: call the right backend based on BackendId
  function requireEtherscan(): NonNullable<typeof etherscan> {
    if (!etherscan) throw new Error("Etherscan not configured");
    return etherscan;
  }

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
            const eth = requireEtherscan();
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
      name: "explorer_get_tx_history",
      category: "explorer",
      description:
        "Get transaction history for an address, optionally filtered by block range and method.",
      inputSchema: zodToJsonSchema(explorerGetTxHistorySchema) as Record<string, unknown>,
      handler: createToolHandler(
        explorerGetTxHistorySchema,
        async (input: TxHistoryInput) => {
          return withFallback(deps, input.chainId, "transactions", async (backend) => {
            if (backend === "blockscout") {
              const raw = await blockscout.getAddressTransactions(input.chainId, input.address, {
                page: input.page,
              });
              return {
                transactions: raw.items.map(normalizeBlockscoutTransaction),
                hasMore: raw.next_page_params !== null,
              };
            }
            const eth = requireEtherscan();
            const params: Record<string, string> = {
              address: input.address,
              sort: "desc",
            };
            if (input.startBlock) params.startblock = String(input.startBlock);
            if (input.endBlock) params.endblock = String(input.endBlock);
            if (input.page) params.page = String(input.page);
            if (input.pageSize) params.offset = String(input.pageSize);
            const raw = await eth.call<EtherscanTransaction[]>(
              input.chainId,
              "account",
              "txlist",
              params
            );
            return {
              transactions: raw.map(normalizeEtherscanTransaction),
              hasMore: raw.length === (input.pageSize ?? 10000),
            };
          });
        },
        "EXPLORER_TX_HISTORY_ERROR"
      ),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    {
      name: "explorer_get_tx_details",
      category: "explorer",
      description:
        "Get full transaction details including decoded input parameters and token movements.",
      inputSchema: zodToJsonSchema(explorerGetTxDetailsSchema) as Record<string, unknown>,
      handler: createToolHandler(
        explorerGetTxDetailsSchema,
        async (input: TxHashInput) => {
          return withFallback(deps, input.chainId, "transactions", async (backend) => {
            if (backend === "blockscout") {
              const raw = await blockscout.getTransaction(input.chainId, input.txHash);
              return normalizeBlockscoutTxDetails(raw);
            }
            // Etherscan: fetch tx + receipt + block in parallel for complete data
            const eth = requireEtherscan();
            const [txRaw, receiptRaw] = await Promise.all([
              eth.call<Record<string, string>>(input.chainId, "proxy", "eth_getTransactionByHash", {
                txhash: input.txHash,
              }),
              eth.call<Record<string, string>>(
                input.chainId,
                "proxy",
                "eth_getTransactionReceipt",
                { txhash: input.txHash }
              ),
            ]);
            // Get block timestamp from the block the tx is in
            let timestamp = "";
            if (txRaw.blockNumber) {
              try {
                const block = await eth.call<Record<string, string>>(
                  input.chainId,
                  "proxy",
                  "eth_getBlockByNumber",
                  { tag: txRaw.blockNumber, boolean: "false" }
                );
                if (block.timestamp) {
                  timestamp = new Date(Number.parseInt(block.timestamp, 16) * 1000).toISOString();
                }
              } catch (e: unknown) {
                // Non-fatal — timestamp stays empty
                process.stderr.write(`[explorer] Failed to fetch block timestamp: ${e}\n`);
              }
            }
            const gasUsed = receiptRaw.gasUsed ? BigInt(receiptRaw.gasUsed) : undefined;
            const gasPrice = txRaw.gasPrice ? BigInt(txRaw.gasPrice) : undefined;
            const fee = gasUsed && gasPrice ? (gasUsed * gasPrice).toString() : undefined;
            return {
              hash: input.txHash,
              blockNumber: Number.parseInt(txRaw.blockNumber, 16),
              timestamp,
              from: txRaw.from ?? "",
              to: txRaw.to,
              value: BigInt(txRaw.value ?? "0x0").toString(),
              gasUsed: gasUsed?.toString(),
              gasPrice: gasPrice?.toString(),
              fee,
              status:
                receiptRaw.status === "0x1"
                  ? ("success" as const)
                  : receiptRaw.status === "0x0"
                    ? ("failed" as const)
                    : ("pending" as const),
            };
          });
        },
        "EXPLORER_TX_DETAILS_ERROR"
      ),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    {
      name: "explorer_get_tx_receipt",
      category: "explorer",
      description: "Get transaction receipt with execution status and gas usage.",
      inputSchema: zodToJsonSchema(explorerGetTxReceiptSchema) as Record<string, unknown>,
      handler: createToolHandler(
        explorerGetTxReceiptSchema,
        async (input: TxHashInput) => {
          return withFallback(deps, input.chainId, "transactions", async (backend) => {
            if (backend === "blockscout") {
              const raw = await blockscout.getTransaction(input.chainId, input.txHash);
              return normalizeBlockscoutTxReceipt(raw);
            }
            const eth = requireEtherscan();
            const raw = await eth.call<Record<string, string>>(
              input.chainId,
              "proxy",
              "eth_getTransactionReceipt",
              {
                txhash: input.txHash,
              }
            );
            return {
              hash: input.txHash,
              status: raw.status === "0x1" ? ("success" as const) : ("failed" as const),
              blockNumber: Number.parseInt(raw.blockNumber, 16),
              gasUsed: BigInt(raw.gasUsed ?? "0x0").toString(),
              effectiveGasPrice: raw.effectiveGasPrice
                ? BigInt(raw.effectiveGasPrice).toString()
                : undefined,
              cumulativeGasUsed: raw.cumulativeGasUsed
                ? BigInt(raw.cumulativeGasUsed).toString()
                : undefined,
              contractAddress: raw.contractAddress || undefined,
              logsCount: raw.logs ? (raw.logs as unknown as unknown[]).length : undefined,
            };
          });
        },
        "EXPLORER_TX_RECEIPT_ERROR"
      ),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
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
            const eth = requireEtherscan();
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
      name: "explorer_get_nft_inventory",
      category: "explorer",
      description: "List NFT collections and token IDs owned by an address.",
      inputSchema: zodToJsonSchema(explorerGetNftInventorySchema) as Record<string, unknown>,
      handler: createToolHandler(
        explorerGetNftInventorySchema,
        async (input: NftInventoryInput) => {
          return withFallback(deps, input.chainId, "tokens", async (backend) => {
            if (backend === "blockscout") {
              const raw = await blockscout.getAddressNfts(input.chainId, input.address);
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
      name: "explorer_get_contract_abi",
      category: "explorer",
      description:
        "Fetch the ABI for a verified smart contract. Works only for source-verified contracts.",
      inputSchema: zodToJsonSchema(explorerGetContractAbiSchema) as Record<string, unknown>,
      handler: createToolHandler(
        explorerGetContractAbiSchema,
        async (input: ContractInput) => {
          return withFallback(deps, input.chainId, "contracts", async (backend) => {
            if (backend === "blockscout") {
              const raw = await blockscout.getSmartContract(input.chainId, input.contractAddress);
              return normalizeBlockscoutContractAbi(input.contractAddress, raw);
            }
            const eth = requireEtherscan();
            const abi = await eth.call<string>(input.chainId, "contract", "getabi", {
              address: input.contractAddress,
            });
            return normalizeEtherscanContractAbi(input.contractAddress, abi);
          });
        },
        "EXPLORER_CONTRACT_ABI_ERROR"
      ),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    {
      name: "explorer_get_contract_source",
      category: "explorer",
      description: "Get verified source code for a smart contract.",
      inputSchema: zodToJsonSchema(explorerGetContractSourceSchema) as Record<string, unknown>,
      handler: createToolHandler(
        explorerGetContractSourceSchema,
        async (input: ContractInput) => {
          return withFallback(deps, input.chainId, "contract_source", async (backend) => {
            if (backend === "blockscout") {
              const raw = await blockscout.getSmartContract(input.chainId, input.contractAddress);
              return normalizeBlockscoutContractSource(input.contractAddress, raw);
            }
            const eth = requireEtherscan();
            const raw = await eth.call<EtherscanContractSource[]>(
              input.chainId,
              "contract",
              "getsourcecode",
              { address: input.contractAddress }
            );
            return normalizeEtherscanContractSource(input.contractAddress, raw[0]);
          });
        },
        "EXPLORER_CONTRACT_SOURCE_ERROR"
      ),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
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
            const eth = requireEtherscan();
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
    // --- Phase 2: Historical Balance + Funded-By ---
    {
      name: "explorer_get_historical_balance",
      category: "explorer",
      description:
        "Get the native token balance of an address at a specific historical block number.",
      inputSchema: zodToJsonSchema(explorerGetHistoricalBalanceSchema) as Record<string, unknown>,
      handler: createToolHandler(
        explorerGetHistoricalBalanceSchema,
        async (input: HistoricalBalanceInput) => {
          const eth = requireEtherscan();
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
          const eth = requireEtherscan();
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
          const eth = requireEtherscan();
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
    // --- Phase 2: Internal Transactions + Execution Status ---
    {
      name: "explorer_get_internal_txs",
      category: "explorer",
      description:
        "Get internal (trace) transactions for an address, including contract-to-contract calls.",
      inputSchema: zodToJsonSchema(explorerGetInternalTxsSchema) as Record<string, unknown>,
      handler: createToolHandler(
        explorerGetInternalTxsSchema,
        async (input: InternalTxsInput) => {
          const eth = requireEtherscan();
          const params: Record<string, string> = {
            address: input.address,
            sort: "desc",
          };
          if (input.startBlock) params.startblock = String(input.startBlock);
          if (input.endBlock) params.endblock = String(input.endBlock);
          if (input.page) params.page = String(input.page);
          if (input.pageSize) params.offset = String(input.pageSize);
          const raw = await eth.call<EtherscanInternalTx[]>(
            input.chainId,
            "account",
            "txlistinternal",
            params
          );
          return normalizeEtherscanInternalTxs(raw, input.pageSize);
        },
        "EXPLORER_INTERNAL_TXS_ERROR"
      ),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    {
      name: "explorer_get_tx_execution_status",
      category: "explorer",
      description:
        "Check the execution status of a transaction (whether it errored during execution).",
      inputSchema: zodToJsonSchema(explorerGetTxExecutionStatusSchema) as Record<string, unknown>,
      handler: createToolHandler(
        explorerGetTxExecutionStatusSchema,
        async (input: TxExecutionStatusInput) => {
          const eth = requireEtherscan();
          const raw = await eth.call<EtherscanTxStatus>(input.chainId, "transaction", "getstatus", {
            txhash: input.txHash,
          });
          return {
            isError: raw.isError === "1",
            errDescription: raw.errDescription || undefined,
          };
        },
        "EXPLORER_TX_EXECUTION_STATUS_ERROR"
      ),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    // --- Phase 2: NFT Transfers ---
    {
      name: "explorer_get_nft_transfers",
      category: "explorer",
      description:
        "Get NFT transfer history (ERC-721 and ERC-1155) for an address, merged and sorted by time.",
      inputSchema: zodToJsonSchema(explorerGetNftTransfersSchema) as Record<string, unknown>,
      handler: createToolHandler(
        explorerGetNftTransfersSchema,
        async (input: NftTransfersInput) => {
          const eth = requireEtherscan();
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
  ];
}
