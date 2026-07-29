export const V4_TOOLS = [
  "uniswap_v4_get_deployment",
  "uniswap_v4_get_pool",
  "uniswap_v4_get_position",
  "uniswap_v4_get_events",
  "uniswap_v4_calculate_position",
  "uniswap_v4_simulate_operation",
  "uniswap_v4_mint_position",
  "uniswap_v4_increase_liquidity",
  "uniswap_v4_decrease_liquidity",
  "uniswap_v4_collect_fees",
  "uniswap_v4_burn_position",
];

export const V4_WRITE_TOOLS = new Set(V4_TOOLS.slice(6));
