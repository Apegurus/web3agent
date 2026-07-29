// allow: SIZE_OK — immutable ABI and source-provenance declarations must stay co-located.
export const UNISWAP_V4_ABI_PROVENANCE = {
  erc20Metadata:
    "Uniswap/contracts@37936185dee7decf681360ec799c124e0e034672:src/briefcase/protocols/v3-periphery/interfaces/IERC20Metadata.sol",
  permit2:
    "Uniswap/permit2@cc56ad0f3439c502c246fc5cfcc3db92bb8b7219:src/interfaces/IAllowanceTransfer.sol",
  poolManager: "Uniswap/v4-core@46c6834698c48bc4a463a86d8420f4eb1d7f3b75:src/PoolManager.sol",
  poolManagerEvents:
    "Uniswap/v4-core@46c6834698c48bc4a463a86d8420f4eb1d7f3b75:src/interfaces/IPoolManager.sol#L51-L107",
  positionManager:
    "Uniswap/v4-periphery@3245c3cb99c48fa1dc2459c3b60abc37d4294aba:src/interfaces/IPositionManager.sol",
  positionManagerEvents:
    "Uniswap/v4-periphery@3245c3cb99c48fa1dc2459c3b60abc37d4294aba:src/interfaces/IPositionManager.sol#L19-L33;Uniswap/v4-periphery@3245c3cb99c48fa1dc2459c3b60abc37d4294aba:lib/permit2/lib/solmate/src/tokens/ERC721.sol#L11-L15",
  stateView:
    "Uniswap/v4-periphery@3245c3cb99c48fa1dc2459c3b60abc37d4294aba:src/interfaces/IStateView.sol",
} as const;

export const UNISWAP_V4_POOL_MANAGER_ABI = [
  {
    inputs: [],
    name: "protocolFeeController",
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

export const UNISWAP_V4_POOL_MANAGER_EVENT_ABI = [
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: "id", type: "bytes32" },
      { indexed: true, name: "currency0", type: "address" },
      { indexed: true, name: "currency1", type: "address" },
      { indexed: false, name: "fee", type: "uint24" },
      { indexed: false, name: "tickSpacing", type: "int24" },
      { indexed: false, name: "hooks", type: "address" },
      { indexed: false, name: "sqrtPriceX96", type: "uint160" },
      { indexed: false, name: "tick", type: "int24" },
    ],
    name: "Initialize",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: "id", type: "bytes32" },
      { indexed: true, name: "sender", type: "address" },
      { indexed: false, name: "tickLower", type: "int24" },
      { indexed: false, name: "tickUpper", type: "int24" },
      { indexed: false, name: "liquidityDelta", type: "int256" },
      { indexed: false, name: "salt", type: "bytes32" },
    ],
    name: "ModifyLiquidity",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: "id", type: "bytes32" },
      { indexed: true, name: "sender", type: "address" },
      { indexed: false, name: "amount0", type: "int128" },
      { indexed: false, name: "amount1", type: "int128" },
      { indexed: false, name: "sqrtPriceX96", type: "uint160" },
      { indexed: false, name: "liquidity", type: "uint128" },
      { indexed: false, name: "tick", type: "int24" },
      { indexed: false, name: "fee", type: "uint24" },
    ],
    name: "Swap",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: "id", type: "bytes32" },
      { indexed: true, name: "sender", type: "address" },
      { indexed: false, name: "amount0", type: "uint256" },
      { indexed: false, name: "amount1", type: "uint256" },
    ],
    name: "Donate",
    type: "event",
  },
] as const;

export const UNISWAP_V4_STATE_VIEW_ABI = [
  {
    inputs: [{ name: "poolId", type: "bytes32" }],
    name: "getSlot0",
    outputs: [
      { name: "sqrtPriceX96", type: "uint160" },
      { name: "tick", type: "int24" },
      { name: "protocolFee", type: "uint24" },
      { name: "lpFee", type: "uint24" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "poolId", type: "bytes32" }],
    name: "getLiquidity",
    outputs: [{ name: "liquidity", type: "uint128" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "poolId", type: "bytes32" }],
    name: "getFeeGrowthGlobals",
    outputs: [
      { name: "feeGrowthGlobal0X128", type: "uint256" },
      { name: "feeGrowthGlobal1X128", type: "uint256" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { name: "poolId", type: "bytes32" },
      { name: "tickLower", type: "int24" },
      { name: "tickUpper", type: "int24" },
    ],
    name: "getFeeGrowthInside",
    outputs: [
      { name: "feeGrowthInside0X128", type: "uint256" },
      { name: "feeGrowthInside1X128", type: "uint256" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { name: "poolId", type: "bytes32" },
      { name: "owner", type: "address" },
      { name: "tickLower", type: "int24" },
      { name: "tickUpper", type: "int24" },
      { name: "salt", type: "bytes32" },
    ],
    name: "getPositionInfo",
    outputs: [
      { name: "liquidity", type: "uint128" },
      { name: "feeGrowthInside0LastX128", type: "uint256" },
      { name: "feeGrowthInside1LastX128", type: "uint256" },
    ],
    stateMutability: "view",
    type: "function",
  },
] as const;

export const UNISWAP_V4_POSITION_MANAGER_ABI = [
  {
    inputs: [{ name: "tokenId", type: "uint256" }],
    name: "nonce",
    outputs: [{ name: "nonce", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "tokenId", type: "uint256" }],
    name: "ownerOf",
    outputs: [{ name: "owner", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "tokenId", type: "uint256" }],
    name: "getApproved",
    outputs: [{ name: "operator", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "tokenId", type: "uint256" }],
    name: "getPositionLiquidity",
    outputs: [{ name: "liquidity", type: "uint128" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "tokenId", type: "uint256" }],
    name: "getPoolAndPositionInfo",
    outputs: [
      {
        components: [
          { name: "currency0", type: "address" },
          { name: "currency1", type: "address" },
          { name: "fee", type: "uint24" },
          { name: "tickSpacing", type: "int24" },
          { name: "hooks", type: "address" },
        ],
        name: "poolKey",
        type: "tuple",
      },
      { name: "positionInfo", type: "uint256" },
    ],
    stateMutability: "view",
    type: "function",
  },
] as const;

export const UNISWAP_V4_POSITION_MANAGER_EVENT_ABI = [
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: "from", type: "address" },
      { indexed: true, name: "to", type: "address" },
      { indexed: true, name: "id", type: "uint256" },
    ],
    name: "Transfer",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: "id", type: "bytes32" },
      { indexed: true, name: "sender", type: "address" },
      { indexed: false, name: "tickLower", type: "int24" },
      { indexed: false, name: "tickUpper", type: "int24" },
      { indexed: false, name: "liquidityDelta", type: "int256" },
      { indexed: false, name: "salt", type: "bytes32" },
    ],
    name: "ModifyPosition",
    type: "event",
  },
] as const;

export const PERMIT2_ALLOWANCE_ABI = [
  {
    inputs: [
      { name: "owner", type: "address" },
      { name: "token", type: "address" },
      { name: "spender", type: "address" },
    ],
    name: "allowance",
    outputs: [
      { name: "amount", type: "uint160" },
      { name: "expiration", type: "uint48" },
      { name: "nonce", type: "uint48" },
    ],
    stateMutability: "view",
    type: "function",
  },
] as const;

export const ERC20_METADATA_ABI = [
  {
    inputs: [],
    name: "name",
    outputs: [{ name: "", type: "string" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "symbol",
    outputs: [{ name: "", type: "string" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "decimals",
    outputs: [{ name: "", type: "uint8" }],
    stateMutability: "view",
    type: "function",
  },
] as const;
