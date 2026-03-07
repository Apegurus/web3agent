// Canonical Permit2 address — same on all EVM chains
export const PERMIT2_ADDRESS = "0x000000000022D473030F116dDEE9F6B43aC78BA3";

export const MAX_APPROVAL =
  "115792089237316195423570985008687907853269984665640564039457584007913129639935";

export interface ApprovalCheck {
  token: string;
  spender: string;
  requiredAmount: string;
}

export function buildApprovalCheck(srcToken: string, srcAmount: string): ApprovalCheck {
  return {
    token: srcToken,
    spender: PERMIT2_ADDRESS,
    requiredAmount: srcAmount,
  };
}

export function buildApproveCalldata(
  spender: string,
  amount?: string
): {
  functionName: string;
  args: [string, string];
} {
  return {
    functionName: "approve",
    args: [spender, amount ?? MAX_APPROVAL],
  };
}
