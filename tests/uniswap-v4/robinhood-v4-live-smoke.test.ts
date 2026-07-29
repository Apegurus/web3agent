import { http, createPublicClient, keccak256 } from "viem";
import { robinhood } from "viem/chains";
import { describe, expect, it } from "vitest";

import {
  UNISWAP_V4_POOL_MANAGER_ABI,
  UNISWAP_V4_STATE_VIEW_ABI,
} from "../../src/uniswap-v4/abis.js";
import { getUniswapV4EventPage } from "../../src/uniswap-v4/events.js";
import { getZeroExQuote } from "../../src/zerox/client.js";
import {
  readRobinhoodV4LiveSmokeConfig,
  toRobinhoodV4EventTransport,
} from "./fixtures/robinhood-v4-live.js";
import { robinhoodV4Fixture } from "./fixtures/robinhood-v4.js";

const POSITION_MANAGER_REFERENCE_ABI = [
  {
    inputs: [],
    name: "poolManager",
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

const STATE_VIEW_REFERENCE_ABI = POSITION_MANAGER_REFERENCE_ABI;
const liveSmoke = readRobinhoodV4LiveSmokeConfig(process.env);
const liveIt = liveSmoke.kind === "enabled" ? it : it.skip;

const RPC_OK = "https://rpc.example.test";
const KEY_OK = "test-key";
const WALLET_OK = "0x3333333333333333333333333333333333333333";

const skipCases: ReadonlyArray<
  readonly [label: string, env: Readonly<Record<string, string>>, reason: string]
> = [
  ["neither flag present", {}, "WEB3AGENT_LIVE_TESTS=1 is required"],
  [
    "only WEB3AGENT_LIVE_TESTS=1 (Robinhood flag missing)",
    { WEB3AGENT_LIVE_TESTS: "1" },
    "WEB3AGENT_ROBINHOOD_LIVE_TESTS=1 is required",
  ],
  [
    "only WEB3AGENT_ROBINHOOD_LIVE_TESTS=1 (generic flag missing)",
    { WEB3AGENT_ROBINHOOD_LIVE_TESTS: "1" },
    "WEB3AGENT_LIVE_TESTS=1 is required",
  ],
  [
    'generic flag with a non-"1" value is not opt-in',
    { WEB3AGENT_LIVE_TESTS: "true", WEB3AGENT_ROBINHOOD_LIVE_TESTS: "1" },
    "WEB3AGENT_LIVE_TESTS=1 is required",
  ],
  [
    'Robinhood flag with a non-"1" value is not opt-in',
    { WEB3AGENT_LIVE_TESTS: "1", WEB3AGENT_ROBINHOOD_LIVE_TESTS: "yes" },
    "WEB3AGENT_ROBINHOOD_LIVE_TESTS=1 is required",
  ],
  [
    "both flags but RPC URL missing",
    { WEB3AGENT_LIVE_TESTS: "1", WEB3AGENT_ROBINHOOD_LIVE_TESTS: "1" },
    "WEB3AGENT_ROBINHOOD_RPC_URL is required",
  ],
  [
    "both flags but RPC URL is not absolute",
    {
      WEB3AGENT_LIVE_TESTS: "1",
      WEB3AGENT_ROBINHOOD_LIVE_TESTS: "1",
      WEB3AGENT_ROBINHOOD_RPC_URL: "not-a-url",
    },
    "WEB3AGENT_ROBINHOOD_RPC_URL must be an absolute URL",
  ],
  [
    "both flags but RPC URL uses a non-HTTP protocol",
    {
      WEB3AGENT_LIVE_TESTS: "1",
      WEB3AGENT_ROBINHOOD_LIVE_TESTS: "1",
      WEB3AGENT_ROBINHOOD_RPC_URL: "ws://rpc.example.test",
    },
    "WEB3AGENT_ROBINHOOD_RPC_URL must use HTTP or HTTPS",
  ],
  [
    "both flags plus RPC but ZEROX_API_KEY missing",
    {
      WEB3AGENT_LIVE_TESTS: "1",
      WEB3AGENT_ROBINHOOD_LIVE_TESTS: "1",
      WEB3AGENT_ROBINHOOD_RPC_URL: RPC_OK,
    },
    "ZEROX_API_KEY is required for the live 0x quote",
  ],
  [
    "both flags plus RPC and key but wallet address is malformed",
    {
      WEB3AGENT_LIVE_TESTS: "1",
      WEB3AGENT_LIVE_TEST_WALLET_ADDRESS: "0xnothex",
      WEB3AGENT_ROBINHOOD_LIVE_TESTS: "1",
      WEB3AGENT_ROBINHOOD_RPC_URL: RPC_OK,
      ZEROX_API_KEY: KEY_OK,
    },
    "WEB3AGENT_LIVE_TEST_WALLET_ADDRESS must be an EVM address",
  ],
];

describe("Robinhood opt-in live smoke gate", () => {
  it.each(skipCases)("skips (%s)", (_label, env, reason) => {
    // Given: an environment that lacks the two explicit booleans or a credential.
    // When: the gate is evaluated.
    // Then: it returns a precise no-network skip reason and no live path can be entered.
    const result = readRobinhoodV4LiveSmokeConfig(env);
    expect(result).toEqual({ kind: "skipped", reason });
    expect(result.kind).not.toBe("enabled");
  });

  it("Given both explicit booleans plus RPC and key, when no wallet address is supplied, then the gate enables read-only mode with no submission capability", () => {
    // Given: both opt-in booleans plus the required credentials.
    const result = readRobinhoodV4LiveSmokeConfig({
      WEB3AGENT_LIVE_TESTS: "1",
      WEB3AGENT_ROBINHOOD_LIVE_TESTS: "1",
      WEB3AGENT_ROBINHOOD_RPC_URL: RPC_OK,
      ZEROX_API_KEY: KEY_OK,
    });

    // When / Then: the configuration is enabled read-only and cannot select submission.
    expect(result).toEqual({
      kind: "enabled",
      rpcUrl: RPC_OK,
      submissionMode: "read-only",
      zeroExApiKey: KEY_OK,
    });
    if (result.kind === "enabled") expect(result.submissionMode).not.toBe("submit");
  });

  it("Given both explicit booleans plus a funded test address, when the gate is enabled, then it constrains automated QA to prepare-or-simulate behavior", () => {
    // Given: both opt-in booleans, credentials, and an optional funded wallet address.
    const result = readRobinhoodV4LiveSmokeConfig({
      WEB3AGENT_LIVE_TESTS: "1",
      WEB3AGENT_LIVE_TEST_WALLET_ADDRESS: WALLET_OK,
      WEB3AGENT_ROBINHOOD_LIVE_TESTS: "1",
      WEB3AGENT_ROBINHOOD_RPC_URL: RPC_OK,
      ZEROX_API_KEY: KEY_OK,
    });

    // When / Then: no configured path can select transaction submission.
    expect(result).toMatchObject({
      kind: "enabled",
      submissionMode: "prepare-or-simulate-only",
      walletAddress: WALLET_OK,
    });
    if (result.kind === "enabled") expect(result.submissionMode).not.toBe("submit");
  });
});

liveIt(
  liveSmoke.kind === "enabled"
    ? "Given explicit read-only credentials, when the Robinhood smoke runs, then chain, bytecode, reads, bounded events, and a 0x quote succeed without submission"
    : `Skipped live smoke: ${liveSmoke.reason}`,
  async () => {
    if (liveSmoke.kind !== "enabled") return;
    const blockNumber = BigInt(robinhoodV4Fixture.sourceBlock.blockNumber);
    const client = createPublicClient({
      chain: robinhood,
      transport: http(liveSmoke.rpcUrl, {
        retryCount: 0,
        timeout: robinhoodV4Fixture.live.timeoutMs,
      }),
    });

    const runtimeCode = await Promise.all([
      client.getCode({ address: robinhoodV4Fixture.deployment.poolManager, blockNumber }),
      client.getCode({ address: robinhoodV4Fixture.deployment.positionManager, blockNumber }),
      client.getCode({ address: robinhoodV4Fixture.deployment.stateView, blockNumber }),
      client.getCode({ address: robinhoodV4Fixture.deployment.permit2, blockNumber }),
    ]);
    const expectedCodeHashes = [
      robinhoodV4Fixture.deployment.poolManagerCodeHash,
      robinhoodV4Fixture.deployment.positionManagerCodeHash,
      robinhoodV4Fixture.deployment.stateViewCodeHash,
      robinhoodV4Fixture.deployment.permit2CodeHash,
    ];
    expect(await client.getChainId()).toBe(robinhoodV4Fixture.chainId);
    for (const [index, code] of runtimeCode.entries()) {
      expect(code).toBeDefined();
      const expectedCodeHash = expectedCodeHashes[index];
      if (code && expectedCodeHash) expect(keccak256(code)).toBe(expectedCodeHash);
    }

    const [protocolFeeController, positionManagerPoolManager, stateViewPoolManager, slot0] =
      await Promise.all([
        client.readContract({
          abi: UNISWAP_V4_POOL_MANAGER_ABI,
          address: robinhoodV4Fixture.deployment.poolManager,
          blockNumber,
          functionName: "protocolFeeController",
        }),
        client.readContract({
          abi: POSITION_MANAGER_REFERENCE_ABI,
          address: robinhoodV4Fixture.deployment.positionManager,
          blockNumber,
          functionName: "poolManager",
        }),
        client.readContract({
          abi: STATE_VIEW_REFERENCE_ABI,
          address: robinhoodV4Fixture.deployment.stateView,
          blockNumber,
          functionName: "poolManager",
        }),
        client.readContract({
          abi: UNISWAP_V4_STATE_VIEW_ABI,
          address: robinhoodV4Fixture.deployment.stateView,
          args: [robinhoodV4Fixture.live.poolId],
          blockNumber,
          functionName: "getSlot0",
        }),
      ]);
    expect(protocolFeeController).toBe("0x0000000000000000000000000000000000000000");
    expect(positionManagerPoolManager).toBe(robinhoodV4Fixture.deployment.poolManager);
    expect(stateViewPoolManager).toBe(robinhoodV4Fixture.deployment.poolManager);
    expect(slot0.map(String)).toEqual(robinhoodV4Fixture.live.slot0);

    const eventPage = await getUniswapV4EventPage(
      {
        chainId: robinhoodV4Fixture.chainId,
        endBlock: robinhoodV4Fixture.sourceBlock.blockNumber,
        pageSize: robinhoodV4Fixture.live.eventPageSize,
        poolId: robinhoodV4Fixture.live.poolId,
        scope: "pool",
        startBlock: robinhoodV4Fixture.sourceBlock.blockNumber,
      },
      {
        deployment: robinhoodV4Fixture.eventDeployment,
        transport: toRobinhoodV4EventTransport(client),
      }
    );
    expect(eventPage.events.length).toBeLessThanOrEqual(robinhoodV4Fixture.live.eventPageSize);

    const quote = await getZeroExQuote({
      ...robinhoodV4Fixture.quote.request,
      apiKey: liveSmoke.zeroExApiKey,
      taker: liveSmoke.walletAddress ?? robinhoodV4Fixture.quote.request.taker,
    });
    expect(quote).toMatchObject({ chainId: robinhoodV4Fixture.chainId, provider: "0x" });
    expect(quote.transaction.data.startsWith("0x")).toBe(true);
    expect(liveSmoke.submissionMode).not.toBe("submit");
  }
);
