import { writeFile } from "node:fs/promises";
import { z } from "zod";
import type { DeploymentVerifierFetcher } from "../../src/uniswap-v4/deployment-verifier.js";

const rpcRequestPayloadSchema = z.object({
  id: z.number(),
  jsonrpc: z.literal("2.0"),
  method: z.string(),
  params: z.array(z.unknown()),
});
const rpcPayloadSchema = z.union([z.array(rpcRequestPayloadSchema), rpcRequestPayloadSchema]);
const rpcResponsePayloadSchema = z.object({
  error: z.object({ message: z.string() }).optional(),
  id: z.number(),
  result: z.unknown().optional(),
});

export type LiveRpcTraceEntry = {
  readonly id: number;
  readonly method: string;
  readonly params: readonly unknown[];
  readonly response: {
    readonly error: string | undefined;
    readonly hasResult: boolean;
    readonly status: number;
  };
};

export type LiveTraceArtifact = {
  readonly endpoint: string;
  readonly path: string;
  readonly requests: readonly LiveRpcTraceEntry[];
};

export function tracedFetcher(
  fetcher: DeploymentVerifierFetcher,
  traces: LiveRpcTraceEntry[]
): DeploymentVerifierFetcher {
  return async (input, init) => {
    const payload =
      typeof init.body === "string" ? rpcPayloadSchema.parse(JSON.parse(init.body)) : [];
    const requests = Array.isArray(payload) ? payload : [payload];
    const response = await fetcher(input, init);
    try {
      const body = await response.clone().json();
      const parsed = Array.isArray(body)
        ? body.map((candidate) => rpcResponsePayloadSchema.parse(candidate))
        : [rpcResponsePayloadSchema.parse(body)];
      for (const request of requests) {
        const rpcResponse = parsed.find((candidate) => candidate.id === request.id);
        traces.push({
          ...request,
          response: {
            error: rpcResponse?.error?.message,
            hasResult: rpcResponse?.result !== undefined,
            status: response.status,
          },
        });
      }
    } catch {
      for (const request of requests) {
        traces.push({
          ...request,
          response: {
            error: "unparseable RPC response",
            hasResult: false,
            status: response.status,
          },
        });
      }
    }
    return response;
  };
}

export async function writeLiveTrace(trace: LiveTraceArtifact): Promise<void> {
  await writeFile(trace.path, `${JSON.stringify(trace, null, 2)}\n`);
}
