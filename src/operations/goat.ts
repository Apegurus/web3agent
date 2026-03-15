import type { ToolBase, WalletClientBase } from "@goat-sdk/core";
import { Web3AgentError } from "../api/errors.js";
import type {
  CompletedOperationResult,
  GoatToolOperationInput,
  OperationActionResult,
  PreparedOperation,
  ResumeOperationCompletedResult,
} from "../api/types.js";
import { RESTRICTED_PLUGIN_CHAINS } from "../goat/dispatch.js";
import { loadPlugins } from "../goat/plugins.js";
import { buildGoatTools } from "../goat/toolset.js";
import { getRpcUrlForRuntimeChain, getRuntimeConfigForChain } from "./chain-access.js";
import { OperationPauseError, PreparedActionGoatWallet } from "./goat-wallet.js";
import { assertChainSupported } from "./validation.js";

function findRestrictedPlugin(toolName: string): string | undefined {
  const lowerName = toolName.toLowerCase();
  const sortedKeys = Object.keys(RESTRICTED_PLUGIN_CHAINS).sort((a, b) => b.length - a.length);
  for (const pluginKey of sortedKeys) {
    if (lowerName.startsWith(pluginKey.toLowerCase())) {
      return pluginKey;
    }
  }
  return undefined;
}

function assertGoatToolSupportedOnChain(toolName: string, chainId: number): void {
  assertChainSupported(chainId);
  const pluginKey = findRestrictedPlugin(toolName);
  if (!pluginKey) return;

  const availableChains = RESTRICTED_PLUGIN_CHAINS[pluginKey];
  if (!availableChains.includes(chainId)) {
    throw new Web3AgentError({
      code: "TOOL_UNAVAILABLE_ON_CHAIN",
      message: `${toolName} is not available on chain ${chainId}. Available on chains: ${availableChains.join(", ")}`,
      details: { availableChainIds: availableChains },
    });
  }
}

function toCompletedResult(result: unknown): CompletedOperationResult {
  if (result && typeof result === "object" && !Array.isArray(result)) {
    return result as CompletedOperationResult;
  }

  return {
    value: result,
  };
}

function loadGoatPluginsForChain(chainId: number) {
  const config = getRuntimeConfigForChain(chainId);
  return loadPlugins({
    hasWallet: true,
    zeroxApiKey: config.zeroxApiKey,
    coingeckoApiKey: config.coingeckoApiKey,
    rpcUrl: getRpcUrlForRuntimeChain(chainId, config),
  });
}

function createGoatPreparedOperation(params: {
  input: GoatToolOperationInput;
  tool: ToolBase;
  actionResults: Record<string, OperationActionResult>;
  pause: OperationPauseError;
}): PreparedOperation {
  const { input, tool, actionResults, pause } = params;
  return {
    integration: "goat",
    kind: "tool",
    summary: tool.description || `Prepare GOAT tool ${tool.name} on chain ${input.chainId}`,
    actions: [pause.action],
    resumeState: {
      version: 1,
      integration: "goat",
      kind: "tool",
      state: {
        toolName: input.toolName,
        params: input.params ?? {},
        chainId: input.chainId,
        account: input.account,
        actionResults,
      },
    },
    meta: {
      toolName: tool.name,
      description: tool.description,
    },
  };
}

export async function prepareOrResumeGoatOperation(params: {
  input: GoatToolOperationInput;
  actionResults?: Record<string, OperationActionResult>;
}): Promise<PreparedOperation | ResumeOperationCompletedResult> {
  const actionResults = params.actionResults ?? {};
  assertGoatToolSupportedOnChain(params.input.toolName, params.input.chainId);
  const pluginResult = loadGoatPluginsForChain(params.input.chainId);
  const wallet = new PreparedActionGoatWallet({
    account: params.input.account,
    chainId: params.input.chainId,
    actionResults,
  });
  const tools = await buildGoatTools({
    wallet: wallet as unknown as WalletClientBase,
    pluginResult,
  });
  const executableTool = tools.find((candidate) => candidate.name === params.input.toolName);
  if (!executableTool) {
    throw new Web3AgentError({
      code: "UNKNOWN_TOOL",
      message: `Unknown GOAT tool: ${params.input.toolName}`,
    });
  }

  try {
    const parsed = executableTool.parameters.parse(params.input.params ?? {});
    const result = await executableTool.execute(parsed);
    return {
      completed: true,
      integration: "goat",
      kind: "tool",
      result: toCompletedResult(result),
    };
  } catch (error: unknown) {
    if (error instanceof OperationPauseError) {
      return createGoatPreparedOperation({
        input: params.input,
        tool: executableTool,
        actionResults,
        pause: error,
      });
    }

    throw Web3AgentError.fromUnknown("GOAT_TOOL_ERROR", error);
  }
}
