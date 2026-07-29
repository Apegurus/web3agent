import type { AbiEvent, Address, Hex } from "viem";

import type { UniswapV4EventPage as ApiUniswapV4EventPage, UniswapV4Event } from "../api/types.js";
import type { UniswapV4Deployment } from "./deployment-provenance.js";

export type UniswapV4EventLog = {
  readonly address: Address;
  readonly blockNumber: bigint | null;
  readonly data: Hex;
  readonly logIndex: number | null;
  readonly topics: [Hex, ...Hex[]];
  readonly transactionHash: Hex | null;
  readonly transactionIndex: number | null;
};

export type UniswapV4EventTransport = {
  readonly getChainId: () => Promise<number>;
  readonly getLogs: (request: {
    readonly address: Address;
    readonly events: readonly AbiEvent[];
    readonly fromBlock: bigint;
    readonly toBlock: bigint;
  }) => Promise<readonly UniswapV4EventLog[]>;
};

export type UniswapV4EventPage = ApiUniswapV4EventPage;

export type UniswapV4EventPageOptions = {
  readonly deployment?: Pick<UniswapV4Deployment, "chainId" | "poolManager" | "positionManager">;
  readonly transport?: UniswapV4EventTransport;
};

export type DecodedEvent = UniswapV4Event;
