import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { createPublicClient } from "viem";
import { getChainById } from "../../chains/registry.js";
import { getConfig } from "../../config/env.js";
import { createWalletClientForChain, getTransportForChain } from "../../config/wallet-factory.js";
import {
  getIdentityAddress,
  getReputationAddress,
  identityRegistryAbi,
  reputationRegistryAbi,
} from "../../erc8004/contract.js";
import { buildRegistrationJson, validateRegistrationJson } from "../../erc8004/registration.js";
import type { ToolCategory } from "../../runtime/types.js";
import { formatToolError, formatToolResponse } from "../../utils/errors.js";
import { validateInput } from "../../utils/validation.js";
import { executeWrite } from "../../utils/write.js";
import { registerExecutor } from "../../wallet/confirmation.js";
import { getActiveAccount, getWalletState } from "../../wallet/persistence.js";
import type { ToolDefinition } from "../register.js";
import {
  erc8004GetAgentSchema,
  erc8004GetFeedbackSchema,
  erc8004RegisterSchema,
  erc8004SubmitFeedbackSchema,
  erc8004UpdateAgentSchema,
} from "./schemas.js";

function requireIdentityAddress(chainId: number): { address: `0x${string}` } | CallToolResult {
  const address = getIdentityAddress(chainId);
  if (!address) {
    return formatToolError(
      "NOT_CONFIGURED",
      `ERC-8004 Identity Registry not deployed on chain ${chainId}. Use Base (8453) or Base Sepolia (84532).`
    );
  }
  return { address };
}

function requireReputationAddress(chainId: number): { address: `0x${string}` } | CallToolResult {
  const address = getReputationAddress(chainId);
  if (!address) {
    return formatToolError(
      "NOT_CONFIGURED",
      `ERC-8004 Reputation Registry not deployed on chain ${chainId}. Use Base (8453) or Base Sepolia (84532).`
    );
  }
  return { address };
}

function isCallToolResult(value: unknown): value is CallToolResult {
  return typeof value === "object" && value !== null && "content" in value;
}

function toHttpUri(uri: string): string {
  if (uri.startsWith("ipfs://")) {
    return `https://gateway.pinata.cloud/ipfs/${uri.slice("ipfs://".length)}`;
  }
  return uri;
}

async function pinToIpfs(json: object, label: string, pinataJwt: string): Promise<string> {
  const response = await fetch("https://api.pinata.cloud/pinning/pinJSONToIPFS", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${pinataJwt}`,
    },
    body: JSON.stringify({
      pinataContent: json,
      pinataMetadata: { name: label },
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Pinata API error ${response.status}: ${text}`);
  }

  const result = (await response.json()) as { IpfsHash: string };
  return `ipfs://${result.IpfsHash}`;
}

async function fetchRegistrationJson(agentURI: string): Promise<Record<string, unknown>> {
  const response = await fetch(toHttpUri(agentURI));
  if (!response.ok) {
    throw new Error(`Failed to fetch existing agentURI (${response.status})`);
  }
  const json = (await response.json()) as unknown;
  if (typeof json !== "object" || json === null) {
    throw new Error("Existing registration JSON is not an object");
  }
  return json as Record<string, unknown>;
}

async function erc8004RegisterAgent(params: Record<string, unknown>): Promise<CallToolResult> {
  const v = validateInput(erc8004RegisterSchema, params);
  if (!v.success) return v.error;

  const chainId = v.data.chainId ?? getConfig().chainId;
  const addrResult = requireIdentityAddress(chainId);
  if (isCallToolResult(addrResult)) return addrResult;

  if (!v.data.agentURI) {
    const pinataJwt = getConfig().pinataJwt;
    if (!pinataJwt) {
      return formatToolError(
        "MISSING_IPFS_CONFIG",
        "Provide agentURI parameter with a pre-hosted URL, or set PINATA_JWT env var for automatic IPFS pinning"
      );
    }
  }

  return executeWrite({
    toolName: "erc8004_register_agent",
    description: `Register agent \"${v.data.name}\" on ERC-8004 Identity Registry (chain ${chainId})`,
    params: v.data as unknown as Record<string, unknown>,
    executor: executeRegisterAgent,
  });
}

async function executeRegisterAgent(params: Record<string, unknown>): Promise<CallToolResult> {
  try {
    const {
      name,
      description,
      mcpEndpoint,
      services,
      agentURI: providedAgentURI,
      chainId: rawChainId,
    } = params as {
      name: string;
      description: string;
      mcpEndpoint?: string;
      services?: Array<{ name: string; endpoint: string; version?: string }>;
      agentURI?: string;
      chainId?: number;
    };

    const config = getConfig();
    const chainId = rawChainId ?? config.chainId;
    const chain = getChainById(chainId);
    if (!chain) return formatToolError("UNSUPPORTED_CHAIN", `Chain ${chainId} not supported`);

    const account = getActiveAccount();
    const publicClient = createPublicClient({ chain, transport: getTransportForChain(chainId) });
    const identityAddress = getIdentityAddress(chainId);
    if (!identityAddress) {
      return formatToolError(
        "NOT_CONFIGURED",
        `ERC-8004 Identity Registry not deployed on chain ${chainId}. Use Base (8453) or Base Sepolia (84532).`
      );
    }

    const existingTokenId = (await publicClient.readContract({
      address: identityAddress,
      abi: identityRegistryAbi,
      functionName: "addressToTokenId",
      args: [account.address],
    })) as bigint;
    if (existingTokenId > 0n) {
      return formatToolError(
        "ALREADY_REGISTERED",
        `This wallet is already registered as agent #${existingTokenId}. Use erc8004_update_agent to update.`
      );
    }

    let agentURI: string;
    if (providedAgentURI) {
      agentURI = providedAgentURI;
    } else {
      const mcpEndpointResolved = mcpEndpoint ?? config.mcpEndpointUrl;
      const registrationJson = buildRegistrationJson({
        name,
        description,
        mcpEndpoint: mcpEndpointResolved,
        services,
      });

      const validation = validateRegistrationJson(registrationJson);
      if (!validation.valid) {
        return formatToolError(
          "INVALID_REGISTRATION",
          `Registration JSON invalid: ${validation.errors.join(", ")}`
        );
      }

      const pinataJwt = config.pinataJwt;
      if (!pinataJwt) {
        return formatToolError(
          "MISSING_IPFS_CONFIG",
          "Provide agentURI parameter with a pre-hosted URL, or set PINATA_JWT env var for automatic IPFS pinning"
        );
      }

      agentURI = await pinToIpfs(registrationJson, `erc8004-agent-${account.address}`, pinataJwt);
    }

    const walletClient = createWalletClientForChain(account, chainId);
    const txHash = await walletClient.writeContract({
      address: identityAddress,
      abi: identityRegistryAbi,
      functionName: "register",
      args: [agentURI],
      chain,
      account,
    });

    await publicClient.waitForTransactionReceipt({ hash: txHash });

    const registeredTokenId = (await publicClient.readContract({
      address: identityAddress,
      abi: identityRegistryAbi,
      functionName: "addressToTokenId",
      args: [account.address],
    })) as bigint;

    return formatToolResponse({
      status: "registered",
      agentId: registeredTokenId.toString(),
      agentURI,
      txHash,
    });
  } catch (e: unknown) {
    return formatToolError("ERC8004_REGISTER_ERROR", String(e));
  }
}

async function erc8004GetAgent(params: Record<string, unknown>): Promise<CallToolResult> {
  const v = validateInput(erc8004GetAgentSchema, params);
  if (!v.success) return v.error;

  const chainId = v.data.chainId ?? getConfig().chainId;
  const addrResult = requireIdentityAddress(chainId);
  if (isCallToolResult(addrResult)) return addrResult;
  const identityAddress = addrResult.address;

  const chain = getChainById(chainId);
  if (!chain) return formatToolError("UNSUPPORTED_CHAIN", `Chain ${chainId} not supported`);

  try {
    const publicClient = createPublicClient({ chain, transport: getTransportForChain(chainId) });

    let agentId: bigint;
    if (v.data.agentId !== undefined) {
      agentId = BigInt(v.data.agentId);
    } else {
      agentId = (await publicClient.readContract({
        address: identityAddress,
        abi: identityRegistryAbi,
        functionName: "addressToTokenId",
        args: [v.data.walletAddress as `0x${string}`],
      })) as bigint;

      if (agentId === 0n) {
        return formatToolResponse({
          registered: false,
          message: "This address has no registered agent",
        });
      }
    }

    const [owner, agentURI] = (await publicClient.readContract({
      address: identityAddress,
      abi: identityRegistryAbi,
      functionName: "getAgent",
      args: [agentId],
    })) as [string, string];

    return formatToolResponse({
      agentId: agentId.toString(),
      owner,
      agentURI,
    });
  } catch (e: unknown) {
    return formatToolError("ERC8004_READ_ERROR", String(e));
  }
}

async function erc8004UpdateAgent(params: Record<string, unknown>): Promise<CallToolResult> {
  const v = validateInput(erc8004UpdateAgentSchema, params);
  if (!v.success) return v.error;

  const chainId = v.data.chainId ?? getConfig().chainId;
  const addrResult = requireIdentityAddress(chainId);
  if (isCallToolResult(addrResult)) return addrResult;

  if (!v.data.agentURI) {
    const pinataJwt = getConfig().pinataJwt;
    if (!pinataJwt) {
      return formatToolError(
        "MISSING_IPFS_CONFIG",
        "Provide agentURI parameter with a pre-hosted URL, or set PINATA_JWT env var for automatic IPFS pinning"
      );
    }
  }

  return executeWrite({
    toolName: "erc8004_update_agent",
    description: `Update ERC-8004 agent #${v.data.agentId} (chain ${chainId})`,
    params: v.data as unknown as Record<string, unknown>,
    executor: executeUpdateAgent,
  });
}

async function executeUpdateAgent(params: Record<string, unknown>): Promise<CallToolResult> {
  try {
    const {
      agentId,
      name,
      description,
      mcpEndpoint,
      services,
      agentURI: providedAgentURI,
      chainId: rawChainId,
    } = params as {
      agentId: number;
      name?: string;
      description?: string;
      mcpEndpoint?: string;
      services?: Array<{ name: string; endpoint: string; version?: string }>;
      agentURI?: string;
      chainId?: number;
    };

    const config = getConfig();
    const chainId = rawChainId ?? config.chainId;
    const chain = getChainById(chainId);
    if (!chain) return formatToolError("UNSUPPORTED_CHAIN", `Chain ${chainId} not supported`);

    const identityAddress = getIdentityAddress(chainId);
    if (!identityAddress) {
      return formatToolError(
        "NOT_CONFIGURED",
        `ERC-8004 Identity Registry not deployed on chain ${chainId}. Use Base (8453) or Base Sepolia (84532).`
      );
    }

    const account = getActiveAccount();
    const publicClient = createPublicClient({ chain, transport: getTransportForChain(chainId) });

    const [owner, currentAgentURI] = (await publicClient.readContract({
      address: identityAddress,
      abi: identityRegistryAbi,
      functionName: "getAgent",
      args: [BigInt(agentId)],
    })) as [string, string];

    if (owner.toLowerCase() !== account.address.toLowerCase()) {
      return formatToolError(
        "UNAUTHORIZED",
        `Wallet ${account.address} does not own agent #${agentId}. Owner is ${owner}.`
      );
    }

    let newAgentURI: string;
    if (providedAgentURI) {
      newAgentURI = providedAgentURI;
    } else {
      const existingRegistration = await fetchRegistrationJson(currentAgentURI);
      const resolvedName =
        name ?? (typeof existingRegistration.name === "string" ? existingRegistration.name : "");
      const resolvedDescription =
        description ??
        (typeof existingRegistration.description === "string"
          ? existingRegistration.description
          : "");

      const existingServices = Array.isArray(existingRegistration.services)
        ? (existingRegistration.services as Array<{
            name: string;
            endpoint: string;
            version?: string;
          }>)
        : undefined;

      const mcpEndpointResolved = mcpEndpoint ?? config.mcpEndpointUrl;
      const registrationJson = buildRegistrationJson({
        name: resolvedName,
        description: resolvedDescription,
        mcpEndpoint: mcpEndpointResolved,
        services: services ?? existingServices,
      });

      const validation = validateRegistrationJson(registrationJson);
      if (!validation.valid) {
        return formatToolError(
          "INVALID_REGISTRATION",
          `Registration JSON invalid: ${validation.errors.join(", ")}`
        );
      }

      const pinataJwt = config.pinataJwt;
      if (!pinataJwt) {
        return formatToolError(
          "MISSING_IPFS_CONFIG",
          "Provide agentURI parameter with a pre-hosted URL, or set PINATA_JWT env var for automatic IPFS pinning"
        );
      }

      newAgentURI = await pinToIpfs(
        registrationJson,
        `erc8004-agent-${account.address}`,
        pinataJwt
      );
    }

    const walletClient = createWalletClientForChain(account, chainId);
    const txHash = await walletClient.writeContract({
      address: identityAddress,
      abi: identityRegistryAbi,
      functionName: "setAgentURI",
      args: [BigInt(agentId), newAgentURI],
      chain,
      account,
    });

    await publicClient.waitForTransactionReceipt({ hash: txHash });

    return formatToolResponse({
      status: "updated",
      agentId: String(agentId),
      agentURI: newAgentURI,
      txHash,
    });
  } catch (e: unknown) {
    return formatToolError("ERC8004_UPDATE_ERROR", String(e));
  }
}

async function erc8004SubmitFeedback(params: Record<string, unknown>): Promise<CallToolResult> {
  const v = validateInput(erc8004SubmitFeedbackSchema, params);
  if (!v.success) return v.error;

  const chainId = v.data.chainId ?? getConfig().chainId;
  const addrResult = requireReputationAddress(chainId);
  if (isCallToolResult(addrResult)) return addrResult;

  return executeWrite({
    toolName: "erc8004_submit_feedback",
    description: `Submit feedback for agent #${v.data.agentId} on chain ${chainId}`,
    params: v.data as unknown as Record<string, unknown>,
    executor: executeSubmitFeedback,
  });
}

async function executeSubmitFeedback(params: Record<string, unknown>): Promise<CallToolResult> {
  try {
    const {
      agentId,
      value,
      tag1,
      tag2,
      endpoint,
      feedbackDescription,
      chainId: rawChainId,
    } = params as {
      agentId: number;
      value: number;
      tag1?: string;
      tag2?: string;
      endpoint?: string;
      feedbackDescription?: string;
      chainId?: number;
    };

    const chainId = rawChainId ?? getConfig().chainId;
    const chain = getChainById(chainId);
    if (!chain) return formatToolError("UNSUPPORTED_CHAIN", `Chain ${chainId} not supported`);

    const reputationAddress = getReputationAddress(chainId);
    if (!reputationAddress) {
      return formatToolError(
        "NOT_CONFIGURED",
        `ERC-8004 Reputation Registry not deployed on chain ${chainId}. Use Base (8453) or Base Sepolia (84532).`
      );
    }

    const account = getActiveAccount();
    const walletClient = createWalletClientForChain(account, chainId);
    const publicClient = createPublicClient({ chain, transport: getTransportForChain(chainId) });
    const zeroBytes32 = `0x${"0".repeat(64)}` as `0x${string}`;

    const txHash = await walletClient.writeContract({
      address: reputationAddress,
      abi: reputationRegistryAbi,
      functionName: "giveFeedback",
      args: [
        BigInt(agentId),
        BigInt(value),
        0,
        tag1 ?? "",
        tag2 ?? "",
        endpoint ?? "",
        "",
        zeroBytes32,
      ],
      chain,
      account,
    });
    await publicClient.waitForTransactionReceipt({ hash: txHash });

    return formatToolResponse({
      status: "feedback_submitted",
      agentId: String(agentId),
      value,
      tag1: tag1 ?? "",
      tag2: tag2 ?? "",
      endpoint: endpoint ?? "",
      feedbackDescription: feedbackDescription ?? "",
      txHash,
    });
  } catch (e: unknown) {
    return formatToolError("ERC8004_FEEDBACK_ERROR", String(e));
  }
}

async function erc8004GetFeedback(params: Record<string, unknown>): Promise<CallToolResult> {
  const v = validateInput(erc8004GetFeedbackSchema, params);
  if (!v.success) return v.error;

  const chainId = v.data.chainId ?? getConfig().chainId;
  const addrResult = requireReputationAddress(chainId);
  if (isCallToolResult(addrResult)) return addrResult;
  const reputationAddress = addrResult.address;

  const chain = getChainById(chainId);
  if (!chain) return formatToolError("UNSUPPORTED_CHAIN", `Chain ${chainId} not supported`);

  try {
    const publicClient = createPublicClient({ chain, transport: getTransportForChain(chainId) });
    const summary = (await publicClient.readContract({
      address: reputationAddress,
      abi: reputationRegistryAbi,
      functionName: "getSummary",
      args: [BigInt(v.data.agentId), [], v.data.tag1 ?? "", v.data.tag2 ?? ""],
    })) as [bigint, bigint, number];

    return formatToolResponse({
      agentId: String(v.data.agentId),
      tag1: v.data.tag1 ?? "",
      tag2: v.data.tag2 ?? "",
      count: summary[0].toString(),
      value: summary[1].toString(),
      decimals: summary[2],
    });
  } catch (e: unknown) {
    return formatToolError("ERC8004_FEEDBACK_READ_ERROR", String(e));
  }
}

const CATEGORY: ToolCategory = "agenticEconomy";

export function getErc8004ToolDefinitions(): ToolDefinition[] {
  return [
    {
      name: "erc8004_register_agent",
      category: CATEGORY,
      description:
        "Register an agent on the ERC-8004 Identity Registry (write operation, wallet + confirmation required).",
      inputSchema: {
        type: "object" as const,
        properties: {
          name: { type: "string", description: "Agent name" },
          description: { type: "string", description: "Agent description" },
          mcpEndpoint: {
            type: "string",
            description: "MCP endpoint URL (or use MCP_ENDPOINT_URL env var)",
          },
          services: {
            type: "array",
            description: "Additional services offered",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                endpoint: { type: "string" },
                version: { type: "string" },
              },
              required: ["name", "endpoint"],
            },
          },
          agentURI: {
            type: "string",
            description: "Pre-hosted registration JSON URI (bypasses IPFS auto-pin)",
          },
          chainId: { type: "number", description: "Target chain ID (default from runtime config)" },
        },
        required: ["name", "description"],
      },
      handler: erc8004RegisterAgent,
      annotations: { destructiveHint: true, openWorldHint: true },
    },
    {
      name: "erc8004_get_agent",
      category: CATEGORY,
      description: "Get ERC-8004 agent identity by token ID or wallet address.",
      inputSchema: {
        type: "object" as const,
        properties: {
          agentId: { type: "number", description: "Agent token ID" },
          walletAddress: {
            type: "string",
            description: "Agent wallet address (alternative to agentId)",
          },
          chainId: { type: "number", description: "Target chain ID (default from runtime config)" },
        },
        required: [],
      },
      handler: erc8004GetAgent,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    {
      name: "erc8004_update_agent",
      category: CATEGORY,
      description:
        "Update ERC-8004 agent metadata URI (write operation, wallet + confirmation required).",
      inputSchema: {
        type: "object" as const,
        properties: {
          agentId: { type: "number", description: "Agent token ID to update" },
          name: { type: "string", description: "Updated agent name" },
          description: { type: "string", description: "Updated agent description" },
          mcpEndpoint: { type: "string", description: "Updated MCP endpoint URL" },
          services: {
            type: "array",
            description: "Updated services array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                endpoint: { type: "string" },
                version: { type: "string" },
              },
              required: ["name", "endpoint"],
            },
          },
          agentURI: { type: "string", description: "Pre-hosted URI (bypasses IPFS auto-pin)" },
          chainId: { type: "number", description: "Target chain ID (default from runtime config)" },
        },
        required: ["agentId"],
      },
      handler: erc8004UpdateAgent,
      annotations: { destructiveHint: true, openWorldHint: true },
    },
    {
      name: "erc8004_submit_feedback",
      category: CATEGORY,
      description:
        "Submit reputation feedback for an ERC-8004 agent (write operation, wallet + confirmation required).",
      inputSchema: {
        type: "object" as const,
        properties: {
          agentId: { type: "number", description: "Agent token ID" },
          value: { type: "number", description: "Feedback value from -100 to +100" },
          tag1: { type: "string", description: "Feedback tag 1" },
          tag2: { type: "string", description: "Feedback tag 2" },
          endpoint: { type: "string", description: "Service endpoint this feedback refers to" },
          feedbackDescription: {
            type: "string",
            description: "Human-readable feedback text",
          },
          chainId: { type: "number", description: "Target chain ID (default from runtime config)" },
        },
        required: ["agentId", "value"],
      },
      handler: erc8004SubmitFeedback,
      annotations: { destructiveHint: true, openWorldHint: true },
    },
    {
      name: "erc8004_get_feedback",
      category: CATEGORY,
      description:
        "Get aggregate ERC-8004 reputation summary for an agent with optional tag filters.",
      inputSchema: {
        type: "object" as const,
        properties: {
          agentId: { type: "number", description: "Agent token ID" },
          tag1: { type: "string", description: "Optional tag1 filter" },
          tag2: { type: "string", description: "Optional tag2 filter" },
          chainId: { type: "number", description: "Target chain ID (default from runtime config)" },
        },
        required: ["agentId"],
      },
      handler: erc8004GetFeedback,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
  ];
}

export function registerErc8004Executors(): void {
  registerExecutor("erc8004_register_agent", executeRegisterAgent);
  registerExecutor("erc8004_update_agent", executeUpdateAgent);
  registerExecutor("erc8004_submit_feedback", executeSubmitFeedback);

  const walletState = getWalletState();
  if (walletState.address) {
    process.stderr.write(
      `[erc8004] Registered write executors for wallet ${walletState.address} on chain ${walletState.chainId}\n`
    );
  }
}
