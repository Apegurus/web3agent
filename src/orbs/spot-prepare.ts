/**
 * Pure function to prepare a Spot order: validates params, applies defaults,
 * computes chunk math, builds EIP-712 typed data, and generates ERC-20 approval calldata.
 * No network calls — pure computation.
 */

import { encodeFunctionData, maxUint256 } from "viem";
import {
  SPOT_SKELETON,
  getSpotAdapter,
  getSpotApiUrl,
  getSpotContracts,
  isSpotChainSupported,
} from "./spot-config.js";

/* ---------- Constants (from order.sh) ---------- */

const MAX_SLIPPAGE = 5000;
const DEF_SLIPPAGE = 500;
const EXCLUSIVITY = 0;
const FRESHNESS = 30;
const TTL = 300;
const DEF_CHUNKED_EPOCH = 60;

/* ---------- ERC-20 approve ABI ---------- */

const APPROVE_ABI = [
  {
    type: "function" as const,
    name: "approve" as const,
    inputs: [
      { name: "spender", type: "address" } as const,
      { name: "amount", type: "uint256" } as const,
    ],
    outputs: [{ type: "bool" } as const],
    stateMutability: "nonpayable" as const,
  },
] as const;

/* ---------- Types ---------- */

export interface SpotOrderParams {
  chainId: number;
  swapper: string;
  fromToken: string;
  fromAmount: string;
  toToken: string;
  fromMaxAmount?: string;
  nonce?: number;
  start?: number;
  deadline?: number;
  epoch?: number;
  slippage?: number;
  outputLimit?: string;
  outputTriggerLower?: string;
  outputTriggerUpper?: string;
  outputRecipient?: string;
  exactApproval?: boolean;
}

export interface SpotPreparedOrder {
  meta: {
    kind: "single" | "chunked";
    chunkCount: number;
    chunkInputAmount: string;
    start: number;
    deadline: number;
    epoch: number;
    limit: string;
  };
  warnings: string[];
  approval: {
    token: string;
    spender: string;
    amount: string;
    exactApproval: boolean;
    tx: { to: string; data: `0x${string}`; value: string };
  };
  typedData: {
    domain: {
      name: "RePermit";
      version: "1";
      chainId: number;
      verifyingContract: string;
    };
    primaryType: "RePermitWitnessTransferFrom";
    types: typeof SPOT_SKELETON.types;
    message: {
      permitted: { token: string; amount: string };
      spender: string;
      nonce: string;
      deadline: string;
      witness: {
        reactor: string;
        executor: string;
        exchange: { adapter: string; ref: string; share: number; data: string };
        swapper: string;
        nonce: string;
        start: string;
        deadline: string;
        chainid: number;
        exclusivity: number;
        epoch: number;
        slippage: number;
        freshness: number;
        input: { token: string; amount: string; maxAmount: string };
        output: {
          token: string;
          limit: string;
          triggerLower: string;
          triggerUpper: string;
          recipient: string;
        };
      };
    };
  };
  submit: {
    url: string;
    body: {
      order: object;
      signature: null;
      status: "pending";
    };
  };
  query: { url: string };
}

/* ---------- Main function ---------- */

export function prepareSpotOrder(params: SpotOrderParams): SpotPreparedOrder {
  const contracts = getSpotContracts();
  const warnings: string[] = [];

  /* ---- Validation ---- */

  if (!isSpotChainSupported(params.chainId)) {
    throw new Error(`Unsupported chain: ${params.chainId}`);
  }

  if (params.fromToken.toLowerCase() === contracts.zero.toLowerCase()) {
    throw new Error("native input token not supported; wrap to WNATIVE first");
  }

  const fromAmountBig = BigInt(params.fromAmount);
  if (fromAmountBig === 0n) {
    throw new Error("fromAmount must be non-zero");
  }

  if (params.fromToken.toLowerCase() === params.toToken.toLowerCase()) {
    throw new Error("fromToken and toToken must differ");
  }

  const fromMaxAmount = params.fromMaxAmount ?? params.fromAmount;
  const fromMaxAmountBig = BigInt(fromMaxAmount);

  if (fromAmountBig > fromMaxAmountBig) {
    throw new Error("fromAmount cannot exceed fromMaxAmount");
  }

  const slippage = params.slippage ?? DEF_SLIPPAGE;
  if (slippage > MAX_SLIPPAGE) {
    throw new Error(`slippage ${slippage} exceeds maximum ${MAX_SLIPPAGE}`);
  }

  const triggerLower = params.outputTriggerLower ?? "0";
  const triggerUpper = params.outputTriggerUpper ?? "0";
  if (BigInt(triggerUpper) > 0n && BigInt(triggerLower) > BigInt(triggerUpper)) {
    throw new Error("triggerLower cannot exceed triggerUpper");
  }

  /* ---- Chunk math ---- */

  let effectiveMaxAmount = fromMaxAmount;
  let effectiveMaxAmountBig = fromMaxAmountBig;

  if (fromMaxAmountBig % fromAmountBig !== 0n) {
    effectiveMaxAmountBig = (fromMaxAmountBig / fromAmountBig) * fromAmountBig;
    effectiveMaxAmount = effectiveMaxAmountBig.toString();
    warnings.push(
      `fromMaxAmount rounded down from ${fromMaxAmount} to ${effectiveMaxAmount} for even chunk sizes`
    );
  }

  const chunkCount = Number(effectiveMaxAmountBig / fromAmountBig);
  const isSingle = params.fromAmount === effectiveMaxAmount;

  /* ---- Epoch resolution ---- */

  let epoch: number;
  if (params.epoch !== undefined) {
    epoch = params.epoch;
  } else {
    epoch = isSingle ? 0 : DEF_CHUNKED_EPOCH;
  }

  /* ---- Chunked validation ---- */

  if (!isSingle && epoch === 0) {
    throw new Error("chunked orders require epoch > 0");
  }

  if (epoch !== 0 && FRESHNESS >= epoch) {
    throw new Error(`freshness (${FRESHNESS}) must be less than epoch (${epoch})`);
  }

  /* ---- Defaults ---- */

  const nowS = Math.floor(Date.now() / 1000);
  const nonce = params.nonce ?? nowS;
  const start = params.start ?? nowS;
  const deadline = params.deadline ?? start + TTL + chunkCount * epoch;
  const outputLimit = params.outputLimit ?? "0";
  const outputRecipient = params.outputRecipient ?? params.swapper;

  /* ---- Warnings ---- */

  if (slippage < DEF_SLIPPAGE) {
    warnings.push("slippage below default (5%); low slippage can reduce fill probability");
  }

  if (outputRecipient.toLowerCase() !== params.swapper.toLowerCase()) {
    warnings.push("recipient differs from swapper");
  }

  /* ---- Adapter ---- */

  const adapter = getSpotAdapter(params.chainId);

  /* ---- Approval calldata ---- */

  const approvalAmount = params.exactApproval ? effectiveMaxAmountBig : maxUint256;
  const approvalData = encodeFunctionData({
    abi: APPROVE_ABI,
    functionName: "approve",
    args: [contracts.repermit, approvalAmount],
  });

  /* ---- Build typed data ---- */

  const witness = {
    reactor: contracts.reactor,
    executor: contracts.executor,
    exchange: {
      adapter,
      ref: contracts.zero,
      share: 0,
      data: "0x",
    },
    swapper: params.swapper,
    nonce: String(nonce),
    start: String(start),
    deadline: String(deadline),
    chainid: params.chainId,
    exclusivity: EXCLUSIVITY,
    epoch,
    slippage,
    freshness: FRESHNESS,
    input: {
      token: params.fromToken,
      amount: params.fromAmount,
      maxAmount: effectiveMaxAmount,
    },
    output: {
      token: params.toToken,
      limit: outputLimit,
      triggerLower,
      triggerUpper,
      recipient: outputRecipient,
    },
  };

  const message = {
    permitted: {
      token: params.fromToken,
      amount: effectiveMaxAmount,
    },
    spender: contracts.reactor,
    nonce: String(nonce),
    deadline: String(deadline),
    witness,
  };

  const typedData = {
    domain: {
      name: "RePermit" as const,
      version: "1" as const,
      chainId: params.chainId,
      verifyingContract: contracts.repermit as string,
    },
    primaryType: SPOT_SKELETON.primaryType,
    types: SPOT_SKELETON.types,
    message,
  };

  /* ---- API URLs ---- */

  const apiUrl = getSpotApiUrl();

  return {
    meta: {
      kind: isSingle ? "single" : "chunked",
      chunkCount,
      chunkInputAmount: params.fromAmount,
      start,
      deadline,
      epoch,
      limit: outputLimit,
    },
    warnings,
    approval: {
      token: params.fromToken,
      spender: contracts.repermit,
      amount: effectiveMaxAmount,
      exactApproval: params.exactApproval ?? false,
      tx: {
        to: params.fromToken,
        data: approvalData,
        value: "0",
      },
    },
    typedData,
    submit: {
      url: `${apiUrl}/orders/new`,
      body: {
        order: typedData.message,
        signature: null,
        status: "pending",
      },
    },
    query: {
      url: `${apiUrl}/orders`,
    },
  };
}
