import { pathToFileURL } from "node:url";
import { http, createPublicClient, keccak256 } from "viem";
import { robinhood } from "viem/chains";

const ROBINHOOD_CHAIN_ID = 4663;
const ROBINHOOD_POOL_MANAGER_CODE_HASH =
  "0xbd3881180b547f5fe817545743cfb4343e96b1bc6640dcd70c106b0066e95626";
const ROBINHOOD_DEPLOYMENT = {
  chainId: ROBINHOOD_CHAIN_ID,
  permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
  poolManager: "0x8366a39CC670B4001A1121B8F6A443A643e40951",
  positionManager: "0x58daec3116aae6D93017bAAea7749052E8a04fA7",
  stateView: "0xF3334192D15450CdD385c8B70e03f9A6bD9E673b",
};
const MODES = new Set(["--read", "--prepare", "--simulate", "--execute"]);
const SUPPORTED_FLAGS = new Set([...MODES, "--help"]);

export async function runUniswapV4Example({
  args = process.argv.slice(2),
  dependencies = {},
  env = process.env,
  write = () => undefined,
} = {}) {
  const unknownArgs = args.filter((arg) => !SUPPORTED_FLAGS.has(arg));
  const selectedModes = args.filter((arg) => MODES.has(arg));
  if (unknownArgs.length > 0) throw new Error(`Unsupported flag(s): ${unknownArgs.join(", ")}`);
  if (args.includes("--help")) {
    write({
      modes: [...MODES],
      usage: "node examples/uniswap-v4.mjs [--read|--prepare|--simulate|--execute]",
    });
    return;
  }
  if (selectedModes.length > 1) {
    throw new Error("Select at most one of --read, --prepare, --simulate, or --execute");
  }

  const chainId = envInt(env, "WEB3AGENT_EXAMPLE_CHAIN_ID", ROBINHOOD_CHAIN_ID);
  const account = env.WEB3AGENT_EXAMPLE_ACCOUNT;
  const sourceBlock = sourceBlockFromEnv(env, chainId);
  const operation = collectFixture({
    account: account ?? "0x1111111111111111111111111111111111111111",
    chainId,
    sourceBlock,
  });
  const mode = selectedModes[0]?.slice(2) ?? "fixture";

  if (mode === "execute") {
    requireEnv(env, "WEB3AGENT_EXAMPLE_EXECUTE");
    requireEnv(env, "WEB3AGENT_EXAMPLE_ACCOUNT");
    requireEnv(env, "WEB3AGENT_EXAMPLE_CONFIRMATION_ID");
    throw new Error(
      "This example never submits transactions. Use the supplied confirmation ID with your MCP host or application confirmation queue."
    );
  }

  if (mode === "fixture") {
    write({
      example: "uniswap-v4-position",
      mode,
      next: [
        "Run --read to verify the Robinhood PoolManager bytecode without initializing a wallet.",
        "Set WEB3AGENT_EXAMPLE_ACCOUNT plus a real canonical pool fixture before --prepare or --simulate.",
        "--execute never submits from this example; confirmation remains outside this process.",
      ],
      operation,
    });
    return;
  }

  if (mode === "read") {
    write(
      await readVerifiedRobinhoodDeployment({
        createPublicClient: dependencies.createPublicClient ?? createPublicClient,
        env,
        hashCode: dependencies.hashCode ?? keccak256,
      })
    );
    return;
  }

  requireEnv(env, "WEB3AGENT_EXAMPLE_ACCOUNT");
  requireSourceBlock(sourceBlock);
  const liveOperation = collectFixture({
    account,
    chainId,
    sourceBlock,
    currency1Address: requireEnv(env, "WEB3AGENT_EXAMPLE_CURRENCY1_ADDRESS"),
    currency1Decimals: envInt(env, "WEB3AGENT_EXAMPLE_CURRENCY1_DECIMALS", 18),
    currency1Name: env.WEB3AGENT_EXAMPLE_CURRENCY1_NAME ?? "Pool token",
    currency1Symbol: env.WEB3AGENT_EXAMPLE_CURRENCY1_SYMBOL ?? "TOKEN",
    fee: envInt(env, "WEB3AGENT_EXAMPLE_POOL_FEE", 500),
    hooks: env.WEB3AGENT_EXAMPLE_POOL_HOOKS ?? "0x0000000000000000000000000000000000000000",
    tickSpacing: envInt(env, "WEB3AGENT_EXAMPLE_TICK_SPACING", 60),
    tokenId: requireEnv(env, "WEB3AGENT_EXAMPLE_TOKEN_ID"),
  });
  const operations = await (dependencies.loadOperations ?? loadOperations)();

  if (mode === "prepare") {
    write(await operations.prepareOperation(liveOperation));
    return;
  }

  write(
    await operations.simulateUniswapV4Operation(
      operations.uniswapV4SimulationInputSchema.parse({ operation: liveOperation, sourceBlock })
    )
  );
}

export async function readVerifiedRobinhoodDeployment({ createPublicClient, env, hashCode }) {
  if (envInt(env, "WEB3AGENT_EXAMPLE_CHAIN_ID", ROBINHOOD_CHAIN_ID) !== ROBINHOOD_CHAIN_ID) {
    throw new Error("--read supports only the verified Robinhood Chain deployment (4663)");
  }

  const client = createPublicClient({
    chain: robinhood,
    transport: http(env.WEB3AGENT_EXAMPLE_RPC_URL),
  });
  const [chainId, poolManagerCode] = await Promise.all([
    client.getChainId(),
    client.getCode({ address: ROBINHOOD_DEPLOYMENT.poolManager }),
  ]);
  if (chainId !== ROBINHOOD_CHAIN_ID) throw new Error(`Robinhood RPC returned chain ${chainId}`);
  if (poolManagerCode === undefined || poolManagerCode === "0x") {
    throw new Error("Robinhood PoolManager has no runtime bytecode");
  }

  const poolManagerCodeHash = hashCode(poolManagerCode);
  if (poolManagerCodeHash !== ROBINHOOD_POOL_MANAGER_CODE_HASH) {
    throw new Error("Robinhood PoolManager bytecode does not match the verified deployment");
  }
  return { ...ROBINHOOD_DEPLOYMENT, poolManagerCodeHash };
}

async function loadOperations() {
  return import("web3agent");
}

function envInt(env, name, fallback) {
  const value = env[name];
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive safe integer`);
  }
  return parsed;
}

function sourceBlockFromEnv(env, chainId) {
  const blockNumber = env.WEB3AGENT_EXAMPLE_SOURCE_BLOCK_NUMBER;
  const blockHash = env.WEB3AGENT_EXAMPLE_SOURCE_BLOCK_HASH;
  if (blockNumber === undefined || blockHash === undefined) return undefined;
  return { blockHash, blockNumber, chainId };
}

function requireEnv(env, name) {
  const value = env[name];
  if (value === undefined || value.length === 0)
    throw new Error(`${name} is required for this mode`);
  return value;
}

function requireSourceBlock(sourceBlock) {
  if (sourceBlock === undefined) {
    throw new Error(
      "WEB3AGENT_EXAMPLE_SOURCE_BLOCK_NUMBER and WEB3AGENT_EXAMPLE_SOURCE_BLOCK_HASH are required for --prepare and --simulate"
    );
  }
}

function collectFixture({
  account,
  chainId,
  sourceBlock,
  currency1Address = "0x2222222222222222222222222222222222222222",
  currency1Decimals = 18,
  currency1Name = "Replace with a real token before live modes",
  currency1Symbol = "FIXTURE",
  fee = 500,
  hooks = "0x0000000000000000000000000000000000000000",
  tickSpacing = 60,
  tokenId = "1",
}) {
  return {
    account,
    chainId,
    deadline: "4102444800",
    hookData: "0x",
    integration: "uniswap-v4",
    kind: "collect",
    poolKey: {
      currency0: { chainId, decimals: 18, kind: "native", name: "Ether", symbol: "ETH" },
      currency1: {
        address: currency1Address,
        chainId,
        decimals: currency1Decimals,
        kind: "erc20",
        name: currency1Name,
        symbol: currency1Symbol,
      },
      fee,
      hooks,
      tickSpacing,
    },
    recipient: account,
    slippageBps: 0,
    sourceBlock: sourceBlock ?? {
      blockHash: `0x${"aa".repeat(32)}`,
      blockNumber: "1",
      chainId,
    },
    tokenId,
  };
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runUniswapV4Example({
    write: (output) => process.stdout.write(`${JSON.stringify(output, null, 2)}\n`),
  });
}
