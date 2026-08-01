import { writeFileSync } from "node:fs";
import { join } from "node:path";

export function writeFixturePreload(directory) {
  const path = join(directory, "fixture-preload.cjs");
  writeFileSync(
    path,
    `const { createRequire } = require("node:module");
const { readFileSync, writeFileSync } = require("node:fs");
const requireFromConsumer = createRequire(process.cwd() + "/package.json");
const { decodeFunctionData, encodeAbiParameters, encodeFunctionResult, keccak256 } = requireFromConsumer("viem");
const fixture = JSON.parse(readFileSync(process.env.WEB3AGENT_FIXTURE_PATH, "utf8"));
const counterPath = process.env.WEB3AGENT_FIXTURE_COUNTER;
const result = (value) => ({ jsonrpc: "2.0", id: value.id, result: rpcResult(value.method, value.params ?? []) });
const multicallAbi = [{ type: "function", name: "aggregate3", stateMutability: "view", inputs: [{ name: "calls", type: "tuple[]", components: [{ name: "target", type: "address" }, { name: "allowFailure", type: "bool" }, { name: "callData", type: "bytes" }] }], outputs: [{ name: "returnData", type: "tuple[]", components: [{ name: "success", type: "bool" }, { name: "returnData", type: "bytes" }] }] }];
const stateAbi = [{ type: "function", name: "getSlot0", inputs: [{ type: "bytes32" }], outputs: [{ type: "uint160" }, { type: "int24" }, { type: "uint24" }, { type: "uint24" }] }, { type: "function", name: "getLiquidity", inputs: [{ type: "bytes32" }], outputs: [{ type: "uint128" }] }, { type: "function", name: "getFeeGrowthGlobals", inputs: [{ type: "bytes32" }], outputs: [{ type: "uint256" }, { type: "uint256" }] }, { type: "function", name: "getFeeGrowthInside", inputs: [{ type: "bytes32" }, { type: "int24" }, { type: "int24" }], outputs: [{ type: "uint256" }, { type: "uint256" }] }, { type: "function", name: "getPositionInfo", inputs: [{ type: "bytes32" }, { type: "address" }, { type: "int24" }, { type: "int24" }, { type: "bytes32" }], outputs: [{ type: "uint128" }, { type: "uint256" }, { type: "uint256" }] }];
const positionAbi = [{ type: "function", name: "ownerOf", inputs: [{ type: "uint256" }], outputs: [{ type: "address" }] }, { type: "function", name: "getApproved", inputs: [{ type: "uint256" }], outputs: [{ type: "address" }] }, { type: "function", name: "getPositionLiquidity", inputs: [{ type: "uint256" }], outputs: [{ type: "uint128" }] }, { type: "function", name: "getPoolAndPositionInfo", inputs: [{ type: "uint256" }], outputs: [{ type: "tuple", components: [{ type: "address" }, { type: "address" }, { type: "uint24" }, { type: "int24" }, { type: "address" }] }, { type: "uint256" }] }, { type: "function", name: "nonce", inputs: [{ type: "uint256" }], outputs: [{ type: "uint256" }] }];
const permitAbi = [{ type: "function", name: "allowance", inputs: [{ type: "address" }, { type: "address" }, { type: "address" }], outputs: [{ type: "uint160" }, { type: "uint48" }, { type: "uint48" }] }];
const permitProxyAbi = [{ type: "function", name: "nextNonce", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] }];
const poolAbi = [{ type: "function", name: "protocolFeeController", inputs: [], outputs: [{ type: "address" }] }];
const erc20Abi = [{ type: "function", name: "name", inputs: [], outputs: [{ type: "string" }] }, { type: "function", name: "symbol", inputs: [], outputs: [{ type: "string" }] }, { type: "function", name: "decimals", inputs: [], outputs: [{ type: "uint8" }] }, { type: "function", name: "allowance", inputs: [{ type: "address" }, { type: "address" }], outputs: [{ type: "uint256" }] }];
const settlerRegistryAbi = [{ type: "function", name: "ownerOf", inputs: [{ type: "uint256" }], outputs: [{ type: "address" }] }, { type: "function", name: "prev", inputs: [{ type: "uint256" }], outputs: [{ type: "address" }] }];
const settlerRegistry = "0x00000000000004533fe15556b1e086bb1a72ceae";
const counter = () => JSON.parse(readFileSync(counterPath, "utf8"));
const count = (key) => { const value = counter(); value[key] = (value[key] ?? 0) + 1; writeFileSync(counterPath, JSON.stringify(value)); };
const positionInfo = () => (BigInt(keccak256(encodeAbiParameters([{ type: "address" }, { type: "address" }, { type: "uint24" }, { type: "int24" }, { type: "address" }], ["0x0000000000000000000000000000000000000000", fixture.token.address, fixture.pool.poolKey.fee, fixture.pool.poolKey.tickSpacing, fixture.pool.poolKey.hooks]))) & 0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffff00000000000000n) | (BigInt.asUintN(24, -120n) << 8n) | (120n << 32n);
const attempt = (abi, data) => { try { return decodeFunctionData({ abi, data }); } catch { return undefined; } };
const encoded = (abi, functionName, value) => encodeFunctionResult({ abi, functionName, result: value });
function callResult(data, target) {
  if (target?.toLowerCase() === settlerRegistry) {
    const call = decodeFunctionData({ abi: settlerRegistryAbi, data });
    return encoded(settlerRegistryAbi, call.functionName, call.functionName === "ownerOf" ? fixture.quote.response.transaction.to : "0x7777777777777777777777777777777777777777");
  }
  for (const abi of [stateAbi, positionAbi, permitAbi, permitProxyAbi, poolAbi, erc20Abi]) {
    const call = attempt(abi, data);
    if (!call) continue;
    switch (call.functionName) {
      case "getSlot0": return encoded(abi, call.functionName, [79228162514264337593543950336n, 0, 0, 500]);
      case "getLiquidity": return encoded(abi, call.functionName, 900n);
      case "getFeeGrowthGlobals": return encoded(abi, call.functionName, [101n, 202n]);
      case "getFeeGrowthInside": return encoded(abi, call.functionName, [1020847100762815390390123822295304634368n, 1361129467683753853853498429727072845824n]);
      case "getPositionInfo": return encoded(abi, call.functionName, [77n, 340282366920938463463374607431768211456n, 680564733841876926926749214863536422912n]);
      case "ownerOf": return encoded(abi, call.functionName, process.env.WEB3AGENT_FIXTURE_ACCOUNT ?? fixture.position.owner);
      case "getApproved": return encoded(abi, call.functionName, fixture.position.operator);
      case "getPositionLiquidity": return encoded(abi, call.functionName, 77n);
      case "getPoolAndPositionInfo": return encoded(abi, call.functionName, [["0x0000000000000000000000000000000000000000", fixture.token.address, fixture.pool.poolKey.fee, fixture.pool.poolKey.tickSpacing, fixture.pool.poolKey.hooks], positionInfo()]);
      case "nonce": return encoded(abi, call.functionName, 0n);
      case "allowance": { const arity = abi.find((entry) => entry.name === "allowance").inputs.length; count("allowanceArity" + arity); return encoded(abi, call.functionName, arity === 2 ? 0n : [0n, 0n, 0n]); }
      case "nextNonce": return encoded(abi, call.functionName, 0n);
      case "protocolFeeController": return encoded(abi, call.functionName, "0x0000000000000000000000000000000000000000");
      case "name": return encoded(abi, call.functionName, fixture.token.name);
      case "symbol": return encoded(abi, call.functionName, fixture.token.symbol);
      case "decimals": return encoded(abi, call.functionName, fixture.token.decimals);
    }
  }
  return "0x";
}
function rpcResult(method, params) {
  count("rpcCalls");
  if (method === "eth_chainId") return "0x1237";
  if (method === "eth_blockNumber") return "0x" + BigInt(fixture.sourceBlock.blockNumber).toString(16);
  if (method === "eth_getBlockByNumber") return { hash: fixture.sourceBlock.blockHash, number: "0xfad14f", parentHash: "0x" + "00".repeat(32), nonce: "0x0000000000000000", sha3Uncles: "0x" + "00".repeat(32), logsBloom: "0x" + "00".repeat(256), transactionsRoot: "0x" + "00".repeat(32), stateRoot: "0x" + "00".repeat(32), receiptsRoot: "0x" + "00".repeat(32), miner: "0x0000000000000000000000000000000000000000", difficulty: "0x0", totalDifficulty: "0x0", extraData: "0x", size: "0x0", gasLimit: "0x1c9c380", gasUsed: "0x0", timestamp: "0x1", transactions: [], uncles: [], baseFeePerGas: "0x1" };
  if (method === "eth_getLogs") return [];
  if (method === "eth_estimateGas") return "0x5208";
  if (method === "eth_gasPrice" || method === "eth_maxPriorityFeePerGas") return "0x1";
  if (method === "eth_getBalance" || method === "eth_getTransactionCount") return "0x0";
  if (method === "eth_getCode") return "0x6000";
  if (method === "eth_feeHistory") return { baseFeePerGas: ["0x1", "0x1"], gasUsedRatio: [0], oldestBlock: "0xface0f", reward: [["0x1"]] };
  if (method === "eth_sendTransaction" || method === "eth_sendRawTransaction") { count("walletSubmissions"); return "0x" + "11".repeat(32); }
  if (method !== "eth_call") return "0x";
  const data = params[0]?.data ?? "0x";
  const multicall = attempt(multicallAbi, data);
  if (multicall?.functionName === "aggregate3") return encoded(multicallAbi, "aggregate3", multicall.args[0].map((call) => ({ success: true, returnData: callResult(call.callData, call.target) })));
  return callResult(data, params[0]?.to);
}
const lifiQuote = { action: { fromAmount: fixture.quote.request.fromAmount, fromChainId: 4663, fromToken: { address: fixture.quote.request.fromToken, decimals: 18, symbol: "USDG" }, toChainId: 4663, toToken: { address: fixture.quote.request.toToken, decimals: 18, symbol: "WETH" } }, estimate: { approvalAddress: "0x000000000022D473030F116dDEE9F6B43aC78BA3", fromAmount: fixture.quote.request.fromAmount, toAmount: "999", toAmountMin: "990", gasCosts: [], executionDuration: 1 }, transactionRequest: { chainId: 4663, data: "0xabcdef", to: "0xB477751B76CF82d00a686A1232f5fCD772414Af3", value: "0" }, includedSteps: [] };
const originalFetch = global.fetch;
global.fetch = async (input, init) => {
  const url = String(input);
  if (url.includes("api.0x.org")) { count("zeroExCalls"); const noRoute = process.env.WEB3AGENT_FIXTURE_ZEROEX_MODE === "no-route"; return new Response(JSON.stringify(noRoute ? { code: "NO_LIQUIDITY" } : fixture.quote.response), { status: noRoute ? 400 : 200, headers: { "content-type": "application/json" } }); }
  if (url.includes("li.quest")) { count("lifiCalls"); const value = counter(); value.lastLifiUrl = url; writeFileSync(counterPath, JSON.stringify(value)); return new Response(JSON.stringify(url.includes("/chains") ? { chains: [{ id: 4663, diamondAddress: lifiQuote.transactionRequest.to, permit2: fixture.deployment.permit2, permit2Proxy: "0x8eABB4E117fB70b346592e013855f6d825F50af1" }] } : lifiQuote), { status: 200, headers: { "content-type": "application/json" } }); }
  if (url === process.env.RPC_URL_4663) { const body = JSON.parse(init?.body ?? "{}"); return new Response(JSON.stringify(Array.isArray(body) ? body.map(result) : result(body)), { status: 200, headers: { "content-type": "application/json" } }); }
  return originalFetch(input, init);
};
`
  );
  return path;
}
