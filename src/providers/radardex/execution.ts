import type { Abi, Address, Hash } from "viem";
import { RADARDEX_ABIS } from "./manifest.js";
import { type RadarRoute, swapRequestSchema } from "./schemas.js";
import { type RadarContractCall, buildSwapCall } from "./transactions.js";

type Receipt = {
  readonly status: "success" | "reverted";
  readonly to?: Address | null;
};

export interface RadarExecutionPublicClient {
  readContract(request: {
    readonly address: Address;
    readonly abi: Abi;
    readonly functionName: string;
    readonly args: readonly unknown[];
  }): Promise<unknown>;
  simulateContract(request: RadarContractCall & { readonly account: Address }): Promise<unknown>;
  waitForTransactionReceipt(request: { readonly hash: Hash }): Promise<Receipt>;
}

export interface RadarExecutionWalletClient {
  writeContract(request: RadarContractCall & { readonly account: Address }): Promise<Hash>;
}

export type RadarExecutionDependencies = {
  readonly publicClient: RadarExecutionPublicClient;
  readonly walletClient: RadarExecutionWalletClient;
  readonly refreshQuote: () => Promise<RadarRoute | undefined>;
};

export type RadarExecutionResult = {
  readonly txHash: Hash;
  readonly minimumOutput: bigint;
  readonly route: RadarRoute;
};

export class RadarExecutionError extends Error {
  readonly name = "RadarExecutionError";

  constructor(
    readonly stage: "refresh" | "approval" | "simulation" | "receipt",
    message: string,
    options?: ErrorOptions
  ) {
    super(`RadarDEX ${stage}: ${message}`, options);
  }
}

type ReceiptExpectation = {
  readonly client: RadarExecutionPublicClient;
  readonly hash: Hash;
  readonly expectedTarget: Address;
  readonly stage: "approval" | "receipt";
};

async function requireSuccessfulReceipt(expectation: ReceiptExpectation): Promise<void> {
  const receipt = await expectation.client.waitForTransactionReceipt({ hash: expectation.hash });
  if (receipt.status !== "success") {
    throw new RadarExecutionError(expectation.stage, "transaction receipt reverted");
  }
  if (receipt.to && receipt.to.toLowerCase() !== expectation.expectedTarget.toLowerCase()) {
    throw new RadarExecutionError(expectation.stage, "transaction receipt target mismatch");
  }
}

function requiresApproval(route: RadarRoute): boolean {
  return !(route.execution.kind === "v4_native" && route.execution.direction === "native_to_token");
}

export async function executeRadarDexSwap(
  input: unknown,
  dependencies: RadarExecutionDependencies
): Promise<RadarExecutionResult> {
  const request = swapRequestSchema.parse(input);
  const route = await dependencies.refreshQuote();
  if (!route?.executable) {
    throw new RadarExecutionError("refresh", "no executable refreshed route");
  }
  if (
    route.fromToken.toLowerCase() !== request.fromToken.toLowerCase() ||
    route.toToken.toLowerCase() !== request.toToken.toLowerCase() ||
    route.grossInput !== BigInt(request.fromAmount)
  ) {
    throw new RadarExecutionError(
      "refresh",
      "refreshed route does not match the confirmed request"
    );
  }

  if (requiresApproval(route)) {
    const allowance = await dependencies.publicClient.readContract({
      address: route.fromToken,
      abi: RADARDEX_ABIS.erc20,
      functionName: "allowance",
      args: [request.account, route.spender],
    });
    if (typeof allowance !== "bigint") {
      throw new RadarExecutionError("approval", "allowance response was not a bigint");
    }
    if (allowance < route.grossInput) {
      const approvalCall: RadarContractCall & { readonly account: Address } = {
        account: request.account,
        address: route.fromToken,
        abi: RADARDEX_ABIS.erc20,
        functionName: "approve",
        args: [route.spender, route.grossInput],
      };
      const approvalHash = await dependencies.walletClient.writeContract(approvalCall);
      await requireSuccessfulReceipt({
        client: dependencies.publicClient,
        hash: approvalHash,
        expectedTarget: route.fromToken,
        stage: "approval",
      });
    }
  }

  const minimumOutput =
    route.expectedOutput - (route.expectedOutput * BigInt(request.slippageBps)) / 10_000n;
  const call = buildSwapCall(route, request.account, minimumOutput);
  if (call.address.toLowerCase() !== route.spender.toLowerCase()) {
    throw new RadarExecutionError("refresh", "route spender does not match execution target");
  }
  const writeRequest = { ...call, account: request.account };
  try {
    await dependencies.publicClient.simulateContract(writeRequest);
  } catch (error: unknown) {
    throw new RadarExecutionError("simulation", "final swap simulation failed", { cause: error });
  }
  const txHash = await dependencies.walletClient.writeContract(writeRequest);
  await requireSuccessfulReceipt({
    client: dependencies.publicClient,
    hash: txHash,
    expectedTarget: call.address,
    stage: "receipt",
  });
  return { txHash, minimumOutput, route };
}
