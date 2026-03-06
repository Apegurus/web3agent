import { describe, it, expect } from "vitest";
import {
	getChainById,
	getChainByName,
	getAllChains,
	isSupported,
	SUPPORTED_CHAIN_IDS,
} from "../../src/chains/registry.js";

describe("chain registry", () => {
	it("has exactly 17 supported chains", () => {
		expect(getAllChains()).toHaveLength(17);
		expect(SUPPORTED_CHAIN_IDS).toHaveLength(17);
	});

	it("looks up chain by ID", () => {
		const chain = getChainById(8453);
		expect(chain).toBeDefined();
		expect(chain?.id).toBe(8453);
	});

	it("returns undefined for unsupported chain ID", () => {
		expect(getChainById(9999999)).toBeUndefined();
	});

	it("looks up chain by name case-insensitively", () => {
		const chain = getChainByName("base");
		expect(chain).toBeDefined();
		expect(chain?.id).toBe(8453);
	});

	it("isSupported returns true for all 17 chains", () => {
		for (const id of SUPPORTED_CHAIN_IDS) {
			expect(isSupported(id)).toBe(true);
		}
	});

	it("isSupported returns false for unsupported chains", () => {
		expect(isSupported(9999999)).toBe(false);
	});
});
