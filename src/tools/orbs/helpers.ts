export function limitParamsToSpotParams(params: {
  fromAmount: string;
  toMinAmount: string;
  expiry?: number;
  slippageBps?: number;
  exactApproval?: boolean;
}): {
  fromAmount: string;
  outputLimit: string;
  deadline?: number;
  slippage?: number;
  exactApproval?: boolean;
} {
  const expiry = params.expiry ?? 86400;
  return {
    fromAmount: params.fromAmount,
    outputLimit: params.toMinAmount,
    deadline: Math.floor(Date.now() / 1000) + expiry,
    slippage: params.slippageBps,
    exactApproval: params.exactApproval,
  };
}
