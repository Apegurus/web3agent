import { describe, expect, it } from "vitest";
import { evmGetSupportedNetworks } from "../../src/tools/evm/handlers.js";

describe("evm_get_supported_networks", () => {
  it("includes custom chains registered outside viem", async () => {
    const result = await evmGetSupportedNetworks({});

    expect(result.isError).toBe(false);
    const payload = JSON.parse((result.content[0] as { text: string }).text);
    expect(payload.networks).toContainEqual({
      chainId: 5042,
      name: "Arc",
      nativeCurrency: "USDC",
    });
  });
});
