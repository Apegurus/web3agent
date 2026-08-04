import { describe, expect, it } from "vitest";

import {
  ERC20_METADATA_ABI,
  PERMIT2_ALLOWANCE_ABI,
  UNISWAP_V4_POOL_MANAGER_ABI,
  UNISWAP_V4_POSITION_MANAGER_ABI,
  UNISWAP_V4_STATE_VIEW_ABI,
} from "../../src/uniswap-v4/abis.js";
import { createUniswapV4ReadClient } from "../../src/uniswap-v4/client.js";
import {
  BLOCK_NUMBER,
  CHAIN_ID,
  OPERATOR,
  OWNER,
  POOL_ID,
  SPENDER,
  TOKEN,
  ZERO_ADDRESS,
  createClientFixtureTransport,
} from "./client-fixtures.js";

describe("Uniswap v4 viem read client", () => {
  it("uses one explicit block for every typed deployment read and returns a coherent snapshot", async () => {
    // Given: a viem-shaped fixture transport at one historical block.
    const fixture = createClientFixtureTransport();
    const client = createUniswapV4ReadClient({ chainId: CHAIN_ID, client: fixture.transport });

    // When: all protocol and token reads share an explicitly pinned block.
    const snapshot = await client.readSnapshot({
      blockNumber: BLOCK_NUMBER,
      owner: OWNER,
      poolId: POOL_ID,
      spender: SPENDER,
      token: { address: TOKEN, chainId: CHAIN_ID },
      tokenId: 7n,
    });

    // Then: the typed snapshot has no latest-block mixing or zero-value substitution.
    expect(snapshot).toMatchObject({
      blockNumber: BLOCK_NUMBER,
      chainId: CHAIN_ID,
      permit2: { amount: 1000n, expiration: 999n, nonce: 7n },
      poolManager: { protocolFeeController: ZERO_ADDRESS },
      positionManager: { liquidity: 77n, operator: OPERATOR, owner: OWNER },
      stateView: { feeGrowthGlobal0X128: 101n, feeGrowthGlobal1X128: 202n, liquidity: 900n },
      token: { decimals: 18, name: "Fixture Token", symbol: "FIX" },
    });
    expect(fixture.requests).toHaveLength(12);
    expect(fixture.requests.map((request) => request.functionName).sort()).toEqual([
      "allowance",
      "decimals",
      "getApproved",
      "getFeeGrowthGlobals",
      "getLiquidity",
      "getPoolAndPositionInfo",
      "getPositionLiquidity",
      "getSlot0",
      "name",
      "ownerOf",
      "protocolFeeController",
      "symbol",
    ]);
    for (const request of fixture.requests) {
      expect(request.blockNumber).toBe(BLOCK_NUMBER);
      if (request.functionName === "protocolFeeController") {
        expect(request).toMatchObject({
          address: "0x8366a39CC670B4001A1121B8F6A443A643e40951",
          args: [],
        });
        expect(request.abi).toBe(UNISWAP_V4_POOL_MANAGER_ABI);
      } else if (
        ["getSlot0", "getLiquidity", "getFeeGrowthGlobals"].includes(request.functionName)
      ) {
        expect(request).toMatchObject({
          address: "0xF3334192D15450CdD385c8B70e03f9A6bD9E673b",
          args: [POOL_ID],
        });
        expect(request.abi).toBe(UNISWAP_V4_STATE_VIEW_ABI);
      } else if (
        ["ownerOf", "getApproved", "getPositionLiquidity", "getPoolAndPositionInfo"].includes(
          request.functionName
        )
      ) {
        expect(request).toMatchObject({
          address: "0x58daec3116aae6D93017bAAea7749052E8a04fA7",
          args: [7n],
        });
        expect(request.abi).toBe(UNISWAP_V4_POSITION_MANAGER_ABI);
      } else if (request.functionName === "allowance") {
        expect(request).toMatchObject({
          address: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
          args: [OWNER, TOKEN, SPENDER],
        });
        expect(request.abi).toBe(PERMIT2_ALLOWANCE_ABI);
      } else {
        expect(request).toMatchObject({ address: TOKEN, args: [] });
        expect(request.abi).toBe(ERC20_METADATA_ABI);
      }
    }
  });

  it("resolves one block before a read when callers omit it", async () => {
    // Given: a fixture transport with a deterministic current block.
    const fixture = createClientFixtureTransport();
    const client = createUniswapV4ReadClient({ chainId: CHAIN_ID, client: fixture.transport });

    // When: the PoolManager read omits a block number.
    const poolManager = await client.readPoolManagerProtocolFeeController();

    // Then: the resolved block is surfaced and passed to viem exactly once.
    expect(poolManager.blockNumber).toBe(BLOCK_NUMBER);
    expect(fixture.requests).toContainEqual(
      expect.objectContaining({ blockNumber: BLOCK_NUMBER, functionName: "protocolFeeController" })
    );
  });

  it("Given a viem-decoded named PoolKey tuple, when reading a position, then it normalizes the named fields", async () => {
    const fixture = createClientFixtureTransport({ namedPoolKey: true });
    const client = createUniswapV4ReadClient({ chainId: CHAIN_ID, client: fixture.transport });

    const position = await client.readPositionManagerPosition({
      blockNumber: BLOCK_NUMBER,
      tokenId: 7n,
    });

    expect(position.poolKey).toEqual({
      currency0: TOKEN,
      currency1: OWNER,
      fee: 500,
      hooks: OPERATOR,
      tickSpacing: 60,
    });
  });

  it("Given safe numeric ABI integers, when reading Permit2 allowance facts, then it canonicalizes them to bigint", async () => {
    const fixture = createClientFixtureTransport({ numericAllowance: true });
    const client = createUniswapV4ReadClient({ chainId: CHAIN_ID, client: fixture.transport });

    const allowance = await client.readPermit2Allowance({
      blockNumber: BLOCK_NUMBER,
      owner: OWNER,
      spender: SPENDER,
      token: TOKEN,
    });

    expect(allowance).toEqual({
      amount: 1000n,
      blockNumber: BLOCK_NUMBER,
      expiration: 999n,
      nonce: 7n,
    });
  });

  it("Given an injected transport, when reading global position approval, then it stays pinned to that transport and block", async () => {
    const fixture = createClientFixtureTransport();
    const client = createUniswapV4ReadClient({ chainId: CHAIN_ID, client: fixture.transport });

    const approval = await client.readPositionManagerApprovalForAll({
      blockNumber: BLOCK_NUMBER,
      operator: SPENDER,
      owner: OWNER,
    });

    expect(approval).toEqual({ approved: true, blockNumber: BLOCK_NUMBER });
    expect(fixture.requests).toContainEqual(
      expect.objectContaining({
        args: [OWNER, SPENDER],
        blockNumber: BLOCK_NUMBER,
        functionName: "isApprovedForAll",
      })
    );
  });

  it("fails closed for an unavailable deployment or a chain-mismatched RPC", async () => {
    // Given: unsupported deployment input and a Robinhood deployment served by another chain.
    const missingDeployment = () => createUniswapV4ReadClient({ chainId: 1 });
    const fixture = createClientFixtureTransport({ chainId: 1 });
    const client = createUniswapV4ReadClient({ chainId: CHAIN_ID, client: fixture.transport });

    // When / Then: neither condition is silently accepted.
    expect(missingDeployment).toThrowError(
      expect.objectContaining({ code: "UNISWAP_V4_UNAVAILABLE" })
    );
    await expect(
      client.readPoolManagerProtocolFeeController({ blockNumber: BLOCK_NUMBER })
    ).rejects.toMatchObject({
      code: "UNISWAP_V4_CHAIN_MISMATCH",
      details: { expectedChainId: CHAIN_ID, observedChainId: 1 },
    });
  });

  it("rejects reverted calls, wrong-chain tokens, and partial multicalls with call context", async () => {
    // Given: isolated direct-revert, wrong-token-chain, and partial-multicall fixtures.
    const directRevert = createUniswapV4ReadClient({
      chainId: CHAIN_ID,
      client: createClientFixtureTransport({ revertFunction: "protocolFeeController" }).transport,
    });
    const tokenClient = createUniswapV4ReadClient({
      chainId: CHAIN_ID,
      client: createClientFixtureTransport().transport,
    });
    const partialFailure = createUniswapV4ReadClient({
      chainId: CHAIN_ID,
      client: createClientFixtureTransport({ failFunction: "getLiquidity" }).transport,
    });

    // When / Then: failures preserve action context and never become zero values.
    await expect(
      directRevert.readPoolManagerProtocolFeeController({ blockNumber: BLOCK_NUMBER })
    ).rejects.toMatchObject({
      code: "UNISWAP_V4_READ_REVERTED",
      details: expect.objectContaining({ functionName: "protocolFeeController" }),
    });
    await expect(
      tokenClient.readTokenMetadata({
        blockNumber: BLOCK_NUMBER,
        token: { address: TOKEN, chainId: 1 },
      })
    ).rejects.toMatchObject({
      code: "UNISWAP_V4_TOKEN_CHAIN_MISMATCH",
      details: { expectedChainId: CHAIN_ID, tokenChainId: 1 },
    });
    await expect(
      partialFailure.readStateViewPool({ blockNumber: BLOCK_NUMBER, poolId: POOL_ID })
    ).rejects.toMatchObject({
      code: "UNISWAP_V4_MULTICALL_FAILED",
      details: expect.objectContaining({
        blockNumber: BLOCK_NUMBER,
        calls: [expect.objectContaining({ functionName: "getLiquidity", index: 1 })],
      }),
    });
  });
});
