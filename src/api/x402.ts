import { createSDKInvoker } from "./shared.js";

export const x402CheckRequirements = createSDKInvoker<
  Record<string, unknown>,
  Record<string, unknown>
>("x402_check_requirements");
export const x402Fetch = createSDKInvoker<Record<string, unknown>, Record<string, unknown>>(
  "x402_fetch"
);
