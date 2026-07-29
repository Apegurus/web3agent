import { type Hex, keccak256 } from "viem";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { DeploymentAdmissionProvenance } from "../../src/uniswap-v4/deployment-verifier.js";
import { verifyUniswapV4DeploymentAdmission } from "../../src/uniswap-v4/deployment-verifier.js";
import { getUniswapV4Deployment } from "../../src/uniswap-v4/deployments.js";

const CODE: Hex = "0x6000";
const CODE_HASH = keccak256(CODE);
const DEPLOYMENT = getUniswapV4Deployment(4663);
const rpcRequestSchema = z.object({
  id: z.number(),
  method: z.string(),
  params: z.array(z.unknown()),
});

const PROVENANCE = {
  manifest: {
    sourceCommit: "retry-test-commit",
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

function response(id: number, result: unknown): Response {
  return new Response(JSON.stringify({ id, jsonrpc: "2.0", result }));
}

function metadataUnavailable(id: number): Response {
  return new Response(
    JSON.stringify({
      error: { message: "metadata is not found, 16437586" },
      id,
      jsonrpc: "2.0",
    })
  );
}

function manifestResponse(): Response {
  return new Response(
    JSON.stringify({
      records: [
        { address: DEPLOYMENT.poolManager, chainId: 4663, contract: "PoolManager" },
        { address: DEPLOYMENT.positionManager, chainId: 4663, contract: "PositionManager" },
        { address: DEPLOYMENT.stateView, chainId: 4663, contract: "StateView" },
        { address: DEPLOYMENT.permit2, chainId: 4663, contract: "Permit2" },
      ],
      source: {
        commit: PROVENANCE.manifest.sourceCommit,
        repo: PROVENANCE.manifest.sourceRepository,
      },
    })
  );
}

function identityResponse(): Response {
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

function snapshotResponses(): readonly Response[] {
  return [
    response(3, { codeHash: CODE_HASH }),
    response(4, { codeHash: CODE_HASH }),
    response(5, { codeHash: CODE_HASH }),
    response(6, { codeHash: CODE_HASH }),
    response(7, "0x01"),
    response(8, "0x02"),
    response(9, "0x03"),
    response(10, "0x04"),
  ];
}

function queuedFetcher(responses: readonly Response[]) {
  const queuedResponses = [...responses];
  const requests: z.infer<typeof rpcRequestSchema>[] = [];
  const fetcher = vi.fn(async (_input: string, init: RequestInit) => {
    if (typeof init.body === "string") {
      const body = JSON.parse(init.body);
      const parsed = Array.isArray(body)
        ? body.map((candidate) => rpcRequestSchema.parse(candidate))
        : [rpcRequestSchema.parse(body)];
      requests.push(...parsed);
    }
    const next = queuedResponses.shift();
    if (next === undefined) throw new TypeError("missing queued deployment response");
    return next;
  });
  return { fetcher, requests };
}

describe("Uniswap v4 pinned deployment retry", () => {
  it("retries an exact pinned request after a transient metadata response", async () => {
    // Given: response id 3 fails once although its request is pinned to the provenance block
    const { fetcher, requests } = queuedFetcher([
      manifestResponse(),
      identityResponse(),
      metadataUnavailable(3),
      ...snapshotResponses(),
    ]);
    const retryWaiter = vi.fn(async () => undefined);

    // When: admission is retried through the injected deterministic waiter
    const result = await verifyUniswapV4DeploymentAdmission({
      fetcher,
      provenance: PROVENANCE,
      retryWaiter,
    });

    // Then: only the exact id 3 historical request repeats and admission still verifies every fact
    expect(result).toEqual({ block: PROVENANCE.block, deployment: DEPLOYMENT });
    expect(retryWaiter).toHaveBeenCalledTimes(1);
    expect(retryWaiter).toHaveBeenCalledWith(50);
    expect(requests.filter((request) => request.id === 3)).toEqual([
      {
        id: 3,
        method: "eth_getProof",
        params: [DEPLOYMENT.poolManager, [], PROVENANCE.block.number],
      },
      {
        id: 3,
        method: "eth_getProof",
        params: [DEPLOYMENT.poolManager, [], PROVENANCE.block.number],
      },
    ]);
  });

  it("fails closed after bounded retries for persistent metadata responses", async () => {
    // Given: the same explicitly pinned id 3 request receives the typed transient provider error three times
    const { fetcher, requests } = queuedFetcher([
      manifestResponse(),
      identityResponse(),
      metadataUnavailable(3),
      metadataUnavailable(3),
      metadataUnavailable(3),
    ]);
    const retryWaiter = vi.fn(async () => undefined);

    // When: the bounded retry policy is exhausted
    const verifyAdmission = () =>
      verifyUniswapV4DeploymentAdmission({ fetcher, provenance: PROVENANCE, retryWaiter });

    // Then: it rejects with a typed failure and never substitutes a current block
    await expect(verifyAdmission).rejects.toMatchObject({
      code: "UNISWAP_V4_RPC_TRANSIENT_EXHAUSTED",
    });
    expect(retryWaiter).toHaveBeenNthCalledWith(1, 50);
    expect(retryWaiter).toHaveBeenNthCalledWith(2, 100);
    expect(requests.filter((request) => request.id === 3)).toEqual([
      {
        id: 3,
        method: "eth_getProof",
        params: [DEPLOYMENT.poolManager, [], PROVENANCE.block.number],
      },
      {
        id: 3,
        method: "eth_getProof",
        params: [DEPLOYMENT.poolManager, [], PROVENANCE.block.number],
      },
      {
        id: 3,
        method: "eth_getProof",
        params: [DEPLOYMENT.poolManager, [], PROVENANCE.block.number],
      },
    ]);
  });
});
