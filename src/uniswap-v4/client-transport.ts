import type { Address, PublicClient } from "viem";

import { Web3AgentError } from "../api/errors.js";
import {
  malformedMulticall,
  parseMulticallResult,
  readFailure,
} from "./client-transport-results.js";
import type { UniswapV4ReadExecutor, UniswapV4ReadTransport } from "./client-transport-types.js";

export type * from "./client-transport-types.js";

function toTransport(client: PublicClient): UniswapV4ReadTransport {
  return {
    getBlock: async (request) => {
      const block = await client.getBlock(request);
      if (block.hash === null || block.number === null) {
        throw new Web3AgentError({
          code: "UNISWAP_V4_BLOCK_UNAVAILABLE",
          message: "RPC returned an incomplete block",
        });
      }
      return { hash: block.hash, number: block.number };
    },
    getBlockNumber: () => client.getBlockNumber(),
    getChainId: () => client.getChainId(),
    multicall: (request) => client.multicall(request),
    readContract: (request) => client.readContract(request),
  };
}

export function createUniswapV4ReadExecutor(input: {
  readonly chainId: number;
  readonly client?: PublicClient;
  readonly deploymentAddress: Address;
  readonly transport?: UniswapV4ReadTransport;
}): UniswapV4ReadExecutor {
  const transport =
    input.transport ??
    (() => {
      if (!input.client) {
        throw new Web3AgentError({
          code: "UNISWAP_V4_READ_CLIENT_MISSING",
          message: "A viem public client is required when no test transport is injected",
        });
      }
      return toTransport(input.client);
    })();
  let chainVerified: Promise<void> | undefined;
  const ensureChain = (): Promise<void> => {
    chainVerified ??= transport.getChainId().then((observedChainId) => {
      if (observedChainId !== input.chainId) {
        throw new Web3AgentError({
          code: "UNISWAP_V4_CHAIN_MISMATCH",
          details: { expectedChainId: input.chainId, observedChainId },
          message: `RPC returned chain ${observedChainId}; expected ${input.chainId}`,
        });
      }
    });
    return chainVerified;
  };
  return {
    readBlock: async (blockNumber) => {
      await ensureChain();
      return transport.getBlock({ blockNumber });
    },
    multicall: async (calls, blockNumber) => {
      await ensureChain();
      let response: unknown;
      try {
        response = await transport.multicall({
          allowFailure: true,
          blockNumber,
          contracts: calls.map((call) => ({ ...call, blockNumber })),
        });
      } catch (error: unknown) {
        if (error instanceof Error) {
          throw readFailure(
            {
              abi: [],
              address: input.deploymentAddress,
              args: [],
              contract: "multicall",
              functionName: "multicall",
            },
            blockNumber,
            error
          );
        }
        throw readFailure(
          {
            abi: [],
            address: input.deploymentAddress,
            args: [],
            contract: "multicall",
            functionName: "multicall",
          },
          blockNumber,
          error
        );
      }
      if (!Array.isArray(response)) {
        throw malformedMulticall({
          blockNumber,
          chainId: input.chainId,
          reason: "response must be an array",
        });
      }
      if (response.length !== calls.length) {
        throw new Web3AgentError({
          code: "UNISWAP_V4_MULTICALL_CARDINALITY_MISMATCH",
          details: {
            actualCount: response.length,
            blockNumber,
            chainId: input.chainId,
            expectedCount: calls.length,
          },
          message: `Uniswap v4 multicall returned ${response.length} result(s) for ${calls.length} call(s)`,
        });
      }
      const failures: Array<Record<string, unknown>> = [];
      const successes: unknown[] = [];
      for (const [index, value] of response.entries()) {
        const call = calls[index];
        if (!call) {
          throw malformedMulticall({
            blockNumber,
            chainId: input.chainId,
            index,
            reason: "response index has no matching call",
          });
        }
        const result = parseMulticallResult({
          blockNumber,
          call,
          chainId: input.chainId,
          index,
          value,
        });
        if (result.status === "failure") {
          failures.push({ ...call, error: result.error.message, index });
        } else {
          successes.push(result.result);
        }
      }
      if (failures.length > 0) {
        throw new Web3AgentError({
          code: "UNISWAP_V4_MULTICALL_FAILED",
          details: { blockNumber, calls: failures, chainId: input.chainId },
          message: `Uniswap v4 multicall failed for ${failures.length} read(s) at block ${blockNumber}`,
        });
      }
      return successes;
    },
    read: async (call, blockNumber) => {
      await ensureChain();
      try {
        return await transport.readContract({ ...call, blockNumber });
      } catch (error: unknown) {
        if (error instanceof Error) {
          throw readFailure(call, blockNumber, error);
        }
        throw readFailure(call, blockNumber, error);
      }
    },
    resolveBlock: async (blockNumber) => {
      const resolved = blockNumber ?? (await transport.getBlockNumber());
      if (resolved < 0n) {
        throw new Web3AgentError({
          code: "UNISWAP_V4_BLOCK_INVALID",
          message: "Block number must be non-negative",
        });
      }
      return resolved;
    },
  };
}
