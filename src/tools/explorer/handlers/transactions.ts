import type { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import type {
  EtherscanInternalTx,
  EtherscanTransaction,
  EtherscanTxStatus,
} from "../../../api/explorer/etherscan/types.js";
import {
  normalizeBlockscoutTransaction,
  normalizeBlockscoutTxDetails,
  normalizeBlockscoutTxReceipt,
  normalizeEtherscanInternalTxs,
  normalizeEtherscanTransaction,
} from "../../../api/explorer/transactions.js";
import type { ToolDefinition } from "../../register.js";
import { createToolHandler } from "../../shared/handler-factory.js";
import {
  explorerGetInternalTxsSchema,
  explorerGetTxDetailsSchema,
  explorerGetTxExecutionStatusSchema,
  explorerGetTxHistorySchema,
  explorerGetTxReceiptSchema,
} from "../schemas.js";
import { ETHERSCAN_DEFAULT_PAGE_SIZE } from "./shared.js";
import type { ExplorerDeps } from "./shared.js";
import { requireEtherscan, withFallback } from "./shared.js";

type TxHistoryInput = z.infer<typeof explorerGetTxHistorySchema>;
type TxHashInput = z.infer<typeof explorerGetTxDetailsSchema>;
type InternalTxsInput = z.infer<typeof explorerGetInternalTxsSchema>;
type TxExecutionStatusInput = z.infer<typeof explorerGetTxExecutionStatusSchema>;

export function getTransactionToolDefinitions(deps: ExplorerDeps): ToolDefinition[] {
  const { blockscout, etherscan } = deps;

  return [
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
            const eth = requireEtherscan(etherscan);
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
              hasMore: raw.length === (input.pageSize ?? ETHERSCAN_DEFAULT_PAGE_SIZE),
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
            const eth = requireEtherscan(etherscan);
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
            const eth = requireEtherscan(etherscan);
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
      name: "explorer_get_internal_txs",
      category: "explorer",
      description:
        "Get internal (trace) transactions for an address, including contract-to-contract calls.",
      inputSchema: zodToJsonSchema(explorerGetInternalTxsSchema) as Record<string, unknown>,
      handler: createToolHandler(
        explorerGetInternalTxsSchema,
        async (input: InternalTxsInput) => {
          const eth = requireEtherscan(etherscan);
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
          const eth = requireEtherscan(etherscan);
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
  ];
}
