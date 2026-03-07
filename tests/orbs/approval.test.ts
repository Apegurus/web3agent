import { describe, expect, it } from "vitest";
import {
  MAX_APPROVAL,
  PERMIT2_ADDRESS,
  buildApprovalCheck,
  buildApproveCalldata,
} from "../../src/orbs/approval.js";

describe("orbs approval utilities", () => {
  it("exports canonical permit2 constants", () => {
    expect(PERMIT2_ADDRESS).toBe("0x000000000022D473030F116dDEE9F6B43aC78BA3");
    expect(MAX_APPROVAL).toBe(
      "115792089237316195423570985008687907853269984665640564039457584007913129639935"
    );
  });

  it("builds approval check using permit2 spender", () => {
    const check = buildApprovalCheck("0xToken", "1000000000000000000");

    expect(check).toEqual({
      token: "0xToken",
      spender: PERMIT2_ADDRESS,
      requiredAmount: "1000000000000000000",
    });
  });

  it("preserves boundary and empty-string input values in approval check", () => {
    const check = buildApprovalCheck("", "0");

    expect(check.token).toBe("");
    expect(check.requiredAmount).toBe("0");
    expect(check.spender).toBe(PERMIT2_ADDRESS);
  });

  it("builds approve calldata with explicit amount", () => {
    const calldata = buildApproveCalldata("0xSpender", "42");

    expect(calldata).toEqual({
      functionName: "approve",
      args: ["0xSpender", "42"],
    });
  });

  it("defaults approve calldata amount to MAX_APPROVAL when amount is missing", () => {
    const calldata = buildApproveCalldata("0xSpender");

    expect(calldata.functionName).toBe("approve");
    expect(calldata.args).toEqual(["0xSpender", MAX_APPROVAL]);
  });

  it("does not override empty string explicit amount", () => {
    const calldata = buildApproveCalldata("0xSpender", "");

    expect(calldata.args).toEqual(["0xSpender", ""]);
  });
});
