import { decodeEventLog, getAddress } from "viem";

import { Web3AgentError } from "../api/errors.js";
import type { UniswapV4Event } from "../api/types.js";
import {
  UNISWAP_V4_POOL_MANAGER_EVENT_ABI,
  UNISWAP_V4_POSITION_MANAGER_EVENT_ABI,
} from "./abis.js";
import type { UniswapV4EventLog } from "./event-types.js";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

function eventError(message: string, cause: unknown): Web3AgentError {
  return new Web3AgentError({ cause, code: "UNISWAP_V4_EVENT_DECODE_FAILED", message });
}

function metadata(log: UniswapV4EventLog): {
  readonly blockNumber: string;
  readonly logIndex: number;
  readonly transactionHash: string;
  readonly transactionIndex: number;
} {
  if (
    log.blockNumber === null ||
    log.logIndex === null ||
    log.transactionHash === null ||
    log.transactionIndex === null
  ) {
    throw new Web3AgentError({
      code: "UNISWAP_V4_EVENT_LOG_MALFORMED",
      message: "event log is missing ordering metadata",
    });
  }
  return {
    blockNumber: log.blockNumber.toString(),
    logIndex: log.logIndex,
    transactionHash: log.transactionHash,
    transactionIndex: log.transactionIndex,
  };
}

function associated(
  log: UniswapV4EventLog,
  poolId: string,
  source: "pool-manager" | "position-manager-modify-position"
) {
  return { ...metadata(log), poolAssociation: { kind: "associated" as const, poolId, source } };
}

function unassociated(log: UniswapV4EventLog) {
  return {
    ...metadata(log),
    poolAssociation: {
      kind: "unassociated" as const,
      reason: "erc721-transfer-does-not-emit-pool-id" as const,
    },
  };
}

export function decodePoolManagerEvent(log: UniswapV4EventLog): UniswapV4Event | undefined {
  try {
    const decoded = decodeEventLog({
      abi: UNISWAP_V4_POOL_MANAGER_EVENT_ABI,
      data: log.data,
      topics: log.topics,
    });
    switch (decoded.eventName) {
      case "Initialize":
        return {
          ...associated(log, decoded.args.id, "pool-manager"),
          kind: "initialize",
          sqrtPriceX96: decoded.args.sqrtPriceX96.toString(),
          tick: decoded.args.tick,
        };
      case "ModifyLiquidity":
        return {
          ...associated(log, decoded.args.id, "pool-manager"),
          kind: "modifyLiquidity",
          liquidityDelta: decoded.args.liquidityDelta.toString(),
          sender: getAddress(decoded.args.sender),
          tickLower: decoded.args.tickLower,
          tickUpper: decoded.args.tickUpper,
        };
      case "Swap":
        return {
          ...associated(log, decoded.args.id, "pool-manager"),
          amount0: decoded.args.amount0.toString(),
          amount1: decoded.args.amount1.toString(),
          fee: decoded.args.fee,
          kind: "swap",
          liquidity: decoded.args.liquidity.toString(),
          sender: getAddress(decoded.args.sender),
          sqrtPriceX96: decoded.args.sqrtPriceX96.toString(),
          tick: decoded.args.tick,
        };
      case "Donate":
        return {
          ...associated(log, decoded.args.id, "pool-manager"),
          amount0: decoded.args.amount0.toString(),
          amount1: decoded.args.amount1.toString(),
          kind: "donate",
          sender: getAddress(decoded.args.sender),
        };
    }
  } catch (error: unknown) {
    if (error instanceof Web3AgentError) throw error;
    throw eventError("PoolManager event decoding failed", error);
  }
}

export function decodePositionManagerPoolEvent(log: UniswapV4EventLog): UniswapV4Event | undefined {
  try {
    const decoded = decodeEventLog({
      abi: UNISWAP_V4_POSITION_MANAGER_EVENT_ABI,
      data: log.data,
      topics: log.topics,
    });
    if (decoded.eventName !== "ModifyPosition") return undefined;
    return {
      ...associated(log, decoded.args.id, "position-manager-modify-position"),
      kind: "positionModify",
      liquidityDelta: decoded.args.liquidityDelta.toString(),
      salt: decoded.args.salt,
      sender: getAddress(decoded.args.sender),
      tickLower: decoded.args.tickLower,
      tickUpper: decoded.args.tickUpper,
    };
  } catch (error: unknown) {
    if (error instanceof Web3AgentError) throw error;
    throw eventError("PositionManager event decoding failed", error);
  }
}

export function decodePositionManagerTransfer(log: UniswapV4EventLog): UniswapV4Event | undefined {
  try {
    const decoded = decodeEventLog({
      abi: UNISWAP_V4_POSITION_MANAGER_EVENT_ABI,
      data: log.data,
      topics: log.topics,
    });
    if (decoded.eventName !== "Transfer") return undefined;
    const from = getAddress(decoded.args.from);
    const to = getAddress(decoded.args.to);
    const tokenId = decoded.args.id.toString();
    if (from.toLowerCase() === ZERO_ADDRESS)
      return {
        ...unassociated(log),
        action: "mint",
        kind: "positionLifecycle",
        owner: to,
        tokenId,
      };
    if (to.toLowerCase() === ZERO_ADDRESS)
      return {
        ...unassociated(log),
        action: "burn",
        kind: "positionLifecycle",
        owner: from,
        tokenId,
      };
    return { ...unassociated(log), from, kind: "positionTransfer", to, tokenId };
  } catch (error: unknown) {
    if (error instanceof Web3AgentError) throw error;
    throw eventError("PositionManager transfer decoding failed", error);
  }
}
