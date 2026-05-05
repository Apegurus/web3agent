import type { ExplorerBlockInfo, ExplorerBlockRewards } from "../types.js";
import type { BlockscoutBlock } from "./blockscout/types.js";
import type { EtherscanBlock } from "./etherscan/types.js";

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

export function normalizeEtherscanBlockRewards(raw: EtherscanBlock): ExplorerBlockRewards {
  return {
    blockNumber: Number(raw.blockNumber),
    miner: raw.blockMiner,
    blockReward: raw.blockReward,
    uncleInclusionReward: raw.uncleInclusionReward,
    uncles: raw.uncles.map((u) => ({
      miner: u.miner,
      unclePosition: Number(u.unclePosition),
      blockreward: u.blockreward,
    })),
  };
}
