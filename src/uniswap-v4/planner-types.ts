import type { Address, Hex } from "viem";

import type {
  UniswapV4BlockReference,
  UniswapV4BurnOperation,
  UniswapV4CollectOperation,
  UniswapV4DecreaseOperation,
  UniswapV4ExpectedDeltas,
  UniswapV4IncreaseOperation,
  UniswapV4MintOperation,
  UniswapV4PoolState,
  UniswapV4PositionState,
} from "../api/types.js";
import type { UniswapV4Deployment } from "./deployments.js";

export type UniswapV4AddOperation = UniswapV4MintOperation | UniswapV4IncreaseOperation;
export type UniswapV4RemoveOperation =
  | UniswapV4BurnOperation
  | UniswapV4CollectOperation
  | UniswapV4DecreaseOperation;

export type UniswapV4Permit2Allowance = {
  readonly amount: bigint;
  readonly expiration: bigint;
  readonly nonce: bigint;
};

export type UniswapV4TokenAllowance = {
  readonly erc20Amount: bigint;
  readonly permit2: UniswapV4Permit2Allowance;
  readonly sourceBlock: UniswapV4BlockReference;
  readonly token: Address;
};

export type UniswapV4AddPlanInput = {
  readonly account: Address;
  readonly allowanceMode?: "exact" | "unlimited";
  readonly allowances: readonly UniswapV4TokenAllowance[];
  readonly deployment: UniswapV4Deployment;
  readonly now?: bigint;
  readonly operation: UniswapV4AddOperation;
  readonly pool: UniswapV4PoolState;
  readonly position?: UniswapV4PositionState;
};

export type UniswapV4Erc20ApprovalAction = {
  readonly amount: bigint;
  readonly data: Hex;
  readonly kind: "erc20Approval";
  readonly spender: Address;
  readonly token: Address;
  readonly to: Address;
  readonly value: bigint;
};

export type UniswapV4Permit2SignatureAction = {
  readonly domain: {
    readonly chainId: number;
    readonly name: "Permit2";
    readonly verifyingContract: Address;
  };
  readonly kind: "permit2Signature";
  readonly message: {
    readonly details: readonly {
      readonly amount: bigint;
      readonly expiration: bigint;
      readonly nonce: bigint;
      readonly token: Address;
    }[];
    readonly sigDeadline: bigint;
    readonly spender: Address;
  };
  readonly primaryType: "PermitBatch";
  readonly types: {
    readonly PermitBatch: readonly { readonly name: string; readonly type: string }[];
    readonly PermitDetails: readonly { readonly name: string; readonly type: string }[];
  };
};

export type UniswapV4PoolInitializationAction = {
  readonly data: Hex;
  readonly kind: "poolInitialization";
  readonly to: Address;
  readonly value: bigint;
};

export type UniswapV4PositionManagerAction = {
  readonly data: Hex;
  readonly kind: "positionManager";
  readonly to: Address;
  readonly value: bigint;
};

export type UniswapV4AddPlanAction =
  | UniswapV4Erc20ApprovalAction
  | UniswapV4Permit2SignatureAction
  | UniswapV4PoolInitializationAction
  | UniswapV4PositionManagerAction;

export type UniswapV4AddPlan = {
  readonly actions: readonly UniswapV4AddPlanAction[];
  readonly expectedDeltas: UniswapV4ExpectedDeltas;
  readonly poolId: Hex;
  readonly sourceBlock: UniswapV4BlockReference;
};

export type UniswapV4NftPermit = {
  readonly deadline: bigint;
  readonly domain: {
    readonly chainId: number;
    readonly name: "Uniswap V4 Positions NFT";
    readonly verifyingContract: Address;
  };
  readonly nonce: bigint;
  readonly signature: Hex;
  readonly spender: Address;
  readonly tokenId: bigint;
};

export type UniswapV4NftPermitSignatureAction = {
  readonly domain: {
    readonly chainId: number;
    readonly name: "Uniswap V4 Positions NFT";
    readonly verifyingContract: Address;
  };
  readonly expectedSigner: Address;
  readonly finalActionId: string;
  readonly kind: "nftPermitSignature";
  readonly message: {
    readonly deadline: string;
    readonly nonce: string;
    readonly spender: Address;
    readonly tokenId: string;
  };
  readonly primaryType: "Permit";
  readonly sourceNft: {
    readonly nonce: bigint;
    readonly operator: Address;
    readonly owner: Address;
    readonly tokenId: bigint;
  };
  readonly types: { readonly Permit: readonly { readonly name: string; readonly type: string }[] };
  readonly unsignedFinal: UniswapV4PositionManagerAction;
};

export type UniswapV4RemovePlanInput = {
  readonly account: Address;
  readonly deployment: UniswapV4Deployment;
  readonly nftPermit?: UniswapV4NftPermit;
  readonly nftPermitWillBeAppended?: boolean;
  readonly nftPermitNonce?: bigint;
  readonly now?: bigint;
  readonly operation: UniswapV4RemoveOperation;
  readonly pool: UniswapV4PoolState;
  readonly position: UniswapV4PositionState;
};

export type UniswapV4NftPermitPlan = UniswapV4NftPermit & {
  readonly message: {
    readonly deadline: string;
    readonly nonce: string;
    readonly spender: string;
    readonly tokenId: string;
  };
  readonly primaryType: "Permit";
  readonly types: { readonly Permit: readonly { readonly name: string; readonly type: string }[] };
};

export type UniswapV4RemovePlan = {
  readonly actions: readonly UniswapV4PositionManagerAction[];
  readonly expectedDeltas: UniswapV4ExpectedDeltas;
  readonly expectedNftState: "burned" | "retained";
  readonly nftPermit?: UniswapV4NftPermitPlan;
  readonly minimums: { readonly amount0: bigint; readonly amount1: bigint };
  readonly poolId: Hex;
  readonly recipient: Address;
  readonly sourceBlock: UniswapV4BlockReference;
};
