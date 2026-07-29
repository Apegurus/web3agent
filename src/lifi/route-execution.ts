import { convertQuoteToRoute, executeRoute, getQuote } from "@lifi/sdk";
import { getWalletState } from "../wallet/persistence.js";
import { ensureLifiInitialized } from "./config.js";

export type LifiRoute = ReturnType<typeof convertQuoteToRoute>;

export type LifiRouteRequest = {
  readonly fromChainId: number;
  readonly toChainId: number;
  readonly fromToken: string;
  readonly toToken: string;
  readonly fromAmount: string;
};

export async function prepareLifiRoute(params: LifiRouteRequest): Promise<LifiRoute> {
  ensureLifiInitialized();
  const walletState = getWalletState();
  const quote = await getQuote({
    fromChain: params.fromChainId,
    toChain: params.toChainId,
    fromToken: params.fromToken,
    toToken: params.toToken,
    fromAmount: params.fromAmount,
    fromAddress: walletState.address ?? "0x0000000000000000000000000000000000000000",
  });
  return convertQuoteToRoute(quote);
}

export async function executePreparedLifiRoute(
  route: LifiRoute
): Promise<{ readonly status: "completed"; readonly message: string }> {
  await executeRoute(route, {
    updateRouteHook: (updatedRoute) => {
      const step = updatedRoute.steps?.[0];
      if (step?.execution) {
        process.stderr.write(
          `[web3agent] LI.FI route progress: ${JSON.stringify(step.execution.process)}\n`
        );
      }
    },
  });
  return { status: "completed", message: "LI.FI route executed successfully" };
}

export async function executeLifiRoute(
  params: LifiRouteRequest
): Promise<{ readonly status: "completed"; readonly message: string }> {
  return executePreparedLifiRoute(await prepareLifiRoute(params));
}
