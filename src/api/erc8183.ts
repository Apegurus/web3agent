import { createSDKInvoker } from "./shared.js";

export const erc8183CreateJob = createSDKInvoker<Record<string, unknown>, Record<string, unknown>>(
  "erc8183_create_job"
);
export const erc8183SetBudget = createSDKInvoker<Record<string, unknown>, Record<string, unknown>>(
  "erc8183_set_budget"
);
export const erc8183FundJob = createSDKInvoker<Record<string, unknown>, Record<string, unknown>>(
  "erc8183_fund_job"
);
export const erc8183SubmitJob = createSDKInvoker<Record<string, unknown>, Record<string, unknown>>(
  "erc8183_submit_job"
);
export const erc8183CompleteJob = createSDKInvoker<
  Record<string, unknown>,
  Record<string, unknown>
>("erc8183_complete_job");
export const erc8183RejectJob = createSDKInvoker<Record<string, unknown>, Record<string, unknown>>(
  "erc8183_reject_job"
);
export const erc8183ClaimRefund = createSDKInvoker<
  Record<string, unknown>,
  Record<string, unknown>
>("erc8183_claim_refund");
export const erc8183GetJob = createSDKInvoker<Record<string, unknown>, Record<string, unknown>>(
  "erc8183_get_job"
);
