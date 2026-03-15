import type { ToolCategory } from "../../runtime/types.js";
import type { ToolDefinition } from "../../tools/register.js";
import {
  evmApproveTokenSpending,
  evmGetAllowance,
  evmGetBalance,
  evmGetBlock,
  evmGetChainInfo,
  evmGetContractAbi,
  evmGetErc1155Balance,
  evmGetGasPrice,
  evmGetLatestBlock,
  evmGetNftInfo,
  evmGetSupportedNetworks,
  evmGetTokenBalance,
  evmGetTransaction,
  evmGetTransactionReceipt,
  evmGetWalletAddress,
  evmListRegisteredAbis,
  evmLookupEnsAddress,
  evmMulticall,
  evmReadContract,
  evmRegisterAbi,
  evmResolveEnsName,
  evmSignMessage,
  evmSignTypedData,
  evmTransferErc20,
  evmTransferNative,
  evmWaitForTransaction,
  evmWriteContract,
} from "./handlers.js";

const CATEGORY: ToolCategory = "onchain";

export function getEvmToolDefinitions(): ToolDefinition[] {
  return [
    {
      name: "evm_get_wallet_address",
      category: CATEGORY,
      description: "Get the currently active wallet address, mode, and chain context.",
      inputSchema: {
        type: "object" as const,
        properties: {},
        required: [],
      },
      handler: evmGetWalletAddress,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    {
      name: "evm_get_chain_info",
      category: CATEGORY,
      description: "Get basic chain status including latest block number for a chain ID.",
      inputSchema: {
        type: "object" as const,
        properties: {
          chainId: { type: "number", description: "Chain ID (defaults to configured chain)" },
        },
        required: [],
      },
      handler: evmGetChainInfo,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    {
      name: "evm_get_supported_networks",
      category: CATEGORY,
      description: "List supported EVM networks available for EVM tool operations.",
      inputSchema: {
        type: "object" as const,
        properties: {},
        required: [],
      },
      handler: evmGetSupportedNetworks,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    {
      name: "evm_get_gas_price",
      category: CATEGORY,
      description: "Get current base gas price and priority fee estimates for a chain.",
      inputSchema: {
        type: "object" as const,
        properties: {
          chainId: { type: "number", description: "Chain ID (defaults to configured chain)" },
        },
        required: [],
      },
      handler: evmGetGasPrice,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    {
      name: "evm_resolve_ens_name",
      category: CATEGORY,
      description: "Resolve an ENS name to an EVM address.",
      inputSchema: {
        type: "object" as const,
        properties: {
          ensName: { type: "string", description: "ENS name (for example vitalik.eth)" },
          chainId: { type: "number", description: "Target chain ID" },
        },
        required: ["ensName"],
      },
      handler: evmResolveEnsName,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    {
      name: "evm_lookup_ens_address",
      category: CATEGORY,
      description: "Perform reverse ENS lookup for an address.",
      inputSchema: {
        type: "object" as const,
        properties: {
          address: { type: "string", description: "Address to reverse-resolve" },
          chainId: { type: "number", description: "Target chain ID" },
        },
        required: ["address"],
      },
      handler: evmLookupEnsAddress,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    {
      name: "evm_get_block",
      category: CATEGORY,
      description: "Get block details by block number string or block hash.",
      inputSchema: {
        type: "object" as const,
        properties: {
          blockIdentifier: {
            type: "string",
            description: "Block number (decimal string) or 0x-prefixed block hash",
          },
          chainId: { type: "number", description: "Target chain ID" },
        },
        required: ["blockIdentifier"],
      },
      handler: evmGetBlock,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    {
      name: "evm_get_latest_block",
      category: CATEGORY,
      description: "Get the latest block details for a chain.",
      inputSchema: {
        type: "object" as const,
        properties: {
          chainId: { type: "number", description: "Target chain ID" },
        },
        required: [],
      },
      handler: evmGetLatestBlock,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    {
      name: "evm_get_transaction",
      category: CATEGORY,
      description: "Get transaction details for a transaction hash.",
      inputSchema: {
        type: "object" as const,
        properties: {
          txHash: { type: "string", description: "Transaction hash" },
          chainId: { type: "number", description: "Target chain ID" },
        },
        required: ["txHash"],
      },
      handler: evmGetTransaction,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    {
      name: "evm_get_transaction_receipt",
      category: CATEGORY,
      description: "Get the transaction receipt (status, logs, gas usage) for a hash.",
      inputSchema: {
        type: "object" as const,
        properties: {
          txHash: { type: "string", description: "Transaction hash" },
          chainId: { type: "number", description: "Target chain ID" },
        },
        required: ["txHash"],
      },
      handler: evmGetTransactionReceipt,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    {
      name: "evm_wait_for_transaction",
      category: CATEGORY,
      description: "Wait for transaction confirmations and return the confirmed receipt.",
      inputSchema: {
        type: "object" as const,
        properties: {
          txHash: { type: "string", description: "Transaction hash" },
          confirmations: { type: "number", description: "Required confirmation count" },
          chainId: { type: "number", description: "Target chain ID" },
        },
        required: ["txHash"],
      },
      handler: evmWaitForTransaction,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    {
      name: "evm_get_balance",
      category: CATEGORY,
      description: "Get native token balance (ETH, MATIC, etc.) for an address or ENS name.",
      inputSchema: {
        type: "object" as const,
        properties: {
          address: { type: "string", description: "Wallet address or ENS name" },
          chainId: { type: "number", description: "Chain ID (defaults to configured chain)" },
        },
        required: ["address"],
      },
      handler: evmGetBalance,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    {
      name: "evm_get_token_balance",
      category: CATEGORY,
      description: "Get ERC-20 token balance for an owner address.",
      inputSchema: {
        type: "object" as const,
        properties: {
          tokenAddress: { type: "string", description: "ERC-20 token contract address" },
          ownerAddress: { type: "string", description: "Owner wallet address" },
          chainId: { type: "number", description: "Chain ID (defaults to configured chain)" },
        },
        required: ["tokenAddress", "ownerAddress"],
      },
      handler: evmGetTokenBalance,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    {
      name: "evm_get_allowance",
      category: CATEGORY,
      description: "Get ERC-20 allowance from owner to spender for a token contract.",
      inputSchema: {
        type: "object" as const,
        properties: {
          tokenAddress: { type: "string", description: "ERC-20 token contract address" },
          ownerAddress: {
            type: "string",
            description: "Owner wallet address (defaults to active wallet when available)",
          },
          spenderAddress: { type: "string", description: "Approved spender address" },
          chainId: { type: "number", description: "Chain ID (defaults to configured chain)" },
        },
        required: ["tokenAddress", "spenderAddress"],
      },
      handler: evmGetAllowance,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    {
      name: "evm_get_contract_abi",
      category: CATEGORY,
      description: "Fetch a contract ABI from Etherscan for a specific chain.",
      inputSchema: {
        type: "object" as const,
        properties: {
          contractAddress: { type: "string", description: "Contract address" },
          chainId: { type: "number", description: "Chain ID (defaults to configured chain)" },
        },
        required: ["contractAddress"],
      },
      handler: evmGetContractAbi,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    {
      name: "evm_register_abi",
      category: CATEGORY,
      description:
        "Register a contract ABI under a label for reuse. Once registered, pass abiLabel to evm_read_contract, evm_write_contract, or evm_multicall instead of repeating the full ABI JSON on every call.",
      inputSchema: {
        type: "object" as const,
        properties: {
          label: {
            type: "string",
            description: "Short label to reference this ABI (e.g. 'uniswap-router', 'aave-pool')",
          },
          abiJson: { type: "string", description: "Full contract ABI as JSON string" },
        },
        required: ["label", "abiJson"],
      },
      handler: evmRegisterAbi,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    {
      name: "evm_list_registered_abis",
      category: CATEGORY,
      description: "List all ABI labels registered via evm_register_abi.",
      inputSchema: {
        type: "object" as const,
        properties: {},
        required: [],
      },
      handler: evmListRegisteredAbis,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    {
      name: "evm_read_contract",
      category: CATEGORY,
      description:
        "Read contract state by function name. Provide abiLabel (from evm_register_abi), abiJson, or let the tool auto-resolve from Etherscan.",
      inputSchema: {
        type: "object" as const,
        properties: {
          contractAddress: { type: "string", description: "Contract address" },
          functionName: { type: "string", description: "Function name to call" },
          args: {
            type: "array",
            description: "Function arguments as strings",
            items: { type: "string" },
          },
          abiJson: { type: "string", description: "Optional ABI JSON string" },
          abiLabel: {
            type: "string",
            description: "Label of a registered ABI (from evm_register_abi)",
          },
          chainId: { type: "number", description: "Chain ID (defaults to configured chain)" },
        },
        required: ["contractAddress", "functionName"],
      },
      handler: evmReadContract,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    {
      name: "evm_get_nft_info",
      category: CATEGORY,
      description: "Get ERC-721 NFT details including collection metadata, owner, and tokenURI.",
      inputSchema: {
        type: "object" as const,
        properties: {
          tokenAddress: { type: "string", description: "ERC-721 contract address" },
          tokenId: { type: "string", description: "Token ID as string" },
          chainId: { type: "number", description: "Chain ID (defaults to configured chain)" },
        },
        required: ["tokenAddress", "tokenId"],
      },
      handler: evmGetNftInfo,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    {
      name: "evm_get_erc1155_balance",
      category: CATEGORY,
      description: "Get ERC-1155 token balance for an owner and token ID.",
      inputSchema: {
        type: "object" as const,
        properties: {
          tokenAddress: { type: "string", description: "ERC-1155 contract address" },
          tokenId: { type: "string", description: "Token ID as string" },
          ownerAddress: { type: "string", description: "Owner wallet address" },
          chainId: { type: "number", description: "Chain ID (defaults to configured chain)" },
        },
        required: ["tokenAddress", "tokenId", "ownerAddress"],
      },
      handler: evmGetErc1155Balance,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    {
      name: "evm_multicall",
      category: CATEGORY,
      description: "Batch multiple contract read calls into one multicall RPC request.",
      inputSchema: {
        type: "object" as const,
        properties: {
          calls: {
            type: "array",
            description: "Contract calls to execute",
            items: {
              type: "object",
              properties: {
                contractAddress: { type: "string" },
                functionName: { type: "string" },
                args: { type: "array", items: { type: "string" } },
                abiJson: { type: "string" },
                abiLabel: { type: "string" },
              },
              required: ["contractAddress", "functionName"],
            },
          },
          allowFailure: { type: "boolean", description: "Continue if individual call fails" },
          chainId: { type: "number", description: "Chain ID (defaults to configured chain)" },
        },
        required: ["calls"],
      },
      handler: evmMulticall,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    {
      name: "evm_write_contract",
      category: CATEGORY,
      description:
        "Execute a state-changing contract function. Provide abiLabel (from evm_register_abi), abiJson, or let the tool auto-resolve. Confirmation-gated.",
      inputSchema: {
        type: "object" as const,
        properties: {
          contractAddress: { type: "string", description: "Contract address" },
          functionName: { type: "string", description: "State-changing function name" },
          args: {
            type: "array",
            description: "Function arguments as strings",
            items: { type: "string" },
          },
          value: { type: "string", description: "Optional native amount in ether units" },
          abiJson: { type: "string", description: "Optional ABI JSON string" },
          abiLabel: {
            type: "string",
            description: "Label of a registered ABI (from evm_register_abi)",
          },
          chainId: { type: "number", description: "Chain ID (defaults to configured chain)" },
        },
        required: ["contractAddress", "functionName"],
      },
      handler: evmWriteContract,
      annotations: { destructiveHint: true, openWorldHint: true },
    },
    {
      name: "evm_transfer_native",
      category: CATEGORY,
      description: "Send native tokens (ETH, MATIC, etc.) to an address or ENS name.",
      inputSchema: {
        type: "object" as const,
        properties: {
          to: { type: "string", description: "Recipient address or ENS name" },
          amount: { type: "string", description: "Amount in ether units" },
          chainId: { type: "number", description: "Chain ID (defaults to configured chain)" },
        },
        required: ["to", "amount"],
      },
      handler: evmTransferNative,
      annotations: { destructiveHint: true, openWorldHint: true },
    },
    {
      name: "evm_transfer_erc20",
      category: CATEGORY,
      description:
        "Transfer ERC-20 tokens. Amount is in the token's smallest unit (e.g. for USDC with 6 decimals, '1000000' = 1 USDC). Use evm_get_token_balance to check decimals first.",
      inputSchema: {
        type: "object" as const,
        properties: {
          tokenAddress: { type: "string", description: "ERC-20 token address" },
          to: { type: "string", description: "Recipient address or ENS name" },
          amount: {
            type: "string",
            description:
              "Token amount in smallest units (wei-equivalent). For USDC (6 decimals): '1000000' = 1 USDC. For WETH (18 decimals): '1000000000000000000' = 1 WETH.",
          },
          chainId: { type: "number", description: "Chain ID (defaults to configured chain)" },
        },
        required: ["tokenAddress", "to", "amount"],
      },
      handler: evmTransferErc20,
      annotations: { destructiveHint: true, openWorldHint: true },
    },
    {
      name: "evm_approve_token_spending",
      category: CATEGORY,
      description: "Approve ERC-20 spender allowance using raw token units.",
      inputSchema: {
        type: "object" as const,
        properties: {
          tokenAddress: { type: "string", description: "ERC-20 token address" },
          spenderAddress: { type: "string", description: "Spender address or ENS name" },
          amount: { type: "string", description: "Raw token allowance amount" },
          chainId: { type: "number", description: "Chain ID (defaults to configured chain)" },
        },
        required: ["tokenAddress", "spenderAddress", "amount"],
      },
      handler: evmApproveTokenSpending,
      annotations: { destructiveHint: true, openWorldHint: true },
    },
    {
      name: "evm_sign_message",
      category: CATEGORY,
      description: "Sign an arbitrary UTF-8 message with the active wallet.",
      inputSchema: {
        type: "object" as const,
        properties: {
          message: { type: "string", description: "Message to sign" },
        },
        required: ["message"],
      },
      handler: evmSignMessage,
      annotations: { destructiveHint: true, openWorldHint: true },
    },
    {
      name: "evm_sign_typed_data",
      category: CATEGORY,
      description: "Sign EIP-712 typed data payload with the active wallet.",
      inputSchema: {
        type: "object" as const,
        properties: {
          domainJson: { type: "string", description: "EIP-712 domain JSON string" },
          typesJson: { type: "string", description: "EIP-712 types JSON string" },
          primaryType: { type: "string", description: "Primary type name" },
          messageJson: { type: "string", description: "Typed message JSON string" },
        },
        required: ["domainJson", "typesJson", "primaryType", "messageJson"],
      },
      handler: evmSignTypedData,
      annotations: { destructiveHint: true, openWorldHint: true },
    },
  ];
}
