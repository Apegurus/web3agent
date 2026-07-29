import { createPublicClient, keccak256, toHex } from "viem";
import { z } from "zod";
import { Web3AgentError } from "../../api/errors.js";
import { addressSchema, hexSchema } from "../../api/schemas/common.js";
import { getChainById } from "../../chains/registry.js";
import { getTransportForChain } from "../../config/wallet-factory.js";
import { assertAddress } from "../../operations/validation.js";
import type { ZeroExQuote } from "../../zerox/client.js";
import { zeroExIntegerSchema, zeroExTransactionSchema } from "../../zerox/schemas.js";
import { zeroExSwapSchema } from "./schemas.js";

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
  provider: z.literal("0x"),
  chainId: z.literal(ROBINHOOD_CHAIN_ID),
  adapterSource: z.literal("native"),
  capabilityDecisionId: z.string(),
  capabilityReason: z.string(),
  taker: addressSchema,
  sellAmount: zeroExIntegerSchema,
  transaction: zeroExTransactionSchema,
  allowance: z.object({ target: addressSchema, amount: zeroExIntegerSchema }).optional(),
  settler: z.object({
    blockNumber: zeroExIntegerSchema,
    owner: addressSchema,
    previousOwner: addressSchema,
  }),
});

const zeroExConfirmedExecutionSchema = zeroExConfirmedExecutionFactsSchema.extend({
  integrityHash: hexSchema,
});

export const zeroExConfirmedSwapSchema = zeroExSwapSchema.extend({
  execution: zeroExConfirmedExecutionSchema,
});

type ZeroExConfirmedExecution = z.infer<typeof zeroExConfirmedExecutionSchema>;
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
  fromAmount: string
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
  if (
    !hasSameAddress(execution.transaction.to, execution.settler.owner) &&
    !hasSameAddress(execution.transaction.to, execution.settler.previousOwner)
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
  const previousOwner = await publicClient.readContract({
    address: SETTLER_REGISTRY,
    abi: settlerRegistryAbi,
    functionName: "prev",
    args: [SETTLER_FEATURE_ID],
    blockNumber,
  });
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
      previousOwner: assertAddress(previousOwner, "previous Settler owner"),
    },
  });
  const execution = zeroExConfirmedExecutionSchema.parse({
    ...facts,
    integrityHash: getExecutionIntegrityHash(facts),
  });
  requireValidConfirmedExecution(execution, fromAmount);
  return execution;
}
