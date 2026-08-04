import { type PublicClient, getAddress } from "viem";

import { addressSchema } from "../../../src/api/schemas/common.js";
import type { UniswapV4EventLog, UniswapV4EventTransport } from "../../../src/uniswap-v4/events.js";

type LiveEnvironment = Readonly<Record<string, string | undefined>>;

export type RobinhoodV4LiveSmokeConfig =
  | { readonly kind: "skipped"; readonly reason: string }
  | {
      readonly kind: "enabled";
      readonly rpcUrl: string;
      readonly submissionMode: "prepare-or-simulate-only" | "read-only";
      readonly walletAddress?: `0x${string}`;
      readonly zeroExApiKey: string;
    };

function valueFrom(env: LiveEnvironment, name: string): string | undefined {
  const value = env[name];
  return value?.trim() || undefined;
}

export function readRobinhoodV4LiveSmokeConfig(env: LiveEnvironment): RobinhoodV4LiveSmokeConfig {
  if (valueFrom(env, "WEB3AGENT_LIVE_TESTS") !== "1") {
    return { kind: "skipped", reason: "WEB3AGENT_LIVE_TESTS=1 is required" };
  }
  if (valueFrom(env, "WEB3AGENT_ROBINHOOD_LIVE_TESTS") !== "1") {
    return { kind: "skipped", reason: "WEB3AGENT_ROBINHOOD_LIVE_TESTS=1 is required" };
  }
  const rpcUrl = valueFrom(env, "WEB3AGENT_ROBINHOOD_RPC_URL");
  if (!rpcUrl) {
    return { kind: "skipped", reason: "WEB3AGENT_ROBINHOOD_RPC_URL is required" };
  }
  if (!URL.canParse(rpcUrl)) {
    return { kind: "skipped", reason: "WEB3AGENT_ROBINHOOD_RPC_URL must be an absolute URL" };
  }
  const protocol = new URL(rpcUrl).protocol;
  if (protocol !== "http:" && protocol !== "https:") {
    return { kind: "skipped", reason: "WEB3AGENT_ROBINHOOD_RPC_URL must use HTTP or HTTPS" };
  }
  const zeroExApiKey = valueFrom(env, "ZEROX_API_KEY");
  if (!zeroExApiKey) {
    return { kind: "skipped", reason: "ZEROX_API_KEY is required for the live 0x quote" };
  }
  const walletAddress = valueFrom(env, "WEB3AGENT_LIVE_TEST_WALLET_ADDRESS");
  const parsedWalletAddress = walletAddress ? addressSchema.safeParse(walletAddress) : undefined;
  if (parsedWalletAddress && !parsedWalletAddress.success) {
    return { kind: "skipped", reason: "WEB3AGENT_LIVE_TEST_WALLET_ADDRESS must be an EVM address" };
  }
  return parsedWalletAddress?.success
    ? {
        kind: "enabled",
        rpcUrl,
        submissionMode: "prepare-or-simulate-only",
        walletAddress: getAddress(parsedWalletAddress.data),
        zeroExApiKey,
      }
    : { kind: "enabled", rpcUrl, submissionMode: "read-only", zeroExApiKey };
}

function toEventLog(log: {
  readonly address: `0x${string}`;
  readonly blockNumber: bigint | null;
  readonly data: `0x${string}`;
  readonly logIndex: number | null;
  readonly topics: readonly `0x${string}`[];
  readonly transactionHash: `0x${string}` | null;
  readonly transactionIndex: number | null;
}): UniswapV4EventLog {
  const [signature, ...topics] = log.topics;
  if (!signature) throw new Error("RPC event log omitted its signature topic");
  return { ...log, topics: [signature, ...topics] };
}

export function toRobinhoodV4EventTransport(client: PublicClient): UniswapV4EventTransport {
  return {
    getChainId: () => client.getChainId(),
    getLogs: async ({ address, fromBlock, toBlock }) =>
      (await client.getLogs({ address, fromBlock, toBlock })).map(toEventLog),
  };
}
