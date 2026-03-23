import { createSDKInvoker } from "./shared.js";

export const acpCreateJob = createSDKInvoker<Record<string, unknown>, Record<string, unknown>>(
  "acp_create_job"
);
export const acpSetBudget = createSDKInvoker<Record<string, unknown>, Record<string, unknown>>(
  "acp_set_budget"
);
export const acpFundJob = createSDKInvoker<Record<string, unknown>, Record<string, unknown>>(
  "acp_fund_job"
);
export const acpSubmitJob = createSDKInvoker<Record<string, unknown>, Record<string, unknown>>(
  "acp_submit_job"
);
export const acpCompleteJob = createSDKInvoker<Record<string, unknown>, Record<string, unknown>>(
  "acp_complete_job"
);
export const acpRejectJob = createSDKInvoker<Record<string, unknown>, Record<string, unknown>>(
  "acp_reject_job"
);
export const acpClaimRefund = createSDKInvoker<Record<string, unknown>, Record<string, unknown>>(
  "acp_claim_refund"
);
export const acpGetJob = createSDKInvoker<Record<string, unknown>, Record<string, unknown>>(
  "acp_get_job"
);
