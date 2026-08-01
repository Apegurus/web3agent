import { createPublicClient, keccak256, toHex } from "viem";
import { z } from "zod";
import { Web3AgentError } from "../api/errors.js";
import { addressSchema, hexSchema } from "../api/schemas/common.js";
import { getChainById } from "../chains/registry.js";
import { getTransportForChain } from "../config/wallet-factory.js";
import { assertAddress } from "../operations/validation.js";
import { isNativeTokenAddress } from "../orbs/liquidity-hub.js";
import type { ZeroExQuote } from "./client.js";
import { zeroExIntegerSchema, zeroExTransactionSchema } from "./schemas.js";

export const ROBINHOOD_CHAIN_ID = 4663;
const ALLOWANCE_HOLDER = "0x0000000000001fF3684f28c67538d4D072C22734";
const SETTLER_REGISTRY = "0x00000000000004533Fe15556B1E086BB1A72cEae";
const SETTLER_FEATURE_ID = 2n;

const settlerRegistryAbi = [
  {
    type: "function",
    name: "ownerOf",
    stateMutability: "view",
    inputs: [{ name: "feature", type: "uint256" }],
    outputs: [{ name: "owner", type: "address" }],
  },
  {
    type: "function",
    name: "prev",
    stateMutability: "view",
    inputs: [{ name: "feature", type: "uint256" }],
    outputs: [{ name: "owner", type: "address" }],
  },
] as const;

const zeroExConfirmedExecutionFactsSchema = z.object({
  provider: z.literal("0x").describe("Confirmed swap provider"),
  chainId: z.literal(ROBINHOOD_CHAIN_ID).describe("Robinhood chain ID"),
  adapterSource: z.literal("native").describe("Selected native 0x adapter source"),
  capabilityDecisionId: z.string().describe("Adapter capability decision identifier"),
  capabilityReason: z.string().describe("Adapter capability decision reason"),
  taker: addressSchema.describe("Wallet submitting the confirmed swap"),
  sellAmount: zeroExIntegerSchema.describe("Confirmed input amount in base units"),
  transaction: zeroExTransactionSchema.describe("Confirmed 0x transaction request"),
  allowance: z
    .object({
      target: addressSchema.describe("Canonical Robinhood AllowanceHolder address"),
      amount: zeroExIntegerSchema.describe("Exact confirmed approval amount"),
    })
    .optional()
    .describe("Optional exact ERC-20 approval requirement"),
  settler: z
    .object({
      blockNumber: zeroExIntegerSchema.describe("Block used to pin Settler owners"),
      owner: addressSchema.describe("Settler registry owner at the pinned block"),
      previousOwner: addressSchema
        .optional()
        .describe("Previous Settler owner at the pinned block when one exists"),
    })
    .describe("Pinned canonical Settler authority"),
});

export const zeroExConfirmedExecutionSchema = zeroExConfirmedExecutionFactsSchema.extend({
  integrityHash: hexSchema.describe("Hash binding all confirmed execution facts"),
});

export type ZeroExConfirmedExecution = z.infer<typeof zeroExConfirmedExecutionSchema>;
type ZeroExConfirmedExecutionFacts = z.infer<typeof zeroExConfirmedExecutionFactsSchema>;

export function hasSameAddress(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

function getExecutionIntegrityHash(execution: ZeroExConfirmedExecutionFacts): string {
  return keccak256(
    toHex(
      JSON.stringify({
        provider: execution.provider,
        chainId: execution.chainId,
        adapterSource: execution.adapterSource,
        capabilityDecisionId: execution.capabilityDecisionId,
        capabilityReason: execution.capabilityReason,
        taker: execution.taker,
        sellAmount: execution.sellAmount,
        transaction: execution.transaction,
        allowance: execution.allowance ?? null,
        settler: execution.settler,
      })
    )
  );
}

export function requireValidConfirmedExecution(
  execution: ZeroExConfirmedExecution,
  fromAmount: string,
  fromToken: string
): void {
  const { integrityHash, ...facts } = execution;
  if (integrityHash !== getExecutionIntegrityHash(facts)) {
    throw new Web3AgentError({
      code: "ZEROEX_CONFIRMED_EXECUTION_TAMPERED",
      message: "Confirmed 0x execution facts no longer match the approved payload",
    });
  }
  if (execution.sellAmount !== fromAmount) {
    throw new Web3AgentError({
      code: "ZEROEX_CONFIRMED_SELL_AMOUNT_MISMATCH",
      message: "Confirmed 0x sell amount no longer matches the requested amount",
    });
  }
  if (execution.allowance && !hasSameAddress(execution.allowance.target, ALLOWANCE_HOLDER)) {
    throw new Web3AgentError({
      code: "ZEROEX_CONFIRMED_ALLOWANCE_TARGET_MISMATCH",
      message: "Confirmed 0x allowance target is not the Robinhood AllowanceHolder",
    });
  }
  if (execution.allowance && execution.allowance.amount !== execution.sellAmount) {
    throw new Web3AgentError({
      code: "ZEROEX_CONFIRMED_ALLOWANCE_AMOUNT_MISMATCH",
      message: "Confirmed 0x allowance amount does not match the exact sell amount",
    });
  }
  const expectedValue = isNativeTokenAddress(fromToken) ? BigInt(fromAmount) : 0n;
  if (BigInt(execution.transaction.value) !== expectedValue) {
    throw new Web3AgentError({
      code: "ZEROEX_CONFIRMED_VALUE_MISMATCH",
      message: "Confirmed 0x transaction value does not match the requested input asset",
    });
  }
  if (
    !hasSameAddress(execution.transaction.to, execution.settler.owner) &&
    (!execution.settler.previousOwner ||
      !hasSameAddress(execution.transaction.to, execution.settler.previousOwner))
  ) {
    throw new Web3AgentError({
      code: "ZEROEX_CONFIRMED_SETTLER_TARGET_MISMATCH",
      message: "Confirmed 0x transaction target is not a pinned Robinhood Settler owner",
    });
  }
}

export async function prepareZeroExExecution(
  quote: ZeroExQuote,
  fromAmount: string,
  fromToken: string,
  taker: string
): Promise<ZeroExConfirmedExecution> {
  const chain = getChainById(ROBINHOOD_CHAIN_ID);
  if (!chain) {
    throw new Web3AgentError({
      code: "CHAIN_NOT_SUPPORTED",
      message: `Chain ${ROBINHOOD_CHAIN_ID} is not supported`,
    });
  }
  const publicClient = createPublicClient({
    chain,
    transport: getTransportForChain(ROBINHOOD_CHAIN_ID),
  });
  const blockNumber = await publicClient.getBlockNumber();
  let owner: string;
  try {
    owner = await publicClient.readContract({
      address: SETTLER_REGISTRY,
      abi: settlerRegistryAbi,
      functionName: "ownerOf",
      args: [SETTLER_FEATURE_ID],
      blockNumber,
    });
  } catch (error: unknown) {
    throw new Web3AgentError({
      code: "ZEROEX_SETTLER_PAUSED",
      message: "Robinhood Settler is paused at the quoted block",
      cause: error,
    });
  }
  let previousOwner: string | undefined;
  if (!hasSameAddress(quote.transaction.to, owner)) {
    try {
      previousOwner = await publicClient.readContract({
        address: SETTLER_REGISTRY,
        abi: settlerRegistryAbi,
        functionName: "prev",
        args: [SETTLER_FEATURE_ID],
        blockNumber,
      });
    } catch (error: unknown) {
      throw new Web3AgentError({
        code: "ZEROEX_CONFIRMED_SETTLER_TARGET_MISMATCH",
        message: "Quoted 0x target is neither the current nor a previous Robinhood Settler",
        cause: error,
      });
    }
  }
  const facts = zeroExConfirmedExecutionFactsSchema.parse({
    provider: "0x" as const,
    chainId: ROBINHOOD_CHAIN_ID,
    adapterSource: quote.adapterSource,
    capabilityDecisionId: quote.capabilityDecisionId,
    capabilityReason: quote.capabilityReason,
    taker: assertAddress(taker, "taker"),
    sellAmount: quote.sellAmount,
    transaction: quote.transaction,
    ...(quote.allowance ? { allowance: quote.allowance } : {}),
    settler: {
      blockNumber: blockNumber.toString(),
      owner: assertAddress(owner, "Settler owner"),
      ...(previousOwner
        ? { previousOwner: assertAddress(previousOwner, "previous Settler owner") }
        : {}),
    },
  });
  const execution = zeroExConfirmedExecutionSchema.parse({
    ...facts,
    integrityHash: getExecutionIntegrityHash(facts),
  });
  requireValidConfirmedExecution(execution, fromAmount, fromToken);
  return execution;
}
