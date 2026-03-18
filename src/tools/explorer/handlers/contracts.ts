import type { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import {
  normalizeBlockscoutContractAbi,
  normalizeBlockscoutContractSource,
  normalizeEtherscanContractAbi,
  normalizeEtherscanContractCreator,
  normalizeEtherscanContractSource,
} from "../../../api/explorer/contracts.js";
import type {
  EtherscanContractCreator,
  EtherscanContractSource,
} from "../../../api/explorer/etherscan/types.js";
import type { ToolDefinition } from "../../register.js";
import { createToolHandler } from "../../shared/handler-factory.js";
import {
  explorerGetContractAbiSchema,
  explorerGetContractCodeSchema,
  explorerGetContractCreatorSchema,
  explorerGetContractSourceSchema,
} from "../schemas.js";
import type { ExplorerDeps } from "./shared.js";
import { requireEtherscan, withFallback } from "./shared.js";

type ContractInput = z.infer<typeof explorerGetContractAbiSchema>;
type ContractCreatorInput = z.infer<typeof explorerGetContractCreatorSchema>;
type ContractCodeInput = z.infer<typeof explorerGetContractCodeSchema>;

export function getContractToolDefinitions(deps: ExplorerDeps): ToolDefinition[] {
  const { blockscout, etherscan } = deps;

  return [
    {
      name: "explorer_get_contract_abi",
      category: "explorer",
      description:
        "Fetch the ABI for a verified smart contract. Works only for source-verified contracts.",
      inputSchema: zodToJsonSchema(explorerGetContractAbiSchema) as Record<string, unknown>,
      handler: createToolHandler(
        explorerGetContractAbiSchema,
        async (input: ContractInput) => {
          return withFallback(deps, input.chainId, "contracts", async (backend) => {
            if (backend === "blockscout") {
              const raw = await blockscout.getSmartContract(input.chainId, input.contractAddress);
              return normalizeBlockscoutContractAbi(input.contractAddress, raw);
            }
            const eth = requireEtherscan(etherscan);
            const abi = await eth.call<string>(input.chainId, "contract", "getabi", {
              address: input.contractAddress,
            });
            return normalizeEtherscanContractAbi(input.contractAddress, abi);
          });
        },
        "EXPLORER_CONTRACT_ABI_ERROR"
      ),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    {
      name: "explorer_get_contract_source",
      category: "explorer",
      description: "Get verified source code for a smart contract.",
      inputSchema: zodToJsonSchema(explorerGetContractSourceSchema) as Record<string, unknown>,
      handler: createToolHandler(
        explorerGetContractSourceSchema,
        async (input: ContractInput) => {
          return withFallback(deps, input.chainId, "contract_source", async (backend) => {
            if (backend === "blockscout") {
              const raw = await blockscout.getSmartContract(input.chainId, input.contractAddress);
              return normalizeBlockscoutContractSource(input.contractAddress, raw);
            }
            const eth = requireEtherscan(etherscan);
            const raw = await eth.call<EtherscanContractSource[]>(
              input.chainId,
              "contract",
              "getsourcecode",
              { address: input.contractAddress }
            );
            return normalizeEtherscanContractSource(input.contractAddress, raw[0]);
          });
        },
        "EXPLORER_CONTRACT_SOURCE_ERROR"
      ),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    {
      name: "explorer_get_contract_creator",
      category: "explorer",
      description: "Find who deployed a contract and the creation transaction hash.",
      inputSchema: zodToJsonSchema(explorerGetContractCreatorSchema) as Record<string, unknown>,
      handler: createToolHandler(
        explorerGetContractCreatorSchema,
        async (input: ContractCreatorInput) => {
          const eth = requireEtherscan(etherscan);
          const raw = await eth.call<EtherscanContractCreator[]>(
            input.chainId,
            "contract",
            "getcontractcreation",
            { contractaddresses: input.contractAddress }
          );
          if (!raw || raw.length === 0) {
            throw new Error("Contract creation info not found");
          }
          return normalizeEtherscanContractCreator(raw[0]);
        },
        "EXPLORER_CONTRACT_CREATOR_ERROR"
      ),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    {
      name: "explorer_get_contract_code",
      category: "explorer",
      description: "Get the deployed bytecode of a contract at a given address.",
      inputSchema: zodToJsonSchema(explorerGetContractCodeSchema) as Record<string, unknown>,
      handler: createToolHandler(
        explorerGetContractCodeSchema,
        async (input: ContractCodeInput) => {
          const eth = requireEtherscan(etherscan);
          const bytecode = await eth.call<string>(input.chainId, "proxy", "eth_getCode", {
            address: input.contractAddress,
            tag: "latest",
          });
          return {
            contractAddress: input.contractAddress,
            bytecode,
          };
        },
        "EXPLORER_CONTRACT_CODE_ERROR"
      ),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
  ];
}
