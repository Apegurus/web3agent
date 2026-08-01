import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { V4_TOOLS, V4_WRITE_TOOLS } from "./fixture-tools.mjs";

const ACCOUNT = "0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf";
const PRIVATE_KEY = `0x${"0".repeat(63)}1`;
const SDK_CALLS = [
  "getUniswapV4Deployment",
  "getUniswapV4Pool",
  "getUniswapV4Position",
  "calculateUniswapV4Position",
  "calculateUniswapV4",
  "simulateTransaction",
  "prepareOperation:mint",
  "prepareOperation:burn",
  "prepareOperation:zeroex",
  "prepareOperation:lifi",
];

function operationInputs(fixture) {
  const base = {
    account: ACCOUNT,
    chainId: fixture.chainId,
    deadline: "9999999999",
    hookData: "0x",
    poolKey: fixture.pool.poolKey,
    sourceBlock: fixture.sourceBlock,
  };
  return {
    burn: {
      ...base,
      amount0Min: "0",
      amount1Min: "0",
      kind: "burn",
      liquidity: fixture.position.liquidity,
      liquidityBps: 10000,
      recipient: ACCOUNT,
      tokenId: fixture.position.tokenId,
    },
    collect: { ...base, kind: "collect", recipient: ACCOUNT, tokenId: fixture.position.tokenId },
    decrease: {
      ...base,
      amount0Min: "0",
      amount1Min: "0",
      kind: "decrease",
      liquidity: fixture.position.liquidity,
      liquidityBps: 10000,
      recipient: ACCOUNT,
      tokenId: fixture.position.tokenId,
    },
    increase: {
      ...base,
      amount0Max: "1",
      amount1Max: "1",
      kind: "increase",
      liquidity: "1",
      tickLower: fixture.position.tickLower,
      tickUpper: fixture.position.tickUpper,
      tokenId: fixture.position.tokenId,
    },
    mint: {
      ...base,
      amount0Max: "1",
      amount1Max: "1",
      kind: "mint",
      liquidity: "1",
      tickLower: fixture.position.tickLower,
      tickUpper: fixture.position.tickUpper,
    },
  };
}

function parseJson(stdout, label, violations) {
  try {
    return JSON.parse(stdout);
  } catch {
    violations.push(label);
    return undefined;
  }
}

function invokeCli(consumer, environment, tool, input, violations) {
  const binary = join("node_modules", ".bin", "web3agent");
  const result = spawnSync(
    "node",
    [binary, "tools", "call", tool, "--input", JSON.stringify(input), "--json"],
    {
      cwd: consumer,
      encoding: "utf8",
      env: { ...process.env, ...environment },
    }
  );
  const payload = parseJson(result.stdout, tool, violations);
  return { payload, stderr: result.stderr, status: result.status, tool };
}

function writeSdkDriver(consumer) {
  const path = join(consumer, "fixture-sdk-driver.mjs");
  writeFileSync(
    path,
    `import { readFileSync } from "node:fs";
import * as sdk from "web3agent";
const fixture = JSON.parse(readFileSync(process.env.WEB3AGENT_FIXTURE_PATH, "utf8"));
const account = process.env.WEB3AGENT_FIXTURE_ACCOUNT;
const base = { account, chainId: fixture.chainId, deadline: "9999999999", hookData: "0x", poolKey: fixture.pool.poolKey, sourceBlock: fixture.sourceBlock };
const mint = { ...base, amount0Max: "1", amount1Max: "1", kind: "mint", liquidity: "1", tickLower: fixture.position.tickLower, tickUpper: fixture.position.tickUpper };
const burn = { ...base, amount0Min: "0", amount1Min: "0", kind: "burn", liquidity: fixture.position.liquidity, liquidityBps: 10000, recipient: account, tokenId: fixture.position.tokenId };
let reads;
try {
reads = {
  deployment: await sdk.getUniswapV4Deployment({ chainId: fixture.chainId }),
  pool: await sdk.getUniswapV4Pool({ poolKey: fixture.pool.poolKey, sourceBlock: fixture.sourceBlock }),
  position: await sdk.getUniswapV4Position({ expectedOwner: account, poolKey: fixture.pool.poolKey, sourceBlock: fixture.sourceBlock, tokenId: fixture.position.tokenId }),
  positionCalculation: await sdk.calculateUniswapV4Position({ pool: fixture.normalized.pool, position: fixture.normalized.position }),
  calculation: await sdk.calculateUniswapV4({ kind: "feeEstimate", position: fixture.normalized.position }),
};
} catch (error) {
  process.stderr.write(JSON.stringify(error, (_, value) => typeof value === "bigint" ? value.toString() : value));
  throw error;
}
const prepared = { mint: await sdk.prepareOperation({ ...mint, integration: "uniswap-v4" }), burn: await sdk.prepareOperation({ ...burn, integration: "uniswap-v4" }) };
const simulation = await sdk.simulateTransaction({ chainId: fixture.chainId, data: "0x", from: account, to: fixture.deployment.poolManager, value: "0" });
const zeroEx = await sdk.prepareOperation({ account, chainId: fixture.chainId, fromAmount: fixture.quote.request.fromAmount, fromToken: fixture.quote.request.fromToken, integration: "zeroex", kind: "swap", toToken: fixture.quote.request.toToken });
process.env.WEB3AGENT_FIXTURE_ZEROEX_MODE = "no-route";
const lifi = await sdk.prepareOperation({ account, chainId: fixture.chainId, fromAmount: fixture.quote.request.fromAmount, fromToken: fixture.quote.request.fromToken, integration: "zeroex", kind: "swap", toToken: fixture.quote.request.toToken });
process.stdout.write(JSON.stringify({ prepared, reads, sdkCalls: ${JSON.stringify(SDK_CALLS)}, simulation, swaps: { lifi, zeroEx } }));
`
  );
  return path;
}

function runSdkDriver(consumer, environment, violations) {
  const path = writeSdkDriver(consumer);
  const result = spawnSync("node", [path], {
    cwd: consumer,
    encoding: "utf8",
    env: { ...process.env, ...environment },
  });
  if (result.status !== 0) throw new Error(`SDK driver failed:\n${result.stderr}`);
  const payload = parseJson(result.stdout, "root-sdk", violations);
  if (!payload) throw new Error("SDK driver emitted invalid JSON");
  return payload;
}

function countCalls(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

export function runConsumerFixture({ consumer, counterPath, fixturePath, preloadPath }) {
  const fixture = JSON.parse(readFileSync(fixturePath, "utf8"));
  const environment = {
    CHAIN_ID: String(fixture.chainId),
    CONFIRM_WRITES: "true",
    NODE_OPTIONS: `--require=${preloadPath}`,
    OWS_FORCE_LEGACY: "1",
    POLICY_ENABLED: "false",
    PRIVATE_KEY,
    RPC_URL_4663: "https://fixture.invalid/rpc",
    WEB3AGENT_FIXTURE_ACCOUNT: ACCOUNT,
    WEB3AGENT_FIXTURE_COUNTER: counterPath,
    WEB3AGENT_FIXTURE_PATH: fixturePath,
    ZEROX_API_KEY: "fixture-key",
  };
  const violations = [];
  const list = spawnSync(
    "node",
    [join("node_modules", ".bin", "web3agent"), "tools", "list", "--json"],
    {
      cwd: consumer,
      encoding: "utf8",
      env: { ...process.env, ...environment },
    }
  );
  const catalog = parseJson(list.stdout, "tools-list", violations);
  if (list.status !== 0 || !catalog?.data?.tools)
    throw new Error(`Tool discovery failed:\n${list.stderr}`);
  const names = catalog.data.tools
    .map((tool) => tool.name)
    .filter((name) => name.startsWith("uniswap_v4_"));
  if (JSON.stringify(names) !== JSON.stringify(V4_TOOLS))
    throw new Error("Packed CLI tool catalog drift");
  const operations = operationInputs(fixture);
  const inputs = {
    uniswap_v4_burn_position: operations.burn,
    uniswap_v4_calculate_position: {
      pool: fixture.normalized.pool,
      position: fixture.normalized.position,
    },
    uniswap_v4_calculate: {
      kind: "feeEstimate",
      position: fixture.normalized.position,
    },
    uniswap_v4_collect_fees: operations.collect,
    uniswap_v4_decrease_liquidity: operations.decrease,
    uniswap_v4_get_deployment: { chainId: fixture.chainId },
    uniswap_v4_get_events: {
      chainId: fixture.chainId,
      endBlock: fixture.sourceBlock.blockNumber,
      pageSize: 10,
      poolId: fixture.pool.poolId,
      scope: "pool",
      startBlock: fixture.sourceBlock.blockNumber,
    },
    uniswap_v4_get_pool: { poolKey: fixture.pool.poolKey, sourceBlock: fixture.sourceBlock },
    uniswap_v4_get_position: {
      expectedOwner: ACCOUNT,
      poolKey: fixture.pool.poolKey,
      sourceBlock: fixture.sourceBlock,
      tokenId: fixture.position.tokenId,
    },
    uniswap_v4_increase_liquidity: operations.increase,
    uniswap_v4_mint_position: operations.mint,
    uniswap_v4_simulate_operation: { operation: operations.mint, sourceBlock: fixture.sourceBlock },
  };
  const calls = V4_TOOLS.map((tool) =>
    invokeCli(consumer, environment, tool, inputs[tool], violations)
  );
  const invalid = invokeCli(
    consumer,
    environment,
    "uniswap_v4_get_events",
    { bad: true },
    violations
  );
  if (invalid.status === 0 || invalid.payload?.ok !== false || !invalid.payload.error?.code)
    throw new Error("Packed CLI invalid input did not return a structured error");
  const failed = calls.filter((call) => call.status !== 0 || call.payload?.ok !== true);
  let sdk;
  try {
    sdk = runSdkDriver(consumer, environment, violations);
  } catch (error) {
    throw new Error(
      `${error instanceof Error ? error.message : String(error)}\nCounter: ${JSON.stringify(countCalls(counterPath))}`
    );
  }
  if (failed.length > 0)
    throw new Error(
      `Packed v4 tool calls failed: ${JSON.stringify(
        failed.map((call) => ({ tool: call.tool, payload: call.payload }))
      )}`
    );
  const writes = calls
    .filter((call) => V4_WRITE_TOOLS.has(call.tool))
    .map((call) => [call.tool, call.payload.data.status]);
  if (writes.some(([, status]) => status !== "pending_confirmation"))
    throw new Error(`Packed write tool confirmation statuses: ${JSON.stringify(writes)}`);
  return {
    cliCalls: calls,
    counter: countCalls(counterPath),
    invalid,
    sdk,
    stdoutProtocolViolations: violations,
  };
}
