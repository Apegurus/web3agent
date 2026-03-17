import { describe, expect, it } from "vitest";
import type { BlockscoutSmartContract } from "../../../src/api/explorer/blockscout/types.js";
import {
  normalizeBlockscoutContractAbi,
  normalizeBlockscoutContractSource,
  normalizeEtherscanContractAbi,
  normalizeEtherscanContractSource,
} from "../../../src/api/explorer/contracts.js";
import type { EtherscanContractSource } from "../../../src/api/explorer/etherscan/types.js";

const bsContract: BlockscoutSmartContract = {
  name: "UniswapV3Pool",
  compiler_version: "v0.7.6+commit.7338295f",
  optimization_enabled: true,
  source_code: "pragma solidity ^0.7.6;\ncontract UniswapV3Pool {}",
  abi: [
    { type: "function", name: "swap", inputs: [], outputs: [] },
    { type: "event", name: "Swap", inputs: [] },
  ],
  constructor_args: "0000000000000000000000001234",
  additional_sources: [
    {
      file_path: "interfaces/IUniswapV3Pool.sol",
      source_code: "interface IUniswapV3Pool {}",
    },
  ],
  is_proxy: false,
  implementations: [],
};

const bsProxyContract: BlockscoutSmartContract = {
  ...bsContract,
  is_proxy: true,
  implementations: [{ address: "0ximpl", name: "Implementation" }],
};

describe("normalizeBlockscoutContractAbi", () => {
  it("maps contractAddress", () => {
    const result = normalizeBlockscoutContractAbi("0xcontract", bsContract);
    expect(result.contractAddress).toBe("0xcontract");
  });

  it("casts abi array", () => {
    const result = normalizeBlockscoutContractAbi("0xcontract", bsContract);
    expect(result.abi).toHaveLength(2);
    expect(result.abi[0]).toMatchObject({ type: "function", name: "swap" });
  });

  it("maps name", () => {
    const result = normalizeBlockscoutContractAbi("0xcontract", bsContract);
    expect(result.name).toBe("UniswapV3Pool");
  });

  it("maps compiler_version to compiler", () => {
    const result = normalizeBlockscoutContractAbi("0xcontract", bsContract);
    expect(result.compiler).toBe("v0.7.6+commit.7338295f");
  });

  it("maps is_proxy to isProxy", () => {
    const result = normalizeBlockscoutContractAbi("0xcontract", bsContract);
    expect(result.isProxy).toBe(false);
  });

  it("maps first implementation address", () => {
    const result = normalizeBlockscoutContractAbi("0xcontract", bsProxyContract);
    expect(result.isProxy).toBe(true);
    expect(result.implementationAddress).toBe("0ximpl");
  });

  it("omits implementationAddress when no implementations", () => {
    const result = normalizeBlockscoutContractAbi("0xcontract", bsContract);
    expect(result.implementationAddress).toBeUndefined();
  });

  it("omits name when null", () => {
    const raw: BlockscoutSmartContract = { ...bsContract, name: null };
    const result = normalizeBlockscoutContractAbi("0xcontract", raw);
    expect(result.name).toBeUndefined();
  });
});

describe("normalizeBlockscoutContractSource", () => {
  it("maps contractAddress and sourceCode", () => {
    const result = normalizeBlockscoutContractSource("0xcontract", bsContract);
    expect(result.contractAddress).toBe("0xcontract");
    expect(result.sourceCode).toBe("pragma solidity ^0.7.6;\ncontract UniswapV3Pool {}");
  });

  it("maps name and compiler", () => {
    const result = normalizeBlockscoutContractSource("0xcontract", bsContract);
    expect(result.name).toBe("UniswapV3Pool");
    expect(result.compiler).toBe("v0.7.6+commit.7338295f");
  });

  it("maps optimizationEnabled", () => {
    const result = normalizeBlockscoutContractSource("0xcontract", bsContract);
    expect(result.optimizationEnabled).toBe(true);
  });

  it("maps additional_sources", () => {
    const result = normalizeBlockscoutContractSource("0xcontract", bsContract);
    expect(result.additionalSources).toHaveLength(1);
    expect(result.additionalSources?.[0]).toMatchObject({
      filename: "interfaces/IUniswapV3Pool.sol",
      code: "interface IUniswapV3Pool {}",
    });
  });

  it("omits additionalSources when empty", () => {
    const raw: BlockscoutSmartContract = { ...bsContract, additional_sources: [] };
    const result = normalizeBlockscoutContractSource("0xcontract", raw);
    expect(result.additionalSources).toBeUndefined();
  });

  it("maps constructor_args to constructorArgs", () => {
    const result = normalizeBlockscoutContractSource("0xcontract", bsContract);
    expect(result.constructorArgs).toBe("0000000000000000000000001234");
  });

  it("omits constructorArgs when null", () => {
    const raw: BlockscoutSmartContract = { ...bsContract, constructor_args: null };
    const result = normalizeBlockscoutContractSource("0xcontract", raw);
    expect(result.constructorArgs).toBeUndefined();
  });
});

const esContractAbiJson = JSON.stringify([
  { type: "function", name: "balanceOf", inputs: [{ name: "account", type: "address" }] },
]);

describe("normalizeEtherscanContractAbi", () => {
  it("parses abiJson string to array", () => {
    const result = normalizeEtherscanContractAbi("0xcontract", esContractAbiJson);
    expect(result.contractAddress).toBe("0xcontract");
    expect(result.abi).toHaveLength(1);
    expect(result.abi[0]).toMatchObject({ type: "function", name: "balanceOf" });
  });
});

const esSource: EtherscanContractSource = {
  SourceCode: "pragma solidity ^0.8.0;\ncontract Token {}",
  ABI: esContractAbiJson,
  ContractName: "Token",
  CompilerVersion: "v0.8.17+commit.8df45f5f",
  OptimizationUsed: "1",
  Runs: "200",
  ConstructorArguments: "00000000000000000000000000000001",
  EVMVersion: "london",
  Library: "",
  LicenseType: "MIT",
  Proxy: "0",
  Implementation: "",
  SwarmSource: "",
};

const esProxySource: EtherscanContractSource = {
  ...esSource,
  Proxy: "1",
  Implementation: "0ximpl",
};

describe("normalizeEtherscanContractSource", () => {
  it("maps contractAddress and sourceCode", () => {
    const result = normalizeEtherscanContractSource("0xcontract", esSource);
    expect(result.contractAddress).toBe("0xcontract");
    expect(result.sourceCode).toBe("pragma solidity ^0.8.0;\ncontract Token {}");
  });

  it("maps ContractName to name", () => {
    const result = normalizeEtherscanContractSource("0xcontract", esSource);
    expect(result.name).toBe("Token");
  });

  it("maps CompilerVersion to compiler", () => {
    const result = normalizeEtherscanContractSource("0xcontract", esSource);
    expect(result.compiler).toBe("v0.8.17+commit.8df45f5f");
  });

  it("maps OptimizationUsed='1' to optimizationEnabled=true", () => {
    const result = normalizeEtherscanContractSource("0xcontract", esSource);
    expect(result.optimizationEnabled).toBe(true);
  });

  it("maps OptimizationUsed='0' to optimizationEnabled=false", () => {
    const raw: EtherscanContractSource = { ...esSource, OptimizationUsed: "0" };
    const result = normalizeEtherscanContractSource("0xcontract", raw);
    expect(result.optimizationEnabled).toBe(false);
  });

  it("maps ConstructorArguments to constructorArgs", () => {
    const result = normalizeEtherscanContractSource("0xcontract", esSource);
    expect(result.constructorArgs).toBe("00000000000000000000000000000001");
  });

  it("handles proxy source", () => {
    const result = normalizeEtherscanContractSource("0xcontract", esProxySource);
    // source schema doesn't have isProxy; just verify it doesn't throw
    expect(result.contractAddress).toBe("0xcontract");
  });
});
