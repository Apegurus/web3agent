import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import { mkdir, rm, stat, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";

const TEST_HOME = join(process.cwd(), "tests/tmp/home-wallet");
const VALID_PRIVATE_KEY =
	"0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

describe("wallet persistence", () => {
	let origHome: string | undefined;
	let origPrivateKey: string | undefined;
	let origMnemonic: string | undefined;

	beforeEach(async () => {
		origHome = process.env.HOME;
		origPrivateKey = process.env.PRIVATE_KEY;
		origMnemonic = process.env.MNEMONIC;

		delete process.env.PRIVATE_KEY;
		delete process.env.MNEMONIC;
		process.env.HOME = TEST_HOME;

		await rm(TEST_HOME, { recursive: true, force: true });
		await mkdir(join(TEST_HOME, ".web3agent"), { recursive: true });
	});

	afterEach(async () => {
		process.env.HOME = origHome;
		if (origPrivateKey !== undefined) process.env.PRIVATE_KEY = origPrivateKey;
		else delete process.env.PRIVATE_KEY;
		if (origMnemonic !== undefined) process.env.MNEMONIC = origMnemonic;
		else delete process.env.MNEMONIC;

		await rm(TEST_HOME, { recursive: true, force: true });
	});

	it("creates wallet file with 0o600 permissions", async () => {
		const { activateWallet } = await import(
			"../../src/wallet/persistence.js"
		);
		const state = await activateWallet({ privateKey: VALID_PRIVATE_KEY });
		expect(state.mode).toBe("private-key");

		const walletPath = join(TEST_HOME, ".web3agent", "wallet.json");
		expect(existsSync(walletPath)).toBe(true);

		const stats = await stat(walletPath);
		expect(stats.mode & 0o777).toBe(0o600);
	});

	it("persists private key wallet as JSON", async () => {
		const { activateWallet } = await import(
			"../../src/wallet/persistence.js"
		);
		await activateWallet({ privateKey: VALID_PRIVATE_KEY });

		const walletPath = join(TEST_HOME, ".web3agent", "wallet.json");
		const raw = await readFile(walletPath, "utf-8");
		const data = JSON.parse(raw);
		expect(data.type).toBe("private-key");
		expect(data.privateKey).toBe(VALID_PRIVATE_KEY);
		expect(data.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
	});

	it("deactivate removes wallet file and reverts to read-only", async () => {
		const { activateWallet, deactivateWallet, getWalletState } =
			await import("../../src/wallet/persistence.js");
		await activateWallet({ privateKey: VALID_PRIVATE_KEY });
		await deactivateWallet();

		const walletPath = join(TEST_HOME, ".web3agent", "wallet.json");
		expect(existsSync(walletPath)).toBe(false);
		expect(getWalletState().mode).toBe("read-only");
	});

	it("startup resolves PRIVATE_KEY env first", async () => {
		process.env.PRIVATE_KEY = VALID_PRIVATE_KEY;
		const { initializeWallet, getWalletState } = await import(
			"../../src/wallet/persistence.js"
		);
		await initializeWallet({
			chainId: 1,
			accountIndex: 0,
			addressIndex: 0,
		});

		const state = getWalletState();
		expect(state.mode).toBe("private-key");
		expect(state.address).toMatch(/^0x/);
	});

	it("startup falls through to read-only when nothing configured", async () => {
		const { initializeWallet, getWalletState } = await import(
			"../../src/wallet/persistence.js"
		);
		await initializeWallet({
			chainId: 42161,
			accountIndex: 0,
			addressIndex: 0,
		});

		const state = getWalletState();
		expect(state.mode).toBe("read-only");
		expect(state.chainId).toBe(42161);
		expect(state.address).toMatch(/^0x/);
	});
});
