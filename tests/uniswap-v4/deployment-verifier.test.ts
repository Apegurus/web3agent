import { type Hex, keccak256 } from "viem";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { ROBINHOOD_UNISWAP_V4_PROVENANCE } from "../../src/uniswap-v4/deployment-provenance.js";
import {
  type DeploymentAdmissionProvenance,
  type DeploymentVerifierFetcher,
  verifyUniswapV4DeploymentAdmission,
} from "../../src/uniswap-v4/deployment-verifier.js";
import { getUniswapV4Deployment } from "../../src/uniswap-v4/deployments.js";
import {
  type LiveRpcTraceEntry,
  tracedFetcher,
  writeLiveTrace,
} from "./deployment-verifier-live-trace.js";

const CODE: Hex = "0x6000";
const CODE_HASH = keccak256(CODE);
const DEPLOYMENT = getUniswapV4Deployment(4663);
const rpcRequestPayloadSchema = z.object({
  id: z.number(),
  jsonrpc: z.literal("2.0"),
  method: z.string(),
  params: z.array(z.unknown()),
});
const rpcPayloadSchema = z.union([z.array(rpcRequestPayloadSchema), rpcRequestPayloadSchema]);

const PROVENANCE = {
  manifest: {
    sourceCommit: "test-commit",
    sourceRepository: "https://github.com/Uniswap/contracts",
  },
  deployment: DEPLOYMENT,
  block: {
    hash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    number: "0x10",
  },
  codeHashes: {
    permit2: CODE_HASH,
    poolManager: CODE_HASH,
    positionManager: CODE_HASH,
    stateView: CODE_HASH,
  },
  probes: [
    { contract: "poolManager", data: "0x11111111", result: "0x01" },
    { contract: "positionManager", data: "0x22222222", result: "0x02" },
    { contract: "stateView", data: "0x33333333", result: "0x03" },
    { contract: "permit2", data: "0x44444444", result: "0x04" },
  ],
} satisfies DeploymentAdmissionProvenance;

function manifestResponse(sourceCommit = PROVENANCE.manifest.sourceCommit): Response {
  return new Response(
    JSON.stringify({
      source: {
        commit: sourceCommit,
        repo: PROVENANCE.manifest.sourceRepository,
      },
      records: [
        { address: DEPLOYMENT.poolManager, chainId: 4663, contract: "PoolManager" },
        { address: DEPLOYMENT.positionManager, chainId: 4663, contract: "PositionManager" },
        { address: DEPLOYMENT.stateView, chainId: 4663, contract: "StateView" },
        { address: DEPLOYMENT.permit2, chainId: 4663, contract: "Permit2" },
      ],
    })
  );
}

function pinnedBlockIdentityResponse(): Response {
  return new Response(
    JSON.stringify([
      { id: 1, jsonrpc: "2.0", result: "0x1237" },
      {
        id: 2,
        jsonrpc: "2.0",
        result: { hash: PROVENANCE.block.hash, number: PROVENANCE.block.number },
      },
    ])
  );
}

function pinnedSnapshotResponses(code = CODE): readonly Response[] {
  return [
    new Response(JSON.stringify({ id: 3, jsonrpc: "2.0", result: { codeHash: keccak256(code) } })),
    new Response(JSON.stringify({ id: 4, jsonrpc: "2.0", result: { codeHash: keccak256(code) } })),
    new Response(JSON.stringify({ id: 5, jsonrpc: "2.0", result: { codeHash: keccak256(code) } })),
    new Response(JSON.stringify({ id: 6, jsonrpc: "2.0", result: { codeHash: keccak256(code) } })),
    new Response(JSON.stringify({ id: 7, jsonrpc: "2.0", result: "0x01" })),
    new Response(JSON.stringify({ id: 8, jsonrpc: "2.0", result: "0x02" })),
    new Response(JSON.stringify({ id: 9, jsonrpc: "2.0", result: "0x03" })),
    new Response(JSON.stringify({ id: 10, jsonrpc: "2.0", result: "0x04" })),
  ];
}

function currentHeadResponse(): Response {
  return new Response(JSON.stringify({ id: 1, jsonrpc: "2.0", result: "0xfad152" }));
}

function queuedFetcher(responses: readonly Response[]): ReturnType<typeof vi.fn> {
  const queuedResponses = [...responses];
  return vi.fn(async () => {
    const response = queuedResponses.shift();
    if (response === undefined) throw new TypeError("missing queued deployment response");
    return response;
  });
}

function successfulFetcher(): DeploymentVerifierFetcher {
  return queuedFetcher([
    manifestResponse(),
    pinnedBlockIdentityResponse(),
    ...pinnedSnapshotResponses(),
  ]);
}

function rpcPayloads(
  fetcher: ReturnType<typeof vi.fn>
): readonly z.infer<typeof rpcPayloadSchema>[] {
  return fetcher.mock.calls
    .map(([, init]) => init.body)
    .filter((body): body is string => typeof body === "string")
    .map((body) => rpcPayloadSchema.parse(JSON.parse(body)));
}

const liveAdmissionRpcUrl =
  process.env.WEB3AGENT_LIVE_TESTS === "1" && process.env.WEB3AGENT_ROBINHOOD_LIVE_TESTS === "1"
    ? process.env.WEB3AGENT_ROBINHOOD_RPC_URL
    : undefined;

describe("Uniswap v4 deployment admission", () => {
  it("accepts manifest and pinned RPC evidence before reporting a verified deployment", async () => {
    // Given: matching official-manifest and pinned-RPC fixtures
    const fetcher = successfulFetcher();

    // When: the admission verifier runs
    const result = await verifyUniswapV4DeploymentAdmission({ fetcher, provenance: PROVENANCE });

    // Then: the deployment is accepted only with its pinned block identity
    expect(result).toEqual({ block: PROVENANCE.block, deployment: DEPLOYMENT });
  });

  it("keeps bytecode and read probes at the provenance block when a current-head availability probe is requested", async () => {
    // Given: a current head beyond the authoritative historical deployment block
    const fetcher = queuedFetcher([
      manifestResponse(),
      pinnedBlockIdentityResponse(),
      currentHeadResponse(),
      ...pinnedSnapshotResponses(),
    ]);

    // When: admission includes the optional liveness probe
    await verifyUniswapV4DeploymentAdmission({
      fetcher,
      provenance: PROVENANCE,
      verifyCurrentHead: true,
    });

    // Then: liveness is isolated from every authoritative historical request
    const [identity, currentHead, ...snapshotRequests] = rpcPayloads(fetcher);
    expect(identity).toEqual([
      { id: 1, jsonrpc: "2.0", method: "eth_chainId", params: [] },
      {
        id: 2,
        jsonrpc: "2.0",
        method: "eth_getBlockByNumber",
        params: [PROVENANCE.block.number, false],
      },
    ]);
    expect(currentHead).toEqual({ id: 1, jsonrpc: "2.0", method: "eth_blockNumber", params: [] });
    expect(snapshotRequests).toHaveLength(8);
    for (const [index, request] of snapshotRequests.entries()) {
      expect(Array.isArray(request)).toBe(false);
      if (Array.isArray(request)) continue;
      expect(request.method).toBe(index < 4 ? "eth_getProof" : "eth_call");
      expect(request.params).toContain(PROVENANCE.block.number);
      expect(request.params).not.toContain("latest");
    }
  });

  it("rejects stale manifest provenance before RPC admission", async () => {
    // Given: a manifest from a different official source revision
    const fetcher = vi.fn().mockResolvedValue(manifestResponse("stale-commit"));

    // When: the admission verifier runs
    const verifyAdmission = () =>
      verifyUniswapV4DeploymentAdmission({ fetcher, provenance: PROVENANCE });

    // Then: verification fails before an RPC request can accept the registry
    await expect(verifyAdmission).rejects.toMatchObject({
      code: "UNISWAP_V4_MANIFEST_PROVENANCE_INVALID",
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("rejects mismatched runtime code without changing the immutable registry", async () => {
    // Given: an RPC fixture with unexpected PoolManager bytecode
    const before = getUniswapV4Deployment(4663);
    const fetcher = queuedFetcher([
      manifestResponse(),
      pinnedBlockIdentityResponse(),
      ...pinnedSnapshotResponses("0x6001"),
    ]);

    // When: the admission verifier runs
    const verifyAdmission = () =>
      verifyUniswapV4DeploymentAdmission({ fetcher, provenance: PROVENANCE });

    // Then: code mismatch fails closed and cannot mutate the registry
    await expect(verifyAdmission).rejects.toMatchObject({
      code: "UNISWAP_V4_DEPLOYMENT_UNVERIFIED",
    });
    expect(getUniswapV4Deployment(4663)).toEqual(before);
  });

  it("classifies bounded RPC timeouts", async () => {
    // Given: a manifest response followed by an AbortSignal timeout
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(manifestResponse())
      .mockRejectedValueOnce(new DOMException("timed out", "TimeoutError"));

    // When: the admission verifier runs
    const verifyAdmission = () =>
      verifyUniswapV4DeploymentAdmission({ fetcher, provenance: PROVENANCE });

    // Then: timeout is surfaced as an actionable typed failure
    await expect(verifyAdmission).rejects.toMatchObject({ code: "UNISWAP_V4_RPC_TIMEOUT" });
  });

  it("classifies RPC rate limits", async () => {
    // Given: a manifest response followed by a rate-limited RPC response
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(manifestResponse())
      .mockResolvedValueOnce(new Response("rate limited", { status: 429 }));

    // When: the admission verifier runs
    const verifyAdmission = () =>
      verifyUniswapV4DeploymentAdmission({ fetcher, provenance: PROVENANCE });

    // Then: callers receive a distinct retryable failure classification
    await expect(verifyAdmission).rejects.toMatchObject({ code: "UNISWAP_V4_RPC_RATE_LIMITED" });
  });

  const liveAdmissionTest = liveAdmissionRpcUrl === undefined ? it.skip : it;

  liveAdmissionTest(
    "reproduces the official public-RPC admission record",
    async () => {
      // Given: the documented public endpoint and pinned official provenance
      // When: the admission verifier is executed with its bounded default timeout
      const traces: LiveRpcTraceEntry[] = [];
      try {
        const result = await verifyUniswapV4DeploymentAdmission({
          fetcher: tracedFetcher(fetch, traces),
          provenance: ROBINHOOD_UNISWAP_V4_PROVENANCE,
          rpcUrl: liveAdmissionRpcUrl,
        });

        // Then: the static registry can be independently reproduced
        expect(result).toEqual({
          block: ROBINHOOD_UNISWAP_V4_PROVENANCE.block,
          deployment: DEPLOYMENT,
        });
      } finally {
        const tracePath = process.env.WEB3AGENT_LIVE_ADMISSION_TRACE_PATH;
        if (tracePath !== undefined && liveAdmissionRpcUrl !== undefined) {
          await writeLiveTrace({
            endpoint: new URL(liveAdmissionRpcUrl).origin,
            path: tracePath,
            requests: traces,
          });
        }
      }
    },
    30_000
  );
});
