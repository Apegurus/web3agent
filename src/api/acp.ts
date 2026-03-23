import { createSDKInvoker } from "./shared.js";
import type {
  AcpClaimRefundInput,
  AcpClaimRefundOutput,
  AcpCompleteJobInput,
  AcpCompleteJobOutput,
  AcpCreateJobInput,
  AcpCreateJobOutput,
  AcpFundJobInput,
  AcpFundJobOutput,
  AcpGetJobInput,
  AcpGetJobOutput,
  AcpRejectJobInput,
  AcpRejectJobOutput,
  AcpSetBudgetInput,
  AcpSetBudgetOutput,
  AcpSubmitJobInput,
  AcpSubmitJobOutput,
} from "./types.js";

export const acpCreateJob = createSDKInvoker<AcpCreateJobInput, AcpCreateJobOutput>(
  "acp_create_job"
);
export const acpSetBudget = createSDKInvoker<AcpSetBudgetInput, AcpSetBudgetOutput>(
  "acp_set_budget"
);
export const acpFundJob = createSDKInvoker<AcpFundJobInput, AcpFundJobOutput>("acp_fund_job");
export const acpSubmitJob = createSDKInvoker<AcpSubmitJobInput, AcpSubmitJobOutput>(
  "acp_submit_job"
);
export const acpCompleteJob = createSDKInvoker<AcpCompleteJobInput, AcpCompleteJobOutput>(
  "acp_complete_job"
);
export const acpRejectJob = createSDKInvoker<AcpRejectJobInput, AcpRejectJobOutput>(
  "acp_reject_job"
);
export const acpClaimRefund = createSDKInvoker<AcpClaimRefundInput, AcpClaimRefundOutput>(
  "acp_claim_refund"
);
export const acpGetJob = createSDKInvoker<AcpGetJobInput, AcpGetJobOutput>("acp_get_job");
