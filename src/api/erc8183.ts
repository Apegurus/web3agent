import { createSDKInvoker } from "./shared.js";
import type {
  Erc8183ClaimRefundInput,
  Erc8183ClaimRefundOutput,
  Erc8183CompleteJobInput,
  Erc8183CompleteJobOutput,
  Erc8183CreateJobInput,
  Erc8183CreateJobOutput,
  Erc8183FundJobInput,
  Erc8183FundJobOutput,
  Erc8183GetJobInput,
  Erc8183GetJobOutput,
  Erc8183RejectJobInput,
  Erc8183RejectJobOutput,
  Erc8183SetBudgetInput,
  Erc8183SetBudgetOutput,
  Erc8183SubmitJobInput,
  Erc8183SubmitJobOutput,
} from "./types.js";

export const erc8183CreateJob = createSDKInvoker<Erc8183CreateJobInput, Erc8183CreateJobOutput>(
  "erc8183_create_job"
);
export const erc8183SetBudget = createSDKInvoker<Erc8183SetBudgetInput, Erc8183SetBudgetOutput>(
  "erc8183_set_budget"
);
export const erc8183FundJob = createSDKInvoker<Erc8183FundJobInput, Erc8183FundJobOutput>(
  "erc8183_fund_job"
);
export const erc8183SubmitJob = createSDKInvoker<Erc8183SubmitJobInput, Erc8183SubmitJobOutput>(
  "erc8183_submit_job"
);
export const erc8183CompleteJob = createSDKInvoker<
  Erc8183CompleteJobInput,
  Erc8183CompleteJobOutput
>("erc8183_complete_job");
export const erc8183RejectJob = createSDKInvoker<Erc8183RejectJobInput, Erc8183RejectJobOutput>(
  "erc8183_reject_job"
);
export const erc8183ClaimRefund = createSDKInvoker<
  Erc8183ClaimRefundInput,
  Erc8183ClaimRefundOutput
>("erc8183_claim_refund");
export const erc8183GetJob = createSDKInvoker<Erc8183GetJobInput, Erc8183GetJobOutput>(
  "erc8183_get_job"
);
