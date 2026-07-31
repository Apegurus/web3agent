import { keccak256, toHex } from "viem";
import { z } from "zod";
import { Web3AgentError } from "../../api/errors.js";
import { addressSchema, hexSchema } from "../../api/schemas/common.js";
import type { LifiRoute } from "../../lifi/route-execution.js";
import { zeroExSwapSchema } from "./schemas.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAddress(value: unknown): value is string {
  return typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value);
}

function isLifiRoute(value: unknown): value is LifiRoute {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    !Array.isArray(value.steps) ||
    value.steps.length === 0
  ) {
    return false;
  }
  return value.steps.every((step) => {
    if (!isRecord(step) || typeof step.id !== "string" || !isRecord(step.action)) return false;
    const { action, transactionRequest } = step;
    if (
      typeof action.fromChainId !== "number" ||
      typeof action.toChainId !== "number" ||
      !isRecord(action.fromToken) ||
      !isRecord(action.toToken) ||
      !isAddress(action.fromToken.address) ||
      !isAddress(action.toToken.address) ||
      typeof action.fromAmount !== "string" ||
      typeof action.toAmount !== "string" ||
      !isRecord(transactionRequest)
    ) {
      return false;
    }
    return (
      isAddress(transactionRequest.to) &&
      typeof transactionRequest.data === "string" &&
      typeof transactionRequest.value === "string" &&
      (transactionRequest.chainId === undefined ||
        typeof transactionRequest.chainId === "number") &&
      (transactionRequest.from === undefined || isAddress(transactionRequest.from))
    );
  });
}

function canonicalJson(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number" && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  throw new Web3AgentError({
    code: "ZEROEX_LIFI_ROUTE_NOT_SERIALIZABLE",
    message: "LI.FI route contains a non-serializable value",
  });
}

export function getLifiRouteIntegrityHash(route: LifiRoute): string {
  return keccak256(toHex(canonicalJson(route)));
}

export const zeroExLifiFallbackSchema = zeroExSwapSchema
  .extend({
    account: addressSchema.describe("Wallet account bound to the prepared LI.FI fallback"),
    chainId: z.literal(4663).describe("Robinhood Chain ID required for LI.FI fallback execution"),
    fallbackReason: z.enum(["no-route", "provider-unavailable"]),
    preparedRoute: z.custom<LifiRoute>(isLifiRoute),
    routeIntegrityHash: hexSchema,
  })
  .superRefine((fallback, context) => {
    const firstStep = fallback.preparedRoute.steps[0];
    const lastStep = fallback.preparedRoute.steps.at(-1);
    const routeMatchesIntent =
      firstStep !== undefined &&
      lastStep !== undefined &&
      fallback.preparedRoute.steps.every(
        (step) =>
          step.action.fromChainId === fallback.chainId &&
          step.action.toChainId === fallback.chainId &&
          (step.transactionRequest?.chainId === undefined ||
            step.transactionRequest.chainId === fallback.chainId) &&
          (step.transactionRequest?.from === undefined ||
            step.transactionRequest.from.toLowerCase() === fallback.account.toLowerCase())
      ) &&
      firstStep.action.fromToken.address.toLowerCase() === fallback.fromToken.toLowerCase() &&
      firstStep.action.fromAmount === fallback.fromAmount &&
      lastStep.action.toToken.address.toLowerCase() === fallback.toToken.toLowerCase();
    if (!routeMatchesIntent) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["preparedRoute"],
        message: "LI.FI route does not match the approved swap intent",
      });
    }
  });
