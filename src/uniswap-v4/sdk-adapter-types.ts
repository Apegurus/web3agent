import type { UniswapV4PoolKey } from "../api/types.js";

export type SdkPoolIdentity = { readonly poolKey: UniswapV4PoolKey; readonly poolId: string };
export type SdkAmounts = { readonly amount0: bigint; readonly amount1: bigint };
export type SdkRational = { readonly numerator: bigint; readonly denominator: bigint };
export type SdkAmountsAndLiquidity = SdkAmounts & { readonly liquidity: bigint };
export type SdkPositionAmounts = {
  readonly current: SdkAmounts;
  readonly mintMaximum: SdkAmounts;
  readonly burnMinimum: SdkAmounts;
};
export type SdkPermit2Batch = {
  readonly spender: string;
  readonly sigDeadline: bigint;
  readonly details: readonly {
    readonly token: string;
    readonly amount: bigint;
    readonly expiration: bigint;
    readonly nonce: bigint;
  }[];
};
export type SdkTransaction = { readonly calldata: string; readonly value: bigint };
export type SdkNftPermitData = {
  readonly domain: {
    readonly chainId: number;
    readonly name: string;
    readonly verifyingContract: string;
  };
  readonly message: {
    readonly deadline: string;
    readonly nonce: string;
    readonly spender: string;
    readonly tokenId: string;
  };
  readonly primaryType: "Permit";
  readonly types: { readonly Permit: readonly { readonly name: string; readonly type: string }[] };
};
