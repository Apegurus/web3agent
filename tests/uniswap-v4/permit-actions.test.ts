import { decodeFunctionData } from "viem";
import { describe, expect, it } from "vitest";

import { buildPermit2PermitTransaction, permit2Abi } from "../../src/uniswap-v4/permit-actions.js";

describe("Uniswap v4 browser-wallet Permit2 binding", () => {
  it("Given a verified Permit2 signature When deriving its submission transaction Then the exact signature is embedded in canonical Permit2 calldata", () => {
    const signature = `0x${"11".repeat(65)}` as const;
    const transaction = buildPermit2PermitTransaction({
      account: "0x1111111111111111111111111111111111111111",
      permit: {
        details: [
          {
            amount: "100",
            expiration: "2000000000",
            nonce: "7",
            token: "0x2222222222222222222222222222222222222222",
          },
        ],
        sigDeadline: "2000000000",
        spender: "0x3333333333333333333333333333333333333333",
      },
      permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
      signature,
    });

    const decoded = decodeFunctionData({ abi: permit2Abi, data: transaction.data });
    expect(transaction.to).toBe("0x000000000022D473030F116dDEE9F6B43aC78BA3");
    expect(decoded.functionName).toBe("permit");
    expect(decoded.args[2]).toBe(signature);
  });
});
