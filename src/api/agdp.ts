import { createSDKInvoker } from "./shared.js";

export const agdpGetOfferings = createSDKInvoker<Record<string, unknown>, Record<string, unknown>>(
  "agdp_get_offerings"
);
export const agdpGetOffering = createSDKInvoker<Record<string, unknown>, Record<string, unknown>>(
  "agdp_get_offering"
);
export const agdpGetMyJobs = createSDKInvoker<Record<string, unknown>, Record<string, unknown>>(
  "agdp_get_my_jobs"
);
export const agdpHireAgent = createSDKInvoker<Record<string, unknown>, Record<string, unknown>>(
  "agdp_hire_agent"
);
export const agdpCreateOffering = createSDKInvoker<
  Record<string, unknown>,
  Record<string, unknown>
>("agdp_create_offering");
