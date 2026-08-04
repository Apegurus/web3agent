import { type Hex, encodeFunctionData, keccak256 } from "viem";
import { assertAddress, assertHex, parseBigIntString } from "../../operations/validation.js";
import { Web3AgentError } from "../errors.js";
import type {
  OperationActionResult,
  PreparedTransactionAction,
  TypedDataPayload,
} from "../types.js";
import {
  type ExtendedChain,
  LIFI_PERMIT2_PROXY_ABI,
  LIFI_PERMIT2_WITNESS_TYPES,
  type LifiBridgeFinalization,
  buildLifiReadClient,
  getPermit2Domain,
} from "./lifi-facts.js";
import { assertActionResultType } from "./shared.js";

export async function getPermit2TypedData(params: {
  account: Hex;
  tokenAddress: Hex;
  amount: bigint;
  chain: ExtendedChain;
  finalAction: PreparedTransactionAction;
}): Promise<{
  typedData: TypedDataPayload;
  nonce: string;
  deadline: string;
  diamondAddress: Hex;
  diamondCalldataHash: Hex;
}> {
  if (!params.chain.permit2 || !params.chain.permit2Proxy || !params.chain.diamondAddress) {
    throw new Web3AgentError({
      code: "BRIDGE_INTENT_ERROR",
      message: `Permit2 metadata is missing for chain ${params.chain.id}`,
    });
  }
  if (!params.finalAction.tx.data) {
    throw new Web3AgentError({
      code: "BRIDGE_INTENT_ERROR",
      message: "Bridge transaction is missing calldata for Permit2 witness signing",
    });
  }

  const diamondAddress = assertAddress(params.chain.diamondAddress, "fromChain.diamondAddress");
  if (params.finalAction.tx.to.toLowerCase() !== diamondAddress.toLowerCase()) {
    throw new Web3AgentError({
      code: "BRIDGE_INTENT_ERROR",
      message: "Bridge transaction target does not match LI.FI diamond address",
    });
  }

  const client = buildLifiReadClient(params.account, params.chain.id);
  const nonce = await client.readContract({
    address: assertAddress(params.chain.permit2Proxy, "fromChain.permit2Proxy"),
    abi: LIFI_PERMIT2_PROXY_ABI,
    functionName: "nextNonce",
    args: [params.account],
  });
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 30 * 60);
  const diamondCalldataHash = keccak256(params.finalAction.tx.data);

  return {
    typedData: {
      domain: getPermit2Domain(
        assertAddress(params.chain.permit2, "fromChain.permit2"),
        params.chain.id
      ),
      types: LIFI_PERMIT2_WITNESS_TYPES,
      primaryType: "PermitWitnessTransferFrom",
      message: {
        permitted: {
          token: params.tokenAddress,
          amount: params.amount.toString(),
        },
        spender: assertAddress(params.chain.permit2Proxy, "fromChain.permit2Proxy"),
        nonce: nonce.toString(),
        deadline: deadline.toString(),
        witness: {
          diamondAddress,
          diamondCalldataHash,
        },
      },
    },
    nonce: nonce.toString(),
    deadline: deadline.toString(),
    diamondAddress,
    diamondCalldataHash,
  };
}

export function rewriteFinalBridgeAction(
  finalAction: PreparedTransactionAction,
  finalization: LifiBridgeFinalization,
  actionResults: Record<string, OperationActionResult>
): PreparedTransactionAction {
  if (finalization.kind === "none") {
    return finalAction;
  }

  const signatureResult = assertActionResultType(
    actionResults,
    finalization.signatureActionId,
    "signature"
  );
  if (!signatureResult) {
    throw new Web3AgentError({
      code: "INVALID_PARAMS",
      message: `Missing signature result for ${finalization.signatureActionId}`,
    });
  }

  if (Number(finalization.deadline) <= Math.floor(Date.now() / 1000)) {
    throw new Web3AgentError({
      code: "BRIDGE_INTENT_ERROR",
      message: "Permit2 authorization expired; prepare the bridge again",
    });
  }

  if (!finalAction.tx.data) {
    throw new Web3AgentError({
      code: "BRIDGE_INTENT_ERROR",
      message: "Bridge transaction is missing calldata for permit wrapping",
    });
  }

  const signature = assertHex(signatureResult.signature, "actionResults.signature");
  const calldataHash = keccak256(finalAction.tx.data);
  if (finalAction.tx.to.toLowerCase() !== finalization.diamondAddress.toLowerCase()) {
    throw new Web3AgentError({
      code: "INVALID_PARAMS",
      message: "resumeState.state.finalAction.tx.to does not match the signed Permit2 witness",
    });
  }
  if (calldataHash !== finalization.diamondCalldataHash) {
    throw new Web3AgentError({
      code: "INVALID_PARAMS",
      message: "resumeState.state.finalAction.tx.data does not match the signed Permit2 witness",
    });
  }

  return {
    ...finalAction,
    tx: {
      ...finalAction.tx,
      to: finalization.permit2Proxy,
      data: encodeFunctionData({
        abi: LIFI_PERMIT2_PROXY_ABI,
        functionName: "callDiamondWithPermit2Witness",
        args: [
          finalAction.tx.data,
          finalization.account,
          [
            [
              finalization.tokenAddress,
              parseBigIntString(finalization.amount, "resumeState.state.finalization.amount"),
            ],
            parseBigIntString(finalization.nonce, "resumeState.state.finalization.nonce"),
            parseBigIntString(finalization.deadline, "resumeState.state.finalization.deadline"),
          ],
          signature,
        ],
      }),
    },
  };
}
