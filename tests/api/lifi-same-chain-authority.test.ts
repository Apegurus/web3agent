import { encodeFunctionData, erc20Abi } from "viem";
import { describe, expect, it } from "vitest";
import { assertTrustedLifiSameChainPlan } from "../../src/api/operations/lifi-same-chain-authority.js";

const account = "0x1234567890123456789012345678901234567890" as const;
const token = "0x3333333333333333333333333333333333333333" as const;
const permit2 = "0x000000000022D473030F116dDEE9F6B43aC78BA3" as const;
const diamond = "0x2222222222222222222222222222222222222222" as const;
const attacker = "0x9999999999999999999999999999999999999999" as const;
const finalAction = {
  id: "bridge:execute:0",
  label: "Execute bridge",
  type: "transaction" as const,
  tx: { chainId: 4663, data: "0xabcdef" as const, from: account, to: diamond, value: "0" },
};

function approvalAction(spender: `0x${string}`) {
  return {
    id: "bridge:approval:0",
    label: "Approve bridge spender",
    type: "transaction" as const,
    tx: {
      chainId: 4663,
      data: encodeFunctionData({
        abi: erc20Abi,
        functionName: "approve",
        args: [spender, 1000n],
      }),
      from: account,
      to: token,
      value: "0",
    },
  };
}

const input = {
  account,
  fromAmount: "1000",
  fromChainId: 4663,
  fromToken: token,
  integration: "lifi",
  kind: "swap",
  toChainId: 4663,
  toToken: "0x4444444444444444444444444444444444444444",
} as const;
const chain = { diamondAddress: diamond, id: 4663, permit2 };

describe("Robinhood LI.FI authority", () => {
  it("accepts an approval and execution plan bound to canonical LI.FI contracts", () => {
    expect(() =>
      assertTrustedLifiSameChainPlan({
        chain,
        finalAction,
        input,
        stages: [[approvalAction(permit2)]],
      })
    ).not.toThrow();
  });

  it("rejects an approval spender outside canonical LI.FI contracts", () => {
    expect(() =>
      assertTrustedLifiSameChainPlan({
        chain,
        finalAction,
        input,
        stages: [[approvalAction(attacker)]],
      })
    ).toThrowError(expect.objectContaining({ code: "LIFI_ROUTE_AUTHORITY_MISMATCH" }));
  });

  it("rejects an execution target outside canonical LI.FI contracts", () => {
    expect(() =>
      assertTrustedLifiSameChainPlan({
        chain,
        finalAction: { ...finalAction, tx: { ...finalAction.tx, to: attacker } },
        input,
        stages: [],
      })
    ).toThrowError(expect.objectContaining({ code: "LIFI_ROUTE_AUTHORITY_MISMATCH" }));
  });
});
