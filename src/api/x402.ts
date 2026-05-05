import { createSDKInvoker } from "./shared.js";
import type {
  X402CheckRequirementsInput,
  X402CheckRequirementsOutput,
  X402FetchInput,
  X402FetchOutput,
} from "./types.js";

export const x402CheckRequirements = createSDKInvoker<
  X402CheckRequirementsInput,
  X402CheckRequirementsOutput
>("x402_check_requirements");
export const x402Fetch = createSDKInvoker<X402FetchInput, X402FetchOutput>("x402_fetch");
