import { type Hex, keccak256 } from "viem";
import { z } from "zod";
import { Web3AgentError } from "../api/errors.js";

export type DeploymentVerifierFetcher = (input: string, init: RequestInit) => Promise<Response>;

export type RpcRequest = {
  readonly id: number;
  readonly method: string;
  readonly params: readonly unknown[];
};

type VerificationRequest = {
  readonly fetcher: DeploymentVerifierFetcher;
  readonly init: RequestInit;
  readonly source: "manifest" | "rpc";
  readonly timeoutMs: number;
  readonly url: string;
};

type RpcBatchRequest = {
  readonly fetcher: DeploymentVerifierFetcher;
  readonly requests: readonly RpcRequest[];
  readonly rpcUrl: string;
  readonly timeoutMs: number;
};

type RpcSingleRequest = {
  readonly fetcher: DeploymentVerifierFetcher;
  readonly request: RpcRequest;
  readonly rpcUrl: string;
  readonly timeoutMs: number;
};

export type RpcResponse = {
  readonly error?: { readonly message: string } | undefined;
  readonly id: number;
  readonly jsonrpc: "2.0";
  readonly result?: unknown;
};

const hexSchema = z.custom<Hex>(
  (value) => typeof value === "string" && /^0x[\da-fA-F]*$/.test(value)
);
const rpcResponseSchema = z.object({
  error: z.object({ message: z.string() }).optional(),
  id: z.number(),
  jsonrpc: z.literal("2.0"),
  result: z.unknown().optional(),
});
const rpcResponsesSchema = z.array(rpcResponseSchema);
const transientMetadataErrorPattern = /^metadata is not found, \d+$/;

function verificationError(code: string, message: string, cause?: unknown): Web3AgentError {
  return new Web3AgentError({ code, message, cause });
}

function isTimeout(error: unknown): boolean {
  return error instanceof DOMException && error.name === "TimeoutError";
}

export function requireHex(value: unknown, label: string): Hex {
  const parsed = hexSchema.safeParse(value);
  if (!parsed.success) {
    throw verificationError("UNISWAP_V4_RPC_RESPONSE_INVALID", `${label} was not hex`);
  }
  return parsed.data;
}

export function hashRuntimeCode(value: unknown, label: string): Hex {
  const code = requireHex(value, label);
  if (code === "0x") {
    throw verificationError("UNISWAP_V4_DEPLOYMENT_UNVERIFIED", `${label} was empty`);
  }
  return keccak256(code);
}

export async function requestJson(request: VerificationRequest): Promise<unknown> {
  try {
    const response = await request.fetcher(request.url, {
      ...request.init,
      signal: AbortSignal.timeout(request.timeoutMs),
    });
    if (response.status === 429) {
      throw verificationError(
        "UNISWAP_V4_RPC_RATE_LIMITED",
        `${request.source} endpoint rate limited`
      );
    }
    if (!response.ok) {
      throw verificationError(
        "UNISWAP_V4_RPC_UNAVAILABLE",
        `${request.source} endpoint returned ${response.status}`
      );
    }
    return await response.json();
  } catch (error: unknown) {
    if (error instanceof Web3AgentError) {
      throw error;
    }
    if (isTimeout(error)) {
      throw verificationError(
        "UNISWAP_V4_RPC_TIMEOUT",
        `${request.source} endpoint timed out`,
        error
      );
    }
    throw verificationError(
      "UNISWAP_V4_RPC_UNAVAILABLE",
      `${request.source} endpoint request failed`,
      error
    );
  }
}

export function getRpcResult(responses: readonly RpcResponse[], id: number): unknown {
  const response = responses.find((candidate) => candidate.id === id);
  if (response === undefined) {
    throw verificationError("UNISWAP_V4_RPC_RESPONSE_INVALID", `missing RPC response ${id}`);
  }
  if (response.error !== undefined) {
    throw verificationError(
      "UNISWAP_V4_RPC_RESPONSE_INVALID",
      `RPC response ${id}: ${response.error.message}`
    );
  }
  if (response.result === undefined) {
    throw verificationError("UNISWAP_V4_RPC_RESPONSE_INVALID", `missing RPC result ${id}`);
  }
  return response.result;
}

export function isTransientProviderMetadataError(response: RpcResponse): boolean {
  return response.error !== undefined && transientMetadataErrorPattern.test(response.error.message);
}

export async function rpcRequest(request: RpcSingleRequest): Promise<RpcResponse> {
  const payload = await requestJson({
    fetcher: request.fetcher,
    init: {
      body: JSON.stringify({ ...request.request, jsonrpc: "2.0" }),
      headers: { "content-type": "application/json" },
      method: "POST",
    },
    source: "rpc",
    timeoutMs: request.timeoutMs,
    url: request.rpcUrl,
  });
  const response = rpcResponseSchema.safeParse(payload);
  if (!response.success) {
    throw verificationError("UNISWAP_V4_RPC_RESPONSE_INVALID", "RPC response shape changed");
  }
  return response.data;
}

export async function rpcBatch(request: RpcBatchRequest): Promise<readonly RpcResponse[]> {
  const payload = await requestJson({
    fetcher: request.fetcher,
    init: {
      body: JSON.stringify(
        request.requests.map((rpcRequest) => ({ ...rpcRequest, jsonrpc: "2.0" }))
      ),
      headers: { "content-type": "application/json" },
      method: "POST",
    },
    source: "rpc",
    timeoutMs: request.timeoutMs,
    url: request.rpcUrl,
  });
  const responses = rpcResponsesSchema.safeParse(payload);
  if (!responses.success) {
    throw verificationError("UNISWAP_V4_RPC_RESPONSE_INVALID", "RPC response shape changed");
  }
  return responses.data;
}
