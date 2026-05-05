import { z } from "zod";

// --- ACP (Virtuals) outputs ---

export const acpJobMemoSchema = z.object({
  memoId: z.string().describe("Memo identifier"),
  sender: z.string().describe("Memo sender address"),
  content: z.string().describe("Memo content payload"),
  memoType: z.string().describe("Memo type"),
  nextPhase: z.string().describe("Next phase requested by this memo"),
  isApproved: z.boolean().describe("Whether this memo is approved"),
  requiresApproval: z.boolean().describe("Whether this memo requires approval"),
  isSecured: z.boolean().describe("Whether this memo is secured"),
  createdAt: z.number().describe("Memo creation timestamp"),
});

export const acpCreateJobOutputSchema = z.object({
  status: z.literal("created").describe("Job creation status"),
  txHash: z.string().describe("Transaction hash"),
});

export const acpSetBudgetOutputSchema = z.object({
  status: z.literal("budget_set").describe("Budget update status"),
  jobId: z.number().describe("Job identifier"),
  amount: z.string().describe("Budget amount"),
  paymentToken: z.string().describe("Payment token address"),
  txHash: z.string().describe("Transaction hash"),
});

export const acpFundJobOutputSchema = z.object({
  status: z.literal("funded").describe("Funding status"),
  jobId: z.number().describe("Job identifier"),
  txHash: z.string().describe("Funding transaction hash"),
  approveTxHash: z.string().optional().describe("Optional approval transaction hash"),
});

export const acpSubmitJobOutputSchema = z.object({
  status: z.literal("submitted").describe("Submission status"),
  jobId: z.number().describe("Job identifier"),
  deliverable: z.string().describe("Submitted deliverable content"),
  txHash: z.string().describe("Transaction hash"),
});

export const acpCompleteJobOutputSchema = z.object({
  status: z.literal("completed").describe("Completion status"),
  jobId: z.number().describe("Job identifier"),
  memoId: z.string().describe("Completion memo identifier"),
  txHash: z.string().describe("Transaction hash"),
});

export const acpRejectJobOutputSchema = z.object({
  status: z.literal("rejected").describe("Rejection status"),
  jobId: z.number().describe("Job identifier"),
  memoId: z.string().describe("Rejection memo identifier"),
  txHash: z.string().describe("Transaction hash"),
});

export const acpClaimRefundOutputSchema = z.object({
  status: z.literal("claimed").describe("Refund claim status"),
  jobId: z.number().describe("Job identifier"),
  txHash: z.string().describe("Transaction hash"),
});

export const acpGetJobOutputSchema = z.object({
  jobId: z.number().describe("Numeric job identifier"),
  id: z.string().describe("Job identifier string"),
  phase: z.string().describe("Current job phase"),
  client: z.string().describe("Client wallet address"),
  provider: z.string().describe("Provider wallet address"),
  evaluator: z.string().describe("Evaluator wallet address"),
  paymentToken: z.string().describe("Payment token address"),
  budget: z.string().describe("Job budget amount"),
  expiredAt: z.number().describe("Job expiration timestamp"),
  jobMemoCount: z.number().describe("Total job memo count"),
  evaluatorCount: z.number().describe("Evaluator memo count"),
  memoCount: z.number().describe("Current phase memo count"),
  memos: z.array(acpJobMemoSchema).describe("All job memos"),
  pendingMemos: z.array(acpJobMemoSchema).describe("Pending memos requiring action"),
});

// --- ERC-8183 outputs ---

export const erc8183CreateJobOutputSchema = z.object({
  status: z.literal("created").describe("Job creation status"),
  txHash: z.string().describe("Transaction hash"),
});

export const erc8183SetBudgetOutputSchema = z.object({
  status: z.literal("budget_set").describe("Budget update status"),
  jobId: z.number().describe("Job identifier"),
  amount: z.string().describe("Budget amount"),
  txHash: z.string().describe("Transaction hash"),
});

export const erc8183FundJobOutputSchema = z.object({
  status: z.literal("funded").describe("Funding status"),
  jobId: z.number().describe("Job identifier"),
  txHash: z.string().describe("Funding transaction hash"),
  approveTxHash: z.string().optional().describe("Optional approval transaction hash"),
});

export const erc8183SubmitJobOutputSchema = z.object({
  status: z.literal("submitted").describe("Submission status"),
  jobId: z.number().describe("Job identifier"),
  deliverable: z.string().describe("Submitted deliverable content"),
  deliverableHash: z.string().describe("Deliverable hash"),
  txHash: z.string().describe("Transaction hash"),
});

export const erc8183CompleteJobOutputSchema = z.object({
  status: z.literal("completed").describe("Completion status"),
  jobId: z.number().describe("Job identifier"),
  reason: z.string().optional().describe("Optional completion reason"),
  reasonHash: z.string().describe("Completion reason hash"),
  txHash: z.string().describe("Transaction hash"),
});

export const erc8183RejectJobOutputSchema = z.object({
  status: z.literal("rejected").describe("Rejection status"),
  jobId: z.number().describe("Job identifier"),
  reason: z.string().optional().describe("Optional rejection reason"),
  reasonHash: z.string().describe("Rejection reason hash"),
  txHash: z.string().describe("Transaction hash"),
});

export const erc8183ClaimRefundOutputSchema = z.object({
  status: z.literal("refund_claimed").describe("Refund claim status"),
  jobId: z.number().describe("Job identifier"),
  txHash: z.string().describe("Transaction hash"),
});

export const erc8183GetJobOutputSchema = z.object({
  jobId: z.number().describe("Job identifier"),
  client: z.string().describe("Client wallet address"),
  provider: z.string().describe("Provider wallet address"),
  evaluator: z.string().describe("Evaluator wallet address"),
  paymentToken: z.string().describe("Payment token address"),
  budget: z.string().describe("Job budget amount"),
  expiredAt: z.number().describe("Job expiration timestamp"),
  description: z.string().describe("Job description"),
  status: z.string().describe("Current job status"),
  deliverable: z.string().describe("Job deliverable"),
});

// --- aGDP outputs ---

export const agdpGetOfferingsOutputSchema = z.object({
  count: z.number().describe("Number of agents returned"),
  agents: z
    .array(
      z.object({
        id: z.string().describe("Agent identifier"),
        name: z.string().describe("Agent name"),
        description: z.string().describe("Agent description"),
        walletAddress: z.string().describe("Agent wallet address"),
        metrics: z.record(z.unknown()).describe("Agent metrics payload"),
        offerings: z.array(z.unknown()).describe("Agent offerings list"),
      })
    )
    .describe("Agent offerings entries"),
});

export const agdpGetOfferingOutputSchema = z
  .record(z.unknown())
  .describe("Raw agent offering object with variable shape");

export const agdpGetMyJobsOutputSchema = z.object({
  count: z.number().describe("Number of jobs returned"),
  jobs: z.array(z.unknown()).describe("Job entries with variable shape"),
});

export const agdpHireAgentOutputSchema = z.object({
  status: z.literal("hired_via_api").describe("Hire status"),
  agent: z
    .object({
      id: z.string().describe("Hired agent identifier"),
      name: z.string().describe("Hired agent name"),
    })
    .describe("Hired agent metadata"),
  job: z.record(z.unknown()).describe("Created job payload"),
});

export const agdpCreateOfferingOutputSchema = z
  .record(z.unknown())
  .describe("Raw create-offering response payload with variable shape");

// --- ERC-8004 outputs ---

export const erc8004RegisterAgentOutputSchema = z.object({
  status: z.literal("registered").describe("Registration status"),
  agentId: z.string().describe("Registered agent identifier"),
  agentURI: z.string().describe("Registered agent metadata URI"),
  txHash: z.string().describe("Transaction hash"),
});

export const erc8004GetAgentRegisteredOutputSchema = z.object({
  agentId: z.string().describe("Registered agent identifier"),
  owner: z.string().describe("Agent owner address"),
  agentURI: z.string().describe("Agent metadata URI"),
});

export const erc8004GetAgentUnregisteredOutputSchema = z.object({
  registered: z.literal(false).describe("Registration state"),
  message: z.string().describe("Reason the agent is not registered"),
});

export const erc8004GetAgentOutputSchema = z
  .union([erc8004GetAgentRegisteredOutputSchema, erc8004GetAgentUnregisteredOutputSchema])
  .describe("Agent registration lookup result");

export const erc8004UpdateAgentOutputSchema = z.object({
  status: z.literal("updated").describe("Update status"),
  agentId: z.string().describe("Updated agent identifier"),
  agentURI: z.string().describe("Updated agent metadata URI"),
  txHash: z.string().describe("Transaction hash"),
});

export const erc8004SubmitFeedbackOutputSchema = z.object({
  status: z.literal("feedback_submitted").describe("Feedback submission status"),
  agentId: z.string().describe("Target agent identifier"),
  value: z.number().describe("Feedback value"),
  tag1: z.string().describe("First feedback tag"),
  tag2: z.string().describe("Second feedback tag"),
  endpoint: z.string().describe("Feedback endpoint"),
  txHash: z.string().describe("Transaction hash"),
});

export const erc8004GetFeedbackOutputSchema = z.object({
  agentId: z.string().describe("Target agent identifier"),
  tag1: z.string().describe("First feedback tag"),
  tag2: z.string().describe("Second feedback tag"),
  count: z.string().describe("Feedback count in raw units"),
  value: z.string().describe("Aggregate feedback value in raw units"),
  decimals: z.number().describe("Decimals used for feedback value"),
});

// --- x402 outputs ---

export const x402CheckRequirementsOutputSchema = z.object({
  paymentRequired: z.boolean().describe("Whether payment is required"),
  message: z.string().optional().describe("Optional requirements message"),
  requirements: z.record(z.unknown()).optional().describe("Optional payment requirements payload"),
});

export const x402FetchOutputSchema = z.object({
  status: z.number().describe("HTTP status code"),
  ok: z.boolean().describe("Whether the request succeeded"),
  body: z.string().describe("Response body text"),
  paymentMade: z.boolean().optional().describe("Whether x402 payment was made"),
});

// --- Policy output ---

export const policyGetOutputSchema = z.object({
  policy: z
    .object({
      enabled: z.boolean().describe("Whether policy enforcement is enabled"),
      maxSingleTransactionUsd: z
        .number()
        .optional()
        .describe("Maximum USD allowed per single transaction"),
      maxHourlyUsd: z.number().optional().describe("Maximum USD allowed per hour"),
      maxDailyUsd: z.number().optional().describe("Maximum USD allowed per day"),
      minReserveUsd: z.number().optional().describe("Minimum USD reserve to maintain"),
      maxX402PaymentUsd: z.number().optional().describe("Maximum USD allowed for x402 payment"),
    })
    .describe("Configured spending policy"),
  currentSpend: z.record(z.unknown()).describe("Current spend tracking state"),
  remainingBudget: z.number().describe("Remaining budget in USD"),
  recentSpends: z.array(z.unknown()).optional().describe("Recent spend entries"),
});
