import { describe, expect, it, vi } from "vitest";

import { getUniswapV4EventPage } from "../../src/uniswap-v4/events.js";
import { createUniswapV4StateReader } from "../../src/uniswap-v4/state.js";
import { getZeroExQuote } from "../../src/zerox/client.js";
import {
  createEventTransport,
  createInitializeEvent,
  createModifyPositionEvent,
} from "./event-fixtures.js";
import {
  createRobinhoodV4FixtureTransport,
  parseRobinhoodV4Fixture,
  robinhoodV4Fixture,
} from "./fixtures/robinhood-v4.js";

const mocks = vi.hoisted(() => ({ resilientFetch: vi.fn() }));

vi.mock("../../src/utils/resilient-fetch.js", () => ({
  resilientFetch: mocks.resilientFetch,
}));

describe("Robinhood Uniswap v4 pinned integration fixture", () => {
  it("Given the independently verified deployment fixture, when pool and position reads run at its pinned block, then normalized outputs reproduce without network access", async () => {
    // Given: an in-memory fork transport that accepts only pinned block reads.
    const fixtureTransport = createRobinhoodV4FixtureTransport(robinhoodV4Fixture);
    const reader = createUniswapV4StateReader({
      deployment: robinhoodV4Fixture.deployment,
      readClient: fixtureTransport.readClient,
    });

    // When: the pool and position snapshots are resolved through production readers.
    const pool = await reader.readPoolSnapshot({
      poolKey: robinhoodV4Fixture.pool.poolKey,
      sourceBlock: robinhoodV4Fixture.sourceBlock,
    });
    const position = await reader.readPositionSnapshot({
      expectedOwner: robinhoodV4Fixture.position.owner,
      poolKey: robinhoodV4Fixture.pool.poolKey,
      sourceBlock: robinhoodV4Fixture.sourceBlock,
      tokenId: robinhoodV4Fixture.position.tokenId,
    });

    // Then: each result and every request remains bound to the immutable fixture block.
    expect(pool).toEqual(robinhoodV4Fixture.normalized.pool);
    expect(position).toEqual(robinhoodV4Fixture.normalized.position);
    expect(fixtureTransport.requests).not.toHaveLength(0);
    expect(
      fixtureTransport.requests.every(
        (request) => request.blockNumber === BigInt(robinhoodV4Fixture.sourceBlock.blockNumber)
      )
    ).toBe(true);
    expect(fixtureTransport.transactionSubmissions).toBe(0);
  });

  it("Given mixed singleton logs in the pinned range, when querying the fixture PoolId, then bounded event normalization omits other pools", async () => {
    // Given: two pool identities in one inclusive source-block range.
    const transport = createEventTransport([
      createInitializeEvent({
        blockNumber: BigInt(robinhoodV4Fixture.sourceBlock.blockNumber),
        deployment: robinhoodV4Fixture.eventDeployment,
        logIndex: 0,
        poolId: robinhoodV4Fixture.pool.poolId,
      }),
      createModifyPositionEvent({
        blockNumber: BigInt(robinhoodV4Fixture.sourceBlock.blockNumber),
        deployment: robinhoodV4Fixture.eventDeployment,
        logIndex: 1,
        poolId: robinhoodV4Fixture.eventOtherPoolId,
        salt: robinhoodV4Fixture.logs.otherPoolSalt,
      }),
    ]);

    // When: the single-block, bounded page is normalized.
    const page = await getUniswapV4EventPage(
      {
        chainId: robinhoodV4Fixture.chainId,
        endBlock: robinhoodV4Fixture.sourceBlock.blockNumber,
        pageSize: 10,
        poolId: robinhoodV4Fixture.pool.poolId,
        scope: "pool",
        startBlock: robinhoodV4Fixture.sourceBlock.blockNumber,
      },
      { deployment: robinhoodV4Fixture.eventDeployment, transport }
    );

    // Then: the expected normalized event is complete and has no fabricated association.
    expect(page.events).toEqual(robinhoodV4Fixture.normalized.events);
    expect(page.hasMore).toBe(false);
  });

  it("Given the pinned 0x response fixture, when the quote is normalized, then it performs one GET-only quote path and exposes no submission capability", async () => {
    // Given: a redacted native 0x v2 response and no wallet client.
    mocks.resilientFetch.mockResolvedValue(
      new Response(JSON.stringify(robinhoodV4Fixture.quote.response), { status: 200 })
    );

    // When: production quote normalization runs against the fixture response.
    const quote = await getZeroExQuote({
      ...robinhoodV4Fixture.quote.request,
      apiKey: "test-only-key",
    });

    // Then: quote and transaction request are deterministic while submission remains impossible.
    expect(quote).toEqual(robinhoodV4Fixture.normalized.quote);
    expect(mocks.resilientFetch).toHaveBeenCalledTimes(1);
    expect(mocks.resilientFetch).toHaveBeenCalledWith(
      expect.stringContaining("/swap/allowance-holder/quote?"),
      expect.objectContaining({ method: "GET" }),
      expect.objectContaining({ timeoutMs: robinhoodV4Fixture.live.timeoutMs })
    );
    expect(robinhoodV4Fixture.transactionRequest).toEqual(quote.transaction);
  });

  it("Given malformed fixture data or a stale pinned block, when the fixture boundary is parsed or read, then untrusted state fails closed", async () => {
    // Given: an invalid file boundary and an RPC result for another block hash.
    const malformedFixture = {
      ...robinhoodV4Fixture,
      sourceBlock: { ...robinhoodV4Fixture.sourceBlock, blockHash: "not-hex" },
    };
    const fixtureTransport = createRobinhoodV4FixtureTransport(robinhoodV4Fixture);
    const reader = createUniswapV4StateReader({
      deployment: robinhoodV4Fixture.deployment,
      readClient: {
        ...fixtureTransport.readClient,
        readBlock: async (request) => ({
          hash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          number: request.blockNumber,
        }),
      },
    });

    // When: parsing untrusted fixture data and resolving the stale pinned block.
    const staleRead = reader.readPoolSnapshot({
      poolKey: robinhoodV4Fixture.pool.poolKey,
      sourceBlock: robinhoodV4Fixture.sourceBlock,
    });

    // Then: Zod rejects malformed input and block identity mismatch prevents normalization.
    expect(() => parseRobinhoodV4Fixture(malformedFixture)).toThrow();
    await expect(staleRead).rejects.toMatchObject({ code: "UNISWAP_V4_BLOCK_HASH_MISMATCH" });
  });
});
