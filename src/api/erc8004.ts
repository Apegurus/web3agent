import { createSDKInvoker } from "./shared.js";
import type {
  Erc8004GetAgentInput,
  Erc8004GetAgentOutput,
  Erc8004GetFeedbackInput,
  Erc8004GetFeedbackOutput,
  Erc8004RegisterAgentInput,
  Erc8004RegisterAgentOutput,
  Erc8004SubmitFeedbackInput,
  Erc8004SubmitFeedbackOutput,
  Erc8004UpdateAgentInput,
  Erc8004UpdateAgentOutput,
} from "./types.js";

export const erc8004RegisterAgent = createSDKInvoker<
  Erc8004RegisterAgentInput,
  Erc8004RegisterAgentOutput
>("erc8004_register_agent");
export const erc8004GetAgent = createSDKInvoker<Erc8004GetAgentInput, Erc8004GetAgentOutput>(
  "erc8004_get_agent"
);
export const erc8004UpdateAgent = createSDKInvoker<
  Erc8004UpdateAgentInput,
  Erc8004UpdateAgentOutput
>("erc8004_update_agent");
export const erc8004SubmitFeedback = createSDKInvoker<
  Erc8004SubmitFeedbackInput,
  Erc8004SubmitFeedbackOutput
>("erc8004_submit_feedback");
export const erc8004GetFeedback = createSDKInvoker<
  Erc8004GetFeedbackInput,
  Erc8004GetFeedbackOutput
>("erc8004_get_feedback");
