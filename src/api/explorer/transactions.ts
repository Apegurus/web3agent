import type {
  ExplorerTransaction,
  ExplorerTxDetails,
  ExplorerTxReceipt,
} from "../types.js";
import type { BlockscoutTransaction } from "./blockscout/types.js";
import type { EtherscanTransaction } from "./etherscan/types.js";

function blockscoutStatus(raw: BlockscoutTransaction): "success" | "failed" | "pending" {
  if (raw.status === "ok") return "success";
  if (raw.status === "error") return "failed";
  return "pending";
}

export function normalizeBlockscoutTransaction(
  raw: BlockscoutTransaction,
): ExplorerTransaction {
  const result: ExplorerTransaction = {
    hash: raw.hash,
    blockNumber: raw.block,
    timestamp: raw.timestamp,
    from: raw.from.hash,
    value: raw.value,
    status: blockscoutStatus(raw),
  };

  if (raw.to != null) {
    result.to = raw.to.hash;
  }

  if (raw.gas_used != null) {
    result.gasUsed = raw.gas_used;
  }

  if (raw.gas_price != null) {
    result.gasPrice = raw.gas_price;
  }

  if (raw.fee != null) {
    result.fee = raw.fee.value;
  }

  if (raw.method != null) {
    result.method = raw.method;
  }

  result.nonce = raw.nonce;

  return result;
}

export function normalizeBlockscoutTxDetails(
  raw: BlockscoutTransaction,
): ExplorerTxDetails {
  const base = normalizeBlockscoutTransaction(raw);

  const details: ExplorerTxDetails = {
    ...base,
  };

  if (raw.raw_input != null) {
    details.input = raw.raw_input;
  }

  if (raw.decoded_input != null) {
    details.decodedInput = raw.decoded_input as Record<string, unknown>;
  }

  if (raw.token_transfers != null && raw.token_transfers.length > 0) {
    details.tokenTransfers = raw.token_transfers.map((t) => ({
      token: t.token.address,
      symbol: t.token.symbol ?? undefined,
      from: t.from.hash,
      to: t.to.hash,
      value: t.total.value,
      type: t.token.type,
    }));
  }

  return details;
}

export function normalizeBlockscoutTxReceipt(
  raw: BlockscoutTransaction,
): ExplorerTxReceipt {
  const status = blockscoutStatus(raw);

  const receipt: ExplorerTxReceipt = {
    hash: raw.hash,
    status: status === "pending" ? "failed" : status,
    blockNumber: raw.block,
    gasUsed: raw.gas_used,
  };

  if (raw.gas_price != null) {
    receipt.effectiveGasPrice = raw.gas_price;
  }

  if (raw.result != null && raw.status === "error") {
    receipt.revertReason = raw.result;
  }

  return receipt;
}

export function normalizeEtherscanTransaction(
  raw: EtherscanTransaction,
): ExplorerTransaction {
  const status: "success" | "failed" = raw.isError === "1" ? "failed" : "success";

  const result: ExplorerTransaction = {
    hash: raw.hash,
    blockNumber: Number(raw.blockNumber),
    timestamp: new Date(Number(raw.timeStamp) * 1000).toISOString(),
    from: raw.from,
    value: raw.value,
    status,
  };

  if (raw.to) {
    result.to = raw.to;
  }

  if (raw.gasUsed) {
    result.gasUsed = raw.gasUsed;
  }

  if (raw.gasPrice) {
    result.gasPrice = raw.gasPrice;
  }

  if (raw.functionName) {
    result.method = raw.functionName;
  }

  result.nonce = Number(raw.nonce);

  return result;
}
