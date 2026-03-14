import type { Hex, PublicClient } from "viem";

export { erc20ApproveAbi, getPaymentTokenAddress, USDC_ADDRESSES } from "./contract.js";

export const acpRouterV2Abi = [
  {
    name: "createJob",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "provider", type: "address" },
      { name: "evaluator", type: "address" },
      { name: "expiredAt", type: "uint256" },
      { name: "paymentToken", type: "address" },
      { name: "budget", type: "uint256" },
      { name: "metadata", type: "string" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "setBudgetWithPaymentToken",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "jobId", type: "uint256" },
      { name: "amount", type: "uint256" },
      { name: "paymentToken", type: "address" },
    ],
    outputs: [],
  },
  {
    name: "createMemo",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "jobId", type: "uint256" },
      { name: "content", type: "string" },
      { name: "memoType", type: "uint8" },
      { name: "isSecured", type: "bool" },
      { name: "nextPhase", type: "uint8" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "createPayableMemo",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "jobId", type: "uint256" },
      { name: "content", type: "string" },
      { name: "token", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "recipient", type: "address" },
      { name: "feeAmount", type: "uint256" },
      { name: "feeType", type: "uint8" },
      { name: "memoType", type: "uint8" },
      { name: "expiredAt", type: "uint256" },
      { name: "isSecured", type: "bool" },
      { name: "nextPhase", type: "uint8" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "signMemo",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "memoId", type: "uint256" },
      { name: "isApproved", type: "bool" },
      { name: "reason", type: "string" },
    ],
    outputs: [],
  },
  {
    name: "claimBudget",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "jobId", type: "uint256" }],
    outputs: [],
  },
  {
    name: "getAllMemos",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "jobId", type: "uint256" },
      { name: "offset", type: "uint256" },
      { name: "limit", type: "uint256" },
    ],
    outputs: [
      {
        name: "memoList",
        type: "tuple[]",
        components: [
          { name: "id", type: "uint256" },
          { name: "jobId", type: "uint256" },
          { name: "sender", type: "address" },
          { name: "content", type: "string" },
          { name: "memoType", type: "uint8" },
          { name: "createdAt", type: "uint256" },
          { name: "isApproved", type: "bool" },
          { name: "approvedBy", type: "address" },
          { name: "approvedAt", type: "uint256" },
          { name: "requiresApproval", type: "bool" },
          { name: "metadata", type: "string" },
          { name: "isSecured", type: "bool" },
          { name: "nextPhase", type: "uint8" },
          { name: "expiredAt", type: "uint256" },
          { name: "state", type: "uint8" },
        ],
      },
      { name: "totalCount", type: "uint256" },
    ],
  },
  {
    name: "jobs",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "jobId", type: "uint256" }],
    outputs: [
      { name: "id", type: "uint256" },
      { name: "client", type: "address" },
      { name: "provider", type: "address" },
      { name: "expiredAt", type: "uint256" },
      { name: "budget", type: "uint256" },
      { name: "phase", type: "uint8" },
      { name: "jobMemoCount", type: "uint256" },
      { name: "evaluatorCount", type: "uint256" },
      { name: "paymentToken", type: "address" },
      { name: "evaluator", type: "address" },
    ],
  },
  {
    name: "canSign",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "account", type: "address" },
      { name: "jobId", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "isJobEvaluator",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "jobId", type: "uint256" },
      { name: "account", type: "address" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "defaultPaymentToken",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
] as const;

export enum AcpPhase {
  REQUEST = 0,
  NEGOTIATION = 1,
  TRANSACTION = 2,
  EVALUATION = 3,
  COMPLETED = 4,
  REJECTED = 5,
  EXPIRED = 6,
}

export enum AcpMemoType {
  MESSAGE = 0,
  CONTEXT_URL = 1,
  IMAGE_URL = 2,
  VOICE_URL = 3,
  OBJECT_URL = 4,
  TXHASH = 5,
  PAYABLE_REQUEST = 6,
  PAYABLE_TRANSFER = 7,
  PAYABLE_TRANSFER_ESCROW = 8,
  NOTIFICATION = 9,
  PAYABLE_NOTIFICATION = 10,
}

export const ACP_ROUTER_V2_ADDRESSES: Record<number, Hex> = {
  8453: "0xa6C9BA866992cfD7fd6460ba912bfa405adA9df0",
  84532: "0xdf54E6Ed6cD1d0632d973ADECf96597b7e87893c",
};

export function getAcpRouterAddress(chainId: number): Hex | null {
  return ACP_ROUTER_V2_ADDRESSES[chainId] ?? null;
}

type AcpMemo = {
  id: bigint;
  jobId: bigint;
  sender: Hex;
  content: string;
  memoType: number;
  createdAt: bigint;
  isApproved: boolean;
  approvedBy: Hex;
  approvedAt: bigint;
  requiresApproval: boolean;
  metadata: string;
  isSecured: boolean;
  nextPhase: number;
  expiredAt: bigint;
  state: number;
};

export async function resolvePendingMemo(
  publicClient: PublicClient,
  acpRouterAddress: Hex,
  jobId: number | bigint,
  signerAddress: Hex
): Promise<{ memoId: bigint; content: string; memoType: number } | null> {
  const [memoList] = (await publicClient.readContract({
    address: acpRouterAddress,
    abi: acpRouterV2Abi,
    functionName: "getAllMemos",
    args: [BigInt(jobId), 0n, 100n],
  })) as readonly [readonly AcpMemo[], bigint];

  if (!memoList || memoList.length === 0) return null;

  for (let i = memoList.length - 1; i >= 0; i--) {
    const memo = memoList[i];
    if (!memo.requiresApproval || memo.isApproved) continue;
    if (memo.sender.toLowerCase() === signerAddress.toLowerCase()) continue;
    return { memoId: memo.id, content: memo.content, memoType: memo.memoType };
  }

  return null;
}
