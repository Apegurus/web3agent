import { createSDKInvoker } from "./shared.js";

export const erc8004RegisterAgent = createSDKInvoker<
  Record<string, unknown>,
  Record<string, unknown>
>("erc8004_register_agent");
export const erc8004GetAgent = createSDKInvoker<Record<string, unknown>, Record<string, unknown>>(
  "erc8004_get_agent"
);
export const erc8004UpdateAgent = createSDKInvoker<
  Record<string, unknown>,
  Record<string, unknown>
>("erc8004_update_agent");
export const erc8004SubmitFeedback = createSDKInvoker<
  Record<string, unknown>,
  Record<string, unknown>
>("erc8004_submit_feedback");
export const erc8004GetFeedback = createSDKInvoker<
  Record<string, unknown>,
  Record<string, unknown>
>("erc8004_get_feedback");
