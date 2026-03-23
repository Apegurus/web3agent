import { createSDKInvoker } from "./shared.js";

export const policyGet = createSDKInvoker<Record<string, unknown>, Record<string, unknown>>(
  "policy_get"
);
