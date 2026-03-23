import { createSDKInvoker } from "./shared.js";
import type { PolicyGetInput, PolicyGetOutput } from "./types.js";

export const policyGet = createSDKInvoker<PolicyGetInput, PolicyGetOutput>("policy_get");
