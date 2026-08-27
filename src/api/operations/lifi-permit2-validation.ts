import { type Hex, createClient, parseAbi, publicActions, recoverTypedDataAddress } from "viem";
import { parseAccount } from "viem/accounts";
import { getChainForRuntime, getTransportForRuntimeChain } from "../../operations/chain-access.js";
import { Web3AgentError } from "../errors.js";

const LIFI_PERMIT2_WITNESS_TYPES = {
  TokenPermissions: [
    { name: "token", type: "address" },
    { name: "amount", type: "uint256" },
  ],
  LiFiCall: [
    { name: "diamondAddress", type: "address" },
    { name: "diamondCalldataHash", type: "bytes32" },
  ],
  PermitWitnessTransferFrom: [
    { name: "permitted", type: "TokenPermissions" },
    { name: "spender", type: "address" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
    { name: "witness", type: "LiFiCall" },
  ],
} as const;

const LIFI_PERMIT2_STATE_ABI = parseAbi([
  "function nextNonce(address) external view returns (uint256)",
  "function allowance(address owner, address spender) external view returns (uint256)",
]);

export type LifiPermit2Finalization = {
  readonly kind: "permit2";
  readonly signatureActionId: string;
  readonly tokenAddress: Hex;
  readonly amount: string;
  readonly nonce: string;
  readonly deadline: string;
  readonly permit2: Hex;
  readonly permit2Proxy: Hex;
  readonly account: Hex;
  readonly witness: true;
  readonly diamondAddress: Hex;
  readonly diamondCalldataHash: Hex;
};

export async function assertLifiPermit2Signature(params: {
  readonly finalization: LifiPermit2Finalization;
  readonly chainId: number;
  readonly signature: Hex;
}): Promise<void> {
  const { finalization } = params;
  let signer: Hex;

  try {
    signer = await recoverTypedDataAddress({
      domain: {
        name: "Permit2",
        chainId: params.chainId,
        verifyingContract: finalization.permit2,
      },
      types: LIFI_PERMIT2_WITNESS_TYPES,
      primaryType: "PermitWitnessTransferFrom",
      message: {
        permitted: {
          token: finalization.tokenAddress,
          amount: BigInt(finalization.amount),
        },
        spender: finalization.permit2Proxy,
        nonce: BigInt(finalization.nonce),
        deadline: BigInt(finalization.deadline),
        witness: {
          diamondAddress: finalization.diamondAddress,
          diamondCalldataHash: finalization.diamondCalldataHash,
        },
      },
      signature: params.signature,
    });
  } catch (error: unknown) {
    throw new Web3AgentError({
      code: "INVALID_PARAMS",
      message: "LI.FI Permit2 signature is invalid",
      cause: error,
    });
  }

  if (signer.toLowerCase() !== finalization.account.toLowerCase()) {
    throw new Web3AgentError({
      code: "INVALID_PARAMS",
      message: "LI.FI Permit2 signature does not match the bridge account",
    });
  }
}

export async function assertLifiPermit2State(params: {
  readonly finalization: LifiPermit2Finalization;
  readonly chainId: number;
}): Promise<void> {
  const client = createClient({
    account: parseAccount(params.finalization.account),
    chain: getChainForRuntime(params.chainId),
    transport: getTransportForRuntimeChain(params.chainId),
  }).extend(publicActions);
  const [nonce, allowance] = await Promise.all([
    client.readContract({
      address: params.finalization.permit2Proxy,
      abi: LIFI_PERMIT2_STATE_ABI,
      functionName: "nextNonce",
      args: [params.finalization.account],
    }),
    client.readContract({
      address: params.finalization.tokenAddress,
      abi: LIFI_PERMIT2_STATE_ABI,
      functionName: "allowance",
      args: [params.finalization.account, params.finalization.permit2],
    }),
  ]);

  if (nonce !== BigInt(params.finalization.nonce)) {
    throw new Web3AgentError({
      code: "INVALID_PARAMS",
      message: "LI.FI Permit2 authorization nonce is no longer valid",
    });
  }

  if (allowance < BigInt(params.finalization.amount)) {
    throw new Web3AgentError({
      code: "INVALID_PARAMS",
      message: "LI.FI Permit2 allowance is insufficient",
    });
  }
}
