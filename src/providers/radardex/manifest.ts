import { parseAbi } from "viem";

export const RADARDEX_ARC = {
  chainId: 5042,
  apiBaseUrl: "https://api.radardex.pro",
  zeroAddress: "0x0000000000000000000000000000000000000000",
  usdc: "0x3600000000000000000000000000000000000000",
  feeTiers: [100, 500, 3000, 10000],
  quoters: {
    v3: "0x7dfd4f31be6814d2906bde155c3e1b146eac1468",
    v4: "0x8dc178efb8111bb0973dd9d722ebeff267c98f94",
    synthra: "0x9c179A7335B3fc841F59Aa6a62daf6d5c61b65D7",
  },
  routers: {
    v3: "0x53bf6b0684ec7ef91e1387da3d1a1769bc5a6f77",
    v3Fee: "0x2804d131cfB046f987E7e532Bc58CFC30326B350",
    v3MultihopFee: "0x062f467B6D4d461Afb512358f5a64D6bf588cEEd",
    v2Fee: "0xf3B8Af3Bb40FE367784169E2E0E5e64F1552c6D7",
    v4: "0x4fca4a51ab4f23a7447b3284fbd7d73289a89fb1",
    v4Fee: "0xfea2A3BEa7eCB406031EA6679d8f58e9db4eDaee",
    v4NativeFee: "0x786c4c8fE7ae4a882F1B3525781d07296701BF49",
    v4MultihopFee: "0x817a8d5B2e57a95b9dbd218D94DC98Ba702a8d1f",
    synthra: "0xa50eDe66a573eE5bB37E28AF5789B76aE5FEb828",
  },
  v2Routers: {
    dyor: "0x33c2bfa0684342B210B62Ca7E92ABE3feCB0BFa3",
    warp: "0x9D93c1B22E3fa6C817835513E76082089E98A9D7",
  },
  provenance: {
    v3: "verified_onchain",
    v3Multihop: "live_site",
    v2: "verified_onchain",
    v4: "live_site",
    synthra: "live_site",
  },
} as const;

export const RADARDEX_ABIS = {
  fee: parseAbi(["function feeBps() view returns (uint256)"]),
  erc20: parseAbi([
    "function allowance(address owner,address spender) view returns (uint256)",
    "function approve(address spender,uint256 amount) returns (bool)",
  ]),
  v3Quoter: parseAbi([
    "function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96)) returns (uint256 amountOut,uint160 sqrtPriceX96After,uint32 initializedTicksCrossed,uint256 gasEstimate)",
    "function quoteExactInput(bytes path,uint256 amountIn) returns (uint256 amountOut,uint160[] sqrtPriceX96AfterList,uint32[] initializedTicksCrossedList,uint256 gasEstimate)",
  ]),
  v2Router: parseAbi([
    "function getAmountsOut(uint256 amountIn,address[] path) view returns (uint256[] amounts)",
  ]),
  v4Quoter: parseAbi([
    "function quoteExactInputSingle(((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) poolKey,bool zeroForOne,uint128 exactAmount,bytes hookData) params) returns (uint256 amountOut,uint256 gasEstimate)",
  ]),
  v3FeeRouter: parseAbi([
    "function swapExactInput(address router,address tokenIn,address tokenOut,uint24 poolFee,uint256 amountIn,uint256 amountOutMinimum) returns (uint256)",
  ]),
  v3MultihopRouter: parseAbi([
    "function swapExactInputPath(address router,bytes path,uint256 amountIn,uint256 amountOutMinimum) returns (uint256)",
  ]),
  v2FeeRouter: parseAbi([
    "function swapExactInputV2(address router,address tokenIn,address tokenOut,uint256 amountIn,uint256 amountOutMinimum) returns (uint256)",
  ]),
  v4FeeRouter: parseAbi([
    "function swapExactInputV4(address router,address tokenIn,address tokenOut,uint24 poolFee,int24 tickSpacing,address hooks,uint256 amountIn,uint256 amountOutMinimum) returns (uint256)",
  ]),
  v4NativeRouter: parseAbi([
    "function swapNativeForToken(address token,uint24 fee,int24 tickSpacing,address hooks,uint256 amountOutMinimum) payable returns (uint256)",
    "function swapTokenForNative(address token,uint24 fee,int24 tickSpacing,address hooks,uint256 amountIn,uint256 amountOutMinimum) returns (uint256)",
  ]),
  v4MultihopRouter: parseAbi([
    "function swapV4Multihop(address tokenIn,address hub,address tokenOut,uint256 amountIn,uint256 amountOutMinimum,(address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) key1,bool zeroForOne1,(address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) key2,bool zeroForOne2) payable returns (uint256)",
  ]),
  synthraRouter: parseAbi([
    "function exactInput((bytes path,address recipient,uint256 amountIn,uint256 amountOutMinimum) params) payable returns (uint256)",
  ]),
} as const;
