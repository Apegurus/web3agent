/**
 * Well-known token registry — canonical contract addresses for major tokens
 * across all chains supported by web3agent.
 *
 * Sources: Official project docs, CoinGecko, chain explorers.
 * Only tokens with high confidence (verified contracts, high TVL) are included.
 *
 * To add a token: append to the chain's entry with verified address + decimals.
 */

export interface TokenEntry {
  address: string;
  decimals: number;
  name: string;
  symbol: string;
}

type ChainTokens = Record<string, TokenEntry>;

export const WELL_KNOWN_TOKENS: Record<number, ChainTokens> = {
  // ── Ethereum Mainnet (1) ──────────────────────────────────────────
  1: {
    USDT: {
      address: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
      decimals: 6,
      name: "Tether USD",
      symbol: "USDT",
    },
    USDC: {
      address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      decimals: 6,
      name: "USD Coin",
      symbol: "USDC",
    },
    WETH: {
      address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
      decimals: 18,
      name: "Wrapped Ether",
      symbol: "WETH",
    },
    DAI: {
      address: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
      decimals: 18,
      name: "Dai Stablecoin",
      symbol: "DAI",
    },
    WBTC: {
      address: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599",
      decimals: 8,
      name: "Wrapped BTC",
      symbol: "WBTC",
    },
    LINK: {
      address: "0x514910771AF9Ca656af840dff83E8264EcF986CA",
      decimals: 18,
      name: "Chainlink",
      symbol: "LINK",
    },
    UNI: {
      address: "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984",
      decimals: 18,
      name: "Uniswap",
      symbol: "UNI",
    },
    AAVE: {
      address: "0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9",
      decimals: 18,
      name: "Aave",
      symbol: "AAVE",
    },
  },

  // ── BNB Smart Chain (56) ──────────────────────────────────────────
  56: {
    USDT: {
      address: "0x55d398326f99059fF775485246999027B3197955",
      decimals: 18,
      name: "Binance-Peg BSC-USD",
      symbol: "USDT",
    },
    USDC: {
      address: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",
      decimals: 18,
      name: "Binance-Peg USD Coin",
      symbol: "USDC",
    },
    WBNB: {
      address: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
      decimals: 18,
      name: "Wrapped BNB",
      symbol: "WBNB",
    },
    WETH: {
      address: "0x2170Ed0880ac9A755fd29B2688956BD959F933F8",
      decimals: 18,
      name: "Binance-Peg Ethereum",
      symbol: "WETH",
    },
    DAI: {
      address: "0x1AF3F329e8BE154074D8769D1FFa4eE058B1DBc3",
      decimals: 18,
      name: "Binance-Peg Dai",
      symbol: "DAI",
    },
    BTCB: {
      address: "0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c",
      decimals: 18,
      name: "Binance-Peg BTCB",
      symbol: "BTCB",
    },
    WBTC: {
      address: "0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c",
      decimals: 18,
      name: "Binance-Peg BTCB",
      symbol: "WBTC",
    },
    CAKE: {
      address: "0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82",
      decimals: 18,
      name: "PancakeSwap",
      symbol: "CAKE",
    },
  },

  // ── Polygon (137) ─────────────────────────────────────────────────
  137: {
    USDT: {
      address: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F",
      decimals: 6,
      name: "Tether USD",
      symbol: "USDT",
    },
    USDC: {
      address: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
      decimals: 6,
      name: "USD Coin",
      symbol: "USDC",
    },
    "USDC.E": {
      address: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174",
      decimals: 6,
      name: "Bridged USDC",
      symbol: "USDC.e",
    },
    WETH: {
      address: "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619",
      decimals: 18,
      name: "Wrapped Ether",
      symbol: "WETH",
    },
    WMATIC: {
      address: "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270",
      decimals: 18,
      name: "Wrapped Matic",
      symbol: "WMATIC",
    },
    WPOL: {
      address: "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270",
      decimals: 18,
      name: "Wrapped POL",
      symbol: "WPOL",
    },
    DAI: {
      address: "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063",
      decimals: 18,
      name: "Dai Stablecoin",
      symbol: "DAI",
    },
    WBTC: {
      address: "0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6",
      decimals: 8,
      name: "Wrapped BTC",
      symbol: "WBTC",
    },
    LINK: {
      address: "0x53E0bca35eC356BD5ddDFebbD1Fc0fD03FaBad39",
      decimals: 18,
      name: "Chainlink",
      symbol: "LINK",
    },
    AAVE: {
      address: "0xD6DF932A45C0f255f85145f286eA0b292B21C90B",
      decimals: 18,
      name: "Aave",
      symbol: "AAVE",
    },
  },

  // ── Arbitrum One (42161) ──────────────────────────────────────────
  42161: {
    USDT: {
      address: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9",
      decimals: 6,
      name: "Tether USD",
      symbol: "USDT",
    },
    USDC: {
      address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
      decimals: 6,
      name: "USD Coin",
      symbol: "USDC",
    },
    "USDC.E": {
      address: "0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8",
      decimals: 6,
      name: "Bridged USDC",
      symbol: "USDC.e",
    },
    WETH: {
      address: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
      decimals: 18,
      name: "Wrapped Ether",
      symbol: "WETH",
    },
    DAI: {
      address: "0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1",
      decimals: 18,
      name: "Dai Stablecoin",
      symbol: "DAI",
    },
    WBTC: {
      address: "0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f",
      decimals: 8,
      name: "Wrapped BTC",
      symbol: "WBTC",
    },
    ARB: {
      address: "0x912CE59144191C1204E64559FE8253a0e49E6548",
      decimals: 18,
      name: "Arbitrum",
      symbol: "ARB",
    },
    LINK: {
      address: "0xf97f4df75117a78c1A5a0DBb814Af92458539FB4",
      decimals: 18,
      name: "Chainlink",
      symbol: "LINK",
    },
  },

  // ── Optimism (10) ─────────────────────────────────────────────────
  10: {
    USDT: {
      address: "0x94b008aA00579c1307B0EF2c499aD98a8ce58e58",
      decimals: 6,
      name: "Tether USD",
      symbol: "USDT",
    },
    USDC: {
      address: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85",
      decimals: 6,
      name: "USD Coin",
      symbol: "USDC",
    },
    "USDC.E": {
      address: "0x7F5c764cBc14f9669B88837ca1490cCa17c31607",
      decimals: 6,
      name: "Bridged USDC",
      symbol: "USDC.e",
    },
    WETH: {
      address: "0x4200000000000000000000000000000000000006",
      decimals: 18,
      name: "Wrapped Ether",
      symbol: "WETH",
    },
    DAI: {
      address: "0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1",
      decimals: 18,
      name: "Dai Stablecoin",
      symbol: "DAI",
    },
    WBTC: {
      address: "0x68f180fcCe6836688e9084f035309E29Bf0A2095",
      decimals: 8,
      name: "Wrapped BTC",
      symbol: "WBTC",
    },
    OP: {
      address: "0x4200000000000000000000000000000000000042",
      decimals: 18,
      name: "Optimism",
      symbol: "OP",
    },
    LINK: {
      address: "0x350a791Bfc2C21F9Ed5d10980Dad2e2638ffa7f6",
      decimals: 18,
      name: "Chainlink",
      symbol: "LINK",
    },
  },

  // ── Base (8453) ───────────────────────────────────────────────────
  8453: {
    USDC: {
      address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      decimals: 6,
      name: "USD Coin",
      symbol: "USDC",
    },
    USDT: {
      address: "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2",
      decimals: 6,
      name: "Tether USD",
      symbol: "USDT",
    },
    WETH: {
      address: "0x4200000000000000000000000000000000000006",
      decimals: 18,
      name: "Wrapped Ether",
      symbol: "WETH",
    },
    DAI: {
      address: "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb",
      decimals: 18,
      name: "Dai Stablecoin",
      symbol: "DAI",
    },
    CBBTC: {
      address: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf",
      decimals: 8,
      name: "Coinbase Wrapped BTC",
      symbol: "cbBTC",
    },
    WBTC: {
      address: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf",
      decimals: 8,
      name: "Coinbase Wrapped BTC",
      symbol: "WBTC",
    },
    AERO: {
      address: "0x940181a94A35A4569E4529A3CDfB74e38FD98631",
      decimals: 18,
      name: "Aerodrome",
      symbol: "AERO",
    },
  },

  // ── Linea (59144) ─────────────────────────────────────────────────
  59144: {
    WETH: {
      address: "0xe5D7C2a44FfDDf6b295A15c148167daaAf5Cf34f",
      decimals: 18,
      name: "Wrapped Ether",
      symbol: "WETH",
    },
    USDC: {
      address: "0x176211869cA2b568f2A7D4EE941E073a821EE1ff",
      decimals: 6,
      name: "USDC",
      symbol: "USDC",
    },
    USDT: {
      address: "0xA219439258ca9da29E9Cc4cE5596924745e12B93",
      decimals: 6,
      name: "Tether USD",
      symbol: "USDT",
    },
    DAI: {
      address: "0x4AF15ec2A0BD43Db75dd04E62FAA3B8EF36b00d5",
      decimals: 18,
      name: "Dai Stablecoin",
      symbol: "DAI",
    },
    WBTC: {
      address: "0x3aAB2285ddcDdaD8edf438C1bAB47e1a9D05a9b4",
      decimals: 8,
      name: "Wrapped BTC",
      symbol: "WBTC",
    },
  },

  // ── Avalanche C-Chain (43114) ─────────────────────────────────────
  43114: {
    USDT: {
      address: "0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7",
      decimals: 6,
      name: "Tether USD",
      symbol: "USDT",
    },
    USDC: {
      address: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E",
      decimals: 6,
      name: "USD Coin",
      symbol: "USDC",
    },
    WAVAX: {
      address: "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7",
      decimals: 18,
      name: "Wrapped AVAX",
      symbol: "WAVAX",
    },
    "WETH.E": {
      address: "0x49D5c2BdFfac6CE2BFdB6640F4F80f226bc10bAB",
      decimals: 18,
      name: "Wrapped Ether",
      symbol: "WETH.e",
    },
    WETH: {
      address: "0x49D5c2BdFfac6CE2BFdB6640F4F80f226bc10bAB",
      decimals: 18,
      name: "Wrapped Ether",
      symbol: "WETH",
    },
    DAI: {
      address: "0xd586E7F844cEa2F87f50152665BCbc2C279D8d70",
      decimals: 18,
      name: "Dai Stablecoin",
      symbol: "DAI",
    },
    "WBTC.E": {
      address: "0x50b7545627a5162F82A992c33b87aDc75187B218",
      decimals: 8,
      name: "Wrapped BTC",
      symbol: "WBTC.e",
    },
    WBTC: {
      address: "0x50b7545627a5162F82A992c33b87aDc75187B218",
      decimals: 8,
      name: "Wrapped BTC",
      symbol: "WBTC",
    },
  },

  // ── Blast (81457) ─────────────────────────────────────────────────
  81457: {
    WETH: {
      address: "0x4300000000000000000000000000000000000004",
      decimals: 18,
      name: "Wrapped Ether",
      symbol: "WETH",
    },
    USDB: {
      address: "0x4300000000000000000000000000000000000003",
      decimals: 18,
      name: "USDB",
      symbol: "USDB",
    },
    BLAST: {
      address: "0xb1a5700fA2358173Fe465e6eA4Ff52E36e88E2ad",
      decimals: 18,
      name: "Blast",
      symbol: "BLAST",
    },
  },

  // ── zkSync Era (324) ──────────────────────────────────────────────
  324: {
    USDT: {
      address: "0x493257fD37EDB34451f62EDf8D2a0C418852bA4C",
      decimals: 6,
      name: "Tether USD",
      symbol: "USDT",
    },
    USDC: {
      address: "0x1d17CBcF0D6D143135aE902365D2E5e2A16538D4",
      decimals: 6,
      name: "USD Coin",
      symbol: "USDC",
    },
    WETH: {
      address: "0x5AEa5775959fBC2557Cc8789bC1bf90A239D9a91",
      decimals: 18,
      name: "Wrapped Ether",
      symbol: "WETH",
    },
    WBTC: {
      address: "0xBBeB516fb02a01611cBBE0453Fe3c580D7281011",
      decimals: 8,
      name: "Wrapped BTC",
      symbol: "WBTC",
    },
  },

  // ── Scroll (534352) ───────────────────────────────────────────────
  534352: {
    USDT: {
      address: "0xf55BEC9cafDbE8730f096Aa55dad6D22d44099Df",
      decimals: 6,
      name: "Tether USD",
      symbol: "USDT",
    },
    USDC: {
      address: "0x06eFdBFf2a14a7c8E15944D1F4A48F9F95F663A4",
      decimals: 6,
      name: "USD Coin",
      symbol: "USDC",
    },
    WETH: {
      address: "0x5300000000000000000000000000000000000004",
      decimals: 18,
      name: "Wrapped Ether",
      symbol: "WETH",
    },
    DAI: {
      address: "0xcA77eB3fEFe3725Dc33bccB54eDEFc3D9f764f97",
      decimals: 18,
      name: "Dai Stablecoin",
      symbol: "DAI",
    },
    WBTC: {
      address: "0x3C1BCa5a656e69edCD0D4E36BEbb3FcDAcA60Cf1",
      decimals: 8,
      name: "Wrapped BTC",
      symbol: "WBTC",
    },
  },

  // ── Gnosis (100) ──────────────────────────────────────────────────
  100: {
    USDT: {
      address: "0x4ECaBa5870353805a9F068101A40E0f32ed605C6",
      decimals: 6,
      name: "Tether USD",
      symbol: "USDT",
    },
    USDC: {
      address: "0xDDAfbb505ad214D7b80b1f830fcCc89B60fb7A83",
      decimals: 6,
      name: "USD Coin",
      symbol: "USDC",
    },
    WETH: {
      address: "0x6A023CCd1ff6F2045C3309768eAd9E68F978f6e1",
      decimals: 18,
      name: "Wrapped Ether",
      symbol: "WETH",
    },
    WXDAI: {
      address: "0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d",
      decimals: 18,
      name: "Wrapped xDAI",
      symbol: "WXDAI",
    },
    GNO: {
      address: "0x9C58BAcC331c9aa871AFD802DB6379a98e80CEdb",
      decimals: 18,
      name: "Gnosis",
      symbol: "GNO",
    },
  },

  // ── Celo (42220) ──────────────────────────────────────────────────
  42220: {
    USDT: {
      address: "0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e",
      decimals: 6,
      name: "Tether USD",
      symbol: "USDT",
    },
    USDC: {
      address: "0xcebA9300f2b948710d2653dD7B07f33A8B32118C",
      decimals: 6,
      name: "USD Coin",
      symbol: "USDC",
    },
    CELO: {
      address: "0x471EcE3750Da237f93B8E339c536989b8978a438",
      decimals: 18,
      name: "Celo",
      symbol: "CELO",
    },
  },

  // ── Mantle (5000) ─────────────────────────────────────────────────
  5000: {
    USDT: {
      address: "0x201EBa5CC46D216Ce6DC03F6a759e8E766e956aE",
      decimals: 6,
      name: "Tether USD",
      symbol: "USDT",
    },
    USDC: {
      address: "0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9",
      decimals: 6,
      name: "USD Coin",
      symbol: "USDC",
    },
    WMNT: {
      address: "0x78c1b0C915c4FAA5FffA6CAbf0219DA63d7f4cb8",
      decimals: 18,
      name: "Wrapped Mantle",
      symbol: "WMNT",
    },
    WETH: {
      address: "0xdEAddEaDdeadDEadDEADDEAddEADDEAddead1111",
      decimals: 18,
      name: "Wrapped Ether",
      symbol: "WETH",
    },
  },

  // ── Mode (34443) ──────────────────────────────────────────────────
  34443: {
    USDT: {
      address: "0xf0F161fDA2712DB8b566946122a5af183995e2eD",
      decimals: 6,
      name: "Tether USD",
      symbol: "USDT",
    },
    USDC: {
      address: "0xd988097fb8612cc24eeC14542bC03424c656005f",
      decimals: 6,
      name: "USD Coin",
      symbol: "USDC",
    },
    WETH: {
      address: "0x4200000000000000000000000000000000000006",
      decimals: 18,
      name: "Wrapped Ether",
      symbol: "WETH",
    },
  },
};

/**
 * Look up a well-known token by symbol and chain.
 * Returns undefined if the token/chain combo is not in the registry.
 */
export function lookupToken(symbol: string, chainId: number): TokenEntry | undefined {
  return WELL_KNOWN_TOKENS[chainId]?.[symbol.toUpperCase()];
}

/**
 * Get all well-known tokens for a chain.
 */
export function getChainTokens(chainId: number): ChainTokens | undefined {
  return WELL_KNOWN_TOKENS[chainId];
}

/**
 * Get all chain IDs that have registered tokens.
 */
export function getRegisteredChainIds(): number[] {
  return Object.keys(WELL_KNOWN_TOKENS).map(Number);
}
