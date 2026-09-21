import { defineChain } from "viem";

export const arc = defineChain({
  id: 5042,
  name: "Arc",
  nativeCurrency: {
    name: "USDC",
    symbol: "USDC",
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ["https://rpc.arc-scan.org"],
    },
  },
});
