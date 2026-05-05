export interface TwapToSpotParamsInput {
  fromAmount: string;
  chunks: number;
  fillDelay: number;
  slippageBps?: number;
  exactApproval?: boolean;
}

export interface TwapToSpotParamsResult {
  fromAmount: string;
  fromMaxAmount: string;
  epoch: number;
  slippage?: number;
  exactApproval?: boolean;
}

export function twapParamsToSpotParams(params: TwapToSpotParamsInput): TwapToSpotParamsResult {
  const totalAmount = BigInt(params.fromAmount);
  const chunkCount = BigInt(params.chunks);
  if (totalAmount < chunkCount) {
    throw new Error("fromAmount must be at least the chunk count for TWAP conversion");
  }
  if (totalAmount % chunkCount !== 0n) {
    throw new Error("fromAmount must be evenly divisible by chunks for TWAP conversion");
  }

  const perChunkAmount = totalAmount / chunkCount;
  return {
    fromAmount: perChunkAmount.toString(),
    fromMaxAmount: params.fromAmount,
    epoch: params.fillDelay,
    slippage: params.slippageBps,
    exactApproval: params.exactApproval,
  };
}
