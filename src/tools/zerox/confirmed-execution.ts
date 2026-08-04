import { zeroExConfirmedExecutionSchema } from "../../zerox/confirmed-execution.js";
import { zeroExSwapSchema } from "./schemas.js";

export const zeroExConfirmedSwapSchema = zeroExSwapSchema.extend({
  execution: zeroExConfirmedExecutionSchema,
});

export {
  ROBINHOOD_CHAIN_ID,
  hasSameAddress,
  prepareZeroExExecution,
  requireValidConfirmedExecution,
} from "../../zerox/confirmed-execution.js";
