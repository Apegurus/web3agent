# Unified Block Explorer — Phase 2+3 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 25 remaining explorer tools (15 Phase 2 + 10 Phase 3) to the unified block explorer module. All infrastructure (clients, router, normalization pattern, SDK pattern, runtime registration) is already in place from Phase 1.

**Architecture:** Extend existing files. Each tool follows a 7-step pattern. Phase 3 creates 2 new normalization files (`events.ts`, `network.ts`) plus their test files.

**Spec:** `docs/superpowers/specs/2026-03-16-unified-block-explorer-design.md`

**Etherscan API note:** All endpoints verified against Etherscan docs. Some (network stats, token supply history) may be Pro-only on certain chains. Handlers must catch Etherscan errors and return `EXPLORER_API_ERROR` with a clear message if the endpoint is unavailable.

---

## Per-Tool Pattern (7 steps)

Every new tool requires changes in exactly these files:

1. `src/api/explorer/etherscan/types.ts` — add raw Etherscan response type (if not already defined)
2. `src/api/schemas/explorer-outputs.ts` — add output Zod schema (all fields `.describe()`)
3. `src/api/types.ts` — add `z.infer<>` type alias
4. `src/tools/explorer/schemas.ts` — add input schema (extend base)
5. `src/tools/explorer/index.ts` — add tool definition + handler
6. `src/api/explorer.ts` — add SDK function
7. `src/index.ts` — add to exports (output schema + input schema + type + function)

**For Etherscan-only tools** (no Blockscout equivalent): use `requireEtherscan()` directly without `withFallback`. Example from Phase 1:
```typescript
async (input: SomeInput) => {
  const eth = requireEtherscan();
  const raw = await eth.call<SomeEtherscanType>(input.chainId, "module", "action", { ... });
  return normalizeSomething(raw);
}
```

**New files needed:**
- `src/api/explorer/events.ts` + `tests/api/explorer/events.test.ts` (Task 7)
- `src/api/explorer/network.ts` + `tests/api/explorer/network.test.ts` (Tasks 8-9)
- `src/api/schemas/explorer.ts` gets `explorerDateRangeSchema` added (Task 8)

**Test locations:** Normalization tests in `tests/api/explorer/<domain>.test.ts`. Handler tests appended to `tests/tools/explorer/explorer-tools.test.ts`.

---

## Phase 2: Historical & Deeper Chain Data (15 tools)

All Etherscan-only unless noted. Capabilities already declared in router.

### Task 1: Accounts — 3 tools

**Tools:**
- `explorer_get_historical_balance` — `account/balance` with `tag=<blockNumber>`
- `explorer_get_historical_token_balance` — `account/tokenbalance` with `tag=<blockNumber>`
- `explorer_get_address_funded_by` — `account/txlist` with `sort=asc&page=1&offset=1`

**Input schemas:** Extend `explorerAddressSchema` + `blockNumber: z.number().int().nonnegative()`

**Output schemas:** Simple — `{ address, balance, blockNumber }` for historical balances, reuse `explorerTransactionSchema` for funded-by.

**Etherscan calls:**
```typescript
// Historical balance
eth.call<string>(chainId, "account", "balance", { address, tag: String(blockNumber) })
// Historical token balance
eth.call<string>(chainId, "account", "tokenbalance", { contractaddress, address, tag: String(blockNumber) })
// Funded by — first incoming tx
eth.call<EtherscanTransaction[]>(chainId, "account", "txlist", { address, sort: "asc", page: "1", offset: "1" })
```

- [ ] Add output schemas + types
- [ ] Add input schemas
- [ ] Add Etherscan response types for historical balance if needed
- [ ] Add 3 tool handlers (Etherscan-only — use `requireEtherscan()` directly, no `withFallback`)
- [ ] Add 3 SDK functions
- [ ] Add exports
- [ ] Add tests
- [ ] Commit: `feat(explorer): add historical balance and funded-by tools`

### Task 2: Transactions — 2 tools

**Tools:**
- `explorer_get_internal_txs` — `account/txlistinternal`
- `explorer_get_tx_execution_status` — `transaction/getstatus`

**Input schemas:**
- Internal txs: `explorerAddressSchema` + `explorerTimeRangeSchema` + `explorerPaginatedSchema`
- Execution status: `explorerTxHashSchema`

**Output schemas:**
```typescript
explorerInternalTxSchema = z.object({
  hash, blockNumber, timestamp, from, to, value, gasUsed,
  type: z.string().describe("Call type (call, delegatecall, create, etc.)"),
  traceId: z.string().optional().describe("Trace ID for distinguishing internal calls"),
  errCode: z.string().optional().describe("Error code if failed"),
  isError: z.boolean().describe("Whether the internal tx failed"),
})
explorerTxExecutionStatusSchema = z.object({
  isError: z.boolean(), errDescription: z.string().optional()
})
```

**Etherscan calls:**
```typescript
eth.call<EtherscanInternalTx[]>(chainId, "account", "txlistinternal", { address, startblock, endblock, page, offset, sort: "desc" })
eth.call<EtherscanTxStatus>(chainId, "transaction", "getstatus", { txhash })
```

- [ ] Add types to `etherscan/types.ts` (EtherscanInternalTx)
- [ ] Add output schemas + types
- [ ] Add input schemas
- [ ] Add 2 tool handlers
- [ ] Add 2 SDK functions
- [ ] Add exports
- [ ] Add tests
- [ ] Commit: `feat(explorer): add internal transactions and execution status tools`

### Task 3: Token Transfers — 1 tool

**Tool:**
- `explorer_get_nft_transfers` — `account/tokennfttx` (ERC721) + `account/token1155tx` (ERC1155)

**Input schema:** `explorerAddressSchema` + `explorerTimeRangeSchema` + `explorerPaginatedSchema` + optional `tokenContract`

**Output:** Reuse `explorerTokenTransfersSchema` (already has `type` field for token standard)

**Etherscan calls:**
```typescript
// Fetch both ERC721 and ERC1155 transfers, merge
const [erc721, erc1155] = await Promise.all([
  eth.call(chainId, "account", "tokennfttx", params),
  eth.call(chainId, "account", "token1155tx", params),
]);
```

- [ ] Add type (EtherscanNftTransfer) to etherscan/types.ts
- [ ] Add input schema
- [ ] Add normalization function to `src/api/explorer/tokens.ts`
- [ ] Add tool handler
- [ ] Add SDK function
- [ ] Add exports
- [ ] Add tests to `tests/api/explorer/tokens.test.ts`
- [ ] Commit: `feat(explorer): add NFT transfer history tool`

### Task 4: Tokens — 4 tools

**Tools:**
- `explorer_get_token_info` — `token/tokeninfo`
- `explorer_get_token_supply` — `token/tokensupply` (current) + `token/tokensupplyhistory` (at block)
- `explorer_get_token_holders` — `token/tokenholderlist`
- `explorer_get_top_token_holders` — `token/toptokenholders`

**Input schemas:** All extend `explorerContractSchema` (has `contractAddress` + `chainId`). Supply adds optional `blockNumber`. Top holders adds `count: z.number().optional()`.

**Output schemas:**
```typescript
explorerTokenInfoSchema = z.object({
  contractAddress, name, symbol, decimals: z.number().optional(), totalSupply: z.string().optional(),
  website: z.string().optional(), description: z.string().optional(),
  socialProfiles: z.record(z.string()).optional()
})
explorerTokenSupplySchema = z.object({ contractAddress, totalSupply: z.string(), decimals: z.number().optional() })
explorerTokenHolderSchema = z.object({ address, balance: z.string(), share: z.string().optional() })
explorerTokenHoldersSchema = z.object({ holders: z.array(explorerTokenHolderSchema), hasMore })
```

- [ ] Add Etherscan response types (EtherscanTokenInfo, EtherscanTokenHolder) to etherscan/types.ts
- [ ] Add output schemas + types
- [ ] Add input schemas
- [ ] Add 4 tool handlers + normalization
- [ ] Add 4 SDK functions + exports + tests
- [ ] Commit: `feat(explorer): add token info, supply, and holders tools`

### Task 5: Blocks — 3 tools

**Tools:**
- `explorer_get_block_by_timestamp` — `block/getblocknobytime`
- `explorer_get_block_rewards` — `block/getblockreward`
- `explorer_get_blocks_by_validator` — `account/getminedblocks`

**Input schemas:**
- By timestamp: `explorerBaseSchema` + `timestamp: z.number()` + `closest: z.enum(["before", "after"])`
- Block rewards: `explorerBlockSchema` (reuse)
- By validator: `explorerAddressSchema` + `explorerPaginatedSchema`

**Output schemas:**
```typescript
explorerBlockByTimestampSchema = z.object({ blockNumber: z.number().describe("Block number") })
explorerBlockRewardsSchema = z.object({
  blockNumber: z.number(), miner: z.string(), blockReward: z.string(),
  uncleInclusionReward: z.string().describe("Reward paid to miner for including uncles"),
  uncles: z.array(z.object({
    miner: z.string(), unclePosition: z.string(), blockreward: z.string()
  })).describe("Individual uncle block rewards"),
})
// By validator reuses explorerBlockInfoSchema in an array wrapper
```

- [ ] Add output schemas + types
- [ ] Add input schemas
- [ ] Add 3 tool handlers + normalization
- [ ] Add 3 SDK functions + exports + tests
- [ ] Commit: `feat(explorer): add block timestamp, rewards, and validator tools`

### Task 6: Contracts — 2 tools

**Tools:**
- `explorer_get_contract_creator` — `contract/getcontractcreation`
- `explorer_get_contract_code` — proxy `eth_getCode`

**Input schemas:** Both extend `explorerContractSchema`

**Output schemas:**
```typescript
explorerContractCreatorSchema = z.object({ contractAddress, creatorAddress, txHash })
explorerContractCodeSchema = z.object({ contractAddress, bytecode: z.string() })
```

- [ ] Add output schemas + types
- [ ] Add input schemas
- [ ] Add 2 tool handlers
- [ ] Add 2 SDK functions + exports + tests
- [ ] Commit: `feat(explorer): add contract creator and bytecode tools`

---

## Phase 3: Analytics & Events (10 tools)

### Task 7: Event Logs — 2 tools

**Tools:**
- `explorer_get_event_logs` — `logs/getLogs` with address + topics + block range
- `explorer_get_event_logs_by_topics` — `logs/getLogs` with topics only (no address)

**Input schemas:**
```typescript
explorerGetEventLogsSchema = explorerAddressSchema.merge(explorerTimeRangeSchema).extend({
  topic0: z.string().optional().describe("First topic (event signature hash)"),
  topic1: z.string().optional().describe("Second topic"),
  topic2: z.string().optional().describe("Third topic"),
  topic3: z.string().optional().describe("Fourth topic"),
})
```

**Output schemas:**
```typescript
explorerEventLogSchema = z.object({
  address: z.string(), topics: z.array(z.string()), data: z.string(),
  blockNumber: z.number(), timestamp: z.string(), txHash: z.string(), logIndex: z.number(),
})
explorerEventLogsSchema = z.object({ logs: z.array(explorerEventLogSchema), hasMore })
```

- [ ] Add Etherscan response type (EtherscanEventLog) to etherscan/types.ts
- [ ] Create `src/api/explorer/events.ts` with normalization functions
- [ ] Add output schemas + types
- [ ] Add input schemas
- [ ] Add 2 tool handlers
- [ ] Add 2 SDK functions
- [ ] Add exports
- [ ] Create `tests/api/explorer/events.test.ts` with normalization tests
- [ ] Commit: `feat(explorer): add event log query tools`

### Task 8: Network Statistics — 5 tools

**Tools:**
- `explorer_get_daily_tx_count` — `stats/dailytx`
- `explorer_get_daily_gas_used` — `stats/dailyavggasused`
- `explorer_get_daily_new_addresses` — `stats/dailynewaddress`
- `explorer_get_daily_block_rewards` — `stats/dailyblockrewards`
- `explorer_get_network_utilization` — `stats/dailynetutilization`

**Input schema (shared):**
```typescript
explorerDateRangeSchema = explorerBaseSchema.extend({
  startDate: z.string().describe("Start date (YYYY-MM-DD)"),
  endDate: z.string().describe("End date (YYYY-MM-DD)"),
  sort: z.enum(["asc", "desc"]).optional().describe("Sort order (default asc)"),
})
```

**Output schema (shared):**
```typescript
explorerDailyStatSchema = z.object({
  date: z.string().describe("Date (YYYY-MM-DD)"),
  value: z.string().describe("Statistic value for the day"),
})
explorerDailyStatsSchema = z.object({
  stats: z.array(explorerDailyStatSchema),
  metric: z.string().describe("Name of the metric"),
})
```

All 5 tools share the same input/output shape — only the Etherscan action differs.

- [ ] Add Etherscan response type (EtherscanDailyStat) to etherscan/types.ts
- [ ] Add `explorerDateRangeSchema` to `src/api/schemas/explorer.ts`
- [ ] Create `src/api/explorer/network.ts` with normalization functions
- [ ] Add shared daily stats output schema + type
- [ ] Add 5 tool handlers (thin wrappers — each just changes the Etherscan `action` string)
- [ ] Add 5 SDK functions
- [ ] Add exports
- [ ] Create `tests/api/explorer/network.test.ts` with normalization tests
- [ ] Commit: `feat(explorer): add network statistics tools`

### Task 9: Price & Supply — 3 tools

**Tools:**
- `explorer_get_native_price` — `stats/ethprice`
- `explorer_get_historical_price` — `stats/ethdailyprice`
- `explorer_get_native_supply` — `stats/ethsupply2`

**Input schemas:**
- Native price: `explorerBaseSchema` only
- Historical price: `explorerDateRangeSchema` (from Task 8)
- Supply: `explorerBaseSchema` only

**Output schemas:**
```typescript
explorerNativePriceSchema = z.object({
  priceUsd: z.string(), priceBtc: z.string(), timestamp: z.string()
})
explorerHistoricalPriceSchema = z.object({
  prices: z.array(z.object({ date: z.string(), priceUsd: z.string() }))
})
explorerNativeSupplySchema = z.object({
  totalSupply: z.string(), circulatingSupply: z.string().optional(),
  stakedEth: z.string().optional(), burnedFees: z.string().optional()
})
```

- [ ] Add Etherscan response types (EtherscanPrice, EtherscanSupply) to etherscan/types.ts
- [ ] Add output schemas + types
- [ ] Add input schemas
- [ ] Add normalization functions to `src/api/explorer/network.ts`
- [ ] Add 3 tool handlers
- [ ] Add 3 SDK functions
- [ ] Add exports
- [ ] Add tests to `tests/api/explorer/network.test.ts`
- [ ] Commit: `feat(explorer): add price and supply tools`

---

## Task 10: Final Integration

- [ ] Update `getExplorerToolDefinitions` count in `tests/tools/explorer/explorer-tools.test.ts` (should be 35)
- [ ] Run: `pnpm run lint && pnpm run typecheck && pnpm run build && pnpm test`
- [ ] Verify schema-quality tests pass (all new schemas have `.describe()`)
- [ ] Verify all 35 tools appear in tool definitions
- [ ] Verify all exports present in `dist/index.d.ts` (grep for `Explorer`)
- [ ] Commit: `fix(explorer): update tool count assertions and final validation`

---

## Execution Strategy

Tasks 1-6 (Phase 2) and 7-9 (Phase 3) are independent of each other within each phase. Within a phase, tasks are also independent — they modify different sections of the same files but don't conflict.

**Recommended approach:** Execute sequentially within one subagent per task (each task is ~30 min mechanical work), since they all append to the same files. Parallelize the review.

**Total: 10 tasks, 25 tools, ~25 new output schemas, ~25 new tests**
