import { type EvmChain, WalletClientBase, getTools } from "@goat-sdk/core";
import { zeroEx } from "@goat-sdk/plugin-0x";
import { describe, expect, it } from "vitest";
import {
  ZEROEX_GOAT_TOOL_NAMES,
  type ZeroExGoatCapabilitySnapshot,
  evaluateZeroExGoatCapability,
  getInstalledZeroExGoatCapability,
} from "../../src/zerox/capability.js";

const mainnetChain = {
  type: "evm",
  id: 1,
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
} satisfies EvmChain;

const robinhoodChain = {
  ...mainnetChain,
  id: 4663,
} satisfies EvmChain;

class CapabilityWallet extends WalletClientBase {
  getAddress(): string {
    return "0x1111111111111111111111111111111111111111";
  }

  getChain(): EvmChain {
    return mainnetChain;
  }

  async signMessage(): Promise<{ signature: string }> {
    return { signature: "0x" };
  }

  async balanceOf(): Promise<{
    decimals: number;
    symbol: string;
    name: string;
    value: string;
    inBaseUnits: string;
  }> {
    return {
      decimals: 18,
      symbol: "ETH",
      name: "Ether",
      value: "0",
      inBaseUnits: "0",
    };
  }
}

function createConformantSnapshot(): ZeroExGoatCapabilitySnapshot {
  return {
    ...getInstalledZeroExGoatCapability(),
    toolNames: [...ZEROEX_GOAT_TOOL_NAMES],
    supportsRobinhoodChain: true,
  };
}

describe("0x GOAT capability gate", () => {
  it("selects the native adapter when the installed 0.1.11 plugin rejects Robinhood", async () => {
    // Given: the concrete, locked GOAT plugin and a canonical EVM wallet fake
    const installed = getInstalledZeroExGoatCapability();
    const plugin = zeroEx({ apiKey: "capability-test" });
    const tools = await getTools({ wallet: new CapabilityWallet(), plugins: [plugin] });

    // When: the installed snapshot is evaluated against the required v2 contract
    const decision = evaluateZeroExGoatCapability({
      ...installed,
      toolNames: tools.map((tool) => tool.name),
      supportsRobinhoodChain: plugin.supportsChain(robinhoodChain),
    });

    // Then: exact upstream tool names are present but chain 4663 routes natively
    expect(tools.map((tool) => tool.name)).toEqual(
      expect.arrayContaining([...ZEROEX_GOAT_TOOL_NAMES])
    );
    expect(decision).toEqual({
      id: "zeroex-goat-v2-admission-v1",
      adapterSource: "native",
      reason: "goat-chain-4663-unavailable",
    });
  });

  it("selects GOAT only when every version, tool, chain, response, allowance, and error assertion passes", () => {
    // Given: a fully conformant future GOAT snapshot
    const snapshot = createConformantSnapshot();

    // When: the gate evaluates it
    const decision = evaluateZeroExGoatCapability(snapshot);

    // Then: GOAT is the sole selected adapter
    expect(decision).toEqual({
      id: "zeroex-goat-v2-admission-v1",
      adapterSource: "goat",
      reason: "goat-capability-verified",
    });
  });

  it("fails closed to native for stale snapshots and malformed allowance contracts", () => {
    // Given: stale and malformed plugin snapshots
    const conformant = createConformantSnapshot();
    const stale = evaluateZeroExGoatCapability({
      ...conformant,
      pluginVersion: "0.1.10",
    });
    const malformed = evaluateZeroExGoatCapability({
      ...conformant,
      allowance: { ...conformant.allowance, amount: "not-an-integer" },
    });

    // When: each gate is evaluated
    const installed = getInstalledZeroExGoatCapability();

    // Then: neither snapshot can select the GOAT adapter, and the locked package is detected
    expect(stale).toEqual({
      id: "zeroex-goat-v2-admission-v1",
      adapterSource: "native",
      reason: "goat-snapshot-version-mismatch",
    });
    expect(malformed).toEqual({
      id: "zeroex-goat-v2-admission-v1",
      adapterSource: "native",
      reason: "goat-v2-contract-invalid",
    });
    expect(installed.pluginVersion).toBe("0.1.11");
  });
});
