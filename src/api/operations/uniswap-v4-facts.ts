import type { Address, Hex } from "viem";

import { assertHex } from "../../operations/validation.js";
import { Web3AgentError } from "../errors.js";

export function facts(action: {
  readonly data: Hex;
  readonly dataHash: string;
  readonly to: Address;
  readonly value: string;
}): { readonly data: Hex; readonly dataHash: Hex; readonly to: Address; readonly value: string } {
  return {
    data: action.data,
    dataHash: assertHex(action.dataHash, "canonical transaction data hash"),
    to: action.to,
    value: action.value,
  };
}

export function invalid(message: string): Web3AgentError {
  return new Web3AgentError({ code: "INVALID_PARAMS", message });
}
