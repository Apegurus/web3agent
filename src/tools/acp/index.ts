import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { createPublicClient, keccak256, toHex, zeroAddress } from "viem";
import type { Hex } from "viem";
import {
  JobStatus,
  erc20ApproveAbi,
  erc8183Abi,
  getAcpAddress,
  getPaymentTokenAddress,
} from "../../acp/contract.js";
import { getChainById } from "../../chains/registry.js";
import { getConfig } from "../../config/env.js";
import { createWalletClientForChain, getTransportForChain } from "../../config/wallet-factory.js";
import type { ToolCategory } from "../../runtime/types.js";
import { formatToolError, formatToolResponse } from "../../utils/errors.js";
import { validateAddress, validateInput } from "../../utils/validation.js";
import { executeWrite } from "../../utils/write.js";
import { registerExecutor } from "../../wallet/confirmation.js";
import { getActiveAccount } from "../../wallet/persistence.js";
import type { ToolDefinition } from "../register.js";
import {
  erc8183ClaimRefundSchema,
  erc8183CompleteJobSchema,
  erc8183CreateJobSchema,
  erc8183FundJobSchema,
  erc8183GetJobSchema,
  erc8183RejectJobSchema,
  erc8183SetBudgetSchema,
  erc8183SubmitJobSchema,
} from "./schemas.js";

const ZERO_BYTES32 = `0x${"0".repeat(64)}` as Hex;

function checkAcpConfigured(): CallToolResult | null {
  const addr = getAcpAddress();
  if (!addr)
    return formatToolError(
      "NOT_CONFIGURED",
      "ACP_CONTRACT_ADDRESS env var required for erc8183_* tools"
    );
  return null;
}

async function acpGetJob(params: Record<string, unknown>): Promise<CallToolResult> {
  const configErr = checkAcpConfigured();
  if (configErr) return configErr;

  const v = validateInput(erc8183GetJobSchema, params);
  if (!v.success) return v.error;

  const acpAddress = getAcpAddress();
  if (!acpAddress) {
    return formatToolError(
      "NOT_CONFIGURED",
      "ACP_CONTRACT_ADDRESS env var required for erc8183_* tools"
    );
  }
  const chainId = v.data.chainId ?? getConfig().chainId;
  const chain = getChainById(chainId);
  if (!chain) return formatToolError("UNSUPPORTED_CHAIN", `Chain ${chainId} not supported`);

  try {
    const publicClient = createPublicClient({ chain, transport: getTransportForChain(chainId) });
    const job = await publicClient.readContract({
      address: acpAddress,
      abi: erc8183Abi,
      functionName: "jobs",
      args: [BigInt(v.data.jobId)],
    });

    const [
      client,
      provider,
      evaluator,
      paymentToken,
      budget,
      expiredAt,
      description,
      status,
      deliverable,
    ] = job as [string, string, string, string, bigint, bigint, string, number, string];

    const statusName = JobStatus[status] ?? String(status);

    return formatToolResponse({
      jobId: v.data.jobId,
      client,
      provider,
      evaluator,
      paymentToken,
      budget: budget.toString(),
      expiredAt: Number(expiredAt),
      description,
      status: statusName,
      deliverable,
    });
  } catch (e: unknown) {
    return formatToolError("ACP_READ_ERROR", e instanceof Error ? e.message : String(e));
  }
}

async function acpCreateJob(params: Record<string, unknown>): Promise<CallToolResult> {
  const configErr = checkAcpConfigured();
  if (configErr) return configErr;

  const v = validateInput(erc8183CreateJobSchema, params);
  if (!v.success) return v.error;
  const { provider, evaluator, description, expiryDuration } = v.data;

  return executeWrite({
    toolName: "erc8183_create_job",
    description: `Create ERC-8183 job: provider=${provider}, evaluator=${evaluator}, expires in ${expiryDuration}s, description=${description}`,
    params: v.data as unknown as Record<string, unknown>,
    executor: executeCreateJob,
  });
}

async function executeCreateJob(params: Record<string, unknown>): Promise<CallToolResult> {
  try {
    const {
      provider,
      evaluator,
      description,
      expiryDuration,
      hook,
      chainId: rawChainId,
    } = params as {
      provider: string;
      evaluator: string;
      description: string;
      expiryDuration: number;
      hook?: string;
      chainId?: number;
    };

    // biome-ignore lint/style/noNonNullAssertion: handler already validated via checkAcpConfigured
    const acpAddress = getAcpAddress()!;
    const chainId = rawChainId ?? getConfig().chainId;
    const chain = getChainById(chainId);
    if (!chain) return formatToolError("UNSUPPORTED_CHAIN", `Chain ${chainId} not supported`);

    const account = getActiveAccount();
    const walletClient = createWalletClientForChain(account, chainId);
    const publicClient = createPublicClient({ chain, transport: getTransportForChain(chainId) });

    const addrErr =
      validateAddress(provider, "provider") ??
      validateAddress(evaluator, "evaluator") ??
      (hook ? validateAddress(hook, "hook") : null);
    if (addrErr) return addrErr;

    const expiredAt = BigInt(Math.floor(Date.now() / 1000) + expiryDuration);
    const hookAddr = (hook ?? zeroAddress) as Hex;

    const hash = await walletClient.writeContract({
      address: acpAddress,
      abi: erc8183Abi,
      functionName: "createJob",
      args: [provider as Hex, evaluator as Hex, expiredAt, description, hookAddr],
      chain,
      account,
    });
    await publicClient.waitForTransactionReceipt({ hash });

    return formatToolResponse({ status: "created", txHash: hash });
  } catch (e: unknown) {
    return formatToolError("ACP_CREATE_ERROR", e instanceof Error ? e.message : String(e));
  }
}

async function acpSetBudget(params: Record<string, unknown>): Promise<CallToolResult> {
  const configErr = checkAcpConfigured();
  if (configErr) return configErr;

  const v = validateInput(erc8183SetBudgetSchema, params);
  if (!v.success) return v.error;

  return executeWrite({
    toolName: "erc8183_set_budget",
    description: `Set ERC-8183 job #${v.data.jobId} budget to ${v.data.amount}`,
    params: v.data as unknown as Record<string, unknown>,
    executor: executeSetBudget,
  });
}

async function executeSetBudget(params: Record<string, unknown>): Promise<CallToolResult> {
  try {
    const {
      jobId,
      amount,
      chainId: rawChainId,
    } = params as {
      jobId: number;
      amount: string;
      chainId?: number;
    };

    // biome-ignore lint/style/noNonNullAssertion: handler already validated via checkAcpConfigured
    const acpAddress = getAcpAddress()!;
    const chainId = rawChainId ?? getConfig().chainId;
    const chain = getChainById(chainId);
    if (!chain) return formatToolError("UNSUPPORTED_CHAIN", `Chain ${chainId} not supported`);

    const account = getActiveAccount();
    const walletClient = createWalletClientForChain(account, chainId);
    const publicClient = createPublicClient({ chain, transport: getTransportForChain(chainId) });

    const hash = await walletClient.writeContract({
      address: acpAddress,
      abi: erc8183Abi,
      functionName: "setBudget",
      args: [BigInt(jobId), BigInt(amount), "0x"],
      chain,
      account,
    });
    await publicClient.waitForTransactionReceipt({ hash });

    return formatToolResponse({ status: "budget_set", jobId, amount, txHash: hash });
  } catch (e: unknown) {
    return formatToolError("ACP_SET_BUDGET_ERROR", e instanceof Error ? e.message : String(e));
  }
}

async function acpFundJob(params: Record<string, unknown>): Promise<CallToolResult> {
  const configErr = checkAcpConfigured();
  if (configErr) return configErr;

  const v = validateInput(erc8183FundJobSchema, params);
  if (!v.success) return v.error;

  const chainId = v.data.chainId ?? getConfig().chainId;
  const paymentToken = getPaymentTokenAddress(chainId);

  return executeWrite({
    toolName: "erc8183_fund_job",
    description: `Fund ERC-8183 job #${v.data.jobId} with ${v.data.expectedBudget} tokens. This will execute up to 2 transactions: (1) approve ${v.data.expectedBudget} ${paymentToken} to ACP contract, (2) fund job escrow. If step 2 fails after step 1 succeeds, retry - the approval will be reused automatically.`,
    params: v.data as unknown as Record<string, unknown>,
    executor: executeFundJob,
  });
}

async function executeFundJob(params: Record<string, unknown>): Promise<CallToolResult> {
  try {
    const {
      jobId,
      expectedBudget,
      chainId: rawChainId,
    } = params as {
      jobId: number;
      expectedBudget: string;
      chainId?: number;
    };

    // biome-ignore lint/style/noNonNullAssertion: handler already validated via checkAcpConfigured
    const acpAddress = getAcpAddress()!;
    const chainId = rawChainId ?? getConfig().chainId;
    const chain = getChainById(chainId);
    if (!chain) return formatToolError("UNSUPPORTED_CHAIN", `Chain ${chainId} not supported`);

    const account = getActiveAccount();
    const walletClient = createWalletClientForChain(account, chainId);
    const publicClient = createPublicClient({ chain, transport: getTransportForChain(chainId) });
    const paymentToken = getPaymentTokenAddress(chainId);
    const amount = BigInt(expectedBudget);

    const allowance = await publicClient.readContract({
      address: paymentToken,
      abi: erc20ApproveAbi,
      functionName: "allowance",
      args: [account.address, acpAddress],
    });

    let approveTxHash: string | undefined;
    // TODO: USDT-style tokens require resetting allowance to 0 before re-approving
    if ((allowance as bigint) < amount) {
      const approveHash = await walletClient.writeContract({
        address: paymentToken,
        abi: erc20ApproveAbi,
        functionName: "approve",
        args: [acpAddress, amount],
        chain,
        account,
      });
      await publicClient.waitForTransactionReceipt({ hash: approveHash });
      approveTxHash = approveHash;
      process.stderr.write(`[acp] Approved ${amount} ${paymentToken} (tx: ${approveHash})\n`);
    }

    const fundHash = await walletClient.writeContract({
      address: acpAddress,
      abi: erc8183Abi,
      functionName: "fund",
      args: [BigInt(jobId), amount, "0x"],
      chain,
      account,
    });
    await publicClient.waitForTransactionReceipt({ hash: fundHash });

    return formatToolResponse({ status: "funded", jobId, txHash: fundHash, approveTxHash });
  } catch (e: unknown) {
    return formatToolError("ACP_FUND_ERROR", e instanceof Error ? e.message : String(e));
  }
}

async function acpSubmitJob(params: Record<string, unknown>): Promise<CallToolResult> {
  const configErr = checkAcpConfigured();
  if (configErr) return configErr;

  const v = validateInput(erc8183SubmitJobSchema, params);
  if (!v.success) return v.error;

  return executeWrite({
    toolName: "erc8183_submit_job",
    description: `Submit ERC-8183 job #${v.data.jobId} deliverable`,
    params: v.data as unknown as Record<string, unknown>,
    executor: executeSubmitJob,
  });
}

async function executeSubmitJob(params: Record<string, unknown>): Promise<CallToolResult> {
  try {
    const {
      jobId,
      deliverable,
      chainId: rawChainId,
    } = params as {
      jobId: number;
      deliverable: string;
      chainId?: number;
    };

    // biome-ignore lint/style/noNonNullAssertion: handler already validated via checkAcpConfigured
    const acpAddress = getAcpAddress()!;
    const chainId = rawChainId ?? getConfig().chainId;
    const chain = getChainById(chainId);
    if (!chain) return formatToolError("UNSUPPORTED_CHAIN", `Chain ${chainId} not supported`);

    const account = getActiveAccount();
    const walletClient = createWalletClientForChain(account, chainId);
    const publicClient = createPublicClient({ chain, transport: getTransportForChain(chainId) });

    const deliverableHash = keccak256(toHex(deliverable));
    const hash = await walletClient.writeContract({
      address: acpAddress,
      abi: erc8183Abi,
      functionName: "submit",
      args: [BigInt(jobId), deliverableHash, "0x"],
      chain,
      account,
    });
    await publicClient.waitForTransactionReceipt({ hash });

    return formatToolResponse({
      status: "submitted",
      jobId,
      deliverable,
      deliverableHash,
      txHash: hash,
    });
  } catch (e: unknown) {
    return formatToolError("ACP_SUBMIT_ERROR", e instanceof Error ? e.message : String(e));
  }
}

async function acpCompleteJob(params: Record<string, unknown>): Promise<CallToolResult> {
  const configErr = checkAcpConfigured();
  if (configErr) return configErr;

  const v = validateInput(erc8183CompleteJobSchema, params);
  if (!v.success) return v.error;

  return executeWrite({
    toolName: "erc8183_complete_job",
    description: `Complete ERC-8183 job #${v.data.jobId}`,
    params: v.data as unknown as Record<string, unknown>,
    executor: executeCompleteJob,
  });
}

async function executeCompleteJob(params: Record<string, unknown>): Promise<CallToolResult> {
  try {
    const {
      jobId,
      reason,
      chainId: rawChainId,
    } = params as {
      jobId: number;
      reason?: string;
      chainId?: number;
    };

    // biome-ignore lint/style/noNonNullAssertion: handler already validated via checkAcpConfigured
    const acpAddress = getAcpAddress()!;
    const chainId = rawChainId ?? getConfig().chainId;
    const chain = getChainById(chainId);
    if (!chain) return formatToolError("UNSUPPORTED_CHAIN", `Chain ${chainId} not supported`);

    const account = getActiveAccount();
    const walletClient = createWalletClientForChain(account, chainId);
    const publicClient = createPublicClient({ chain, transport: getTransportForChain(chainId) });

    const reasonHash = reason ? keccak256(toHex(reason)) : ZERO_BYTES32;
    const hash = await walletClient.writeContract({
      address: acpAddress,
      abi: erc8183Abi,
      functionName: "complete",
      args: [BigInt(jobId), reasonHash, "0x"],
      chain,
      account,
    });
    await publicClient.waitForTransactionReceipt({ hash });

    return formatToolResponse({ status: "completed", jobId, reason, reasonHash, txHash: hash });
  } catch (e: unknown) {
    return formatToolError("ACP_COMPLETE_ERROR", e instanceof Error ? e.message : String(e));
  }
}

async function acpRejectJob(params: Record<string, unknown>): Promise<CallToolResult> {
  const configErr = checkAcpConfigured();
  if (configErr) return configErr;

  const v = validateInput(erc8183RejectJobSchema, params);
  if (!v.success) return v.error;

  return executeWrite({
    toolName: "erc8183_reject_job",
    description: `Reject ERC-8183 job #${v.data.jobId}`,
    params: v.data as unknown as Record<string, unknown>,
    executor: executeRejectJob,
  });
}

async function executeRejectJob(params: Record<string, unknown>): Promise<CallToolResult> {
  try {
    const {
      jobId,
      reason,
      chainId: rawChainId,
    } = params as {
      jobId: number;
      reason?: string;
      chainId?: number;
    };

    // biome-ignore lint/style/noNonNullAssertion: handler already validated via checkAcpConfigured
    const acpAddress = getAcpAddress()!;
    const chainId = rawChainId ?? getConfig().chainId;
    const chain = getChainById(chainId);
    if (!chain) return formatToolError("UNSUPPORTED_CHAIN", `Chain ${chainId} not supported`);

    const account = getActiveAccount();
    const walletClient = createWalletClientForChain(account, chainId);
    const publicClient = createPublicClient({ chain, transport: getTransportForChain(chainId) });

    const reasonHash = reason ? keccak256(toHex(reason)) : ZERO_BYTES32;
    const hash = await walletClient.writeContract({
      address: acpAddress,
      abi: erc8183Abi,
      functionName: "reject",
      args: [BigInt(jobId), reasonHash, "0x"],
      chain,
      account,
    });
    await publicClient.waitForTransactionReceipt({ hash });

    return formatToolResponse({ status: "rejected", jobId, reason, reasonHash, txHash: hash });
  } catch (e: unknown) {
    return formatToolError("ACP_REJECT_ERROR", e instanceof Error ? e.message : String(e));
  }
}

async function acpClaimRefund(params: Record<string, unknown>): Promise<CallToolResult> {
  const configErr = checkAcpConfigured();
  if (configErr) return configErr;

  const v = validateInput(erc8183ClaimRefundSchema, params);
  if (!v.success) return v.error;

  return executeWrite({
    toolName: "erc8183_claim_refund",
    description: `Claim ERC-8183 refund for job #${v.data.jobId}`,
    params: v.data as unknown as Record<string, unknown>,
    executor: executeClaimRefund,
  });
}

async function executeClaimRefund(params: Record<string, unknown>): Promise<CallToolResult> {
  try {
    const { jobId, chainId: rawChainId } = params as {
      jobId: number;
      chainId?: number;
    };

    // biome-ignore lint/style/noNonNullAssertion: handler already validated via checkAcpConfigured
    const acpAddress = getAcpAddress()!;
    const chainId = rawChainId ?? getConfig().chainId;
    const chain = getChainById(chainId);
    if (!chain) return formatToolError("UNSUPPORTED_CHAIN", `Chain ${chainId} not supported`);

    const account = getActiveAccount();
    const walletClient = createWalletClientForChain(account, chainId);
    const publicClient = createPublicClient({ chain, transport: getTransportForChain(chainId) });

    const hash = await walletClient.writeContract({
      address: acpAddress,
      abi: erc8183Abi,
      functionName: "claimRefund",
      args: [BigInt(jobId)],
      chain,
      account,
    });
    await publicClient.waitForTransactionReceipt({ hash });

    return formatToolResponse({ status: "refund_claimed", jobId, txHash: hash });
  } catch (e: unknown) {
    return formatToolError("ACP_CLAIM_REFUND_ERROR", e instanceof Error ? e.message : String(e));
  }
}

export function getErc8183ToolDefinitions(): ToolDefinition[] {
  return [
    {
      name: "erc8183_create_job",
      category: "agenticEconomy" as ToolCategory,
      description: "Create an ERC-8183 job.",
      inputSchema: {
        type: "object" as const,
        properties: {
          provider: { type: "string", description: "Provider wallet address" },
          evaluator: { type: "string", description: "Evaluator wallet address" },
          description: { type: "string", description: "Job description" },
          expiryDuration: { type: "number", description: "Job expiry in seconds from now" },
          hook: { type: "string", description: "Hook address (default zero address)" },
          chainId: { type: "number", description: "Optional chain ID override" },
        },
        required: ["provider", "evaluator", "description", "expiryDuration"],
      },
      handler: acpCreateJob,
      annotations: { destructiveHint: true, openWorldHint: true },
    },
    {
      name: "erc8183_set_budget",
      category: "agenticEconomy" as ToolCategory,
      description: "Set ERC-8183 job budget in payment token smallest units.",
      inputSchema: {
        type: "object" as const,
        properties: {
          jobId: { type: "number", description: "Job ID" },
          amount: { type: "string", description: "Budget amount in token smallest units" },
          chainId: { type: "number", description: "Optional chain ID override" },
        },
        required: ["jobId", "amount"],
      },
      handler: acpSetBudget,
      annotations: { destructiveHint: true, openWorldHint: true },
    },
    {
      name: "erc8183_fund_job",
      category: "agenticEconomy" as ToolCategory,
      description:
        "Fund ERC-8183 job escrow. Performs allowance check + approve if needed, then funds in one confirmation flow.",
      inputSchema: {
        type: "object" as const,
        properties: {
          jobId: { type: "number", description: "Job ID" },
          expectedBudget: {
            type: "string",
            description: "Expected budget amount in token smallest units",
          },
          chainId: { type: "number", description: "Optional chain ID override" },
        },
        required: ["jobId", "expectedBudget"],
      },
      handler: acpFundJob,
      annotations: { destructiveHint: true, openWorldHint: true },
    },
    {
      name: "erc8183_submit_job",
      category: "agenticEconomy" as ToolCategory,
      description: "Submit job deliverable hash for an ERC-8183 job.",
      inputSchema: {
        type: "object" as const,
        properties: {
          jobId: { type: "number", description: "Job ID" },
          deliverable: {
            type: "string",
            description: "Deliverable description (will be keccak256 hashed)",
          },
          chainId: { type: "number", description: "Optional chain ID override" },
        },
        required: ["jobId", "deliverable"],
      },
      handler: acpSubmitJob,
      annotations: { destructiveHint: true, openWorldHint: true },
    },
    {
      name: "erc8183_complete_job",
      category: "agenticEconomy" as ToolCategory,
      description: "Complete an ERC-8183 job and release escrow.",
      inputSchema: {
        type: "object" as const,
        properties: {
          jobId: { type: "number", description: "Job ID" },
          reason: { type: "string", description: "Completion reason" },
          chainId: { type: "number", description: "Optional chain ID override" },
        },
        required: ["jobId"],
      },
      handler: acpCompleteJob,
      annotations: { destructiveHint: true, openWorldHint: true },
    },
    {
      name: "erc8183_reject_job",
      category: "agenticEconomy" as ToolCategory,
      description: "Reject an ERC-8183 job.",
      inputSchema: {
        type: "object" as const,
        properties: {
          jobId: { type: "number", description: "Job ID" },
          reason: { type: "string", description: "Rejection reason" },
          chainId: { type: "number", description: "Optional chain ID override" },
        },
        required: ["jobId"],
      },
      handler: acpRejectJob,
      annotations: { destructiveHint: true, openWorldHint: true },
    },
    {
      name: "erc8183_claim_refund",
      category: "agenticEconomy" as ToolCategory,
      description: "Claim refund from an expired/rejected ERC-8183 job.",
      inputSchema: {
        type: "object" as const,
        properties: {
          jobId: { type: "number", description: "Job ID" },
          chainId: { type: "number", description: "Optional chain ID override" },
        },
        required: ["jobId"],
      },
      handler: acpClaimRefund,
      annotations: { destructiveHint: true, openWorldHint: true },
    },
    {
      name: "erc8183_get_job",
      category: "agenticEconomy" as ToolCategory,
      description: "Read ERC-8183 job details by ID.",
      inputSchema: {
        type: "object" as const,
        properties: {
          jobId: { type: "number", description: "Job ID" },
          chainId: { type: "number", description: "Optional chain ID override" },
        },
        required: ["jobId"],
      },
      handler: acpGetJob,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
  ];
}

export function registerErc8183Executors(): void {
  registerExecutor("erc8183_create_job", executeCreateJob);
  registerExecutor("erc8183_set_budget", executeSetBudget);
  registerExecutor("erc8183_fund_job", executeFundJob);
  registerExecutor("erc8183_submit_job", executeSubmitJob);
  registerExecutor("erc8183_complete_job", executeCompleteJob);
  registerExecutor("erc8183_reject_job", executeRejectJob);
  registerExecutor("erc8183_claim_refund", executeClaimRefund);
}
