import { getChain, isSupportedChain, listChainTokens, resolveCanonicalTokenSync } from "web3agent";

const chainId = 8453;
const chain = getChain(chainId);
const sampleToken = resolveCanonicalTokenSync({ symbol: "USDC", chainId });
const tokens = listChainTokens({ chainId });

process.stdout.write(
  `${JSON.stringify(
    {
      chain: chain
        ? {
            id: chain.id,
            name: chain.name,
          }
        : null,
      supported: isSupportedChain(chainId),
      sampleToken: sampleToken
        ? {
            symbol: sampleToken.symbol,
            address: sampleToken.address,
            decimals: sampleToken.decimals,
          }
        : null,
      tokenCount: tokens.tokens.length,
    },
    null,
    2
  )}\n`
);
