import { describe, it, expect, beforeEach } from "vitest";
import { ConfirmationQueueManager } from "../../src/wallet/confirmation.js";

describe("confirmation queue", () => {
	let queue: ConfirmationQueueManager;

	beforeEach(() => {
		queue = new ConfirmationQueueManager(true);
	});

	it("enqueues operations and returns ID", () => {
		const result = queue.enqueue("swap", "Swap 1 ETH for USDC", {
			amount: "1",
		});
		expect(result.queued).toBe(true);
		expect(result.id).toBeTruthy();
		expect(result.summary).toContain("swap");
	});

	it("confirms operation and returns params", () => {
		const { id } = queue.enqueue("swap", "Swap 1 ETH", { amount: "1" });
		const confirmed = queue.confirm(id!);
		expect(confirmed).not.toBeNull();
		expect(confirmed?.operation.params.amount).toBe("1");
		expect(confirmed?.stale).toBe(false);
	});

	it("deny removes operation without executing", () => {
		const { id } = queue.enqueue("swap", "Swap", { amount: "1" });
		expect(queue.deny(id!)).toBe(true);
		expect(queue.confirm(id!)).toBeNull();
	});

	it("disabled queue bypasses enqueue", () => {
		const disabledQueue = new ConfirmationQueueManager(false);
		const result = disabledQueue.enqueue("swap", "Swap", { amount: "1" });
		expect(result.queued).toBe(false);
		expect(result.id).toBeNull();
		expect(result.summary).toContain("bypassed");
	});

	it("stale operations warn but still execute", () => {
		const { id } = queue.enqueue("swap", "Swap", { amount: "1" });
		const op = queue.list()[0];
		(op as { createdAt: Date }).createdAt = new Date(
			Date.now() - 31 * 60 * 1000,
		);
		const confirmed = queue.confirm(id!);
		expect(confirmed?.stale).toBe(true);
		expect(confirmed?.operation.params.amount).toBe("1");
	});

	it("list returns all pending operations", () => {
		queue.enqueue("swap", "Swap A", {});
		queue.enqueue("bridge", "Bridge B", {});
		expect(queue.list()).toHaveLength(2);
	});

	it("pruneExpired removes stale operations", () => {
		queue.enqueue("swap", "Swap", {});
		const ops = queue.list();
		(ops[0] as { createdAt: Date }).createdAt = new Date(
			Date.now() - 31 * 60 * 1000,
		);
		queue.pruneExpired();
		expect(queue.list()).toHaveLength(0);
	});

	it("confirm returns null for unknown ID", () => {
		expect(queue.confirm("nonexistent")).toBeNull();
	});

	it("deny returns false for unknown ID", () => {
		expect(queue.deny("nonexistent")).toBe(false);
	});
});
