import { describe, expect, it } from "vitest";
import { normalizeEtherscanContractCreator } from "../../../src/api/explorer/contracts.js";
import type { EtherscanContractCreator } from "../../../src/api/explorer/etherscan/types.js";

const baseCreator: EtherscanContractCreator = {
  contractAddress: "0xdac17f958d2ee523a2206206994597c13d831ec7",
  contractCreator: "0x36928500bc1dcd7af6a2b4008875cc336b927d57",
  txHash: "0x2f1c5c2b44f771e942a8506148e256f94f1a464babc938ae0690c6e34cd79190",
};

describe("normalizeEtherscanContractCreator", () => {
  it("maps contractAddress", () => {
    const result = normalizeEtherscanContractCreator(baseCreator);
    expect(result.contractAddress).toBe("0xdac17f958d2ee523a2206206994597c13d831ec7");
  });

  it("maps contractCreator to creatorAddress", () => {
    const result = normalizeEtherscanContractCreator(baseCreator);
    expect(result.creatorAddress).toBe("0x36928500bc1dcd7af6a2b4008875cc336b927d57");
  });

  it("maps txHash", () => {
    const result = normalizeEtherscanContractCreator(baseCreator);
    expect(result.txHash).toBe(
      "0x2f1c5c2b44f771e942a8506148e256f94f1a464babc938ae0690c6e34cd79190"
    );
  });
});
