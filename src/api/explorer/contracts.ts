import type {
  ExplorerContractAbi,
  ExplorerContractCreator,
  ExplorerContractSource,
} from "../types.js";
import type { BlockscoutSmartContract } from "./blockscout/types.js";
import type { EtherscanContractCreator, EtherscanContractSource } from "./etherscan/types.js";

export function normalizeBlockscoutContractAbi(
  contractAddress: string,
  raw: BlockscoutSmartContract
): ExplorerContractAbi {
  const result: ExplorerContractAbi = {
    contractAddress,
    abi: raw.abi as Record<string, unknown>[],
  };

  if (raw.name != null) {
    result.name = raw.name;
  }

  if (raw.compiler_version != null) {
    result.compiler = raw.compiler_version;
  }

  result.isProxy = raw.is_proxy;

  if (raw.implementations.length > 0) {
    result.implementationAddress = raw.implementations[0].address;
  }

  return result;
}

export function normalizeBlockscoutContractSource(
  contractAddress: string,
  raw: BlockscoutSmartContract
): ExplorerContractSource {
  const result: ExplorerContractSource = {
    contractAddress,
    sourceCode: raw.source_code,
  };

  if (raw.name != null) {
    result.name = raw.name;
  }

  if (raw.compiler_version != null) {
    result.compiler = raw.compiler_version;
  }

  result.optimizationEnabled = raw.optimization_enabled;

  if (raw.additional_sources.length > 0) {
    result.additionalSources = raw.additional_sources.map((s) => ({
      filename: s.file_path,
      code: s.source_code,
    }));
  }

  if (raw.constructor_args != null) {
    result.constructorArgs = raw.constructor_args;
  }

  return result;
}

export function normalizeEtherscanContractAbi(
  contractAddress: string,
  abiJson: string
): ExplorerContractAbi {
  let abi: Record<string, unknown>[];
  try {
    abi = JSON.parse(abiJson) as Record<string, unknown>[];
  } catch (e: unknown) {
    throw new Error(`Contract ABI not available: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (!Array.isArray(abi)) {
    throw new Error("Contract ABI not available (source not verified or invalid response)");
  }
  return {
    contractAddress,
    abi,
  };
}

export function normalizeEtherscanContractSource(
  contractAddress: string,
  raw: EtherscanContractSource
): ExplorerContractSource {
  const result: ExplorerContractSource = {
    contractAddress,
    sourceCode: raw.SourceCode,
  };

  if (raw.ContractName) {
    result.name = raw.ContractName;
  }

  if (raw.CompilerVersion) {
    result.compiler = raw.CompilerVersion;
  }

  result.optimizationEnabled = raw.OptimizationUsed === "1";

  // isProxy not in source schema (only ABI schema); proxy status omitted here

  if (raw.ConstructorArguments) {
    result.constructorArgs = raw.ConstructorArguments;
  }

  return result;
}

export function normalizeEtherscanContractCreator(
  raw: EtherscanContractCreator
): ExplorerContractCreator {
  return {
    contractAddress: raw.contractAddress,
    creatorAddress: raw.contractCreator,
    txHash: raw.txHash,
  };
}
