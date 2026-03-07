// dSLTP: twap-sdk v5 has Module.STOP_LOSS/TAKE_PROFIT and triggerAmountPerTrade,
// but the full flow (oracle pricing, trigger execution) is NOT validated for
// headless agent use. Feature-gated until end-to-end confirmation.
export const DSLTP_AVAILABLE = false;

import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export interface DsltpToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (params: Record<string, unknown>) => Promise<CallToolResult>;
}

export function getDsltpToolDefinitions(): DsltpToolDefinition[] {
  if (!DSLTP_AVAILABLE) return [];
  return [];
}

export function getDsltpStatus(): string {
  return DSLTP_AVAILABLE ? "available" : "unavailable — SDK not validated for agent use";
}
