import type { ExplorerEventLog } from "../types.js";
import type { EtherscanEventLog } from "./etherscan/types.js";

export function normalizeEtherscanEventLog(raw: EtherscanEventLog): ExplorerEventLog {
  return {
    address: raw.address,
    topics: raw.topics,
    data: raw.data,
    blockNumber: Number.parseInt(raw.blockNumber, 16),
    timestamp: new Date(Number.parseInt(raw.timeStamp, 10) * 1000).toISOString(),
    txHash: raw.transactionHash,
    logIndex: Number.parseInt(raw.logIndex, 16),
  };
}
