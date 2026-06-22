import { getSwapQuote, prepareOperation, resolveCanonicalTokenSync } from "web3agent";

const quoteMode = process.argv.includes("--quote");
const prepareMode = process.argv.includes("--prepare");

function envInt(name, fallback) {
  const value = process.env[name];
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    throw new Error(`${name} must be an integer`);
  }
  return parsed;
}

function requireCanonicalToken({ chainId, symbol }) {
  const token = resolveCanonicalTokenSync({ chainId, symbol });
  if (!token) {
    throw new Error(`No canonical ${symbol} token found for chain ${chainId}`);
  }
  return token;
}

const fromChainId = envInt("WEB3AGENT_EXAMPLE_FROM_CHAIN_ID", 42161);
const toChainId = envInt("WEB3AGENT_EXAMPLE_TO_CHAIN_ID", 8453);
const from = requireCanonicalToken({ chainId: fromChainId, symbol: "USDC" });
const to = requireCanonicalToken({ chainId: toChainId, symbol: "USDC" });

const bridgeInput = {
  fromChainId,
  toChainId,
  fromToken: process.env.WEB3AGENT_EXAMPLE_FROM_TOKEN ?? from.address,
  toToken: process.env.WEB3AGENT_EXAMPLE_TO_TOKEN ?? to.address,
  fromAmount: process.env.WEB3AGENT_EXAMPLE_FROM_AMOUNT ?? "1000000",
};

const output = {
  example: "cross-chain bridge",
  input: bridgeInput,
  modes: {
    importsOnly: !quoteMode && !prepareMode,
    quote: quoteMode,
    prepare: prepareMode,
  },
  next: [
    "Run `node examples/bridge.mjs --quote` to fetch a live LI.FI quote.",
    "Run `WEB3AGENT_EXAMPLE_ACCOUNT=0x... node examples/bridge.mjs --prepare` to prepare externally signed wallet actions.",
  ],
};

if (quoteMode || prepareMode) {
  output.quote = await getSwapQuote(bridgeInput);
}

if (prepareMode) {
  const account = process.env.WEB3AGENT_EXAMPLE_ACCOUNT;
  if (!account) {
    throw new Error("WEB3AGENT_EXAMPLE_ACCOUNT is required in --prepare mode");
  }

  output.prepared = await prepareOperation({
    integration: "lifi",
    kind: "bridge",
    account,
    ...bridgeInput,
  });
}

process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
