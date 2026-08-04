import { Web3AgentError } from "./errors.js";

export function percentageToBasisPoints(slippagePct: number): number {
  if (!Number.isFinite(slippagePct) || slippagePct < 0 || slippagePct > 100) {
    throw new Web3AgentError({
      code: "INVALID_PARAMS",
      message: "Slippage percentage must be between 0 and 100",
    });
  }
  return Math.floor(slippagePct * 100);
}
