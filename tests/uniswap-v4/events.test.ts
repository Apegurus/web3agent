import { describe, expect, it } from "vitest";

import { getUniswapV4EventPage } from "../../src/uniswap-v4/events.js";
import {
  EVENT_FIXTURE_CHAIN_ID as CHAIN_ID,
  eventFixtureDeployment as DEPLOYMENT,
  EVENT_FIXTURE_POOL_A as POOL_A,
  EVENT_FIXTURE_POOL_B as POOL_B,
  EVENT_FIXTURE_SENDER as SENDER,
  EVENT_FIXTURE_ZERO_ADDRESS as ZERO,
  createEventTransport,
  createInitializeEvent,
  createModifyPositionEvent,
  createTransferEvent,
  createUnknownPositionManagerEvent,
} from "./event-fixtures.js";

describe("Uniswap v4 event pages", () => {
  it("Given two pools and PositionManager modifications When paging one pool Then only emitted-PoolId events are merged in order", async () => {
    // Given: PositionManager ModifyPosition is pool-associated by its emitted id, while Transfer is not queried.
    const fixture = createEventTransport([
      createInitializeEvent({
        blockNumber: 100n,
        deployment: DEPLOYMENT,
        logIndex: 0,
        poolId: POOL_A,
      }),
      createModifyPositionEvent({
        blockNumber: 100n,
        deployment: DEPLOYMENT,
        logIndex: 1,
        poolId: POOL_A,
        salt: `0x${"07".repeat(32)}`,
      }),
      createInitializeEvent({
        blockNumber: 100n,
        deployment: DEPLOYMENT,
        logIndex: 2,
        poolId: POOL_B,
      }),
      createModifyPositionEvent({
        blockNumber: 100n,
        deployment: DEPLOYMENT,
        logIndex: 3,
        poolId: POOL_B,
        salt: `0x${"08".repeat(32)}`,
      }),
    ]);

    // When: a page and its continuation use the same pool identity.
    const first = await getUniswapV4EventPage(
      {
        chainId: CHAIN_ID,
        endBlock: "100",
        pageSize: 1,
        poolId: POOL_A,
        scope: "pool",
        startBlock: "100",
      },
      { deployment: DEPLOYMENT, transport: fixture }
    );
    const second = await getUniswapV4EventPage(
      {
        chainId: CHAIN_ID,
        cursor: first.nextCursor,
        endBlock: "100",
        pageSize: 1,
        poolId: POOL_A,
        scope: "pool",
        startBlock: "100",
      },
      { deployment: DEPLOYMENT, transport: fixture }
    );

    // Then: only Pool A remains and the PositionManager source is explicit.
    expect(first.events).toMatchObject([
      {
        kind: "initialize",
        poolAssociation: { kind: "associated", poolId: POOL_A, source: "pool-manager" },
      },
    ]);
    expect(second).toMatchObject({
      hasMore: false,
      events: [
        {
          kind: "positionModify",
          poolAssociation: {
            kind: "associated",
            poolId: POOL_A,
            source: "position-manager-modify-position",
          },
        },
      ],
    });
  });

  it("Given mixed Transfer and ModifyPosition logs When paging one token Then only emitted-token Transfers are returned unassociated", async () => {
    // Given: token 7 shares a transaction with ModifyPosition and token 8; neither creates an allowed association.
    const fixture = createEventTransport([
      createTransferEvent({
        blockNumber: 100n,
        deployment: DEPLOYMENT,
        from: ZERO,
        logIndex: 0,
        to: SENDER,
        tokenId: 7n,
      }),
      createModifyPositionEvent({
        blockNumber: 100n,
        deployment: DEPLOYMENT,
        logIndex: 1,
        poolId: POOL_A,
        salt: `0x${"00".repeat(31)}07`,
      }),
      createUnknownPositionManagerEvent({
        blockNumber: 100n,
        deployment: DEPLOYMENT,
        logIndex: 2,
      }),
      createTransferEvent({
        blockNumber: 101n,
        deployment: DEPLOYMENT,
        from: ZERO,
        logIndex: 0,
        to: SENDER,
        tokenId: 8n,
      }),
      createTransferEvent({
        blockNumber: 102n,
        deployment: DEPLOYMENT,
        from: SENDER,
        logIndex: 0,
        to: "0x0000000000000000000000000000000000000002",
        tokenId: 7n,
      }),
      createTransferEvent({
        blockNumber: 103n,
        deployment: DEPLOYMENT,
        from: "0x0000000000000000000000000000000000000002",
        logIndex: 0,
        to: ZERO,
        tokenId: 7n,
      }),
    ]);

    // When: the position pages advance with an opaque cursor.
    const first = await getUniswapV4EventPage(
      {
        chainId: CHAIN_ID,
        endBlock: "103",
        pageSize: 2,
        scope: "position",
        startBlock: "100",
        tokenId: "7",
      },
      { deployment: DEPLOYMENT, transport: fixture }
    );
    const second = await getUniswapV4EventPage(
      {
        chainId: CHAIN_ID,
        cursor: first.nextCursor,
        endBlock: "103",
        pageSize: 2,
        scope: "position",
        startBlock: "100",
        tokenId: "7",
      },
      { deployment: DEPLOYMENT, transport: fixture }
    );

    // Then: mint, owner transfer, and burn have token identity but never a fabricated PoolId.
    expect([...first.events, ...second.events]).toMatchObject([
      {
        kind: "positionLifecycle",
        action: "mint",
        tokenId: "7",
        poolAssociation: { kind: "unassociated", reason: "erc721-transfer-does-not-emit-pool-id" },
      },
      {
        kind: "positionTransfer",
        tokenId: "7",
        poolAssociation: { kind: "unassociated", reason: "erc721-transfer-does-not-emit-pool-id" },
      },
      {
        kind: "positionLifecycle",
        action: "burn",
        tokenId: "7",
        poolAssociation: { kind: "unassociated", reason: "erc721-transfer-does-not-emit-pool-id" },
      },
    ]);
    expect(first.hasMore).toBe(true);
    expect(second.hasMore).toBe(false);
  });

  it("Given a cursor for one exact scope identity When resuming another scope or range Then it fails before RPC", async () => {
    // Given: a pool cursor with a continuation and a transport that records no special retry behavior.
    const fixture = createEventTransport([
      createInitializeEvent({
        blockNumber: 100n,
        deployment: DEPLOYMENT,
        logIndex: 0,
        poolId: POOL_A,
      }),
      createInitializeEvent({
        blockNumber: 101n,
        deployment: DEPLOYMENT,
        logIndex: 0,
        poolId: POOL_A,
      }),
    ]);
    const page = await getUniswapV4EventPage(
      {
        chainId: CHAIN_ID,
        endBlock: "101",
        pageSize: 1,
        poolId: POOL_A,
        scope: "pool",
        startBlock: "100",
      },
      { deployment: DEPLOYMENT, transport: fixture }
    );

    // When / Then: scope, identifier, and inclusive range remain inseparable from the cursor.
    await expect(
      getUniswapV4EventPage(
        {
          chainId: CHAIN_ID,
          cursor: page.nextCursor,
          endBlock: "101",
          pageSize: 1,
          scope: "position",
          startBlock: "100",
          tokenId: "7",
        },
        { deployment: DEPLOYMENT, transport: fixture }
      )
    ).rejects.toMatchObject({ code: "UNISWAP_V4_EVENT_CURSOR_MISMATCH" });
    await expect(
      getUniswapV4EventPage(
        {
          chainId: CHAIN_ID,
          cursor: page.nextCursor,
          endBlock: "102",
          pageSize: 1,
          poolId: POOL_A,
          scope: "pool",
          startBlock: "100",
        },
        { deployment: DEPLOYMENT, transport: fixture }
      )
    ).rejects.toMatchObject({ code: "UNISWAP_V4_EVENT_CURSOR_MISMATCH" });
  });
});
