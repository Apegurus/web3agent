import { z } from "zod";

import { addressSchema, hexSchema } from "../../api/schemas/common.js";
import { uniswapV4ExpectedDeltasSchema } from "../../api/schemas/uniswap-v4/calculations.js";
import {
  uniswapV4BurnOperationSchema,
  uniswapV4CollectOperationSchema,
  uniswapV4DecreaseOperationSchema,
  uniswapV4IncreaseOperationSchema,
  uniswapV4LifecycleOperationSchema,
  uniswapV4MintOperationSchema,
} from "../../api/schemas/uniswap-v4/lifecycle.js";
import { uniswapV4PoolIdSchema } from "../../api/schemas/uniswap-v4/primitives.js";

const decimalSchema = z
  .string()
  .regex(/^(0|[1-9]\d*)$/)
  .describe("Canonical unsigned decimal integer");

const transactionFactsSchema = z
  .object({
    data: hexSchema.describe("Canonical unsigned transaction calldata"),
    dataHash: uniswapV4PoolIdSchema.describe("Keccak-256 hash of canonical unsigned calldata"),
    to: addressSchema.describe("Canonical transaction target"),
    value: decimalSchema.describe("Canonical native transaction value"),
  })
  .strict();

const transactionActionSchema = z.discriminatedUnion("kind", [
  z
    .object({
      amount: decimalSchema.describe("ERC-20 approval amount"),
      data: hexSchema.describe("Exact ERC-20 approval calldata"),
      dataHash: uniswapV4PoolIdSchema.describe("Keccak-256 hash of approval calldata"),
      kind: z.literal("erc20Approval").describe("ERC-20 approval stage discriminator"),
      spender: addressSchema.describe("Canonical Permit2 approval spender"),
      to: addressSchema.describe("ERC-20 approval target token"),
      token: addressSchema.describe("ERC-20 token being approved"),
      value: decimalSchema.describe("Native value for the approval transaction"),
    })
    .strict(),
  z
    .object({
      data: hexSchema.describe("Exact PoolManager initialization calldata"),
      dataHash: uniswapV4PoolIdSchema.describe("Keccak-256 hash of initialization calldata"),
      kind: z.literal("poolInitialization").describe("Pool initialization stage discriminator"),
      to: addressSchema.describe("Canonical PoolManager target"),
      value: decimalSchema.describe("Native value for the initialization transaction"),
    })
    .strict(),
  z
    .object({
      data: hexSchema.describe("Exact PositionManager calldata"),
      dataHash: uniswapV4PoolIdSchema.describe("Keccak-256 hash of PositionManager calldata"),
      kind: z.literal("positionManager").describe("PositionManager stage discriminator"),
      to: addressSchema.describe("Canonical PositionManager target"),
      value: decimalSchema.describe("Native value for the PositionManager transaction"),
    })
    .strict(),
]);

const permit2SignatureActionSchema = z
  .object({
    domain: z
      .object({
        chainId: z.number().int().positive().describe("Permit2 EIP-712 chain ID"),
        name: z.literal("Permit2").describe("Permit2 EIP-712 domain name"),
        verifyingContract: addressSchema.describe("Canonical Permit2 EIP-712 verifier"),
      })
      .describe("Permit2 EIP-712 domain"),
    kind: z.literal("permit2Signature").describe("Permit2 signing stage discriminator"),
    message: z
      .object({
        details: z
          .array(
            z.object({
              amount: decimalSchema.describe("Permit2 allowance amount"),
              expiration: decimalSchema.describe("Permit2 allowance expiration"),
              nonce: decimalSchema.describe("Permit2 allowance nonce"),
              token: addressSchema.describe("ERC-20 token authorized through Permit2"),
            })
          )
          .min(1)
          .describe("Permit2 batch token details"),
        sigDeadline: decimalSchema.describe("Permit2 signature deadline"),
        spender: addressSchema.describe("PositionManager authorized to spend through Permit2"),
      })
      .describe("Permit2 EIP-712 message"),
    primaryType: z.literal("PermitBatch").describe("Permit2 EIP-712 primary type"),
    typedDataHash: uniswapV4PoolIdSchema.describe("Exact Permit2 EIP-712 digest"),
  })
  .strict();

const nftPermitSignatureActionSchema = z
  .object({
    domain: z
      .object({
        chainId: z.number().int().positive().describe("PositionManager EIP-712 chain ID"),
        name: z.literal("Uniswap V4 Positions NFT").describe("PositionManager EIP-712 domain name"),
        verifyingContract: addressSchema.describe("Canonical PositionManager EIP-712 verifier"),
      })
      .describe("PositionManager NFT permit EIP-712 domain"),
    expectedSigner: addressSchema.describe("NFT owner required to sign the permit"),
    finalActionId: z.string().min(1).describe("Canonical final transaction action ID"),
    kind: z.literal("nftPermitSignature").describe("NFT permit signing stage discriminator"),
    message: z
      .object({
        deadline: decimalSchema.describe("NFT permit deadline"),
        nonce: decimalSchema.describe("PositionManager NFT permit nonce"),
        spender: addressSchema.describe("Account authorized by the NFT permit"),
        tokenId: decimalSchema.describe("PositionManager NFT token ID"),
      })
      .describe("PositionManager NFT permit EIP-712 message"),
    primaryType: z.literal("Permit").describe("PositionManager NFT permit EIP-712 primary type"),
    sourceNft: z
      .object({
        nonce: decimalSchema.describe("PositionManager NFT nonce at plan source"),
        operator: addressSchema.describe("PositionManager NFT approved operator at plan source"),
        owner: addressSchema.describe("PositionManager NFT owner at plan source"),
        tokenId: decimalSchema.describe("PositionManager NFT token ID at plan source"),
      })
      .describe("NFT authorization facts captured at the source block"),
    typedDataHash: uniswapV4PoolIdSchema.describe("Exact NFT permit EIP-712 digest"),
    types: z
      .object({
        Permit: z
          .array(
            z.object({
              name: z.string().min(1).describe("EIP-712 field name"),
              type: z.string().min(1).describe("EIP-712 field type"),
            })
          )
          .min(1)
          .describe("NFT permit EIP-712 Permit fields"),
      })
      .describe("NFT permit EIP-712 type definitions"),
    unsignedFinal: transactionFactsSchema.describe(
      "Unsigned final PositionManager transaction facts"
    ),
  })
  .strict();

const canonicalDeploymentSchema = z
  .object({
    chainId: z.number().int().positive().describe("Canonical Uniswap v4 deployment chain ID"),
    permit2: addressSchema.describe("Canonical Permit2 address"),
    poolManager: addressSchema.describe("Canonical PoolManager address"),
    positionManager: addressSchema.describe("Canonical PositionManager address"),
    stateView: addressSchema.describe("Canonical StateView address"),
  })
  .strict();

export const uniswapV4PersistedWritePlanSchema = z
  .object({
    account: addressSchema.describe("Wallet address bound to the persisted plan"),
    actions: z
      .array(
        z.union([
          transactionActionSchema,
          permit2SignatureActionSchema,
          nftPermitSignatureActionSchema,
        ])
      )
      .min(1)
      .describe("Exact ordered write stages persisted before confirmation"),
    deployment: canonicalDeploymentSchema.describe("Canonical deployment captured while planning"),
    deploymentHash: uniswapV4PoolIdSchema.describe(
      "Canonical deployment hash captured while planning"
    ),
    expectedDeltas: uniswapV4ExpectedDeltasSchema.describe("Planner expected deltas"),
    expectedNftState: z
      .enum(["burned", "retained"])
      .optional()
      .describe("Expected NFT state after a remove operation"),
    operation: uniswapV4LifecycleOperationSchema.describe("Validated lifecycle operation facts"),
    planHash: uniswapV4PoolIdSchema.describe("Canonical immutable write-plan hash"),
    poolId: uniswapV4PoolIdSchema.describe("Canonical pool identity for the lifecycle plan"),
    sourceBlock: z
      .object({
        blockHash: uniswapV4PoolIdSchema.describe("Pinned source block hash"),
        blockNumber: decimalSchema.describe("Pinned source block number"),
        chainId: z.number().int().positive().describe("Pinned source block chain ID"),
      })
      .describe("Pinned state source shared by every planned stage"),
    version: z.literal(1).describe("Persisted Uniswap v4 write-plan schema version"),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.account.toLowerCase() !== value.operation.account.toLowerCase()) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "plan account must match operation account",
        path: ["account"],
      });
    }
    if (value.deployment.chainId !== value.operation.chainId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "deployment chain must match operation chain",
        path: ["deployment", "chainId"],
      });
    }
    if (value.expectedDeltas.kind !== value.operation.kind) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "expected delta kind must match operation",
        path: ["expectedDeltas", "kind"],
      });
    }
    if (
      value.sourceBlock.blockHash.toLowerCase() !==
        value.operation.sourceBlock.blockHash.toLowerCase() ||
      value.sourceBlock.blockNumber !== value.operation.sourceBlock.blockNumber ||
      value.sourceBlock.chainId !== value.operation.sourceBlock.chainId
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "persisted source block must match operation source block",
        path: ["sourceBlock"],
      });
    }
  });

export const uniswapV4MintPositionSchema = uniswapV4MintOperationSchema.describe(
  "Mint-position server-wallet input"
);
export const uniswapV4IncreaseLiquiditySchema = uniswapV4IncreaseOperationSchema.describe(
  "Increase-liquidity server-wallet input"
);
export const uniswapV4DecreaseLiquiditySchema = uniswapV4DecreaseOperationSchema.describe(
  "Decrease-liquidity server-wallet input"
);
export const uniswapV4CollectFeesSchema = uniswapV4CollectOperationSchema.describe(
  "Collect-all-fees server-wallet input"
);
export const uniswapV4BurnPositionSchema = uniswapV4BurnOperationSchema.describe(
  "Burn-position server-wallet input"
);

export type UniswapV4PersistedWritePlan = z.infer<typeof uniswapV4PersistedWritePlanSchema>;
