import { Web3AgentError } from "../api/errors.js";
import { toPercent, toPosition, toSdkCurrency } from "./sdk-adapter-conversion.js";
import type { SdkNftPermit, SdkPositionManagerInput } from "./sdk-adapter-inputs.js";
import { assertNativeValue, assertPoolKey } from "./sdk-adapter-inputs.js";
import type { SdkNftPermitData, SdkTransaction } from "./sdk-adapter-types.js";
import { Ether, Percent, Pool, V4PositionManager } from "./sdk-adapter.js";

export function getPositionManagerPermitData(input: {
  readonly chainId: number;
  readonly deadline: bigint;
  readonly nonce: bigint;
  readonly positionManager: string;
  readonly spender: string;
  readonly tokenId: bigint;
}): SdkNftPermitData {
  const typedData = V4PositionManager.getPermitData(
    {
      deadline: input.deadline.toString(),
      nonce: input.nonce.toString(),
      spender: input.spender,
      tokenId: input.tokenId.toString(),
    },
    input.positionManager,
    input.chainId
  );
  const permitTypes = typedData.types.Permit;
  if (permitTypes === undefined) {
    throw new Web3AgentError({
      code: "UNISWAP_V4_NFT_PERMIT_TYPES_INVALID",
      message: "Official SDK returned no NFT permit fields",
    });
  }
  return {
    domain: {
      chainId: input.chainId,
      name: "Uniswap V4 Positions NFT",
      verifyingContract: input.positionManager,
    },
    message: {
      deadline: input.deadline.toString(),
      nonce: input.nonce.toString(),
      spender: input.spender,
      tokenId: input.tokenId.toString(),
    },
    primaryType: "Permit",
    types: { Permit: permitTypes.map((field) => ({ name: field.name, type: field.type })) },
  };
}

export function buildPositionManagerCalldata(input: SdkPositionManagerInput): SdkTransaction {
  if (input.kind === "create") {
    assertPoolKey(input.poolKey);
    const transaction = V4PositionManager.createCallParameters(
      Pool.getPoolKey(
        toSdkCurrency(input.poolKey.currency0),
        toSdkCurrency(input.poolKey.currency1),
        input.poolKey.fee,
        input.poolKey.tickSpacing,
        input.poolKey.hooks
      ),
      input.sqrtPriceX96.toString()
    );
    return { calldata: transaction.calldata, value: BigInt(transaction.value) };
  }
  const position = toPosition(
    input.kind === "collect" && input.liquidity === 0n ? { ...input, liquidity: 1n } : input
  );
  const common = {
    deadline: input.deadline.toString(),
    slippageTolerance: toPercent(input.slippageBps),
  };
  const useNative =
    input.poolKey.currency0.kind === "native"
      ? Ether.onChain(input.poolKey.currency0.chainId)
      : undefined;
  const expectedNativeValue =
    useNative === undefined || (input.kind !== "mint" && input.kind !== "increase")
      ? 0n
      : BigInt(position.mintAmountsWithSlippage(toPercent(input.slippageBps)).amount0.toString());
  assertNativeValue(input, expectedNativeValue);
  const transaction = transactionFor(input, position, common, useNative);
  return { calldata: transaction.calldata, value: BigInt(transaction.value) };
}

export function buildPositionManagerCalldataWithNftPermitSignature(input: {
  readonly deadline: bigint;
  readonly nonce: bigint;
  readonly signature: string;
  readonly spender: string;
  readonly tokenId: bigint;
  readonly transaction: SdkTransaction;
}): SdkTransaction {
  const permitCalldata = V4PositionManager.encodeERC721Permit(
    input.spender,
    input.tokenId.toString(),
    input.deadline.toString(),
    input.nonce.toString(),
    input.signature
  );
  return {
    calldata: V4PositionManager.INTERFACE.encodeFunctionData("multicall", [
      [permitCalldata, input.transaction.calldata],
    ]),
    value: input.transaction.value,
  };
}

function transactionFor(
  input: Exclude<SdkPositionManagerInput, { readonly kind: "create" }>,
  position: ReturnType<typeof toPosition>,
  common: { readonly deadline: string; readonly slippageTolerance: Percent },
  useNative: Ether | undefined
): { readonly calldata: string; readonly value: string } {
  switch (input.kind) {
    case "mint":
      return V4PositionManager.addCallParameters(position, {
        ...common,
        recipient: input.recipient,
        ...(input.hookData === undefined ? {} : { hookData: input.hookData }),
        ...(useNative === undefined ? {} : { useNative }),
      });
    case "increase":
      return V4PositionManager.addCallParameters(position, {
        ...common,
        tokenId: input.tokenId.toString(),
        ...(input.hookData === undefined ? {} : { hookData: input.hookData }),
        ...(useNative === undefined ? {} : { useNative }),
      });
    case "decrease":
      return withPermit(
        V4PositionManager.removeCallParameters(position, {
          ...common,
          tokenId: input.tokenId.toString(),
          liquidityPercentage: toPercent(input.liquidityBps),
          ...(input.hookData === undefined ? {} : { hookData: input.hookData }),
        }),
        input.permit
      );
    case "collect":
      return collectTransaction(input, position, common);
    case "burn":
      if (input.liquidityBps !== 10_000) {
        throw new Web3AgentError({
          code: "UNISWAP_V4_BURN_PERCENT_INVALID",
          message: "burn requires 100% liquidity removal",
        });
      }
      return withPermit(
        V4PositionManager.removeCallParameters(position, {
          ...common,
          tokenId: input.tokenId.toString(),
          liquidityPercentage: new Percent("1"),
          burnToken: true,
          ...(input.hookData === undefined ? {} : { hookData: input.hookData }),
        }),
        input.permit
      );
  }
}

function withPermit(
  transaction: { readonly calldata: string; readonly value: string },
  permit: SdkNftPermit | undefined
): { readonly calldata: string; readonly value: string } {
  if (permit === undefined) return transaction;
  const permitCalldata = V4PositionManager.encodeERC721Permit(
    permit.spender,
    permit.tokenId,
    permit.deadline,
    permit.nonce,
    permit.signature
  );
  return {
    calldata: V4PositionManager.INTERFACE.encodeFunctionData("multicall", [
      [permitCalldata, transaction.calldata],
    ]),
    value: transaction.value,
  };
}

function collectTransaction(
  input: Extract<SdkPositionManagerInput, { readonly kind: "collect" }>,
  position: ReturnType<typeof toPosition>,
  common: { readonly deadline: string; readonly slippageTolerance: Percent }
): { readonly calldata: string; readonly value: string } {
  return withPermit(
    V4PositionManager.collectCallParameters(position, {
      ...common,
      recipient: input.recipient,
      tokenId: input.tokenId.toString(),
      ...(input.hookData === undefined ? {} : { hookData: input.hookData }),
    }),
    input.permit
  );
}
