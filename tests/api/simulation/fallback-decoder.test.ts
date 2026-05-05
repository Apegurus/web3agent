import { encodeFunctionData, parseAbi } from "viem";
import { describe, expect, it } from "vitest";
import {
  NATIVE_ASSET_ADDRESS,
  decodeFallbackBalanceChanges,
} from "../../../src/api/simulation/fallback-decoder.js";

describe("decodeFallbackBalanceChanges", () => {
  const tokenAddress = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

  it("decodes transfer", () => {
    const data = encodeFunctionData({
      abi: parseAbi(["function transfer(address to, uint256 amount)"]),
      functionName: "transfer",
      args: ["0x9999999999999999999999999999999999999999", 123n],
    });

    const result = decodeFallbackBalanceChanges({
      from: "0x1234567890123456789012345678901234567890",
      to: tokenAddress,
      data,
      value: 0n,
    });

    expect(result).toEqual([{ token: tokenAddress, direction: "out", amount: 123n }]);
  });

  it("decodes deposit", () => {
    const data = encodeFunctionData({
      abi: parseAbi(["function deposit()"]),
      functionName: "deposit",
    });

    const result = decodeFallbackBalanceChanges({
      from: "0x1234567890123456789012345678901234567890",
      to: tokenAddress,
      data,
      value: 500n,
    });

    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          token: NATIVE_ASSET_ADDRESS,
          direction: "out",
        }),
        expect.objectContaining({
          token: tokenAddress,
          direction: "in",
        }),
      ])
    );
  });

  it("decodes withdraw", () => {
    const data = encodeFunctionData({
      abi: parseAbi(["function withdraw(uint256 amount)"]),
      functionName: "withdraw",
      args: [200n],
    });

    const result = decodeFallbackBalanceChanges({
      from: "0x1234567890123456789012345678901234567890",
      to: tokenAddress,
      data,
      value: 0n,
    });

    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          token: tokenAddress,
          direction: "out",
        }),
        expect.objectContaining({
          token: NATIVE_ASSET_ADDRESS,
          direction: "in",
        }),
      ])
    );
  });

  it("returns empty for unknown selector", () => {
    const result = decodeFallbackBalanceChanges({
      from: "0x1234567890123456789012345678901234567890",
      to: tokenAddress,
      data: "0xdeadbeef",
      value: 0n,
    });

    expect(result).toEqual([]);
  });
});
