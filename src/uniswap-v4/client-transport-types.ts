import type { Abi, Address, Hex } from "viem";

export type UniswapV4ReadCall = {
  readonly abi: Abi;
  readonly address: Address;
  readonly args: readonly unknown[];
  readonly contract: string;
  readonly functionName: string;
};

export type UniswapV4ReadContractRequest = Omit<UniswapV4ReadCall, "contract"> & {
  readonly blockNumber: bigint;
};

export type UniswapV4MulticallRequest = {
  readonly allowFailure: true;
  readonly blockNumber: bigint;
  readonly contracts: readonly UniswapV4ReadContractRequest[];
};

export type UniswapV4MulticallResult =
  | { readonly result: unknown; readonly status: "success" }
  | { readonly error: Error; readonly status: "failure" };

export interface UniswapV4ReadTransport {
  getBlock(request: { readonly blockNumber: bigint }): Promise<{
    readonly hash: Hex;
    readonly number: bigint;
  }>;
  getBlockNumber(): Promise<bigint>;
  getChainId(): Promise<number>;
  multicall(request: UniswapV4MulticallRequest): Promise<unknown>;
  readContract(request: UniswapV4ReadContractRequest): Promise<unknown>;
}

export type UniswapV4ReadExecutor = {
  readonly readBlock: (
    blockNumber: bigint
  ) => Promise<{ readonly hash: Hex; readonly number: bigint }>;
  readonly multicall: (
    calls: readonly UniswapV4ReadCall[],
    blockNumber: bigint
  ) => Promise<readonly unknown[]>;
  readonly read: (call: UniswapV4ReadCall, blockNumber: bigint) => Promise<unknown>;
  readonly resolveBlock: (blockNumber: bigint | undefined) => Promise<bigint>;
};
