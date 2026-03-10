import { existsSync } from "node:fs";
import { readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:os", async () => {
  const actual = await vi.importActual<typeof import("node:os")>("node:os");
  return { ...actual, homedir: vi.fn() };
});

import { homedir } from "node:os";
import { appendAuditLog } from "../../src/wallet/audit.js";

describe("audit log", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `web3agent-audit-test-${Date.now()}`);
    vi.mocked(homedir).mockReturnValue(testDir);
  });

  afterEach(async () => {
    if (existsSync(testDir)) {
      await rm(testDir, { recursive: true });
    }
    vi.restoreAllMocks();
  });

  it("creates audit.log and appends a CONFIRMED entry", async () => {
    await appendAuditLog({
      action: "CONFIRMED",
      operationType: "lifi_bridge",
      operationId: "abc-123",
      walletAddress: "0x1234",
      description: "Bridge 1 ETH to Arbitrum",
    });

    const logPath = join(testDir, ".web3agent", "audit.log");
    expect(existsSync(logPath)).toBe(true);

    const content = await readFile(logPath, "utf-8");
    expect(content).toContain("CONFIRMED");
    expect(content).toContain("lifi_bridge");
    expect(content).toContain("0x1234");
    expect(content).toContain("id=abc-123");
  });

  it("appends multiple entries without overwriting", async () => {
    await appendAuditLog({
      action: "CONFIRMED",
      operationType: "lifi_bridge",
      operationId: "id-1",
      description: "first op",
    });

    await appendAuditLog({
      action: "DENIED",
      operationType: "orbs_swap",
      operationId: "id-2",
      walletAddress: "0xabcd",
      description: "second op",
    });

    const content = await readFile(join(testDir, ".web3agent", "audit.log"), "utf-8");
    const lines = content.trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("CONFIRMED");
    expect(lines[1]).toContain("DENIED");
  });

  it("records EXPIRED action with wallet unknown when no address", async () => {
    await appendAuditLog({
      action: "EXPIRED",
      operationType: "wallet_send",
      operationId: "id-3",
      description: "send 0.5 ETH",
    });

    const content = await readFile(join(testDir, ".web3agent", "audit.log"), "utf-8");
    expect(content).toContain("EXPIRED");
    expect(content).toContain("unknown");
    expect(content).toContain("id=id-3");
  });
});
