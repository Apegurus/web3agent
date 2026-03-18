import type { ToolDefinition } from "../register.js";
import { getAccountToolDefinitions } from "./handlers/accounts.js";
import { getBlockToolDefinitions } from "./handlers/blocks.js";
import { getContractToolDefinitions } from "./handlers/contracts.js";
import { getEventToolDefinitions } from "./handlers/events.js";
import { getNetworkToolDefinitions } from "./handlers/network.js";
import type { ExplorerDeps } from "./handlers/shared.js";
import { getTokenToolDefinitions } from "./handlers/tokens.js";
import { getTransactionToolDefinitions } from "./handlers/transactions.js";

export type { ExplorerDeps };

export function getExplorerToolDefinitions(deps: ExplorerDeps): ToolDefinition[] {
  return [
    ...getAccountToolDefinitions(deps),
    ...getTransactionToolDefinitions(deps),
    ...getTokenToolDefinitions(deps),
    ...getContractToolDefinitions(deps),
    ...getBlockToolDefinitions(deps),
    ...getEventToolDefinitions(deps),
    ...getNetworkToolDefinitions(deps),
  ];
}
