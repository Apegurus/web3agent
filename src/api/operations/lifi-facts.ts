import type { LiFiStep } from "@lifi/sdk";
import { type Hex, createClient, parseAbi, publicActions } from "viem";
import { parseAccount } from "viem/accounts";
import { getChainForRuntime, getTransportForRuntimeChain } from "../../operations/chain-access.js";
import type { PreparedTransactionAction, TypedDataPayload } from "../types.js";

export const LIFI_PERMIT2_PROXY_ABI = parseAbi([
  "function callDiamondWithPermit2(bytes, ((address, uint256), uint256, uint256), bytes) external",
  "function nextNonce(address) external view returns (uint256)",
  "function callDiamondWithPermit2Witness(bytes, address, ((address, uint256), uint256, uint256), bytes) external payable",
]);

export const LIFI_PERMIT2_WITNESS_TYPES = {
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
} satisfies TypedDataPayload["types"];

export type LifiBridgeFinalization =
  | { kind: "none" }
  | {
      kind: "permit2";
      signatureActionId: string;
      tokenAddress: Hex;
      amount: string;
      nonce: string;
      deadline: string;
      permit2Proxy: Hex;
      permit2: Hex;
      account: Hex;
      witness: true;
      diamondAddress: Hex;
      diamondCalldataHash: Hex;
    };

export interface ExtendedChain {
  id: number;
  diamondAddress?: string;
  permit2?: string;
  permit2Proxy?: string;
}

export interface LifiTransactionRequest {
  to?: string;
  data?: string;
  value?: string;
  gasLimit?: string;
  chainId?: number;
}

export interface LifiBridgePreparationContext {
  quote: LiFiStep;
  summary: string;
  account: Hex;
  fromTokenAddress: Hex;
  fromAmount: bigint;
  finalAction: PreparedTransactionAction;
  fromChain?: ExtendedChain;
}

export function getPermit2Domain(permit2: Hex, chainId: number): TypedDataPayload["domain"] {
  return {
    name: "Permit2",
    chainId,
    verifyingContract: permit2,
  };
}

export type LifiReadClient = {
  readonly readContract: (parameters: {
    readonly address: Hex;
    readonly abi: typeof LIFI_PERMIT2_PROXY_ABI;
    readonly functionName: "nextNonce";
    readonly args: readonly [Hex];
  }) => Promise<bigint>;
};

export function buildLifiReadClient(account: Hex, chainId: number): LifiReadClient {
  return createClient({
    account: parseAccount(account),
    chain: getChainForRuntime(chainId),
    transport: getTransportForRuntimeChain(chainId),
  }).extend(publicActions);
}
