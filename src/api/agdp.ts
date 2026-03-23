import { createSDKInvoker } from "./shared.js";
import type {
  AgdpCreateOfferingInput,
  AgdpGetMyJobsInput,
  AgdpGetMyJobsOutput,
  AgdpGetOfferingInput,
  AgdpGetOfferingsInput,
  AgdpGetOfferingsOutput,
  AgdpHireAgentInput,
  AgdpHireAgentOutput,
} from "./types.js";

export const agdpGetOfferings = createSDKInvoker<AgdpGetOfferingsInput, AgdpGetOfferingsOutput>(
  "agdp_get_offerings"
);
export const agdpGetOffering = createSDKInvoker<AgdpGetOfferingInput, Record<string, unknown>>(
  "agdp_get_offering"
);
export const agdpGetMyJobs = createSDKInvoker<AgdpGetMyJobsInput, AgdpGetMyJobsOutput>(
  "agdp_get_my_jobs"
);
export const agdpHireAgent = createSDKInvoker<AgdpHireAgentInput, AgdpHireAgentOutput>(
  "agdp_hire_agent"
);
export const agdpCreateOffering = createSDKInvoker<
  AgdpCreateOfferingInput,
  Record<string, unknown>
>("agdp_create_offering");
