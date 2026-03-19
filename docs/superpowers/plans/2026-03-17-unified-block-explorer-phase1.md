# Unified Block Explorer — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the RemoteMcpAdapter-based Blockscout/Etherscan MCP proxies with a unified block explorer module that calls REST APIs directly, exposing 10 core tools under the `explorer_` prefix with full SDK layer support.

**Architecture:** Two thin REST clients (Blockscout v2 API, Etherscan API) behind a capability-aware router. The API layer normalizes responses into shared Zod output schemas. Tools use `createToolHandler`. SDK functions use `getRuntime()` + `invokeAndRequireData()`.

**Tech Stack:** Zod, zod-to-json-schema, viem (for address validation), resilientFetch (for HTTP with retry/circuit-breaker), vitest

**Spec:** `docs/superpowers/specs/2026-03-16-unified-block-explorer-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/api/schemas/common.ts` | Modify | Add `chainIdRequiredSchema` |
| `src/api/schemas/explorer.ts` | Create | Shared explorer input base schemas |
| `src/api/schemas/explorer-outputs.ts` | Create | Normalized output schemas for Phase 1 tools |
| `src/api/explorer/etherscan/types.ts` | Create | Raw Etherscan response types |
| `src/api/explorer/etherscan/client.ts` | Create | Etherscan REST client with rate limiting |
| `src/api/explorer/etherscan/chains.ts` | Create | chainId → Etherscan base URL mapping |
| `src/api/explorer/blockscout/types.ts` | Create | Raw Blockscout response types |
| `src/api/explorer/blockscout/client.ts` | Create | Blockscout v2 REST client |
| `src/api/explorer/blockscout/chains.ts` | Create | chainId → Blockscout instance URL mapping |
| `src/api/explorer/router.ts` | Create | Chain+capability routing with fallback |
| `src/api/explorer/accounts.ts` | Create | Address info, tokens by address normalization |
| `src/api/explorer/transactions.ts` | Create | Tx history, details, receipt normalization |
| `src/api/explorer/tokens.ts` | Create | Token transfers, NFT inventory normalization |
| `src/api/explorer/contracts.ts` | Create | Contract ABI, source code normalization |
| `src/api/explorer/blocks.ts` | Create | Block info normalization |
| `src/tools/explorer/schemas.ts` | Create | Per-tool input schemas (10 tools) |
| `src/tools/explorer/index.ts` | Create | Tool definitions + handlers (10 tools) |
| `src/api/explorer.ts` | Create | SDK entry point (10 public functions) |
| `src/api/types.ts` | Modify | Add z.infer aliases for explorer output schemas |
| `src/index.ts` | Modify | Export explorer SDK functions, schemas, types |
| `src/config/env.ts` | Modify | Replace MCP URL vars with REST API vars |
| `src/types/health.ts` | Modify | Add explorer health type |
| `src/runtime/managed-runtime.ts` | Modify | Register explorer tools alongside adapters |

**Test files (mirror src/):**

| File | Tests |
|------|-------|
| `tests/api/explorer/etherscan/client.test.ts` | Etherscan client: URL resolution, rate limiting, error handling |
| `tests/api/explorer/blockscout/client.test.ts` | Blockscout client: URL resolution, error handling |
| `tests/api/explorer/router.test.ts` | Router: chain resolution, capability routing, fallback |
| `tests/api/explorer/accounts.test.ts` | Account normalization from both backends |
| `tests/api/explorer/transactions.test.ts` | Transaction normalization from both backends |
| `tests/api/explorer/tokens.test.ts` | Token transfer + NFT normalization |
| `tests/api/explorer/contracts.test.ts` | Contract ABI + source normalization |
| `tests/api/explorer/blocks.test.ts` | Block info normalization |
| `tests/tools/explorer/explorer-tools.test.ts` | Tool handler validation + dispatch |
| `tests/api/explorer.test.ts` | SDK entry point: parseInput + invocation |

---

## Chunk 1: Foundation — Schemas, Types, Config

### Task 1: Add `chainIdRequiredSchema` to common schemas

**Files:**
- Modify: `src/api/schemas/common.ts`
- Test: existing `tests/tools/schema-quality.test.ts` covers `.describe()` enforcement

- [ ] **Step 1: Add chainIdRequiredSchema**

In `src/api/schemas/common.ts`, after the existing `chainIdOptionalSchema` definition, add:

```typescript
export const chainIdRequiredSchema = z
  .number()
  .describe("Chain ID for the target network (required — no default for indexed data)");
```

- [ ] **Step 2: Run typecheck + existing tests**

Run: `pnpm run typecheck && pnpm test -- --run tests/tools/schema-quality.test.ts`
Expected: PASS (no breaking changes, new schema is additive)

- [ ] **Step 3: Commit**

```bash
git add src/api/schemas/common.ts
git commit -m "feat(schemas): add chainIdRequiredSchema for explorer tools"
```

---

### Task 2: Create shared explorer input schemas

**Files:**
- Create: `src/api/schemas/explorer.ts`

- [ ] **Step 1: Write the schema file**

```typescript
import { z } from "zod";
import { addressSchema, chainIdRequiredSchema } from "./common.js";

export const explorerBaseSchema = z.object({
  chainId: chainIdRequiredSchema,
});

export const explorerAddressSchema = explorerBaseSchema.extend({
  address: addressSchema.describe("Target address (0x-prefixed)"),
});

export const explorerPaginatedSchema = z.object({
  page: z.number().optional().describe("Page number (starts at 1)"),
  pageSize: z.number().optional().describe("Results per page (default varies by endpoint)"),
});

export const explorerTimeRangeSchema = z.object({
  startBlock: z.number().optional().describe("Start block number"),
  endBlock: z.number().optional().describe("End block number"),
});

export const explorerTxHashSchema = explorerBaseSchema.extend({
  txHash: z.string().describe("Transaction hash (0x-prefixed)"),
});

export const explorerContractSchema = explorerBaseSchema.extend({
  contractAddress: addressSchema.describe("Contract address (0x-prefixed)"),
});

export const explorerBlockSchema = explorerBaseSchema.extend({
  blockNumber: z.number().describe("Block number"),
  includeTxs: z.boolean().optional().describe("Include full transaction objects (default false)"),
});
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm run typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/api/schemas/explorer.ts
git commit -m "feat(schemas): add shared explorer input base schemas"
```

---

### Task 3: Create explorer output schemas (Phase 1)

**Files:**
- Create: `src/api/schemas/explorer-outputs.ts`

- [ ] **Step 1: Write the output schema file**

```typescript
import { z } from "zod";

// --- Accounts ---

export const explorerAddressInfoSchema = z.object({
  address: z.string().describe("Address hash"),
  balance: z.string().describe("Native token balance in wei"),
  balanceUsd: z.string().optional().describe("Balance value in USD"),
  isContract: z.boolean().describe("Whether the address is a contract"),
  isVerified: z.boolean().optional().describe("Whether the contract is verified"),
  name: z.string().optional().describe("Contract or ENS name"),
  ensDomain: z.string().optional().describe("ENS domain name"),
  tags: z.array(z.string()).optional().describe("Public tags/labels"),
  tokenHoldings: z.number().optional().describe("Number of distinct token types held"),
});

export const explorerTokenHoldingSchema = z.object({
  contractAddress: z.string().describe("Token contract address"),
  symbol: z.string().optional().describe("Token symbol"),
  name: z.string().optional().describe("Token name"),
  decimals: z.number().optional().describe("Token decimals"),
  balance: z.string().describe("Token balance in smallest units"),
  balanceUsd: z.string().optional().describe("Balance value in USD"),
  type: z.enum(["ERC-20", "ERC-721", "ERC-1155"]).describe("Token standard"),
});

export const explorerTokensByAddressSchema = z.object({
  address: z.string().describe("Queried address"),
  tokens: z.array(explorerTokenHoldingSchema).describe("Token holdings"),
});

// --- Transactions ---

export const explorerTransactionSchema = z.object({
  hash: z.string().describe("Transaction hash"),
  blockNumber: z.number().describe("Block number"),
  timestamp: z.string().describe("ISO 8601 timestamp"),
  from: z.string().describe("Sender address"),
  to: z.string().optional().describe("Recipient address (null for contract creation)"),
  value: z.string().describe("Value transferred in wei"),
  gasUsed: z.string().optional().describe("Gas used"),
  gasPrice: z.string().optional().describe("Gas price in wei"),
  fee: z.string().optional().describe("Transaction fee in wei"),
  status: z.enum(["success", "failed", "pending"]).describe("Execution status"),
  method: z.string().optional().describe("Decoded method name"),
  nonce: z.number().optional().describe("Transaction nonce"),
});

export const explorerTxHistorySchema = z.object({
  transactions: z.array(explorerTransactionSchema).describe("Transaction list"),
  hasMore: z.boolean().optional().describe("Whether more pages are available"),
});

export const explorerTxDetailsSchema = explorerTransactionSchema.extend({
  input: z.string().optional().describe("Raw input data"),
  decodedInput: z.record(z.unknown()).optional().describe("Decoded function call parameters"),
  tokenTransfers: z.array(z.object({
    token: z.string().describe("Token contract address"),
    symbol: z.string().optional().describe("Token symbol"),
    from: z.string().describe("Transfer sender"),
    to: z.string().describe("Transfer recipient"),
    value: z.string().describe("Transfer amount"),
    type: z.string().optional().describe("Token type (ERC-20, ERC-721, etc.)"),
  })).optional().describe("Token transfers within this transaction"),
  logs: z.number().optional().describe("Number of event logs emitted"),
});

export const explorerTxReceiptSchema = z.object({
  hash: z.string().describe("Transaction hash"),
  status: z.enum(["success", "failed"]).describe("Execution status"),
  blockNumber: z.number().describe("Block number"),
  gasUsed: z.string().describe("Gas used"),
  effectiveGasPrice: z.string().optional().describe("Effective gas price"),
  cumulativeGasUsed: z.string().optional().describe("Cumulative gas used in block"),
  contractAddress: z.string().optional().describe("Created contract address (if contract creation)"),
  logsCount: z.number().optional().describe("Number of logs emitted"),
  revertReason: z.string().optional().describe("Revert reason (if failed)"),
});

// --- Token Transfers ---

export const explorerTokenTransferSchema = z.object({
  hash: z.string().describe("Transaction hash"),
  blockNumber: z.number().describe("Block number"),
  timestamp: z.string().describe("ISO 8601 timestamp"),
  from: z.string().describe("Sender address"),
  to: z.string().describe("Recipient address"),
  token: z.string().describe("Token contract address"),
  symbol: z.string().optional().describe("Token symbol"),
  decimals: z.number().optional().describe("Token decimals"),
  value: z.string().describe("Transfer amount in smallest units"),
  type: z.string().optional().describe("Token type (ERC-20, ERC-721, ERC-1155)"),
});

export const explorerTokenTransfersSchema = z.object({
  transfers: z.array(explorerTokenTransferSchema).describe("Token transfer list"),
  hasMore: z.boolean().optional().describe("Whether more pages are available"),
});

export const explorerNftItemSchema = z.object({
  contractAddress: z.string().describe("NFT contract address"),
  name: z.string().optional().describe("Collection name"),
  symbol: z.string().optional().describe("Collection symbol"),
  tokenId: z.string().describe("Token ID"),
  tokenType: z.enum(["ERC-721", "ERC-1155"]).describe("Token standard"),
  balance: z.string().optional().describe("Balance (for ERC-1155)"),
  metadata: z.record(z.unknown()).optional().describe("Token metadata"),
});

export const explorerNftInventorySchema = z.object({
  address: z.string().describe("Queried address"),
  nfts: z.array(explorerNftItemSchema).describe("NFT holdings"),
  hasMore: z.boolean().optional().describe("Whether more pages are available"),
});

// --- Contracts ---

export const explorerContractAbiSchema = z.object({
  contractAddress: z.string().describe("Contract address"),
  abi: z.array(z.record(z.unknown())).describe("Contract ABI as JSON array"),
  name: z.string().optional().describe("Contract name"),
  compiler: z.string().optional().describe("Compiler version"),
  isProxy: z.boolean().optional().describe("Whether the contract is a proxy"),
  implementationAddress: z.string().optional().describe("Implementation address (if proxy)"),
});

export const explorerContractSourceSchema = z.object({
  contractAddress: z.string().describe("Contract address"),
  name: z.string().optional().describe("Contract name"),
  compiler: z.string().optional().describe("Compiler version"),
  optimizationEnabled: z.boolean().optional().describe("Whether optimization was enabled"),
  sourceCode: z.string().describe("Verified source code (main file or flattened)"),
  additionalSources: z.array(z.object({
    filename: z.string().describe("Source file name"),
    code: z.string().describe("Source code content"),
  })).optional().describe("Additional source files"),
  constructorArgs: z.string().optional().describe("Constructor arguments (hex-encoded)"),
});

// --- Blocks ---

export const explorerBlockInfoSchema = z.object({
  number: z.number().describe("Block number"),
  hash: z.string().describe("Block hash"),
  timestamp: z.string().describe("ISO 8601 timestamp"),
  parentHash: z.string().describe("Parent block hash"),
  miner: z.string().describe("Miner/validator address"),
  gasUsed: z.string().describe("Total gas used"),
  gasLimit: z.string().describe("Block gas limit"),
  baseFeePerGas: z.string().optional().describe("Base fee per gas (EIP-1559)"),
  txCount: z.number().describe("Number of transactions"),
  reward: z.string().optional().describe("Block reward in wei"),
  transactions: z.array(explorerTransactionSchema).optional().describe("Transactions (if requested)"),
});
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm run typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/api/schemas/explorer-outputs.ts
git commit -m "feat(schemas): add Phase 1 explorer output schemas"
```

---

### Task 4: Add explorer types to `src/api/types.ts`

**Files:**
- Modify: `src/api/types.ts`

- [ ] **Step 1: Add imports and type aliases**

At the end of the imports section in `src/api/types.ts`, add the import for explorer output schemas. Then at the end of the file, add the `z.infer` type aliases:

```typescript
// Import (add with other schema imports — must be value import, not `import type`, because typeof needs runtime binding)
import {
  explorerAddressInfoSchema,
  explorerBlockInfoSchema,
  explorerContractAbiSchema,
  explorerContractSourceSchema,
  explorerNftInventorySchema,
  explorerNftItemSchema,
  explorerTokenHoldingSchema,
  explorerTokenTransferSchema,
  explorerTokenTransfersSchema,
  explorerTokensByAddressSchema,
  explorerTransactionSchema,
  explorerTxDetailsSchema,
  explorerTxHistorySchema,
  explorerTxReceiptSchema,
} from "./schemas/explorer-outputs.js";

// Type aliases (add at end of file)
export type ExplorerAddressInfo = z.infer<typeof explorerAddressInfoSchema>;
export type ExplorerTokenHolding = z.infer<typeof explorerTokenHoldingSchema>;
export type ExplorerTokensByAddress = z.infer<typeof explorerTokensByAddressSchema>;
export type ExplorerTransaction = z.infer<typeof explorerTransactionSchema>;
export type ExplorerTxHistory = z.infer<typeof explorerTxHistorySchema>;
export type ExplorerTxDetails = z.infer<typeof explorerTxDetailsSchema>;
export type ExplorerTxReceipt = z.infer<typeof explorerTxReceiptSchema>;
export type ExplorerTokenTransfer = z.infer<typeof explorerTokenTransferSchema>;
export type ExplorerTokenTransfers = z.infer<typeof explorerTokenTransfersSchema>;
export type ExplorerNftItem = z.infer<typeof explorerNftItemSchema>;
export type ExplorerNftInventory = z.infer<typeof explorerNftInventorySchema>;
export type ExplorerContractAbi = z.infer<typeof explorerContractAbiSchema>;
export type ExplorerContractSource = z.infer<typeof explorerContractSourceSchema>;
export type ExplorerBlockInfo = z.infer<typeof explorerBlockInfoSchema>;
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm run typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/api/types.ts
git commit -m "feat(types): add explorer type aliases derived from output schemas"
```

---

### Task 5: Update env config for explorer REST APIs

**Files:**
- Modify: `src/config/env.ts`

- [ ] **Step 1: Add REST API config vars alongside existing MCP vars**

In the defaults section near the top, add:

```typescript
const BLOCKSCOUT_DEFAULT_API_URL = "https://eth.blockscout.com";
const ETHERSCAN_DEFAULT_API_URL = "https://api.etherscan.io";
```

In the config object (around line 89, alongside the existing MCP vars), add:

```typescript
    blockscoutApiUrl: env.BLOCKSCOUT_API_URL || BLOCKSCOUT_DEFAULT_API_URL,
    etherscanApiUrl: env.ETHERSCAN_API_URL || ETHERSCAN_DEFAULT_API_URL,
```

Keep the existing `blockscoutMcpUrl`, `etherscanMcpUrl`, and `etherscanApiKey` — they'll be removed in the adapter removal PR, not now.

- [ ] **Step 2: Update RuntimeConfig type**

Wherever `RuntimeConfig` is defined (likely `src/config/env.ts` or a type file), add:

```typescript
  blockscoutApiUrl: string;
  etherscanApiUrl: string;
```

- [ ] **Step 3: Run typecheck**

Run: `pnpm run typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/config/env.ts
git commit -m "feat(config): add explorer REST API URL config vars"
```

---

## Chunk 2: REST Clients

### Task 6: Create Etherscan chain URL mapping

**Files:**
- Create: `src/api/explorer/etherscan/chains.ts`
- Test: `tests/api/explorer/etherscan/client.test.ts` (in Task 8)

- [ ] **Step 1: Write the chain mapping**

```typescript
const ETHERSCAN_CHAIN_URLS: Record<number, string> = {
  1: "https://api.etherscan.io",
  10: "https://api-optimistic.etherscan.io",
  56: "https://api.bscscan.com",
  100: "https://api.gnosisscan.io",
  137: "https://api.polygonscan.com",
  324: "https://api-era.zksync.network",
  8453: "https://api.basescan.org",
  42161: "https://api.arbiscan.io",
  43114: "https://api.snowscan.xyz",
  59144: "https://api.lineascan.build",
  534352: "https://api.scrollscan.com",
  81457: "https://api.blastscan.io",
  34443: "https://api.routescan.io/v2/network/mainnet/evm/34443/etherscan",
  5000: "https://api.mantlescan.xyz",
};

export function getEtherscanApiUrl(chainId: number, baseUrlOverride?: string): string | undefined {
  if (baseUrlOverride && chainId === 1) return baseUrlOverride;
  return ETHERSCAN_CHAIN_URLS[chainId];
}

export function getEtherscanSupportedChainIds(): number[] {
  return Object.keys(ETHERSCAN_CHAIN_URLS).map(Number);
}
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm run typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/api/explorer/etherscan/chains.ts
git commit -m "feat(explorer): add Etherscan chain URL mapping"
```

---

### Task 7: Create Etherscan raw response types

**Files:**
- Create: `src/api/explorer/etherscan/types.ts`

- [ ] **Step 1: Write the types file**

```typescript
export interface EtherscanResponse<T = unknown> {
  status: "0" | "1";
  message: string;
  result: T;
}

export interface EtherscanTransaction {
  blockNumber: string;
  timeStamp: string;
  hash: string;
  nonce: string;
  from: string;
  to: string;
  value: string;
  gas: string;
  gasPrice: string;
  gasUsed: string;
  isError: "0" | "1";
  txreceipt_status: "" | "0" | "1";
  input: string;
  methodId: string;
  functionName: string;
  contractAddress: string;
  cumulativeGasUsed: string;
  confirmations: string;
}

export interface EtherscanTokenTransfer {
  blockNumber: string;
  timeStamp: string;
  hash: string;
  nonce: string;
  from: string;
  to: string;
  contractAddress: string;
  tokenName: string;
  tokenSymbol: string;
  tokenDecimal: string;
  value: string;
  transactionIndex: string;
  gas: string;
  gasPrice: string;
  gasUsed: string;
}

export interface EtherscanContractSource {
  SourceCode: string;
  ABI: string;
  ContractName: string;
  CompilerVersion: string;
  OptimizationUsed: "0" | "1";
  Runs: string;
  ConstructorArguments: string;
  EVMVersion: string;
  Library: string;
  LicenseType: string;
  Proxy: "0" | "1";
  Implementation: string;
  SwarmSource: string;
}

export interface EtherscanBlock {
  blockNumber: string;
  timeStamp: string;
  blockMiner: string;
  blockReward: string;
  uncles: Array<{ miner: string; unclePosition: string; blockreward: string }>;
  uncleInclusionReward: string;
}

export interface EtherscanTxStatus {
  isError: "0" | "1";
  errDescription: string;
}

export interface EtherscanTxReceiptStatus {
  status: "" | "0" | "1";
}

export interface EtherscanContractCreator {
  contractAddress: string;
  contractCreator: string;
  txHash: string;
}

export interface EtherscanBalance {
  account: string;
  balance: string;
}
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm run typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/api/explorer/etherscan/types.ts
git commit -m "feat(explorer): add Etherscan raw response types"
```

---

### Task 8: Create Etherscan REST client with tests (TDD)

**Files:**
- Create: `src/api/explorer/etherscan/client.ts`
- Create: `tests/api/explorer/etherscan/client.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock resilientFetch before importing client
vi.mock("../../../../src/utils/resilient-fetch.js", () => ({
  resilientFetch: vi.fn(),
}));

import { resilientFetch } from "../../../../src/utils/resilient-fetch.js";
import { EtherscanClient } from "../../../../src/api/explorer/etherscan/client.js";

const mockFetch = vi.mocked(resilientFetch);

function mockEtherscanResponse(result: unknown, status: "0" | "1" = "1") {
  mockFetch.mockResolvedValueOnce(
    new Response(JSON.stringify({ status, message: "OK", result }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

describe("EtherscanClient", () => {
  let client: EtherscanClient;

  beforeEach(() => {
    client = new EtherscanClient("test-api-key");
    vi.clearAllMocks();
  });

  describe("URL construction", () => {
    it("constructs correct URL for Ethereum mainnet", async () => {
      mockEtherscanResponse("12345");
      await client.call(1, "account", "balance", { address: "0xabc", tag: "latest" });
      const url = new URL(mockFetch.mock.calls[0][0] as string);
      expect(url.origin).toBe("https://api.etherscan.io");
      expect(url.searchParams.get("module")).toBe("account");
      expect(url.searchParams.get("action")).toBe("balance");
      expect(url.searchParams.get("apikey")).toBe("test-api-key");
      expect(url.searchParams.get("address")).toBe("0xabc");
    });

    it("constructs correct URL for Arbitrum", async () => {
      mockEtherscanResponse("12345");
      await client.call(42161, "account", "balance", { address: "0xabc" });
      const url = new URL(mockFetch.mock.calls[0][0] as string);
      expect(url.origin).toBe("https://api.arbiscan.io");
    });

    it("throws for unsupported chain", async () => {
      await expect(client.call(999999, "account", "balance", {})).rejects.toThrow(
        /not supported/,
      );
    });
  });

  describe("response parsing", () => {
    it("returns result on success", async () => {
      mockEtherscanResponse([{ hash: "0x123" }]);
      const result = await client.call(1, "account", "txlist", {});
      expect(result).toEqual([{ hash: "0x123" }]);
    });

    it("throws on NOTOK response", async () => {
      mockEtherscanResponse("Max rate limit reached", "0");
      await expect(client.call(1, "account", "balance", {})).rejects.toThrow(/rate limit/i);
    });

    it("throws on non-200 HTTP status", async () => {
      mockFetch.mockResolvedValueOnce(
        new Response("Server Error", { status: 500 }),
      );
      await expect(client.call(1, "account", "balance", {})).rejects.toThrow();
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- --run tests/api/explorer/etherscan/client.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: Write the client implementation**

```typescript
import { resilientFetch } from "../../../utils/resilient-fetch.js";
import { getEtherscanApiUrl, getEtherscanSupportedChainIds } from "./chains.js";
import type { EtherscanResponse } from "./types.js";

export class EtherscanClient {
  constructor(
    private readonly apiKey: string,
    private readonly baseUrlOverride?: string,
  ) {}

  async call<T = unknown>(
    chainId: number,
    module: string,
    action: string,
    params: Record<string, string> = {},
  ): Promise<T> {
    const baseUrl = getEtherscanApiUrl(chainId, this.baseUrlOverride);
    if (!baseUrl) {
      throw new Error(`Etherscan API not supported for chain ${chainId}`);
    }

    const url = new URL("/api", baseUrl);
    url.searchParams.set("module", module);
    url.searchParams.set("action", action);
    url.searchParams.set("apikey", this.apiKey);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== "") {
        url.searchParams.set(key, value);
      }
    }

    const response = await resilientFetch(url.toString(), {
      method: "GET",
      headers: { Accept: "application/json" },
    }, {
      retry: { maxRetries: 3, baseDelayMs: 200 },
      label: `etherscan:${module}.${action}`,
    });

    if (!response.ok) {
      throw new Error(`Etherscan HTTP ${response.status}: ${await response.text()}`);
    }

    const body = (await response.json()) as EtherscanResponse<T>;

    if (body.status === "0") {
      const msg = typeof body.result === "string" ? body.result : body.message;
      if (/rate limit/i.test(msg)) {
        throw new Error(`Etherscan rate limited: ${msg}`);
      }
      throw new Error(`Etherscan error: ${msg}`);
    }

    return body.result;
  }

  getSupportedChainIds(): number[] {
    return getEtherscanSupportedChainIds();
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- --run tests/api/explorer/etherscan/client.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/api/explorer/etherscan/client.ts tests/api/explorer/etherscan/client.test.ts
git commit -m "feat(explorer): add Etherscan REST client with tests"
```

---

### Task 9: Create Blockscout chain URL mapping

**Files:**
- Create: `src/api/explorer/blockscout/chains.ts`

- [ ] **Step 1: Write the chain mapping**

```typescript
const BLOCKSCOUT_CHAIN_URLS: Record<number, string> = {
  1: "https://eth.blockscout.com",
  10: "https://optimism.blockscout.com",
  100: "https://gnosis.blockscout.com",
  137: "https://polygon.blockscout.com",
  324: "https://zksync.blockscout.com",
  8453: "https://base.blockscout.com",
  42161: "https://arbitrum.blockscout.com",
  534352: "https://scroll.blockscout.com",
};

export function getBlockscoutApiUrl(chainId: number): string | undefined {
  return BLOCKSCOUT_CHAIN_URLS[chainId];
}

export function getBlockscoutSupportedChainIds(): number[] {
  return Object.keys(BLOCKSCOUT_CHAIN_URLS).map(Number);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/api/explorer/blockscout/chains.ts
git commit -m "feat(explorer): add Blockscout chain URL mapping"
```

---

### Task 10: Create Blockscout raw response types

**Files:**
- Create: `src/api/explorer/blockscout/types.ts`

- [ ] **Step 1: Write the types file**

Types based on the Blockscout v2 API response shapes:

```typescript
export interface BlockscoutAddress {
  hash: string;
  coin_balance: string | null;
  exchange_rate: string | null;
  is_contract: boolean;
  is_verified: boolean;
  name: string | null;
  ens_domain_name: string | null;
  public_tags: Array<{ label: string; display_name: string }>;
  has_tokens: boolean;
  has_token_transfers: boolean;
  implementations: Array<{ address_hash: string; name: string }>;
  proxy_type: string | null;
}

export interface BlockscoutToken {
  address: string;
  symbol: string | null;
  name: string | null;
  decimals: string | null;
  type: string;
  balance: string;
  exchange_rate: string | null;
}

export interface BlockscoutTokenList {
  items: BlockscoutToken[];
  next_page_params: Record<string, string> | null;
}

export interface BlockscoutTransaction {
  hash: string;
  block: number;
  timestamp: string;
  from: { hash: string };
  to: { hash: string } | null;
  value: string;
  gas_used: string;
  gas_price: string;
  fee: { value: string } | null;
  status: string;
  method: string | null;
  nonce: number;
  result: string;
  tx_types: string[];
  decoded_input: {
    method_call: string;
    parameters: Array<{ name: string; type: string; value: string }>;
  } | null;
  token_transfers: BlockscoutTokenTransfer[] | null;
  raw_input: string | null;
}

export interface BlockscoutTransactionList {
  items: BlockscoutTransaction[];
  next_page_params: Record<string, string> | null;
}

export interface BlockscoutTokenTransfer {
  block_hash: string;
  block_number: number;
  timestamp: string;
  from: { hash: string };
  to: { hash: string };
  token: {
    address: string;
    symbol: string | null;
    name: string | null;
    decimals: string | null;
    type: string;
  };
  total: { value: string; decimals: string };
  tx_hash: string;
}

export interface BlockscoutTokenTransferList {
  items: BlockscoutTokenTransfer[];
  next_page_params: Record<string, string> | null;
}

export interface BlockscoutBlock {
  height: number;
  hash: string;
  timestamp: string;
  parent_hash: string;
  miner: { hash: string };
  gas_used: string;
  gas_limit: string;
  base_fee_per_gas: string | null;
  tx_count: number;
  rewards: Array<{ type: string; value: string }> | null;
}

export interface BlockscoutSmartContract {
  name: string | null;
  compiler_version: string | null;
  optimization_enabled: boolean;
  source_code: string;
  abi: unknown[];
  constructor_args: string | null;
  additional_sources: Array<{ file_path: string; source_code: string }>;
  is_proxy: boolean;
  implementations: Array<{ address: string; name: string }>;
}

export interface BlockscoutNft {
  token: {
    address: string;
    name: string | null;
    symbol: string | null;
    type: string;
  };
  id: string;
  value: string;
  metadata: Record<string, unknown> | null;
}

export interface BlockscoutNftList {
  items: BlockscoutNft[];
  next_page_params: Record<string, string> | null;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/api/explorer/blockscout/types.ts
git commit -m "feat(explorer): add Blockscout raw response types"
```

---

### Task 11: Create Blockscout REST client with tests (TDD)

**Files:**
- Create: `src/api/explorer/blockscout/client.ts`
- Create: `tests/api/explorer/blockscout/client.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../src/utils/resilient-fetch.js", () => ({
  resilientFetch: vi.fn(),
}));

import { resilientFetch } from "../../../../src/utils/resilient-fetch.js";
import { BlockscoutClient } from "../../../../src/api/explorer/blockscout/client.js";

const mockFetch = vi.mocked(resilientFetch);

function mockJsonResponse(data: unknown) {
  mockFetch.mockResolvedValueOnce(
    new Response(JSON.stringify(data), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

describe("BlockscoutClient", () => {
  let client: BlockscoutClient;

  beforeEach(() => {
    client = new BlockscoutClient();
    vi.clearAllMocks();
  });

  describe("URL construction", () => {
    it("constructs correct URL for Ethereum mainnet", async () => {
      mockJsonResponse({ hash: "0xabc", coin_balance: "1000" });
      await client.getAddress(1, "0xabc");
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toBe("https://eth.blockscout.com/api/v2/addresses/0xabc");
    });

    it("constructs correct URL for Arbitrum", async () => {
      mockJsonResponse({ hash: "0xabc", coin_balance: "1000" });
      await client.getAddress(42161, "0xabc");
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain("arbitrum.blockscout.com");
    });

    it("throws for unsupported chain", async () => {
      await expect(client.getAddress(56, "0xabc")).rejects.toThrow(/not supported/);
    });
  });

  describe("response handling", () => {
    it("returns parsed JSON on success", async () => {
      const data = { hash: "0xabc", coin_balance: "1000", is_contract: false };
      mockJsonResponse(data);
      const result = await client.getAddress(1, "0xabc");
      expect(result).toEqual(data);
    });

    it("throws on HTTP error", async () => {
      mockFetch.mockResolvedValueOnce(
        new Response("Not Found", { status: 404 }),
      );
      await expect(client.getAddress(1, "0xabc")).rejects.toThrow(/404/);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- --run tests/api/explorer/blockscout/client.test.ts`
Expected: FAIL

- [ ] **Step 3: Write the client implementation**

```typescript
import { resilientFetch } from "../../../utils/resilient-fetch.js";
import { getBlockscoutApiUrl, getBlockscoutSupportedChainIds } from "./chains.js";
import type {
  BlockscoutAddress,
  BlockscoutBlock,
  BlockscoutNftList,
  BlockscoutSmartContract,
  BlockscoutTokenList,
  BlockscoutTokenTransferList,
  BlockscoutTransactionList,
} from "./types.js";

export class BlockscoutClient {
  private getBaseUrl(chainId: number): string {
    const url = getBlockscoutApiUrl(chainId);
    if (!url) {
      throw new Error(`Blockscout API not supported for chain ${chainId}`);
    }
    return url;
  }

  private async fetch<T>(url: string): Promise<T> {
    const response = await resilientFetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
    }, {
      retry: { maxRetries: 3, baseDelayMs: 200 },
      label: `blockscout:${new URL(url).pathname}`,
    });

    if (!response.ok) {
      throw new Error(`Blockscout HTTP ${response.status}: ${await response.text()}`);
    }

    return (await response.json()) as T;
  }

  async getAddress(chainId: number, address: string): Promise<BlockscoutAddress> {
    const base = this.getBaseUrl(chainId);
    return this.fetch<BlockscoutAddress>(`${base}/api/v2/addresses/${address}`);
  }

  async getAddressTokens(chainId: number, address: string): Promise<BlockscoutTokenList> {
    const base = this.getBaseUrl(chainId);
    return this.fetch<BlockscoutTokenList>(`${base}/api/v2/addresses/${address}/tokens`);
  }

  async getAddressTransactions(
    chainId: number,
    address: string,
    params?: { page?: number },
  ): Promise<BlockscoutTransactionList> {
    const base = this.getBaseUrl(chainId);
    const url = new URL(`${base}/api/v2/addresses/${address}/transactions`);
    if (params?.page) url.searchParams.set("page", String(params.page));
    return this.fetch<BlockscoutTransactionList>(url.toString());
  }

  async getTransaction(chainId: number, txHash: string): Promise<import("./types.js").BlockscoutTransaction> {
    const base = this.getBaseUrl(chainId);
    return this.fetch(`${base}/api/v2/transactions/${txHash}`);
  }

  async getAddressTokenTransfers(
    chainId: number,
    address: string,
    params?: { token?: string; page?: number },
  ): Promise<BlockscoutTokenTransferList> {
    const base = this.getBaseUrl(chainId);
    const url = new URL(`${base}/api/v2/addresses/${address}/token-transfers`);
    if (params?.token) url.searchParams.set("token", params.token);
    if (params?.page) url.searchParams.set("page", String(params.page));
    return this.fetch<BlockscoutTokenTransferList>(url.toString());
  }

  async getAddressNfts(chainId: number, address: string): Promise<BlockscoutNftList> {
    const base = this.getBaseUrl(chainId);
    return this.fetch<BlockscoutNftList>(`${base}/api/v2/addresses/${address}/nft`);
  }

  async getSmartContract(chainId: number, address: string): Promise<BlockscoutSmartContract> {
    const base = this.getBaseUrl(chainId);
    return this.fetch<BlockscoutSmartContract>(`${base}/api/v2/smart-contracts/${address}`);
  }

  async getBlock(chainId: number, blockNumber: number): Promise<BlockscoutBlock> {
    const base = this.getBaseUrl(chainId);
    return this.fetch<BlockscoutBlock>(`${base}/api/v2/blocks/${blockNumber}`);
  }

  getSupportedChainIds(): number[] {
    return getBlockscoutSupportedChainIds();
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- --run tests/api/explorer/blockscout/client.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/api/explorer/blockscout/client.ts tests/api/explorer/blockscout/client.test.ts
git commit -m "feat(explorer): add Blockscout REST client with tests"
```

---

## Chunk 3: Router

### Task 12: Create capability-aware router with tests (TDD)

**Files:**
- Create: `src/api/explorer/router.ts`
- Create: `tests/api/explorer/router.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
import { beforeEach, describe, expect, it } from "vitest";
import { ExplorerRouter } from "../../../../src/api/explorer/router.js";

describe("ExplorerRouter", () => {
  let router: ExplorerRouter;

  beforeEach(() => {
    router = new ExplorerRouter(
      [1, 137, 42161, 8453, 10, 100, 324, 534352],  // blockscout chains
      [1, 10, 56, 137, 324, 8453, 42161, 43114, 59144, 534352, 81457, 34443, 5000],  // etherscan chains
    );
  });

  describe("resolve", () => {
    it("returns blockscout as primary for shared chains", () => {
      const result = router.resolve(1, "transactions");
      expect(result).toBe("blockscout");
    });

    it("returns etherscan for etherscan-only chains", () => {
      const result = router.resolve(56, "transactions");
      expect(result).toBe("etherscan");
    });

    it("returns etherscan for etherscan-only capabilities on shared chains", () => {
      const result = router.resolve(1, "internal_txs");
      expect(result).toBe("etherscan");
    });

    it("throws for unsupported chain", () => {
      expect(() => router.resolve(999999, "transactions")).toThrow(/not available/);
    });

    it("throws for unsupported capability on chain", () => {
      // BSC has etherscan but not blockscout; "contract_source" is both-capable but BSC only has etherscan
      const result = router.resolve(56, "contract_source");
      expect(result).toBe("etherscan");
    });
  });

  describe("getFallback", () => {
    it("returns etherscan as fallback for shared chains", () => {
      const result = router.getFallback(1, "transactions");
      expect(result).toBe("etherscan");
    });

    it("returns undefined for etherscan-only chains", () => {
      const result = router.getFallback(56, "transactions");
      expect(result).toBeUndefined();
    });

    it("returns undefined for etherscan-only capabilities", () => {
      const result = router.getFallback(1, "internal_txs");
      expect(result).toBeUndefined();
    });
  });

  describe("isChainSupported", () => {
    it("returns true for chains with any backend", () => {
      expect(router.isChainSupported(1)).toBe(true);
      expect(router.isChainSupported(56)).toBe(true);
    });

    it("returns false for unknown chains", () => {
      expect(router.isChainSupported(999999)).toBe(false);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- --run tests/api/explorer/router.test.ts`
Expected: FAIL

- [ ] **Step 3: Write the router implementation**

```typescript
export type BackendId = "blockscout" | "etherscan";

export type ExplorerCapability =
  | "transactions"
  | "tokens"
  | "blocks"
  | "contracts"
  | "accounts"
  | "contract_source"
  | "internal_txs"
  | "event_logs"
  | "network_stats"
  | "price"
  | "nft_transfers"
  | "token_holders"
  | "historical_balance";

// Capabilities supported by each backend
const BLOCKSCOUT_CAPABILITIES: Set<ExplorerCapability> = new Set([
  "transactions",
  "tokens",
  "blocks",
  "contracts",
  "accounts",
  "contract_source",
]);

const ETHERSCAN_CAPABILITIES: Set<ExplorerCapability> = new Set([
  "transactions",
  "tokens",
  "blocks",
  "contracts",
  "accounts",
  "contract_source",
  "internal_txs",
  "event_logs",
  "network_stats",
  "price",
  "nft_transfers",
  "token_holders",
  "historical_balance",
]);

export class ExplorerRouter {
  private readonly blockscoutChains: Set<number>;
  private readonly etherscanChains: Set<number>;

  constructor(blockscoutChainIds: number[], etherscanChainIds: number[]) {
    this.blockscoutChains = new Set(blockscoutChainIds);
    this.etherscanChains = new Set(etherscanChainIds);
  }

  resolve(chainId: number, capability: ExplorerCapability): BackendId {
    const hasBlockscout = this.blockscoutChains.has(chainId) && BLOCKSCOUT_CAPABILITIES.has(capability);
    const hasEtherscan = this.etherscanChains.has(chainId) && ETHERSCAN_CAPABILITIES.has(capability);

    if (!hasBlockscout && !hasEtherscan) {
      if (!this.isChainSupported(chainId)) {
        throw new Error(`Explorer data not available for chain ${chainId}`);
      }
      throw new Error(`Capability "${capability}" not supported on chain ${chainId}`);
    }

    // Prefer blockscout for shared capabilities (no API key needed, richer data)
    if (hasBlockscout) return "blockscout";
    return "etherscan";
  }

  getFallback(chainId: number, capability: ExplorerCapability): BackendId | undefined {
    const primary = this.resolve(chainId, capability);
    if (primary === "blockscout" && this.etherscanChains.has(chainId) && ETHERSCAN_CAPABILITIES.has(capability)) {
      return "etherscan";
    }
    if (primary === "etherscan" && this.blockscoutChains.has(chainId) && BLOCKSCOUT_CAPABILITIES.has(capability)) {
      return "blockscout";
    }
    return undefined;
  }

  isChainSupported(chainId: number): boolean {
    return this.blockscoutChains.has(chainId) || this.etherscanChains.has(chainId);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- --run tests/api/explorer/router.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/api/explorer/router.ts tests/api/explorer/router.test.ts
git commit -m "feat(explorer): add capability-aware router with tests"
```

---

## Chunk 4: Normalization Layer (API)

### Task 13: Create accounts normalization with tests (TDD)

**Files:**
- Create: `src/api/explorer/accounts.ts`
- Create: `tests/api/explorer/accounts.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
import { describe, expect, it } from "vitest";
import {
  normalizeBlockscoutAddress,
  normalizeBlockscoutTokens,
  normalizeEtherscanAddress,
} from "../../../../src/api/explorer/accounts.js";
import type { BlockscoutAddress, BlockscoutToken } from "../../../../src/api/explorer/blockscout/types.js";

describe("accounts normalization", () => {
  describe("normalizeBlockscoutAddress", () => {
    it("normalizes a standard address response", () => {
      const raw: BlockscoutAddress = {
        hash: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
        coin_balance: "1000000000000000000",
        exchange_rate: "3500.00",
        is_contract: false,
        is_verified: false,
        name: null,
        ens_domain_name: "vitalik.eth",
        public_tags: [{ label: "whale", display_name: "Whale" }],
        has_tokens: true,
        has_token_transfers: true,
        implementations: [],
        proxy_type: null,
      };

      const result = normalizeBlockscoutAddress(raw);
      expect(result.address).toBe("0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045");
      expect(result.balance).toBe("1000000000000000000");
      expect(result.isContract).toBe(false);
      expect(result.ensDomain).toBe("vitalik.eth");
      expect(result.tags).toEqual(["Whale"]);
    });
  });

  describe("normalizeBlockscoutTokens", () => {
    it("normalizes token list response", () => {
      const tokens: BlockscoutToken[] = [
        {
          address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
          symbol: "USDC",
          name: "USD Coin",
          decimals: "6",
          type: "ERC-20",
          balance: "5000000",
          exchange_rate: "1.00",
        },
      ];

      const result = normalizeBlockscoutTokens("0xabc", tokens);
      expect(result.tokens).toHaveLength(1);
      expect(result.tokens[0].symbol).toBe("USDC");
      expect(result.tokens[0].type).toBe("ERC-20");
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- --run tests/api/explorer/accounts.test.ts`
Expected: FAIL

- [ ] **Step 3: Write the implementation**

```typescript
import type { ExplorerAddressInfo, ExplorerTokenHolding, ExplorerTokensByAddress } from "../types.js";
import type { BlockscoutAddress, BlockscoutToken } from "./blockscout/types.js";

export function normalizeBlockscoutAddress(raw: BlockscoutAddress): ExplorerAddressInfo {
  return {
    address: raw.hash,
    balance: raw.coin_balance ?? "0",
    isContract: raw.is_contract,
    isVerified: raw.is_verified || undefined,
    name: raw.name ?? undefined,
    ensDomain: raw.ens_domain_name ?? undefined,
    tags: raw.public_tags.length > 0
      ? raw.public_tags.map((t) => t.display_name)
      : undefined,
  };
}

export function normalizeBlockscoutTokens(
  address: string,
  tokens: BlockscoutToken[],
): ExplorerTokensByAddress {
  return {
    address,
    tokens: tokens.map(
      (t): ExplorerTokenHolding => ({
        contractAddress: t.address,
        symbol: t.symbol ?? undefined,
        name: t.name ?? undefined,
        decimals: t.decimals != null ? Number(t.decimals) : undefined,
        balance: t.balance,
        type: t.type as "ERC-20" | "ERC-721" | "ERC-1155",
      }),
    ),
  };
}

export function normalizeEtherscanAddress(
  address: string,
  balance: string,
): ExplorerAddressInfo {
  return {
    address,
    balance,
    isContract: false,  // Etherscan balance endpoint doesn't indicate contract status
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- --run tests/api/explorer/accounts.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/api/explorer/accounts.ts tests/api/explorer/accounts.test.ts
git commit -m "feat(explorer): add accounts normalization with tests"
```

---

### Task 14: Create transactions normalization with tests (TDD)

**Files:**
- Create: `src/api/explorer/transactions.ts`
- Create: `tests/api/explorer/transactions.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
import { describe, expect, it } from "vitest";
import {
  normalizeBlockscoutTransaction,
  normalizeBlockscoutTxDetails,
  normalizeEtherscanTransaction,
} from "../../../../src/api/explorer/transactions.js";
import type { BlockscoutTransaction } from "../../../../src/api/explorer/blockscout/types.js";
import type { EtherscanTransaction } from "../../../../src/api/explorer/etherscan/types.js";

describe("transactions normalization", () => {
  describe("normalizeBlockscoutTransaction", () => {
    it("normalizes a basic transaction", () => {
      const raw: BlockscoutTransaction = {
        hash: "0xabc",
        block: 12345,
        timestamp: "2024-01-01T00:00:00.000000Z",
        from: { hash: "0xsender" },
        to: { hash: "0xrecipient" },
        value: "1000000000000000000",
        gas_used: "21000",
        gas_price: "20000000000",
        fee: { value: "420000000000000" },
        status: "ok",
        method: "transfer",
        nonce: 42,
        result: "success",
        tx_types: ["coin_transfer"],
        decoded_input: null,
        token_transfers: null,
        raw_input: "0x",
      };

      const result = normalizeBlockscoutTransaction(raw);
      expect(result.hash).toBe("0xabc");
      expect(result.blockNumber).toBe(12345);
      expect(result.status).toBe("success");
      expect(result.from).toBe("0xsender");
      expect(result.to).toBe("0xrecipient");
      expect(result.method).toBe("transfer");
    });
  });

  describe("normalizeEtherscanTransaction", () => {
    it("normalizes a basic transaction", () => {
      const raw: EtherscanTransaction = {
        hash: "0xdef",
        blockNumber: "67890",
        timeStamp: "1704067200",
        nonce: "10",
        from: "0xsender",
        to: "0xrecipient",
        value: "2000000000000000000",
        gas: "21000",
        gasPrice: "20000000000",
        gasUsed: "21000",
        isError: "0",
        txreceipt_status: "1",
        input: "0x",
        methodId: "0x",
        functionName: "",
        contractAddress: "",
        cumulativeGasUsed: "100000",
        confirmations: "50",
      };

      const result = normalizeEtherscanTransaction(raw);
      expect(result.hash).toBe("0xdef");
      expect(result.blockNumber).toBe(67890);
      expect(result.status).toBe("success");
      expect(result.nonce).toBe(10);
    });

    it("maps failed transactions correctly", () => {
      const raw: EtherscanTransaction = {
        hash: "0xfail",
        blockNumber: "100",
        timeStamp: "1704067200",
        nonce: "1",
        from: "0xa",
        to: "0xb",
        value: "0",
        gas: "21000",
        gasPrice: "0",
        gasUsed: "21000",
        isError: "1",
        txreceipt_status: "0",
        input: "0x",
        methodId: "0x",
        functionName: "",
        contractAddress: "",
        cumulativeGasUsed: "0",
        confirmations: "0",
      };

      const result = normalizeEtherscanTransaction(raw);
      expect(result.status).toBe("failed");
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- --run tests/api/explorer/transactions.test.ts`
Expected: FAIL

- [ ] **Step 3: Write the implementation**

```typescript
import type {
  ExplorerTransaction,
  ExplorerTxDetails,
  ExplorerTxReceipt,
} from "../types.js";
import type { BlockscoutTransaction } from "./blockscout/types.js";
import type { EtherscanTransaction } from "./etherscan/types.js";

function blockscoutStatusToNormalized(status: string): "success" | "failed" | "pending" {
  if (status === "ok") return "success";
  if (status === "error") return "failed";
  return "pending";
}

export function normalizeBlockscoutTransaction(raw: BlockscoutTransaction): ExplorerTransaction {
  return {
    hash: raw.hash,
    blockNumber: raw.block,
    timestamp: raw.timestamp,
    from: raw.from.hash,
    to: raw.to?.hash,
    value: raw.value,
    gasUsed: raw.gas_used,
    gasPrice: raw.gas_price,
    fee: raw.fee?.value,
    status: blockscoutStatusToNormalized(raw.status),
    method: raw.method ?? undefined,
    nonce: raw.nonce,
  };
}

export function normalizeBlockscoutTxDetails(raw: BlockscoutTransaction): ExplorerTxDetails {
  const base = normalizeBlockscoutTransaction(raw);
  return {
    ...base,
    input: raw.raw_input ?? undefined,
    decodedInput: raw.decoded_input
      ? { method: raw.decoded_input.method_call, params: raw.decoded_input.parameters }
      : undefined,
    tokenTransfers: raw.token_transfers?.map((t) => ({
      token: t.token.address,
      symbol: t.token.symbol ?? undefined,
      from: t.from.hash,
      to: t.to.hash,
      value: t.total.value,
      type: t.token.type,
    })),
  };
}

export function normalizeBlockscoutTxReceipt(raw: BlockscoutTransaction): ExplorerTxReceipt {
  return {
    hash: raw.hash,
    status: raw.status === "ok" ? "success" : "failed",
    blockNumber: raw.block,
    gasUsed: raw.gas_used,
    logsCount: raw.token_transfers?.length,
  };
}

export function normalizeEtherscanTransaction(raw: EtherscanTransaction): ExplorerTransaction {
  return {
    hash: raw.hash,
    blockNumber: Number(raw.blockNumber),
    timestamp: new Date(Number(raw.timeStamp) * 1000).toISOString(),
    from: raw.from,
    to: raw.to || undefined,
    value: raw.value,
    gasUsed: raw.gasUsed,
    gasPrice: raw.gasPrice,
    status: raw.isError === "1" ? "failed" : "success",
    method: raw.functionName || undefined,
    nonce: Number(raw.nonce),
  };
}

export function normalizeEtherscanTxReceipt(
  hash: string,
  receiptStatus: string,
  gasUsed: string,
  blockNumber: string,
): ExplorerTxReceipt {
  return {
    hash,
    status: receiptStatus === "1" ? "success" : "failed",
    blockNumber: Number(blockNumber),
    gasUsed,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- --run tests/api/explorer/transactions.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/api/explorer/transactions.ts tests/api/explorer/transactions.test.ts
git commit -m "feat(explorer): add transactions normalization with tests"
```

---

### Task 15: Create tokens normalization with tests (TDD)

**Files:**
- Create: `src/api/explorer/tokens.ts`
- Create: `tests/api/explorer/tokens.test.ts`

- [ ] **Step 1: Write failing tests**

Test normalizing token transfers and NFT inventory from both backends. Follow the same TDD pattern as Task 14: write tests first for `normalizeBlockscoutTokenTransfer`, `normalizeEtherscanTokenTransfer`, `normalizeBlockscoutNft`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- --run tests/api/explorer/tokens.test.ts`
Expected: FAIL

- [ ] **Step 3: Write the implementation**

Normalize `BlockscoutTokenTransfer` → `ExplorerTokenTransfer`, `EtherscanTokenTransfer` → `ExplorerTokenTransfer`, `BlockscoutNft` → `ExplorerNftItem`. Map field names at the boundary (e.g., `block_number` → `blockNumber`, `tokenSymbol` → `symbol`).

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- --run tests/api/explorer/tokens.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/api/explorer/tokens.ts tests/api/explorer/tokens.test.ts
git commit -m "feat(explorer): add token transfers normalization with tests"
```

---

### Task 16: Create contracts normalization with tests (TDD)

**Files:**
- Create: `src/api/explorer/contracts.ts`
- Create: `tests/api/explorer/contracts.test.ts`

Same TDD pattern. Normalize:
- `BlockscoutSmartContract` → `ExplorerContractAbi` + `ExplorerContractSource`
- `EtherscanContractSource` → `ExplorerContractAbi` + `ExplorerContractSource`

Key mappings: `BlockscoutSmartContract.abi` → `ExplorerContractAbi.abi`, `EtherscanContractSource.ABI` (JSON string) → parse to array.

- [ ] **Step 1: Write failing tests**
- [ ] **Step 2: Run tests to verify they fail**
- [ ] **Step 3: Write the implementation**
- [ ] **Step 4: Run tests to verify they pass**
- [ ] **Step 5: Commit**

```bash
git add src/api/explorer/contracts.ts tests/api/explorer/contracts.test.ts
git commit -m "feat(explorer): add contracts normalization with tests"
```

---

### Task 17: Create blocks normalization with tests (TDD)

**Files:**
- Create: `src/api/explorer/blocks.ts`
- Create: `tests/api/explorer/blocks.test.ts`

Normalize `BlockscoutBlock` → `ExplorerBlockInfo`, Etherscan block reward → `ExplorerBlockInfo`.

- [ ] **Step 1: Write failing tests**
- [ ] **Step 2: Run tests to verify they fail**
- [ ] **Step 3: Write the implementation**
- [ ] **Step 4: Run tests to verify they pass**
- [ ] **Step 5: Commit**

```bash
git add src/api/explorer/blocks.ts tests/api/explorer/blocks.test.ts
git commit -m "feat(explorer): add blocks normalization with tests"
```

---

## Chunk 5: Tool Layer

### Task 18: Create explorer tool input schemas

**Files:**
- Create: `src/tools/explorer/schemas.ts`

- [ ] **Step 1: Write the schemas file**

```typescript
import { z } from "zod";
import {
  explorerAddressSchema,
  explorerBaseSchema,
  explorerBlockSchema,
  explorerContractSchema,
  explorerPaginatedSchema,
  explorerTimeRangeSchema,
  explorerTxHashSchema,
} from "../../api/schemas/explorer.js";

// --- Accounts ---

export const explorerGetAddressInfoSchema = explorerAddressSchema;

export const explorerGetTokensByAddressSchema = explorerAddressSchema.merge(
  explorerPaginatedSchema,
);

// --- Transactions ---

export const explorerGetTxHistorySchema = explorerAddressSchema
  .merge(explorerTimeRangeSchema)
  .merge(explorerPaginatedSchema)
  .extend({
    method: z.string().optional().describe("Filter by method name"),
  });

export const explorerGetTxDetailsSchema = explorerTxHashSchema;

export const explorerGetTxReceiptSchema = explorerTxHashSchema;

// --- Token Transfers ---

export const explorerGetTokenTransfersSchema = explorerAddressSchema
  .merge(explorerTimeRangeSchema)
  .merge(explorerPaginatedSchema)
  .extend({
    tokenContract: z.string().optional().describe("Filter by token contract address"),
  });

export const explorerGetNftInventorySchema = explorerAddressSchema.merge(
  explorerPaginatedSchema,
);

// --- Contracts ---

export const explorerGetContractAbiSchema = explorerContractSchema;

export const explorerGetContractSourceSchema = explorerContractSchema;

// --- Blocks ---

export const explorerGetBlockSchema = explorerBlockSchema;
```

- [ ] **Step 2: Run typecheck + schema quality test**

Run: `pnpm run typecheck && pnpm test -- --run tests/tools/schema-quality.test.ts`
Expected: PASS (all fields inherited from base schemas already have `.describe()`)

- [ ] **Step 3: Commit**

```bash
git add src/tools/explorer/schemas.ts
git commit -m "feat(explorer): add Phase 1 tool input schemas"
```

---

### Task 19: Create explorer tool definitions and handlers with tests (TDD)

**Files:**
- Create: `src/tools/explorer/index.ts`
- Create: `tests/tools/explorer/explorer-tools.test.ts`

- [ ] **Step 1: Write failing tests**

Test that each tool handler validates input and calls the correct API function. Mock the Blockscout/Etherscan clients and router.

```typescript
import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock the explorer API modules
vi.mock("../../../src/api/explorer/blockscout/client.js");
vi.mock("../../../src/api/explorer/etherscan/client.js");
vi.mock("../../../src/api/explorer/router.js");

import { getExplorerToolDefinitions } from "../../../src/tools/explorer/index.js";

describe("explorer tools", () => {
  let tools: ReturnType<typeof getExplorerToolDefinitions>;

  beforeEach(() => {
    tools = getExplorerToolDefinitions(/* mocked dependencies */);
  });

  it("registers 10 tools", () => {
    expect(tools).toHaveLength(10);
  });

  it("all tools have category explorer", () => {
    for (const tool of tools) {
      expect(tool.category).toBe("explorer");
    }
  });

  it("all tools have readOnlyHint annotation", () => {
    for (const tool of tools) {
      expect(tool.annotations?.readOnlyHint).toBe(true);
    }
  });

  it("all tools have inputSchema from zodToJsonSchema", () => {
    for (const tool of tools) {
      expect(tool.inputSchema).toBeDefined();
      expect(tool.inputSchema.type).toBe("object");
    }
  });

  it("explorer_get_address_info rejects invalid input", async () => {
    const tool = tools.find((t) => t.name === "explorer_get_address_info")!;
    const result = await tool.handler({});
    expect(result.isError).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- --run tests/tools/explorer/explorer-tools.test.ts`
Expected: FAIL

- [ ] **Step 3: Write the tool definitions**

```typescript
import { zodToJsonSchema } from "zod-to-json-schema";
import type { ToolDefinition } from "../register.js";
import { createToolHandler } from "../shared/handler-factory.js";
import type { BlockscoutClient } from "../../api/explorer/blockscout/client.js";
import type { EtherscanClient } from "../../api/explorer/etherscan/client.js";
import type { BackendId, ExplorerCapability, ExplorerRouter } from "../../api/explorer/router.js";
import { normalizeBlockscoutAddress, normalizeBlockscoutTokens } from "../../api/explorer/accounts.js";
import {
  normalizeBlockscoutTransaction,
  normalizeBlockscoutTxDetails,
  normalizeBlockscoutTxReceipt,
  normalizeEtherscanTransaction,
} from "../../api/explorer/transactions.js";
import { normalizeBlockscoutTokenTransfers, normalizeEtherscanTokenTransfers } from "../../api/explorer/tokens.js";
import { normalizeBlockscoutNfts } from "../../api/explorer/tokens.js";
import { normalizeBlockscoutContractAbi, normalizeBlockscoutContractSource, normalizeEtherscanContractAbi, normalizeEtherscanContractSource } from "../../api/explorer/contracts.js";
import { normalizeBlockscoutBlock } from "../../api/explorer/blocks.js";
import {
  explorerGetAddressInfoSchema,
  explorerGetBlockSchema,
  explorerGetContractAbiSchema,
  explorerGetContractSourceSchema,
  explorerGetNftInventorySchema,
  explorerGetTokenTransfersSchema,
  explorerGetTokensByAddressSchema,
  explorerGetTxDetailsSchema,
  explorerGetTxHistorySchema,
  explorerGetTxReceiptSchema,
} from "./schemas.js";

export interface ExplorerDeps {
  router: ExplorerRouter;
  blockscout: BlockscoutClient;
  etherscan: EtherscanClient | undefined;
}

// Helper: try primary backend, fall back on failure
async function withFallback<T>(
  deps: ExplorerDeps,
  chainId: number,
  capability: ExplorerCapability,
  primaryFn: (backend: BackendId) => Promise<T>,
): Promise<T> {
  const primary = deps.router.resolve(chainId, capability);
  try {
    return await primaryFn(primary);
  } catch (e: unknown) {
    const fallback = deps.router.getFallback(chainId, capability);
    if (!fallback) throw e;
    process.stderr.write(`[explorer] ${primary} failed for ${capability} on chain ${chainId}, falling back to ${fallback}: ${e}\n`);
    return primaryFn(fallback);
  }
}

export function getExplorerToolDefinitions(deps: ExplorerDeps): ToolDefinition[] {
  const { router, blockscout, etherscan } = deps;

  // Dispatch helper: call the right backend based on BackendId
  function requireEtherscan(): NonNullable<typeof etherscan> {
    if (!etherscan) throw new Error("Etherscan not configured");
    return etherscan;
  }

  return [
    {
      name: "explorer_get_address_info",
      category: "explorer",
      description:
        "Get address overview including balances, ENS name, contract metadata, and public tags.",
      inputSchema: zodToJsonSchema(explorerGetAddressInfoSchema) as Record<string, unknown>,
      handler: createToolHandler(
        explorerGetAddressInfoSchema,
        async (input) => {
          return withFallback(deps, input.chainId, "accounts", async (backend) => {
            if (backend === "blockscout") {
              const raw = await blockscout.getAddress(input.chainId, input.address);
              return normalizeBlockscoutAddress(raw);
            }
            const eth = requireEtherscan();
            const balance = await eth.call<string>(input.chainId, "account", "balance", {
              address: input.address,
              tag: "latest",
            });
            return { address: input.address, balance, isContract: false };
          });
        },
        "EXPLORER_ADDRESS_INFO_ERROR",
      ),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    {
      name: "explorer_get_tokens_by_address",
      category: "explorer",
      description:
        "List all ERC-20 token holdings with balances and market data for an address.",
      inputSchema: zodToJsonSchema(explorerGetTokensByAddressSchema) as Record<string, unknown>,
      handler: createToolHandler(
        explorerGetTokensByAddressSchema,
        async (input) => {
          return withFallback(deps, input.chainId, "tokens", async (backend) => {
            if (backend === "blockscout") {
              const raw = await blockscout.getAddressTokens(input.chainId, input.address);
              return normalizeBlockscoutTokens(input.address, raw.items);
            }
            // Etherscan doesn't have a direct "list all tokens" endpoint
            throw new Error("Token listing not available via Etherscan for this chain");
          });
        },
        "EXPLORER_TOKENS_ERROR",
      ),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    {
      name: "explorer_get_tx_history",
      category: "explorer",
      description:
        "Get transaction history for an address, optionally filtered by block range and method.",
      inputSchema: zodToJsonSchema(explorerGetTxHistorySchema) as Record<string, unknown>,
      handler: createToolHandler(
        explorerGetTxHistorySchema,
        async (input) => {
          return withFallback(deps, input.chainId, "transactions", async (backend) => {
            if (backend === "blockscout") {
              const raw = await blockscout.getAddressTransactions(input.chainId, input.address, {
                page: input.page,
              });
              return {
                transactions: raw.items.map(normalizeBlockscoutTransaction),
                hasMore: raw.next_page_params !== null,
              };
            }
            const eth = requireEtherscan();
            const params: Record<string, string> = {
              address: input.address,
              sort: "desc",
            };
            if (input.startBlock) params.startblock = String(input.startBlock);
            if (input.endBlock) params.endblock = String(input.endBlock);
            if (input.page) params.page = String(input.page);
            if (input.pageSize) params.offset = String(input.pageSize);
            const raw = await eth.call<import("../../api/explorer/etherscan/types.js").EtherscanTransaction[]>(
              input.chainId, "account", "txlist", params,
            );
            return {
              transactions: raw.map(normalizeEtherscanTransaction),
              hasMore: raw.length === (input.pageSize ?? 10),
            };
          });
        },
        "EXPLORER_TX_HISTORY_ERROR",
      ),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    {
      name: "explorer_get_tx_details",
      category: "explorer",
      description:
        "Get full transaction details including decoded input parameters and token movements.",
      inputSchema: zodToJsonSchema(explorerGetTxDetailsSchema) as Record<string, unknown>,
      handler: createToolHandler(
        explorerGetTxDetailsSchema,
        async (input) => {
          return withFallback(deps, input.chainId, "transactions", async (backend) => {
            if (backend === "blockscout") {
              const raw = await blockscout.getTransaction(input.chainId, input.txHash);
              return normalizeBlockscoutTxDetails(raw);
            }
            // Etherscan: get basic tx + receipt for a normalized response
            const eth = requireEtherscan();
            const txList = await eth.call<EtherscanTransaction[]>(input.chainId, "account", "txlist", {
              address: "", // not ideal — Etherscan doesn't have a single-tx endpoint outside proxy
              startblock: "0", endblock: "99999999",
            });
            // Fallback: use proxy endpoint and normalize minimally
            const raw = await eth.call<Record<string, string>>(input.chainId, "proxy", "eth_getTransactionByHash", {
              txhash: input.txHash,
            });
            return {
              hash: input.txHash,
              blockNumber: Number.parseInt(raw.blockNumber, 16),
              timestamp: "", // Not available from proxy — consumer should use tx_history for timestamped data
              from: raw.from ?? "",
              to: raw.to,
              value: BigInt(raw.value ?? "0x0").toString(),
              gasUsed: raw.gas ? BigInt(raw.gas).toString() : undefined,
              gasPrice: raw.gasPrice ? BigInt(raw.gasPrice).toString() : undefined,
              status: "success" as const, // Proxy doesn't include status — assume success
            };
          });
        },
        "EXPLORER_TX_DETAILS_ERROR",
      ),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    {
      name: "explorer_get_tx_receipt",
      category: "explorer",
      description:
        "Get transaction receipt with execution status and gas usage.",
      inputSchema: zodToJsonSchema(explorerGetTxReceiptSchema) as Record<string, unknown>,
      handler: createToolHandler(
        explorerGetTxReceiptSchema,
        async (input) => {
          return withFallback(deps, input.chainId, "transactions", async (backend) => {
            if (backend === "blockscout") {
              const raw = await blockscout.getTransaction(input.chainId, input.txHash);
              return normalizeBlockscoutTxReceipt(raw);
            }
            const eth = requireEtherscan();
            const raw = await eth.call<Record<string, string>>(input.chainId, "proxy", "eth_getTransactionReceipt", {
              txhash: input.txHash,
            });
            return {
              hash: input.txHash,
              status: raw.status === "0x1" ? "success" as const : "failed" as const,
              blockNumber: Number.parseInt(raw.blockNumber, 16),
              gasUsed: BigInt(raw.gasUsed ?? "0x0").toString(),
              effectiveGasPrice: raw.effectiveGasPrice ? BigInt(raw.effectiveGasPrice).toString() : undefined,
              cumulativeGasUsed: raw.cumulativeGasUsed ? BigInt(raw.cumulativeGasUsed).toString() : undefined,
              contractAddress: raw.contractAddress || undefined,
              logsCount: raw.logs ? (raw.logs as unknown as unknown[]).length : undefined,
            };
          });
        },
        "EXPLORER_TX_RECEIPT_ERROR",
      ),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    {
      name: "explorer_get_token_transfers",
      category: "explorer",
      description:
        "Get ERC-20 token transfer history for an address, optionally filtered by token contract.",
      inputSchema: zodToJsonSchema(explorerGetTokenTransfersSchema) as Record<string, unknown>,
      handler: createToolHandler(
        explorerGetTokenTransfersSchema,
        async (input) => {
          return withFallback(deps, input.chainId, "tokens", async (backend) => {
            if (backend === "blockscout") {
              const raw = await blockscout.getAddressTokenTransfers(input.chainId, input.address, {
                token: input.tokenContract,
                page: input.page,
              });
              return normalizeBlockscoutTokenTransfers(raw);
            }
            const eth = requireEtherscan();
            const params: Record<string, string> = {
              address: input.address,
              sort: "desc",
            };
            if (input.tokenContract) params.contractaddress = input.tokenContract;
            if (input.startBlock) params.startblock = String(input.startBlock);
            if (input.endBlock) params.endblock = String(input.endBlock);
            if (input.page) params.page = String(input.page);
            if (input.pageSize) params.offset = String(input.pageSize);
            const raw = await eth.call<import("../../api/explorer/etherscan/types.js").EtherscanTokenTransfer[]>(
              input.chainId, "account", "tokentx", params,
            );
            return normalizeEtherscanTokenTransfers(raw);
          });
        },
        "EXPLORER_TOKEN_TRANSFERS_ERROR",
      ),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    {
      name: "explorer_get_nft_inventory",
      category: "explorer",
      description:
        "List NFT collections and token IDs owned by an address.",
      inputSchema: zodToJsonSchema(explorerGetNftInventorySchema) as Record<string, unknown>,
      handler: createToolHandler(
        explorerGetNftInventorySchema,
        async (input) => {
          return withFallback(deps, input.chainId, "tokens", async (backend) => {
            if (backend === "blockscout") {
              const raw = await blockscout.getAddressNfts(input.chainId, input.address);
              return normalizeBlockscoutNfts(input.address, raw);
            }
            throw new Error("NFT inventory not available via Etherscan — use Blockscout-supported chains");
          });
        },
        "EXPLORER_NFT_INVENTORY_ERROR",
      ),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    {
      name: "explorer_get_contract_abi",
      category: "explorer",
      description:
        "Fetch the ABI for a verified smart contract. Works only for source-verified contracts.",
      inputSchema: zodToJsonSchema(explorerGetContractAbiSchema) as Record<string, unknown>,
      handler: createToolHandler(
        explorerGetContractAbiSchema,
        async (input) => {
          return withFallback(deps, input.chainId, "contracts", async (backend) => {
            if (backend === "blockscout") {
              const raw = await blockscout.getSmartContract(input.chainId, input.contractAddress);
              return normalizeBlockscoutContractAbi(input.contractAddress, raw);
            }
            const eth = requireEtherscan();
            const abi = await eth.call<string>(input.chainId, "contract", "getabi", {
              address: input.contractAddress,
            });
            return normalizeEtherscanContractAbi(input.contractAddress, abi);
          });
        },
        "EXPLORER_CONTRACT_ABI_ERROR",
      ),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    {
      name: "explorer_get_contract_source",
      category: "explorer",
      description:
        "Get verified source code for a smart contract.",
      inputSchema: zodToJsonSchema(explorerGetContractSourceSchema) as Record<string, unknown>,
      handler: createToolHandler(
        explorerGetContractSourceSchema,
        async (input) => {
          return withFallback(deps, input.chainId, "contract_source", async (backend) => {
            if (backend === "blockscout") {
              const raw = await blockscout.getSmartContract(input.chainId, input.contractAddress);
              return normalizeBlockscoutContractSource(input.contractAddress, raw);
            }
            const eth = requireEtherscan();
            const raw = await eth.call<import("../../api/explorer/etherscan/types.js").EtherscanContractSource[]>(
              input.chainId, "contract", "getsourcecode", { address: input.contractAddress },
            );
            return normalizeEtherscanContractSource(input.contractAddress, raw[0]);
          });
        },
        "EXPLORER_CONTRACT_SOURCE_ERROR",
      ),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    {
      name: "explorer_get_block",
      category: "explorer",
      description:
        "Get block information including gas consumption, rewards, and optionally full transaction list.",
      inputSchema: zodToJsonSchema(explorerGetBlockSchema) as Record<string, unknown>,
      handler: createToolHandler(
        explorerGetBlockSchema,
        async (input) => {
          return withFallback(deps, input.chainId, "blocks", async (backend) => {
            if (backend === "blockscout") {
              const raw = await blockscout.getBlock(input.chainId, input.blockNumber);
              return normalizeBlockscoutBlock(raw);
            }
            // Etherscan: use block reward endpoint for richer data
            const eth = requireEtherscan();
            const raw = await eth.call<import("../../api/explorer/etherscan/types.js").EtherscanBlock>(
              input.chainId, "block", "getblockreward", { blockno: String(input.blockNumber) },
            );
            return {
              number: input.blockNumber,
              hash: "", // Not available from getblockreward
              timestamp: new Date(Number(raw.timeStamp) * 1000).toISOString(),
              parentHash: "",
              miner: raw.blockMiner,
              gasUsed: "0",
              gasLimit: "0",
              txCount: 0,
              reward: raw.blockReward,
            };
          });
        },
        "EXPLORER_BLOCK_ERROR",
      ),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
  ];
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- --run tests/tools/explorer/explorer-tools.test.ts`
Expected: PASS

- [ ] **Step 5: Run full typecheck + lint**

Run: `pnpm run typecheck && pnpm run lint`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/tools/explorer/index.ts src/tools/explorer/schemas.ts tests/tools/explorer/explorer-tools.test.ts
git commit -m "feat(explorer): add Phase 1 tool definitions and handlers with tests"
```

---

## Chunk 6: SDK Layer + Registration + Exports

### Task 20: Create SDK entry point with tests (TDD)

**Files:**
- Create: `src/api/explorer.ts`
- Create: `tests/api/explorer.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../../src/api/shared.js", () => ({
  getRuntime: vi.fn().mockResolvedValue({ invokeTool: vi.fn() }),
  invokeAndRequireData: vi.fn(),
}));

import { getRuntime, invokeAndRequireData } from "../../src/api/shared.js";
import { getTransactionHistory, getAddressInfo } from "../../src/api/explorer.js";

const mockInvoke = vi.mocked(invokeAndRequireData);

describe("explorer SDK functions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getAddressInfo", () => {
    it("invokes explorer_get_address_info with validated params", async () => {
      mockInvoke.mockResolvedValueOnce({ address: "0xabc", balance: "100", isContract: false });
      const result = await getAddressInfo({ chainId: 1, address: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045" });
      expect(mockInvoke).toHaveBeenCalledWith(
        expect.anything(),
        "explorer_get_address_info",
        expect.objectContaining({ chainId: 1 }),
      );
      expect(result.address).toBe("0xabc");
    });

    it("throws on invalid params (missing chainId)", async () => {
      await expect(getAddressInfo({ chainId: undefined as unknown as number, address: "0x123" })).rejects.toThrow();
    });
  });

  describe("getTransactionHistory", () => {
    it("invokes explorer_get_tx_history", async () => {
      mockInvoke.mockResolvedValueOnce({ transactions: [], hasMore: false });
      await getTransactionHistory({ chainId: 1, address: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045" });
      expect(mockInvoke).toHaveBeenCalledWith(
        expect.anything(),
        "explorer_get_tx_history",
        expect.objectContaining({ chainId: 1 }),
      );
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- --run tests/api/explorer.test.ts`
Expected: FAIL

- [ ] **Step 3: Write the SDK entry point**

```typescript
import { parseInput } from "./validation.js";
import { getRuntime, invokeAndRequireData } from "./shared.js";
import type {
  ExplorerAddressInfo,
  ExplorerBlockInfo,
  ExplorerContractAbi,
  ExplorerContractSource,
  ExplorerNftInventory,
  ExplorerTokensByAddress,
  ExplorerTokenTransfers,
  ExplorerTxDetails,
  ExplorerTxHistory,
  ExplorerTxReceipt,
  RuntimeBoundOptions,
} from "./types.js";
import {
  explorerGetAddressInfoSchema,
  explorerGetBlockSchema,
  explorerGetContractAbiSchema,
  explorerGetContractSourceSchema,
  explorerGetNftInventorySchema,
  explorerGetTokensByAddressSchema,
  explorerGetTokenTransfersSchema,
  explorerGetTxDetailsSchema,
  explorerGetTxHistorySchema,
  explorerGetTxReceiptSchema,
} from "../tools/explorer/schemas.js";

export async function getAddressInfo(
  params: { chainId: number; address: string },
  options?: RuntimeBoundOptions,
): Promise<ExplorerAddressInfo> {
  const validated = parseInput(explorerGetAddressInfoSchema, params);
  const runtime = await getRuntime(options);
  return invokeAndRequireData(runtime, "explorer_get_address_info", validated);
}

export async function getTokensByAddress(
  params: { chainId: number; address: string; page?: number; pageSize?: number },
  options?: RuntimeBoundOptions,
): Promise<ExplorerTokensByAddress> {
  const validated = parseInput(explorerGetTokensByAddressSchema, params);
  const runtime = await getRuntime(options);
  return invokeAndRequireData(runtime, "explorer_get_tokens_by_address", validated);
}

export async function getTransactionHistory(
  params: { chainId: number; address: string; startBlock?: number; endBlock?: number; page?: number; pageSize?: number; method?: string },
  options?: RuntimeBoundOptions,
): Promise<ExplorerTxHistory> {
  const validated = parseInput(explorerGetTxHistorySchema, params);
  const runtime = await getRuntime(options);
  return invokeAndRequireData(runtime, "explorer_get_tx_history", validated);
}

export async function getTransactionDetails(
  params: { chainId: number; txHash: string },
  options?: RuntimeBoundOptions,
): Promise<ExplorerTxDetails> {
  const validated = parseInput(explorerGetTxDetailsSchema, params);
  const runtime = await getRuntime(options);
  return invokeAndRequireData(runtime, "explorer_get_tx_details", validated);
}

export async function getTransactionReceipt(
  params: { chainId: number; txHash: string },
  options?: RuntimeBoundOptions,
): Promise<ExplorerTxReceipt> {
  const validated = parseInput(explorerGetTxReceiptSchema, params);
  const runtime = await getRuntime(options);
  return invokeAndRequireData(runtime, "explorer_get_tx_receipt", validated);
}

export async function getTokenTransfers(
  params: { chainId: number; address: string; tokenContract?: string; startBlock?: number; endBlock?: number; page?: number; pageSize?: number },
  options?: RuntimeBoundOptions,
): Promise<ExplorerTokenTransfers> {
  const validated = parseInput(explorerGetTokenTransfersSchema, params);
  const runtime = await getRuntime(options);
  return invokeAndRequireData(runtime, "explorer_get_token_transfers", validated);
}

export async function getNftInventory(
  params: { chainId: number; address: string; page?: number; pageSize?: number },
  options?: RuntimeBoundOptions,
): Promise<ExplorerNftInventory> {
  const validated = parseInput(explorerGetNftInventorySchema, params);
  const runtime = await getRuntime(options);
  return invokeAndRequireData(runtime, "explorer_get_nft_inventory", validated);
}

export async function getContractAbi(
  params: { chainId: number; contractAddress: string },
  options?: RuntimeBoundOptions,
): Promise<ExplorerContractAbi> {
  const validated = parseInput(explorerGetContractAbiSchema, params);
  const runtime = await getRuntime(options);
  return invokeAndRequireData(runtime, "explorer_get_contract_abi", validated);
}

export async function getContractSource(
  params: { chainId: number; contractAddress: string },
  options?: RuntimeBoundOptions,
): Promise<ExplorerContractSource> {
  const validated = parseInput(explorerGetContractSourceSchema, params);
  const runtime = await getRuntime(options);
  return invokeAndRequireData(runtime, "explorer_get_contract_source", validated);
}

export async function getBlock(
  params: { chainId: number; blockNumber: number; includeTxs?: boolean },
  options?: RuntimeBoundOptions,
): Promise<ExplorerBlockInfo> {
  const validated = parseInput(explorerGetBlockSchema, params);
  const runtime = await getRuntime(options);
  return invokeAndRequireData(runtime, "explorer_get_block", validated);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- --run tests/api/explorer.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/api/explorer.ts tests/api/explorer.test.ts
git commit -m "feat(explorer): add SDK entry point with tests"
```

---

### Task 21: Register explorer tools in managed runtime

**Files:**
- Modify: `src/runtime/managed-runtime.ts`

- [ ] **Step 1: Add imports**

Near the top of managed-runtime.ts, add imports for the explorer module:

```typescript
import { BlockscoutClient } from "../api/explorer/blockscout/client.js";
import { EtherscanClient as ExplorerEtherscanClient } from "../api/explorer/etherscan/client.js";
import { ExplorerRouter } from "../api/explorer/router.js";
import { getExplorerToolDefinitions, type ExplorerDeps } from "../tools/explorer/index.js";
```

- [ ] **Step 2: Instantiate explorer in createRuntime()**

After the existing adapter initialization (around line 605), add:

```typescript
  // Unified explorer (Phase 1 — runs alongside adapters)
  const explorerBlockscout = new BlockscoutClient();
  const explorerEtherscan = config.etherscanApiKey
    ? new ExplorerEtherscanClient(config.etherscanApiKey, config.etherscanApiUrl)
    : undefined;
  const explorerRouter = new ExplorerRouter(
    explorerBlockscout.getSupportedChainIds(),
    explorerEtherscan?.getSupportedChainIds() ?? [],
  );
  const explorerDeps: ExplorerDeps = {
    router: explorerRouter,
    blockscout: explorerBlockscout,
    etherscan: explorerEtherscan,
  };
```

Pass `explorerDeps` to the ManagedRuntime constructor and store it.

- [ ] **Step 3: Register explorer tools in rebuildToolRegistry()**

After the existing adapter tool registration (around line 540), add:

```typescript
    // Unified explorer tools
    for (const tool of getExplorerToolDefinitions(this.explorerDeps)) {
      this.toolRecords.set(tool.name, {
        ...toCatalogEntry(tool, "explorer"),
        handler: (args) => tool.handler(args),
      });
    }
```

- [ ] **Step 4: Run typecheck**

Run: `pnpm run typecheck`
Expected: PASS

- [ ] **Step 5: Run full test suite**

Run: `pnpm test`
Expected: PASS (explorer tools registered alongside existing adapters, no conflicts since different prefixes)

- [ ] **Step 6: Commit**

```bash
git add src/runtime/managed-runtime.ts
git commit -m "feat(explorer): register Phase 1 explorer tools in runtime"
```

---

### Task 22: Export from `src/index.ts`

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: Add SDK function exports**

In the SDK function export section (near the top):

```typescript
export {
  getAddressInfo,
  getBlock,
  getContractAbi,
  getContractSource,
  getNftInventory,
  getTokensByAddress,
  getTokenTransfers,
  getTransactionDetails,
  getTransactionHistory,
  getTransactionReceipt,
} from "./api/explorer.js";
```

- [ ] **Step 2: Add schema exports**

In the schema export section:

```typescript
export {
  explorerGetAddressInfoSchema,
  explorerGetBlockSchema,
  explorerGetContractAbiSchema,
  explorerGetContractSourceSchema,
  explorerGetNftInventorySchema,
  explorerGetTokensByAddressSchema,
  explorerGetTokenTransfersSchema,
  explorerGetTxDetailsSchema,
  explorerGetTxHistorySchema,
  explorerGetTxReceiptSchema,
} from "./tools/explorer/schemas.js";
```

- [ ] **Step 3: Add type exports**

In the type export section:

```typescript
export type {
  ExplorerAddressInfo,
  ExplorerBlockInfo,
  ExplorerContractAbi,
  ExplorerContractSource,
  ExplorerNftInventory,
  ExplorerNftItem,
  ExplorerTokenHolding,
  ExplorerTokensByAddress,
  ExplorerTokenTransfer,
  ExplorerTokenTransfers,
  ExplorerTransaction,
  ExplorerTxDetails,
  ExplorerTxHistory,
  ExplorerTxReceipt,
} from "./api/types.js";
```

- [ ] **Step 4: Build and verify exports**

Run: `pnpm run build`
Expected: PASS — check that `dist/index.d.ts` includes the new exports

- [ ] **Step 5: Commit**

```bash
git add src/index.ts
git commit -m "feat(explorer): export Phase 1 SDK functions, schemas, and types"
```

---

### Task 23: Full validation

- [ ] **Step 1: Run all four checks**

Run: `pnpm run lint && pnpm run typecheck && pnpm run build && pnpm test`
Expected: ALL PASS

- [ ] **Step 2: Fix any issues**

Address lint errors, type errors, test failures. Most likely issues: missing `.describe()` on schema fields (caught by schema-quality test), import path typos.

- [ ] **Step 3: Final commit if fixes were needed**

```bash
git add -A
git commit -m "fix(explorer): address lint and test issues"
```

---

## Summary

| Chunk | Tasks | What it builds |
|-------|-------|----------------|
| 1: Foundation | 1-5 | Schemas, types, config |
| 2: REST Clients | 6-11 | Etherscan + Blockscout HTTP clients |
| 3: Router | 12 | Capability-aware chain routing |
| 4: Normalization | 13-17 | Response normalization from both backends |
| 5: Tool Layer | 18-19 | 10 MCP tool definitions + handlers |
| 6: Integration | 20-23 | SDK functions, runtime registration, exports, full validation |

**Total: 23 tasks, ~10 tools, full TDD coverage**

After this plan completes, explorer tools run alongside existing adapters. Adapter removal is a separate PR (per spec: after Phase 1 has run in parallel for at least one release).
