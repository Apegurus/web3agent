import { describe, it, expect } from "vitest";
import { parseEnv } from "../../src/config/env.js";

describe("runtime config parsing", () => {
	it("defaults to Base (8453) when CHAIN_ID not set", () => {
		const config = parseEnv({});
		expect(config.chainId).toBe(8453);
	});

	it("overrides chainId from CHAIN_ID env", () => {
		const config = parseEnv({ CHAIN_ID: "1" });
		expect(config.chainId).toBe(1);
	});

	it("defaults confirmWrites to true", () => {
		const config = parseEnv({});
		expect(config.confirmWrites).toBe(true);
	});

	it("parses CONFIRM_WRITES=false correctly", () => {
		const config = parseEnv({ CONFIRM_WRITES: "false" });
		expect(config.confirmWrites).toBe(false);
	});

	it("parses CONFIRM_WRITES=0 as false", () => {
		const config = parseEnv({ CONFIRM_WRITES: "0" });
		expect(config.confirmWrites).toBe(false);
	});

	it("parses CONFIRM_WRITES=no as false", () => {
		const config = parseEnv({ CONFIRM_WRITES: "no" });
		expect(config.confirmWrites).toBe(false);
	});

	it("defaults blockscoutMcpUrl", () => {
		const config = parseEnv({});
		expect(config.blockscoutMcpUrl).toBe("https://mcp.blockscout.com/mcp");
	});

	it("accepts PRIVATE_KEY", () => {
		const config = parseEnv({ PRIVATE_KEY: "0xdeadbeef" });
		expect(config.privateKey).toBe("0xdeadbeef");
	});

	it("accepts optional API keys", () => {
		const config = parseEnv({ LIFI_API_KEY: "abc123" });
		expect(config.lifiApiKey).toBe("abc123");
	});

	it("defaults wallet indices to 0", () => {
		const config = parseEnv({});
		expect(config.walletAccountIndex).toBe(0);
		expect(config.walletAddressIndex).toBe(0);
	});

	it("parses wallet indices from env", () => {
		const config = parseEnv({
			WALLET_ACCOUNT_INDEX: "2",
			WALLET_ADDRESS_INDEX: "3",
		});
		expect(config.walletAccountIndex).toBe(2);
		expect(config.walletAddressIndex).toBe(3);
	});
});
