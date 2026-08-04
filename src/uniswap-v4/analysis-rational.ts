import { Web3AgentError } from "../api/errors.js";
import {
  decimalIntegerSchema,
  positiveDecimalIntegerSchema,
  signedDecimalIntegerSchema,
} from "../api/schemas/uniswap-v4/primitives.js";

export type ExactRational = {
  readonly denominator: string;
  readonly numerator: string;
  readonly rounding: "exact";
};

function greatestCommonDivisor(left: bigint, right: bigint): bigint {
  let dividend = left < 0n ? -left : left;
  let divisor = right < 0n ? -right : right;
  while (divisor !== 0n) {
    const remainder = dividend % divisor;
    dividend = divisor;
    divisor = remainder;
  }
  return dividend;
}

export function exactRational(numerator: bigint, denominator: bigint): ExactRational {
  if (denominator === 0n) {
    throw new Web3AgentError({
      code: "UNISWAP_V4_ANALYSIS_QUOTE_DENOMINATOR_ZERO",
      message: "Exact rational denominator must be positive",
    });
  }
  const normalizedNumerator = denominator < 0n ? -numerator : numerator;
  const normalizedDenominator = denominator < 0n ? -denominator : denominator;
  const divisor = greatestCommonDivisor(normalizedNumerator, normalizedDenominator);
  return {
    denominator: (normalizedDenominator / divisor).toString(),
    numerator: (normalizedNumerator / divisor).toString(),
    rounding: "exact",
  };
}

export function parseExactRational(value: ExactRational): {
  readonly numerator: bigint;
  readonly denominator: bigint;
} {
  try {
    return {
      denominator: BigInt(positiveDecimalIntegerSchema.parse(value.denominator)),
      numerator: BigInt(signedDecimalIntegerSchema.parse(value.numerator)),
    };
  } catch (error: unknown) {
    throw new Web3AgentError({
      cause: error,
      code: "UNISWAP_V4_ANALYSIS_PRICE_INVALID",
      message: "Price must be an exact rational with a positive denominator",
    });
  }
}

export function parseAmount(value: string, field: string): bigint {
  try {
    return BigInt(decimalIntegerSchema.parse(value));
  } catch (error: unknown) {
    throw new Web3AgentError({
      cause: error,
      code: "UNISWAP_V4_ANALYSIS_INPUT_INVALID",
      details: { field },
      message: `${field} must be a canonical unsigned decimal integer`,
    });
  }
}

export function powerOfTen(decimals: number): bigint {
  return 10n ** BigInt(decimals);
}
