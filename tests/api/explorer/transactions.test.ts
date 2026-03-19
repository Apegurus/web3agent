import { describe, expect, it } from "vitest";
import type { BlockscoutTransaction } from "../../../src/api/explorer/blockscout/types.js";
import type {
  EtherscanInternalTx,
  EtherscanTransaction,
} from "../../../src/api/explorer/etherscan/types.js";
import {
  normalizeBlockscoutTransaction,
  normalizeBlockscoutTxDetails,
  normalizeBlockscoutTxReceipt,
  normalizeEtherscanInternalTx,
  normalizeEtherscanInternalTxs,
  normalizeEtherscanTransaction,
} from "../../../src/api/explorer/transactions.js";

const baseBsTx: BlockscoutTransaction = {
  hash: "0xhash1",
  block: 12345678,
  timestamp: "2024-01-15T10:30:00.000Z",
  from: { hash: "0xsender" },
  to: { hash: "0xrecipient" },
  value: "1000000000000000000",
  gas_used: "21000",
  gas_price: "20000000000",
  fee: { value: "420000000000000" },
  status: "ok",
  method: "transfer",
  nonce: 5,
  result: "success",
  tx_types: ["coin_transfer"],
  decoded_input: null,
  token_transfers: null,
  raw_input: "0x",
};

const baseEsTx: EtherscanTransaction = {
  blockNumber: "12345678",
  timeStamp: "1705316600",
  hash: "0xhash2",
  nonce: "10",
  from: "0xfrom",
  to: "0xto",
  value: "500000000000000000",
  gas: "21000",
  gasPrice: "15000000000",
  gasUsed: "21000",
  isError: "0",
  txreceipt_status: "1",
  input: "0x",
  methodId: "0xa9059cbb",
  functionName: "transfer(address,uint256)",
  contractAddress: "",
  cumulativeGasUsed: "21000",
  confirmations: "100",
};

describe("normalizeBlockscoutTransaction", () => {
  it("maps hash, blockNumber, timestamp", () => {
    const result = normalizeBlockscoutTransaction(baseBsTx);
    expect(result.hash).toBe("0xhash1");
    expect(result.blockNumber).toBe(12345678);
    expect(result.timestamp).toBe("2024-01-15T10:30:00.000Z");
  });

  it("maps from and to addresses", () => {
    const result = normalizeBlockscoutTransaction(baseBsTx);
    expect(result.from).toBe("0xsender");
    expect(result.to).toBe("0xrecipient");
  });

  it("omits to when null", () => {
    const raw: BlockscoutTransaction = { ...baseBsTx, to: null };
    const result = normalizeBlockscoutTransaction(raw);
    expect(result.to).toBeUndefined();
  });

  it("maps status ok -> success", () => {
    const result = normalizeBlockscoutTransaction(baseBsTx);
    expect(result.status).toBe("success");
  });

  it("maps status error -> failed", () => {
    const raw: BlockscoutTransaction = { ...baseBsTx, status: "error" };
    const result = normalizeBlockscoutTransaction(raw);
    expect(result.status).toBe("failed");
  });

  it("maps status other -> pending", () => {
    const raw: BlockscoutTransaction = { ...baseBsTx, status: "" };
    const result = normalizeBlockscoutTransaction(raw);
    expect(result.status).toBe("pending");
  });

  it("maps fee value", () => {
    const result = normalizeBlockscoutTransaction(baseBsTx);
    expect(result.fee).toBe("420000000000000");
  });

  it("maps method", () => {
    const result = normalizeBlockscoutTransaction(baseBsTx);
    expect(result.method).toBe("transfer");
  });

  it("maps nonce", () => {
    const result = normalizeBlockscoutTransaction(baseBsTx);
    expect(result.nonce).toBe(5);
  });
});

describe("normalizeBlockscoutTxDetails", () => {
  it("includes base transaction fields", () => {
    const result = normalizeBlockscoutTxDetails(baseBsTx);
    expect(result.hash).toBe("0xhash1");
    expect(result.status).toBe("success");
  });

  it("includes raw_input as input", () => {
    const result = normalizeBlockscoutTxDetails(baseBsTx);
    expect(result.input).toBe("0x");
  });

  it("includes decoded_input as decodedInput", () => {
    const raw: BlockscoutTransaction = {
      ...baseBsTx,
      decoded_input: {
        method_call: "transfer(address,uint256)",
        parameters: [{ name: "to", type: "address", value: "0xabc" }],
      },
    };
    const result = normalizeBlockscoutTxDetails(raw);
    expect(result.decodedInput).toMatchObject({ method_call: "transfer(address,uint256)" });
  });

  it("includes token_transfers", () => {
    const raw: BlockscoutTransaction = {
      ...baseBsTx,
      token_transfers: [
        {
          block_hash: "0xblockhash",
          block_number: 12345678,
          timestamp: "2024-01-15T10:30:00.000Z",
          from: { hash: "0xfrom" },
          to: { hash: "0xto" },
          token: {
            address: "0xtoken",
            symbol: "USDC",
            name: "USD Coin",
            decimals: "6",
            type: "ERC-20",
          },
          total: { value: "1000000", decimals: "6" },
          tx_hash: "0xhash1",
        },
      ],
    };
    const result = normalizeBlockscoutTxDetails(raw);
    expect(result.tokenTransfers).toHaveLength(1);
    expect(result.tokenTransfers?.[0]).toMatchObject({
      token: "0xtoken",
      symbol: "USDC",
      from: "0xfrom",
      to: "0xto",
      value: "1000000",
      type: "ERC-20",
    });
  });

  it("omits tokenTransfers when null", () => {
    const result = normalizeBlockscoutTxDetails(baseBsTx);
    expect(result.tokenTransfers).toBeUndefined();
  });
});

describe("normalizeBlockscoutTxReceipt", () => {
  it("maps hash, blockNumber, gasUsed", () => {
    const result = normalizeBlockscoutTxReceipt(baseBsTx);
    expect(result.hash).toBe("0xhash1");
    expect(result.blockNumber).toBe(12345678);
    expect(result.gasUsed).toBe("21000");
  });

  it("maps status success", () => {
    const result = normalizeBlockscoutTxReceipt(baseBsTx);
    expect(result.status).toBe("success");
  });

  it("maps status failed for error status", () => {
    const raw: BlockscoutTransaction = { ...baseBsTx, status: "error" };
    const result = normalizeBlockscoutTxReceipt(raw);
    expect(result.status).toBe("failed");
  });

  it("maps pending status to failed in receipt", () => {
    const raw: BlockscoutTransaction = { ...baseBsTx, status: "" };
    const result = normalizeBlockscoutTxReceipt(raw);
    expect(result.status).toBe("failed");
  });

  it("maps effectiveGasPrice from gas_price", () => {
    const result = normalizeBlockscoutTxReceipt(baseBsTx);
    expect(result.effectiveGasPrice).toBe("20000000000");
  });

  it("maps revertReason for failed tx", () => {
    const raw: BlockscoutTransaction = {
      ...baseBsTx,
      status: "error",
      result: "execution reverted: insufficient balance",
    };
    const result = normalizeBlockscoutTxReceipt(raw);
    expect(result.revertReason).toBe("execution reverted: insufficient balance");
  });
});

describe("normalizeEtherscanTransaction", () => {
  it("maps hash, blockNumber, from, to", () => {
    const result = normalizeEtherscanTransaction(baseEsTx);
    expect(result.hash).toBe("0xhash2");
    expect(result.blockNumber).toBe(12345678);
    expect(result.from).toBe("0xfrom");
    expect(result.to).toBe("0xto");
  });

  it("converts timeStamp to ISO string", () => {
    const result = normalizeEtherscanTransaction(baseEsTx);
    // 1705316600 seconds * 1000 = ms
    expect(result.timestamp).toBe(new Date(1705316600 * 1000).toISOString());
  });

  it("maps isError=0 to success", () => {
    const result = normalizeEtherscanTransaction(baseEsTx);
    expect(result.status).toBe("success");
  });

  it("maps isError=1 to failed", () => {
    const raw: EtherscanTransaction = { ...baseEsTx, isError: "1" };
    const result = normalizeEtherscanTransaction(raw);
    expect(result.status).toBe("failed");
  });

  it("converts nonce string to number", () => {
    const result = normalizeEtherscanTransaction(baseEsTx);
    expect(result.nonce).toBe(10);
  });

  it("maps gasUsed and gasPrice", () => {
    const result = normalizeEtherscanTransaction(baseEsTx);
    expect(result.gasUsed).toBe("21000");
    expect(result.gasPrice).toBe("15000000000");
  });

  it("maps functionName to method", () => {
    const result = normalizeEtherscanTransaction(baseEsTx);
    expect(result.method).toBe("transfer(address,uint256)");
  });

  it("omits to when empty string", () => {
    const raw: EtherscanTransaction = { ...baseEsTx, to: "" };
    const result = normalizeEtherscanTransaction(raw);
    expect(result.to).toBeUndefined();
  });
});

const baseInternalTx: EtherscanInternalTx = {
  blockNumber: "18000000",
  timeStamp: "1705316600",
  hash: "0xinternalhash",
  from: "0xcontract1",
  to: "0xcontract2",
  value: "500000000000000000",
  gas: "100000",
  gasUsed: "50000",
  isError: "0",
  type: "call",
  traceId: "0_1",
  errCode: "",
  contractAddress: "",
  input: "0x",
};

describe("normalizeEtherscanInternalTx", () => {
  it("maps hash, blockNumber, timestamp", () => {
    const result = normalizeEtherscanInternalTx(baseInternalTx);
    expect(result.hash).toBe("0xinternalhash");
    expect(result.blockNumber).toBe(18000000);
    expect(result.timestamp).toBe(new Date(1705316600 * 1000).toISOString());
  });

  it("maps from and to", () => {
    const result = normalizeEtherscanInternalTx(baseInternalTx);
    expect(result.from).toBe("0xcontract1");
    expect(result.to).toBe("0xcontract2");
  });

  it("maps value and gasUsed", () => {
    const result = normalizeEtherscanInternalTx(baseInternalTx);
    expect(result.value).toBe("500000000000000000");
    expect(result.gasUsed).toBe("50000");
  });

  it("maps type and traceId", () => {
    const result = normalizeEtherscanInternalTx(baseInternalTx);
    expect(result.type).toBe("call");
    expect(result.traceId).toBe("0_1");
  });

  it("maps isError=0 to false", () => {
    const result = normalizeEtherscanInternalTx(baseInternalTx);
    expect(result.isError).toBe(false);
  });

  it("maps isError=1 to true", () => {
    const raw: EtherscanInternalTx = { ...baseInternalTx, isError: "1", errCode: "bad jump" };
    const result = normalizeEtherscanInternalTx(raw);
    expect(result.isError).toBe(true);
    expect(result.errCode).toBe("bad jump");
  });

  it("omits errCode when empty", () => {
    const result = normalizeEtherscanInternalTx(baseInternalTx);
    expect(result.errCode).toBeUndefined();
  });
});

describe("normalizeEtherscanInternalTxs", () => {
  it("wraps array in transactions field", () => {
    const result = normalizeEtherscanInternalTxs([baseInternalTx]);
    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0].hash).toBe("0xinternalhash");
  });

  it("returns empty transactions for empty input", () => {
    const result = normalizeEtherscanInternalTxs([]);
    expect(result.transactions).toEqual([]);
  });

  it("sets hasMore based on pageSize", () => {
    const result = normalizeEtherscanInternalTxs([baseInternalTx], 1);
    expect(result.hasMore).toBe(true);
  });

  it("sets hasMore false when less than pageSize", () => {
    const result = normalizeEtherscanInternalTxs([baseInternalTx], 10);
    expect(result.hasMore).toBe(false);
  });

  it("sets hasMore undefined when pageSize not provided", () => {
    const result = normalizeEtherscanInternalTxs([baseInternalTx]);
    expect(result.hasMore).toBeUndefined();
  });
});
