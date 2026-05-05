import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { getWalletState } from "../wallet/persistence.js";
import { formatToolError } from "./errors.js";

export function requireActiveWallet(toolName: string): CallToolResult | null {
  const state = getWalletState();
  if (state.mode === "read-only") {
    return formatToolError(
      "WALLET_READ_ONLY",
      `${toolName} requires an active wallet. Use wallet_generate or import a key first.`
    );
  }
  return null;
}

export async function withToolErrorHandler(
  code: string,
  fn: () => Promise<CallToolResult>
): Promise<CallToolResult> {
  try {
    return await fn();
  } catch (e: unknown) {
    return formatToolError(code, e instanceof Error ? e.message : String(e));
  }
}
