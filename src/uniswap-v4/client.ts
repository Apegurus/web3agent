import type { Address, Hex } from "viem";

import { Web3AgentError } from "../api/errors.js";
import { getRequiredChain } from "../chains/registry.js";
import { getPublicClientCached } from "../evm/services.js";
import { createUniswapV4Readers } from "./client-reads.js";
import { type UniswapV4ReadTransport, createUniswapV4ReadExecutor } from "./client-transport.js";
import type { UniswapV4Deployment } from "./deployment-provenance.js";
import { getUniswapV4Deployment } from "./deployments.js";

export type {
  UniswapV4MulticallRequest,
  UniswapV4MulticallResult,
  UniswapV4ReadContractRequest,
  UniswapV4ReadTransport,
} from "./client-transport.js";

type BlockRequest = { readonly blockNumber?: bigint };

export type TokenReference = { readonly address: Address; readonly chainId: number };

export type UniswapV4ReadClientOptions = {
  readonly chainId: number;
  readonly client?: UniswapV4ReadTransport;
  readonly deployment?: UniswapV4Deployment;
};

export type UniswapV4StateViewPool = {
  readonly blockNumber: bigint;
  readonly feeGrowthGlobal0X128: bigint;
  readonly feeGrowthGlobal1X128: bigint;
  readonly liquidity: bigint;
  readonly lpFee: number;
  readonly protocolFee: number;
  readonly sqrtPriceX96: bigint;
  readonly tick: number;
};

export type UniswapV4TokenMetadata = {
  readonly blockNumber: bigint;
  readonly decimals: number;
  readonly name: string;
  readonly symbol: string;
};

export type UniswapV4PositionManagerPosition = {
  readonly blockNumber: bigint;
  readonly liquidity: bigint;
  readonly operator: Address;
  readonly owner: Address;
  readonly poolKey: {
    readonly currency0: Address;
    readonly currency1: Address;
    readonly fee: number;
    readonly hooks: Address;
    readonly tickSpacing: number;
  };
  readonly positionInfo: bigint;
};

export type UniswapV4ReadSnapshot = {
  readonly blockNumber: bigint;
  readonly chainId: number;
  readonly deployment: UniswapV4Deployment;
  readonly permit2: {
    readonly amount: bigint;
    readonly expiration: bigint;
    readonly nonce: bigint;
  };
  readonly poolManager: { readonly protocolFeeController: Address };
  readonly positionManager: UniswapV4PositionManagerPosition;
  readonly stateView: UniswapV4StateViewPool;
  readonly token: UniswapV4TokenMetadata;
};

export type UniswapV4ReadClient = {
  readonly readBlock: (request: { readonly blockNumber: bigint }) => Promise<{
    readonly hash: Hex;
    readonly number: bigint;
  }>;
  readonly readPermit2Allowance: (request: {
    readonly blockNumber?: bigint;
    readonly owner: Address;
    readonly spender: Address;
    readonly token: Address;
  }) => Promise<{
    readonly amount: bigint;
    readonly blockNumber: bigint;
    readonly expiration: bigint;
    readonly nonce: bigint;
  }>;
  readonly readPoolManagerProtocolFeeController: (
    request?: BlockRequest
  ) => Promise<{ readonly blockNumber: bigint; readonly protocolFeeController: Address }>;
  readonly readPositionManagerApprovalForAll: (request: {
    readonly blockNumber?: bigint;
    readonly operator: Address;
    readonly owner: Address;
  }) => Promise<{ readonly approved: boolean; readonly blockNumber: bigint }>;
  readonly readPositionManagerPosition: (request: {
    readonly blockNumber?: bigint;
    readonly tokenId: bigint;
  }) => Promise<UniswapV4PositionManagerPosition>;
  readonly readPositionManagerNonce: (request: {
    readonly blockNumber?: bigint;
    readonly tokenId: bigint;
  }) => Promise<{ readonly blockNumber: bigint; readonly nonce: bigint }>;
  readonly readSnapshot: (request: {
    readonly blockNumber?: bigint;
    readonly owner: Address;
    readonly poolId: Hex;
    readonly spender: Address;
    readonly token: TokenReference;
    readonly tokenId: bigint;
  }) => Promise<UniswapV4ReadSnapshot>;
  readonly readStateViewPool: (request: {
    readonly blockNumber?: bigint;
    readonly poolId: Hex;
  }) => Promise<UniswapV4StateViewPool>;
  readonly readStateViewFeeGrowthInside: (request: {
    readonly blockNumber?: bigint;
    readonly poolId: Hex;
    readonly tickLower: number;
    readonly tickUpper: number;
  }) => Promise<{
    readonly blockNumber: bigint;
    readonly feeGrowthInside0X128: bigint;
    readonly feeGrowthInside1X128: bigint;
  }>;
  readonly readStateViewPositionInfo: (request: {
    readonly blockNumber?: bigint;
    readonly poolId: Hex;
    readonly tickLower: number;
    readonly tickUpper: number;
    readonly tokenId: bigint;
  }) => Promise<{
    readonly blockNumber: bigint;
    readonly feeGrowthInside0LastX128: bigint;
    readonly feeGrowthInside1LastX128: bigint;
    readonly liquidity: bigint;
  }>;
  readonly readTokenMetadata: (request: {
    readonly blockNumber?: bigint;
    readonly token: TokenReference;
  }) => Promise<UniswapV4TokenMetadata>;
};

export function createUniswapV4ReadClient(
  options: UniswapV4ReadClientOptions
): UniswapV4ReadClient {
  getRequiredChain(options.chainId);
  const deployment = options.deployment ?? getUniswapV4Deployment(options.chainId);
  if (deployment.chainId !== options.chainId) {
    throw new Web3AgentError({
      code: "UNISWAP_V4_DEPLOYMENT_CHAIN_MISMATCH",
      details: { deploymentChainId: deployment.chainId, expectedChainId: options.chainId },
      message: "Injected Uniswap v4 deployment belongs to another chain",
    });
  }
  const executor = createUniswapV4ReadExecutor({
    chainId: options.chainId,
    client: options.client ? undefined : getPublicClientCached(options.chainId),
    deploymentAddress: deployment.stateView,
    transport: options.client,
  });
  const readers = createUniswapV4Readers({ chainId: options.chainId, deployment, executor });
  return {
    ...readers,
    readBlock: (request) => executor.readBlock(request.blockNumber),
    readSnapshot: async (request) => {
      const blockNumber = await executor.resolveBlock(request.blockNumber);
      return {
        blockNumber,
        chainId: options.chainId,
        deployment,
        permit2: await readers.readPermit2Allowance({
          ...request,
          blockNumber,
          token: request.token.address,
        }),
        poolManager: await readers.readPoolManagerProtocolFeeController({ blockNumber }),
        positionManager: await readers.readPositionManagerPosition({
          blockNumber,
          tokenId: request.tokenId,
        }),
        stateView: await readers.readStateViewPool({ blockNumber, poolId: request.poolId }),
        token: await readers.readTokenMetadata({ blockNumber, token: request.token }),
      };
    },
  };
}
