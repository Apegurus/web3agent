import { z } from "zod";
import { Web3AgentError } from "../api/errors.js";
import {
  DEPLOYMENT_CONTRACTS,
  type DeploymentAdmissionProvenance,
  type DeploymentContract,
  ROBINHOOD_CHAIN_ID,
  ROBINHOOD_PUBLIC_RPC_URL,
  UNISWAP_V4_MANIFEST_URL,
} from "./deployment-provenance.js";
import {
  type DeploymentVerifierFetcher,
  type RpcRequest,
  type RpcResponse,
  getRpcResult,
  isTransientProviderMetadataError,
  requestJson,
  requireHex,
  rpcBatch,
  rpcRequest,
} from "./deployment-rpc.js";

export type { DeploymentAdmissionProvenance } from "./deployment-provenance.js";
export type { DeploymentVerifierFetcher } from "./deployment-rpc.js";

type RetryWaiter = (delayMs: number) => Promise<void>;

type PinnedSnapshotRequest = {
  readonly fetcher: DeploymentVerifierFetcher;
  readonly request: RpcRequest;
  readonly retryWaiter: RetryWaiter;
  readonly rpcUrl: string;
  readonly timeoutMs: number;
};

export type DeploymentAdmissionRequest = {
  readonly fetcher: DeploymentVerifierFetcher;
  readonly manifestUrl?: string;
  readonly provenance: DeploymentAdmissionProvenance;
  readonly retryWaiter?: RetryWaiter;
  readonly rpcUrl?: string;
  readonly timeoutMs?: number;
  readonly verifyCurrentHead?: boolean;
};

const DEFAULT_TIMEOUT_MS = 15_000;
const PINNED_RPC_RETRY_DELAYS_MS = [50, 100] as const;
const defaultRetryWaiter: RetryWaiter = (delayMs) =>
  new Promise((resolve) => setTimeout(resolve, delayMs));
const blockSchema = z.object({ hash: z.string(), number: z.string() });
const accountProofSchema = z.object({ codeHash: z.string() });
const manifestSchema = z.object({
  records: z.array(z.object({ address: z.string(), chainId: z.number(), contract: z.string() })),
  source: z.object({ commit: z.string(), repo: z.string() }),
});

function verificationError(code: string, message: string): Web3AgentError {
  return new Web3AgentError({ code, message });
}

function contractName(contract: DeploymentContract): string {
  return `${contract[0]?.toUpperCase()}${contract.slice(1)}`;
}

function verifyManifest(payload: unknown, provenance: DeploymentAdmissionProvenance): void {
  const manifest = manifestSchema.safeParse(payload);
  if (!manifest.success) {
    throw verificationError(
      "UNISWAP_V4_MANIFEST_PROVENANCE_INVALID",
      "official manifest shape changed"
    );
  }
  if (
    manifest.data.source.commit !== provenance.manifest.sourceCommit ||
    manifest.data.source.repo !== provenance.manifest.sourceRepository
  ) {
    throw verificationError(
      "UNISWAP_V4_MANIFEST_PROVENANCE_INVALID",
      "official manifest source changed"
    );
  }
  for (const contract of DEPLOYMENT_CONTRACTS) {
    const records = manifest.data.records.filter(
      (candidate) =>
        candidate.chainId === ROBINHOOD_CHAIN_ID && candidate.contract === contractName(contract)
    );
    if (
      records.length !== 1 ||
      records[0]?.address.toLowerCase() !== provenance.deployment[contract].toLowerCase()
    ) {
      throw verificationError(
        "UNISWAP_V4_MANIFEST_PROVENANCE_INVALID",
        `manifest ${contract} address mismatch`
      );
    }
  }
}

function buildSnapshotRequests(provenance: DeploymentAdmissionProvenance): RpcRequest[] {
  const requests: RpcRequest[] = DEPLOYMENT_CONTRACTS.map((contract, index) => ({
    id: index + 3,
    method: "eth_getProof",
    params: [provenance.deployment[contract], [], provenance.block.number],
  }));
  provenance.probes.forEach((probe, index) => {
    requests.push({
      id: DEPLOYMENT_CONTRACTS.length + index + 3,
      method: "eth_call",
      params: [
        { data: probe.data, to: provenance.deployment[probe.contract] },
        provenance.block.number,
      ],
    });
  });
  return requests;
}

async function requestPinnedSnapshot(input: PinnedSnapshotRequest): Promise<RpcResponse> {
  let response = await rpcRequest({
    fetcher: input.fetcher,
    request: input.request,
    rpcUrl: input.rpcUrl,
    timeoutMs: input.timeoutMs,
  });
  for (const delayMs of PINNED_RPC_RETRY_DELAYS_MS) {
    if (!isTransientProviderMetadataError(response)) return response;
    await input.retryWaiter(delayMs);
    response = await rpcRequest({
      fetcher: input.fetcher,
      request: input.request,
      rpcUrl: input.rpcUrl,
      timeoutMs: input.timeoutMs,
    });
  }
  if (isTransientProviderMetadataError(response)) {
    throw verificationError(
      "UNISWAP_V4_RPC_TRANSIENT_EXHAUSTED",
      `RPC response ${input.request.id} remained unavailable after ${PINNED_RPC_RETRY_DELAYS_MS.length + 1} pinned attempts`
    );
  }
  return response;
}

export async function verifyUniswapV4DeploymentAdmission(
  request: DeploymentAdmissionRequest
): Promise<{
  readonly block: DeploymentAdmissionProvenance["block"];
  readonly deployment: DeploymentAdmissionProvenance["deployment"];
}> {
  const timeoutMs = request.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const retryWaiter = request.retryWaiter ?? defaultRetryWaiter;
  const manifestUrl = request.manifestUrl ?? UNISWAP_V4_MANIFEST_URL;
  const rpcUrl = request.rpcUrl ?? ROBINHOOD_PUBLIC_RPC_URL;
  verifyManifest(
    await requestJson({
      fetcher: request.fetcher,
      init: { method: "GET" },
      source: "manifest",
      timeoutMs,
      url: manifestUrl,
    }),
    request.provenance
  );
  const identity = await rpcBatch({
    fetcher: request.fetcher,
    requests: [
      { id: 1, method: "eth_chainId", params: [] },
      { id: 2, method: "eth_getBlockByNumber", params: [request.provenance.block.number, false] },
    ],
    rpcUrl,
    timeoutMs,
  });
  if (requireHex(getRpcResult(identity, 1), "chain id") !== "0x1237") {
    throw verificationError("UNISWAP_V4_DEPLOYMENT_UNVERIFIED", "RPC returned the wrong chain");
  }
  const block = blockSchema.safeParse(getRpcResult(identity, 2));
  if (
    !block.success ||
    block.data.hash !== request.provenance.block.hash ||
    block.data.number !== request.provenance.block.number
  ) {
    throw verificationError("UNISWAP_V4_DEPLOYMENT_UNVERIFIED", "RPC block identity mismatch");
  }
  if (request.verifyCurrentHead === true) {
    const currentHead = await rpcRequest({
      fetcher: request.fetcher,
      request: { id: 1, method: "eth_blockNumber", params: [] },
      rpcUrl,
      timeoutMs,
    });
    requireHex(getRpcResult([currentHead], 1), "current head");
  }
  const snapshot: RpcResponse[] = [];
  for (const snapshotRequest of buildSnapshotRequests(request.provenance)) {
    snapshot.push(
      await requestPinnedSnapshot({
        fetcher: request.fetcher,
        request: snapshotRequest,
        retryWaiter,
        rpcUrl,
        timeoutMs,
      })
    );
  }
  for (const [index, contract] of DEPLOYMENT_CONTRACTS.entries()) {
    const accountProof = accountProofSchema.safeParse(getRpcResult(snapshot, index + 3));
    if (!accountProof.success) {
      throw verificationError("UNISWAP_V4_RPC_RESPONSE_INVALID", `${contract} proof was invalid`);
    }
    if (
      requireHex(accountProof.data.codeHash, `${contract} code hash`) !==
      request.provenance.codeHashes[contract]
    ) {
      throw verificationError("UNISWAP_V4_DEPLOYMENT_UNVERIFIED", `${contract} bytecode mismatch`);
    }
  }
  for (const [index, probe] of request.provenance.probes.entries()) {
    const result = requireHex(
      getRpcResult(snapshot, DEPLOYMENT_CONTRACTS.length + index + 3),
      "read probe"
    );
    if (result !== probe.result) {
      throw verificationError(
        "UNISWAP_V4_DEPLOYMENT_UNVERIFIED",
        `${probe.contract} read probe mismatch`
      );
    }
  }
  return { block: request.provenance.block, deployment: request.provenance.deployment };
}
