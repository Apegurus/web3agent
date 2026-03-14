// Heuristic USD extraction from tool arguments.
// Tools pass amounts in various field names and formats. We check common
// field names. For tools where the amount is in token units, we use it as-is
// as an approximation. A price oracle integration can refine this later.

const USD_FIELD_NAMES = ["amountUsd", "amount_usd", "estimatedUsd"];
const AMOUNT_FIELD_NAMES = ["amount", "budget", "fromAmount", "value"];

function parseNumericField(value: unknown): number | null {
  if (typeof value === "number" && value > 0) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (!Number.isNaN(parsed) && parsed > 0) return parsed;
  }
  return null;
}

export function extractEstimatedUsd(args: Record<string, unknown>): number {
  for (const key of USD_FIELD_NAMES) {
    const result = parseNumericField(args[key]);
    if (result !== null) return result;
  }
  for (const key of AMOUNT_FIELD_NAMES) {
    const result = parseNumericField(args[key]);
    if (result !== null) return result;
  }
  return 0;
}
