import type { ExplorerBlockInfo } from "../types.js";
import type { BlockscoutBlock } from "./blockscout/types.js";

export function normalizeBlockscoutBlock(raw: BlockscoutBlock): ExplorerBlockInfo {
  const result: ExplorerBlockInfo = {
    number: raw.height,
    hash: raw.hash,
    timestamp: raw.timestamp,
    parentHash: raw.parent_hash,
    miner: raw.miner.hash,
    gasUsed: raw.gas_used,
    gasLimit: raw.gas_limit,
    txCount: raw.tx_count,
  };

  if (raw.base_fee_per_gas != null) {
    result.baseFeePerGas = raw.base_fee_per_gas;
  }

  if (raw.rewards != null && raw.rewards.length > 0) {
    const total = raw.rewards.reduce((sum, r) => {
      return sum + BigInt(r.value);
    }, BigInt(0));
    result.reward = total.toString();
  }

  return result;
}
