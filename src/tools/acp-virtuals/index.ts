import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { Hex } from "viem";
import { createPublicClient } from "viem";
import {
  AcpMemoType,
  AcpPhase,
  acpRouterV2Abi,
  erc20ApproveAbi,
  getAcpRouterAddress,
  getPaymentTokenAddress,
  resolvePendingMemo,
} from "../../acp/virtuals-contract.js";
import { getChainById } from "../../chains/registry.js";
import { getConfig } from "../../config/env.js";
import { createWalletClientForChain, getTransportForChain } from "../../config/wallet-factory.js";
import type { ToolCategory } from "../../runtime/types.js";
import { formatToolError, formatToolResponse } from "../../utils/errors.js";
import { validateAddress, validateInput } from "../../utils/validation.js";
import { executeWrite } from "../../utils/write.js";
import { registerExecutor } from "../../wallet/confirmation.js";
import { getActiveAccount, getWalletState } from "../../wallet/persistence.js";
import type { ToolDefinition } from "../register.js";
import {
  acpVClaimRefundSchema,
  acpVCompleteJobSchema,
  acpVCreateJobSchema,
  acpVFundJobSchema,
  acpVGetJobSchema,
  acpVRejectJobSchema,
  acpVSetBudgetSchema,
  acpVSubmitJobSchema,
} from "./schemas.js";

function checkChainSupport(chainId: number): CallToolResult | null {
  const addr = getAcpRouterAddress(chainId);
  if (!addr) {
    return formatToolError(
      "UNSUPPORTED_CHAIN",
      `Virtuals ACP not deployed on chain ${chainId}. Use Base (8453) or Base Sepolia (84532).`
    );
  }
  return null;
}

function ensureWritable(toolName: string): CallToolResult | null {
  const walletState = getWalletState();
  if (walletState.mode === "read-only") {
    return formatToolError(
      "WALLET_READ_ONLY",
      `${toolName} requires an active wallet. Use wallet_generate or import a key first.`
    );
  }
  return null;
}

async function acpGetJob(params: Record<string, unknown>): Promise<CallToolResult> {
  const v = validateInput(acpVGetJobSchema, params);
  if (!v.success) return v.error;

  const chainId = v.data.chainId ?? getConfig().chainId;
  const chainErr = checkChainSupport(chainId);
  if (chainErr) return chainErr;

  const acpAddress = getAcpRouterAddress(chainId);
  if (!acpAddress) {
    return formatToolError(
      "UNSUPPORTED_CHAIN",
      `Virtuals ACP not deployed on chain ${chainId}. Use Base (8453) or Base Sepolia (84532).`
    );
  }
  const chain = getChainById(chainId);
  if (!chain) return formatToolError("UNSUPPORTED_CHAIN", `Chain ${chainId} not supported`);

  try {
    const publicClient = createPublicClient({ chain, transport: getTransportForChain(chainId) });

    const jobResult = await publicClient.readContract({
      address: acpAddress,
      abi: acpRouterV2Abi,
      functionName: "jobs",
      args: [BigInt(v.data.jobId)],
    });
    const [
      id,
      client,
      provider,
      expiredAt,
      budget,
      phase,
      jobMemoCount,
      evaluatorCount,
      paymentToken,
      evaluator,
    ] = jobResult as [
      bigint,
      string,
      string,
      bigint,
      bigint,
      number,
      bigint,
      bigint,
      string,
      string,
    ];

    const limit = BigInt(v.data.memoLimit ?? 100);
    type V2MemoTuple = {
      id: bigint;
      sender: string;
      content: string;
      memoType: number;
      nextPhase: number;
      isApproved: boolean;
      requiresApproval: boolean;
      isSecured: boolean;
      createdAt: bigint;
    };
    const [memoList, totalCount] = (await publicClient.readContract({
      address: acpAddress,
      abi: acpRouterV2Abi,
      functionName: "getAllMemos",
      args: [BigInt(v.data.jobId), 0n, limit],
    })) as readonly [readonly V2MemoTuple[], bigint];

    const phaseName = AcpPhase[phase] ?? String(phase);

    const formattedMemos = memoList.map((m) => ({
      memoId: String(m.id),
      sender: m.sender,
      content: m.content,
      memoType: AcpMemoType[m.memoType] ?? String(m.memoType),
      nextPhase: AcpPhase[m.nextPhase] ?? String(m.nextPhase),
      isApproved: m.isApproved,
      requiresApproval: m.requiresApproval,
      isSecured: m.isSecured,
      createdAt: Number(m.createdAt),
    }));

    const pendingMemos = formattedMemos.filter((m) => m.requiresApproval && !m.isApproved);

    return formatToolResponse({
      jobId: v.data.jobId,
      id: id.toString(),
      phase: phaseName,
      client,
      provider,
      evaluator,
      paymentToken,
      budget: budget.toString(),
      expiredAt: Number(expiredAt),
      jobMemoCount: Number(jobMemoCount),
      evaluatorCount: Number(evaluatorCount),
      memoCount: Number(totalCount),
      memos: formattedMemos,
      pendingMemos,
    });
  } catch (e: unknown) {
    return formatToolError("ACP_READ_ERROR", e instanceof Error ? e.message : String(e));
  }
}

async function acpCreateJob(params: Record<string, unknown>): Promise<CallToolResult> {
  const v = validateInput(acpVCreateJobSchema, params);
  if (!v.success) return v.error;

  const chainId = v.data.chainId ?? getConfig().chainId;
  const chainErr = checkChainSupport(chainId);
  if (chainErr) return chainErr;

  return executeWrite({
    toolName: "acp_create_job",
    description: `Create ACP job on Virtuals: provider=${v.data.provider}, expires in ${v.data.expiryDuration}s`,
    params: v.data as unknown as Record<string, unknown>,
    executor: executeCreateJob,
  });
}

async function executeCreateJob(params: Record<string, unknown>): Promise<CallToolResult> {
  const walletErr = ensureWritable("acp_create_job");
  if (walletErr) return walletErr;

  try {
    const {
      provider,
      evaluator,
      description,
      expiryDuration,
      paymentToken: rawPaymentToken,
      budget: rawBudget,
      chainId: rawChainId,
    } = params as {
      provider: string;
      evaluator: string;
      description: string;
      expiryDuration: number;
      paymentToken?: string;
      budget?: string;
      chainId?: number;
    };

    const chainId = rawChainId ?? getConfig().chainId;
    // biome-ignore lint/style/noNonNullAssertion: handler already validated chain support via checkChainSupport
    const acpAddress = getAcpRouterAddress(chainId)!;
    const chain = getChainById(chainId);
    if (!chain) return formatToolError("UNSUPPORTED_CHAIN", `Chain ${chainId} not supported`);

    const account = getActiveAccount();
    const walletClient = createWalletClientForChain(account, chainId);
    const publicClient = createPublicClient({ chain, transport: getTransportForChain(chainId) });

    const addrErr =
      validateAddress(provider, "provider") ??
      validateAddress(evaluator, "evaluator") ??
      (rawPaymentToken ? validateAddress(rawPaymentToken, "paymentToken") : null);
    if (addrErr) return addrErr;

    const expiredAt = BigInt(Math.floor(Date.now() / 1000) + expiryDuration);
    const paymentToken = (rawPaymentToken ?? getPaymentTokenAddress(chainId)) as Hex;
    const budget = rawBudget ? BigInt(rawBudget) : 0n;

    const hash = await walletClient.writeContract({
      address: acpAddress,
      abi: acpRouterV2Abi,
      functionName: "createJob",
      args: [provider as Hex, evaluator as Hex, expiredAt, paymentToken, budget, description],
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
  const v = validateInput(acpVSetBudgetSchema, params);
  if (!v.success) return v.error;

  const chainId = v.data.chainId ?? getConfig().chainId;
  const chainErr = checkChainSupport(chainId);
  if (chainErr) return chainErr;

  return executeWrite({
    toolName: "acp_set_budget",
    description: `Set Virtuals ACP job #${v.data.jobId} budget to ${v.data.amount}`,
    params: v.data as unknown as Record<string, unknown>,
    executor: executeSetBudget,
  });
}

async function executeSetBudget(params: Record<string, unknown>): Promise<CallToolResult> {
  const walletErr = ensureWritable("acp_set_budget");
  if (walletErr) return walletErr;

  try {
    const {
      jobId,
      amount,
      paymentToken: rawPaymentToken,
      chainId: rawChainId,
    } = params as {
      jobId: number;
      amount: string;
      paymentToken?: string;
      chainId?: number;
    };

    const chainId = rawChainId ?? getConfig().chainId;
    // biome-ignore lint/style/noNonNullAssertion: handler already validated chain support via checkChainSupport
    const acpAddress = getAcpRouterAddress(chainId)!;
    const chain = getChainById(chainId);
    if (!chain) return formatToolError("UNSUPPORTED_CHAIN", `Chain ${chainId} not supported`);

    if (rawPaymentToken) {
      const addrErr = validateAddress(rawPaymentToken, "paymentToken");
      if (addrErr) return addrErr;
    }

    const account = getActiveAccount();
    const walletClient = createWalletClientForChain(account, chainId);
    const publicClient = createPublicClient({ chain, transport: getTransportForChain(chainId) });
    const paymentToken = (rawPaymentToken ?? getPaymentTokenAddress(chainId)) as Hex;

    const hash = await walletClient.writeContract({
      address: acpAddress,
      abi: acpRouterV2Abi,
      functionName: "setBudgetWithPaymentToken",
      args: [BigInt(jobId), BigInt(amount), paymentToken],
      chain,
      account,
    });
    await publicClient.waitForTransactionReceipt({ hash });

    return formatToolResponse({ status: "budget_set", jobId, amount, paymentToken, txHash: hash });
  } catch (e: unknown) {
    return formatToolError("ACP_SET_BUDGET_ERROR", e instanceof Error ? e.message : String(e));
  }
}

async function acpFundJob(params: Record<string, unknown>): Promise<CallToolResult> {
  const v = validateInput(acpVFundJobSchema, params);
  if (!v.success) return v.error;

  const chainId = v.data.chainId ?? getConfig().chainId;
  const chainErr = checkChainSupport(chainId);
  if (chainErr) return chainErr;

  return executeWrite({
    toolName: "acp_fund_job",
    description: `Fund Virtuals ACP job #${v.data.jobId} with ${v.data.amount}. This may execute approve + createPayableMemo transactions.`,
    params: v.data as unknown as Record<string, unknown>,
    executor: executeFundJob,
  });
}

async function executeFundJob(params: Record<string, unknown>): Promise<CallToolResult> {
  const walletErr = ensureWritable("acp_fund_job");
  if (walletErr) return walletErr;

  try {
    const {
      jobId,
      amount: rawAmount,
      expiredAt: rawExpiredAt,
      chainId: rawChainId,
    } = params as {
      jobId: number;
      amount: string;
      expiredAt?: number;
      chainId?: number;
    };

    const chainId = rawChainId ?? getConfig().chainId;
    // biome-ignore lint/style/noNonNullAssertion: handler already validated chain support via checkChainSupport
    const acpAddress = getAcpRouterAddress(chainId)!;
    const chain = getChainById(chainId);
    if (!chain) return formatToolError("UNSUPPORTED_CHAIN", `Chain ${chainId} not supported`);

    const account = getActiveAccount();
    const walletClient = createWalletClientForChain(account, chainId);
    const publicClient = createPublicClient({ chain, transport: getTransportForChain(chainId) });
    const amount = BigInt(rawAmount);

    const jobResult = await publicClient.readContract({
      address: acpAddress,
      abi: acpRouterV2Abi,
      functionName: "jobs",
      args: [BigInt(jobId)],
    });
    const [, , providerAddr, jobExpiredAt, , , , , paymentTokenAddr] = jobResult as [
      bigint,
      string,
      string,
      bigint,
      bigint,
      number,
      bigint,
      bigint,
      string,
      string,
    ];

    const paymentToken = paymentTokenAddr as Hex;
    const memoExpiredAt = rawExpiredAt ? BigInt(rawExpiredAt) : jobExpiredAt;

    const allowance = await publicClient.readContract({
      address: paymentToken,
      abi: erc20ApproveAbi,
      functionName: "allowance",
      args: [account.address, acpAddress],
    });

    let approveTxHash: string | undefined;
    // TODO: USDT-style tokens require resetting allowance to 0 before re-approving.
    // Default token is USDC (safe), but custom tokens via ACP_PAYMENT_TOKEN may need approve(0) first.
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
    }

    const hash = await walletClient.writeContract({
      address: acpAddress,
      abi: acpRouterV2Abi,
      functionName: "createPayableMemo",
      args: [
        BigInt(jobId),
        "Funding job",
        paymentToken,
        amount,
        providerAddr as Hex,
        0n,
        0,
        AcpMemoType.PAYABLE_TRANSFER_ESCROW,
        memoExpiredAt,
        true,
        AcpPhase.TRANSACTION,
      ],
      chain,
      account,
    });
    await publicClient.waitForTransactionReceipt({ hash });

    return formatToolResponse({ status: "funded", jobId, txHash: hash, approveTxHash });
  } catch (e: unknown) {
    return formatToolError("ACP_FUND_ERROR", e instanceof Error ? e.message : String(e));
  }
}

async function acpSubmitJob(params: Record<string, unknown>): Promise<CallToolResult> {
  const v = validateInput(acpVSubmitJobSchema, params);
  if (!v.success) return v.error;

  const chainId = v.data.chainId ?? getConfig().chainId;
  const chainErr = checkChainSupport(chainId);
  if (chainErr) return chainErr;

  return executeWrite({
    toolName: "acp_submit_job",
    description: `Submit deliverable for Virtuals ACP job #${v.data.jobId}`,
    params: v.data as unknown as Record<string, unknown>,
    executor: executeSubmitJob,
  });
}

async function executeSubmitJob(params: Record<string, unknown>): Promise<CallToolResult> {
  const walletErr = ensureWritable("acp_submit_job");
  if (walletErr) return walletErr;

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

    const chainId = rawChainId ?? getConfig().chainId;
    // biome-ignore lint/style/noNonNullAssertion: handler already validated chain support via checkChainSupport
    const acpAddress = getAcpRouterAddress(chainId)!;
    const chain = getChainById(chainId);
    if (!chain) return formatToolError("UNSUPPORTED_CHAIN", `Chain ${chainId} not supported`);

    const account = getActiveAccount();
    const walletClient = createWalletClientForChain(account, chainId);
    const publicClient = createPublicClient({ chain, transport: getTransportForChain(chainId) });

    const hash = await walletClient.writeContract({
      address: acpAddress,
      abi: acpRouterV2Abi,
      functionName: "createMemo",
      args: [BigInt(jobId), deliverable, AcpMemoType.MESSAGE, false, AcpPhase.EVALUATION],
      chain,
      account,
    });
    await publicClient.waitForTransactionReceipt({ hash });

    return formatToolResponse({ status: "submitted", jobId, deliverable, txHash: hash });
  } catch (e: unknown) {
    return formatToolError("ACP_SUBMIT_ERROR", e instanceof Error ? e.message : String(e));
  }
}

async function acpCompleteJob(params: Record<string, unknown>): Promise<CallToolResult> {
  const v = validateInput(acpVCompleteJobSchema, params);
  if (!v.success) return v.error;

  const chainId = v.data.chainId ?? getConfig().chainId;
  const chainErr = checkChainSupport(chainId);
  if (chainErr) return chainErr;

  return executeWrite({
    toolName: "acp_complete_job",
    description: `Approve pending memo and complete Virtuals ACP job #${v.data.jobId}`,
    params: v.data as unknown as Record<string, unknown>,
    executor: executeCompleteJob,
  });
}

async function executeCompleteJob(params: Record<string, unknown>): Promise<CallToolResult> {
  const walletErr = ensureWritable("acp_complete_job");
  if (walletErr) return walletErr;

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

    const chainId = rawChainId ?? getConfig().chainId;
    // biome-ignore lint/style/noNonNullAssertion: handler already validated chain support via checkChainSupport
    const acpAddress = getAcpRouterAddress(chainId)!;
    const chain = getChainById(chainId);
    if (!chain) return formatToolError("UNSUPPORTED_CHAIN", `Chain ${chainId} not supported`);

    const account = getActiveAccount();
    const walletClient = createWalletClientForChain(account, chainId);
    const publicClient = createPublicClient({ chain, transport: getTransportForChain(chainId) });

    const pendingMemo = await resolvePendingMemo(publicClient, acpAddress, jobId, account.address);
    if (!pendingMemo) {
      return formatToolError(
        "NO_PENDING_MEMO",
        `No pending memo to approve for job ${jobId}. Use acp_get_job to check job state.`
      );
    }

    const hash = await walletClient.writeContract({
      address: acpAddress,
      abi: acpRouterV2Abi,
      functionName: "signMemo",
      args: [pendingMemo.memoId, true, reason ?? ""],
      chain,
      account,
    });
    await publicClient.waitForTransactionReceipt({ hash });

    return formatToolResponse({
      status: "completed",
      jobId,
      memoId: pendingMemo.memoId.toString(),
      txHash: hash,
    });
  } catch (e: unknown) {
    return formatToolError("ACP_COMPLETE_ERROR", e instanceof Error ? e.message : String(e));
  }
}

async function acpRejectJob(params: Record<string, unknown>): Promise<CallToolResult> {
  const v = validateInput(acpVRejectJobSchema, params);
  if (!v.success) return v.error;

  const chainId = v.data.chainId ?? getConfig().chainId;
  const chainErr = checkChainSupport(chainId);
  if (chainErr) return chainErr;

  return executeWrite({
    toolName: "acp_reject_job",
    description: `Reject pending memo for Virtuals ACP job #${v.data.jobId}`,
    params: v.data as unknown as Record<string, unknown>,
    executor: executeRejectJob,
  });
}

async function executeRejectJob(params: Record<string, unknown>): Promise<CallToolResult> {
  const walletErr = ensureWritable("acp_reject_job");
  if (walletErr) return walletErr;

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

    const chainId = rawChainId ?? getConfig().chainId;
    // biome-ignore lint/style/noNonNullAssertion: handler already validated chain support via checkChainSupport
    const acpAddress = getAcpRouterAddress(chainId)!;
    const chain = getChainById(chainId);
    if (!chain) return formatToolError("UNSUPPORTED_CHAIN", `Chain ${chainId} not supported`);

    const account = getActiveAccount();
    const walletClient = createWalletClientForChain(account, chainId);
    const publicClient = createPublicClient({ chain, transport: getTransportForChain(chainId) });

    const pendingMemo = await resolvePendingMemo(publicClient, acpAddress, jobId, account.address);
    if (!pendingMemo) {
      return formatToolError(
        "NO_PENDING_MEMO",
        `No pending memo to reject for job ${jobId}. Use acp_get_job to check job state.`
      );
    }

    const hash = await walletClient.writeContract({
      address: acpAddress,
      abi: acpRouterV2Abi,
      functionName: "signMemo",
      args: [pendingMemo.memoId, false, reason ?? ""],
      chain,
      account,
    });
    await publicClient.waitForTransactionReceipt({ hash });

    return formatToolResponse({
      status: "rejected",
      jobId,
      memoId: pendingMemo.memoId.toString(),
      txHash: hash,
    });
  } catch (e: unknown) {
    return formatToolError("ACP_REJECT_ERROR", e instanceof Error ? e.message : String(e));
  }
}

async function acpClaimRefund(params: Record<string, unknown>): Promise<CallToolResult> {
  const v = validateInput(acpVClaimRefundSchema, params);
  if (!v.success) return v.error;

  const chainId = v.data.chainId ?? getConfig().chainId;
  const chainErr = checkChainSupport(chainId);
  if (chainErr) return chainErr;

  return executeWrite({
    toolName: "acp_claim_refund",
    description: `Claim budget from Virtuals ACP job #${v.data.jobId}`,
    params: v.data as unknown as Record<string, unknown>,
    executor: executeClaimRefund,
  });
}

async function executeClaimRefund(params: Record<string, unknown>): Promise<CallToolResult> {
  const walletErr = ensureWritable("acp_claim_refund");
  if (walletErr) return walletErr;

  try {
    const { jobId, chainId: rawChainId } = params as {
      jobId: number;
      chainId?: number;
    };

    const chainId = rawChainId ?? getConfig().chainId;
    // biome-ignore lint/style/noNonNullAssertion: handler already validated chain support via checkChainSupport
    const acpAddress = getAcpRouterAddress(chainId)!;
    const chain = getChainById(chainId);
    if (!chain) return formatToolError("UNSUPPORTED_CHAIN", `Chain ${chainId} not supported`);

    const account = getActiveAccount();
    const walletClient = createWalletClientForChain(account, chainId);
    const publicClient = createPublicClient({ chain, transport: getTransportForChain(chainId) });

    const hash = await walletClient.writeContract({
      address: acpAddress,
      abi: acpRouterV2Abi,
      functionName: "claimBudget",
      args: [BigInt(jobId)],
      chain,
      account,
    });
    await publicClient.waitForTransactionReceipt({ hash });

    return formatToolResponse({ status: "claimed", jobId, txHash: hash });
  } catch (e: unknown) {
    return formatToolError("ACP_CLAIM_REFUND_ERROR", e instanceof Error ? e.message : String(e));
  }
}

export function getAcpToolDefinitions(): ToolDefinition[] {
  return [
    {
      name: "acp_create_job",
      category: "agenticEconomy" as ToolCategory,
      description:
        "Create a job on the Virtuals ACPRouter (Base). Specify provider, evaluator, description, and expiry.",
      inputSchema: {
        type: "object" as const,
        properties: {
          provider: { type: "string", description: "Provider wallet address" },
          evaluator: { type: "string", description: "Evaluator wallet address" },
          description: { type: "string", description: "Job description / metadata" },
          expiryDuration: { type: "number", description: "Job expiry in seconds from now" },
          paymentToken: {
            type: "string",
            description: "ERC-20 payment token address (defaults to USDC)",
          },
          budget: {
            type: "string",
            description: "Initial budget in token smallest units (default 0)",
          },
          chainId: { type: "number", description: "Optional chain ID override" },
        },
        required: ["provider", "evaluator", "description", "expiryDuration"],
      },
      handler: acpCreateJob,
      annotations: { destructiveHint: true, openWorldHint: true },
    },
    {
      name: "acp_set_budget",
      category: "agenticEconomy" as ToolCategory,
      description:
        "Set a job budget on the Virtuals ACPRouter using setBudgetWithPaymentToken and optional token override.",
      inputSchema: {
        type: "object" as const,
        properties: {
          jobId: { type: "number", description: "Job ID" },
          amount: { type: "string", description: "Budget amount in token smallest units" },
          paymentToken: { type: "string", description: "Payment token address (defaults to USDC)" },
          chainId: { type: "number", description: "Optional chain ID override" },
        },
        required: ["jobId", "amount"],
      },
      handler: acpSetBudget,
      annotations: { destructiveHint: true, openWorldHint: true },
    },
    {
      name: "acp_fund_job",
      category: "agenticEconomy" as ToolCategory,
      description:
        "Fund a Virtuals ACPRouter job. Automatically checks allowance, approves ERC-20 if needed, then creates payable memo escrow.",
      inputSchema: {
        type: "object" as const,
        properties: {
          jobId: { type: "number", description: "Job ID" },
          amount: { type: "string", description: "Funding amount in token smallest units" },
          expiredAt: {
            type: "number",
            description: "Optional payable memo expiry as Unix timestamp (defaults to job expiry)",
          },
          chainId: { type: "number", description: "Optional chain ID override" },
        },
        required: ["jobId", "amount"],
      },
      handler: acpFundJob,
      annotations: { destructiveHint: true, openWorldHint: true },
    },
    {
      name: "acp_submit_job",
      category: "agenticEconomy" as ToolCategory,
      description:
        "Submit a deliverable memo on the Virtuals ACPRouter and advance the job to evaluation phase.",
      inputSchema: {
        type: "object" as const,
        properties: {
          jobId: { type: "number", description: "Job ID" },
          deliverable: { type: "string", description: "Deliverable content (text, URL, or JSON)" },
          chainId: { type: "number", description: "Optional chain ID override" },
        },
        required: ["jobId", "deliverable"],
      },
      handler: acpSubmitJob,
      annotations: { destructiveHint: true, openWorldHint: true },
    },
    {
      name: "acp_complete_job",
      category: "agenticEconomy" as ToolCategory,
      description:
        "Complete a job on the Virtuals ACPRouter by auto-resolving the pending memo and signing approval.",
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
      name: "acp_reject_job",
      category: "agenticEconomy" as ToolCategory,
      description:
        "Reject a job on the Virtuals ACPRouter by auto-resolving the pending memo and signing rejection.",
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
      name: "acp_claim_refund",
      category: "agenticEconomy" as ToolCategory,
      description: "Claim remaining budget for a Virtuals ACPRouter job using claimBudget.",
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
      name: "acp_get_job",
      category: "agenticEconomy" as ToolCategory,
      description:
        "Get job details and full memo history from the Virtuals ACPRouter. Shows phase, participants, budget, and all memos with their status.",
      inputSchema: {
        type: "object" as const,
        properties: {
          jobId: { type: "number", description: "Job ID" },
          memoLimit: { type: "number", description: "Max memos to return (default 100)" },
          chainId: { type: "number", description: "Optional chain ID override" },
        },
        required: ["jobId"],
      },
      handler: acpGetJob,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
  ];
}

export function registerAcpExecutors(): void {
  registerExecutor("acp_create_job", executeCreateJob);
  registerExecutor("acp_set_budget", executeSetBudget);
  registerExecutor("acp_fund_job", executeFundJob);
  registerExecutor("acp_submit_job", executeSubmitJob);
  registerExecutor("acp_complete_job", executeCompleteJob);
  registerExecutor("acp_reject_job", executeRejectJob);
  registerExecutor("acp_claim_refund", executeClaimRefund);
}
