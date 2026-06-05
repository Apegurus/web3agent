import { beforeEach, describe, expect, it, vi } from "vitest";

const viemAccountMocks = vi.hoisted(() => ({
  generatePrivateKey: vi.fn(),
  privateKeyToAccount: vi.fn(),
  generateMnemonic: vi.fn(),
  mnemonicToAccount: vi.fn(),
  english: {},
}));

const configMocks = vi.hoisted(() => ({
  getConfig: vi.fn().mockReturnValue({ chainId: 1 }),
  tryGetConfig: vi.fn().mockReturnValue({ chainId: 1 }),
}));

const persistenceMocks = vi.hoisted(() => ({
  activateWallet: vi.fn(),
  deactivateWallet: vi.fn(),
  deletePersistedWallet: vi.fn(),
  getWalletState: vi.fn(),
  getActiveAccount: vi.fn(),
  hasPersistedWalletKey: vi.fn().mockReturnValue(false),
}));

const backendSelectorMocks = vi.hoisted(() => ({
  getWalletBackend: vi.fn(),
}));

const confirmationQueueMock = vi.hoisted(() => ({
  enabled: true,
  enqueue: vi.fn(),
  confirm: vi.fn(),
  complete: vi.fn(),
  releaseExecuting: vi.fn(),
  fail: vi.fn(),
  expire: vi.fn(),
  deny: vi.fn(),
  list: vi.fn(),
  pruneExpired: vi.fn(),
  registerExecutor: vi.fn(),
}));

const balanceCacheMocks = vi.hoisted(() => ({
  getCachedBalanceUsd: vi.fn(),
  refreshBalanceUsd: vi.fn(),
}));

const policyConfigMocks = vi.hoisted(() => ({
  resolvePolicy: vi.fn(),
}));

const policyEngineMocks = vi.hoisted(() => ({
  evaluatePolicy: vi.fn(),
}));

const extractUsdMocks = vi.hoisted(() => ({
  extractEstimatedUsd: vi.fn(),
}));

const spendTrackerMocks = vi.hoisted(() => ({
  commitReservation: vi.fn(),
  recordSpend: vi.fn(),
  releaseReservation: vi.fn(),
  reserveSpend: vi.fn(),
}));

const agentVisibleSecretsMocks = vi.hoisted(() => ({
  isAgentVisibleSecretsEnabled: vi.fn().mockReturnValue(true),
  getAgentVisibleSecretsDisabledMessage: vi
    .fn()
    .mockReturnValue(
      "Exposing wallet secrets to an AI agent's inference context is disabled by default. Set WEB3AGENT_ALLOW_AGENT_VISIBLE_SECRETS=1 to allow secrets to be returned in API responses visible to the agent."
    ),
}));

function mockPendingOperation(
  operation: Record<string, unknown>,
  options?: { confirmable?: boolean }
) {
  confirmationQueueMock.list.mockReturnValueOnce([operation]);
  if (options?.confirmable === false) return;
  confirmationQueueMock.confirm.mockReturnValueOnce({
    stale: false,
    operation,
  });
}

vi.mock("viem/accounts", () => ({
  english: viemAccountMocks.english,
  generatePrivateKey: (...args: unknown[]) => viemAccountMocks.generatePrivateKey(...args),
  privateKeyToAccount: (...args: unknown[]) => viemAccountMocks.privateKeyToAccount(...args),
  generateMnemonic: (...args: unknown[]) => viemAccountMocks.generateMnemonic(...args),
  mnemonicToAccount: (...args: unknown[]) => viemAccountMocks.mnemonicToAccount(...args),
}));

vi.mock("../../src/wallet/persistence.js", () => persistenceMocks);

vi.mock("../../src/wallet/backend-selector.js", () => backendSelectorMocks);

vi.mock("../../src/wallet/confirmation.js", () => ({
  confirmationQueue: confirmationQueueMock,
  registerExecutor: (...args: unknown[]) => confirmationQueueMock.registerExecutor(...args),
}));

vi.mock("../../src/tools/utility/index.js", () => ({
  listSupportedChains: vi.fn(),
  serverStatus: vi.fn(),
}));

vi.mock("../../src/config/env.js", () => ({
  getConfig: (...args: unknown[]) => configMocks.getConfig(...args),
  tryGetConfig: (...args: unknown[]) => configMocks.tryGetConfig(...args),
}));

vi.mock("../../src/policy/balance-cache.js", () => ({
  getCachedBalanceUsd: (...args: unknown[]) => balanceCacheMocks.getCachedBalanceUsd(...args),
  refreshBalanceUsd: (...args: unknown[]) => balanceCacheMocks.refreshBalanceUsd(...args),
}));

vi.mock("../../src/policy/config.js", () => ({
  resolvePolicy: (...args: unknown[]) => policyConfigMocks.resolvePolicy(...args),
}));

vi.mock("../../src/policy/engine.js", () => ({
  evaluatePolicy: (...args: unknown[]) => policyEngineMocks.evaluatePolicy(...args),
}));

vi.mock("../../src/policy/extract-usd.js", () => ({
  extractEstimatedUsd: (...args: unknown[]) => extractUsdMocks.extractEstimatedUsd(...args),
}));

vi.mock("../../src/policy/spend-tracker.js", () => ({
  commitReservation: (...args: unknown[]) => spendTrackerMocks.commitReservation(...args),
  recordSpend: (...args: unknown[]) => spendTrackerMocks.recordSpend(...args),
  releaseReservation: (...args: unknown[]) => spendTrackerMocks.releaseReservation(...args),
  reserveSpend: (...args: unknown[]) => spendTrackerMocks.reserveSpend(...args),
}));

vi.mock("../../src/wallet/agent-visible-secrets.js", () => ({
  isAgentVisibleSecretsEnabled: (...args: unknown[]) =>
    agentVisibleSecretsMocks.isAgentVisibleSecretsEnabled(...args),
  getAgentVisibleSecretsDisabledMessage: (...args: unknown[]) =>
    agentVisibleSecretsMocks.getAgentVisibleSecretsDisabledMessage(...args),
}));

describe("wallet tool handlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    persistenceMocks.activateWallet.mockReset();
    persistenceMocks.deactivateWallet.mockReset();
    persistenceMocks.deletePersistedWallet.mockReset();
    persistenceMocks.getWalletState.mockReset();
    persistenceMocks.getActiveAccount.mockReset();
    persistenceMocks.hasPersistedWalletKey.mockReset();
    confirmationQueueMock.enqueue.mockReset();
    confirmationQueueMock.confirm.mockReset();
    confirmationQueueMock.complete.mockReset();
    confirmationQueueMock.releaseExecuting.mockReset();
    confirmationQueueMock.fail.mockReset();
    confirmationQueueMock.expire.mockReset();
    confirmationQueueMock.deny.mockReset();
    confirmationQueueMock.list.mockReset();
    confirmationQueueMock.pruneExpired.mockReset();
    agentVisibleSecretsMocks.isAgentVisibleSecretsEnabled.mockReturnValue(true);
    confirmationQueueMock.enabled = true;
    confirmationQueueMock.enqueue.mockReturnValue({
      queued: true,
      id: "pending-op-id",
      summary: "Queued [wallet_set_confirmation]: Disable write confirmation",
    });
    confirmationQueueMock.confirm.mockReturnValue(null);
    confirmationQueueMock.list.mockReturnValue([]);
    confirmationQueueMock.deny.mockReturnValue(false);
    persistenceMocks.getWalletState.mockReturnValue({
      mode: "private-key",
      chainId: 8453,
      address: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    });
    persistenceMocks.getActiveAccount.mockReturnValue({
      address: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
    });
    persistenceMocks.hasPersistedWalletKey.mockReturnValue(false);
    backendSelectorMocks.getWalletBackend.mockReturnValue({
      info: {
        type: "legacy",
        reason: "OWS wallet backend unavailable; using legacy persistence fallback",
      },
    });
    balanceCacheMocks.getCachedBalanceUsd.mockReturnValue(null);
    balanceCacheMocks.refreshBalanceUsd.mockResolvedValue(1000);
    policyConfigMocks.resolvePolicy.mockReturnValue({});
    policyEngineMocks.evaluatePolicy.mockReturnValue({ action: "allow" });
    extractUsdMocks.extractEstimatedUsd.mockResolvedValue(10);
    spendTrackerMocks.reserveSpend.mockReturnValue(123);
  });

  it("walletGenerate returns address, privateKey, and warning", async () => {
    viemAccountMocks.generatePrivateKey.mockReturnValue(
      "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    );
    viemAccountMocks.privateKeyToAccount.mockReturnValue({
      address: "0x1111111111111111111111111111111111111111",
    });

    const { walletGenerate } = await import("../../src/tools/wallet/index.js");
    const result = await walletGenerate();

    expect(result.isError).toBe(false);
    const payload = JSON.parse((result.content[0] as { text: string }).text);
    expect(payload.address).toBe("0x1111111111111111111111111111111111111111");
    expect(payload.privateKey).toBe(
      "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    );
    expect(payload.warning).toContain("Private key returned once");
  });

  it("walletGenerateMnemonic returns mnemonic, firstAddress, and warning", async () => {
    viemAccountMocks.generateMnemonic.mockReturnValue(
      "test test test test test test test test test test test junk"
    );
    viemAccountMocks.mnemonicToAccount.mockReturnValue({
      address: "0x2222222222222222222222222222222222222222",
    });

    const { walletGenerateMnemonic } = await import("../../src/tools/wallet/index.js");
    const result = await walletGenerateMnemonic();

    expect(result.isError).toBe(false);
    const payload = JSON.parse((result.content[0] as { text: string }).text);
    expect(payload.mnemonic).toBe("test test test test test test test test test test test junk");
    expect(payload.firstAddress).toBe("0x2222222222222222222222222222222222222222");
    expect(payload.warning).toContain("Mnemonic returned once");
  });

  it("walletFromMnemonic returns derived address and path for valid mnemonic", async () => {
    viemAccountMocks.mnemonicToAccount.mockReturnValue({
      address: "0x3333333333333333333333333333333333333333",
    });

    const { walletFromMnemonic } = await import("../../src/tools/wallet/index.js");
    const result = await walletFromMnemonic({
      mnemonic: "test test test test test test test test test test test junk",
      accountIndex: 1,
      addressIndex: 2,
    });

    expect(result.isError).toBe(false);
    const payload = JSON.parse((result.content[0] as { text: string }).text);
    expect(payload.address).toBe("0x3333333333333333333333333333333333333333");
    expect(payload.derivationPath).toBe("m/44'/60'/1'/0/2");
  });

  it("walletFromMnemonic returns error for invalid mnemonic", async () => {
    viemAccountMocks.mnemonicToAccount.mockImplementation(() => {
      throw new Error("Invalid mnemonic");
    });

    const { walletFromMnemonic } = await import("../../src/tools/wallet/index.js");
    const result = await walletFromMnemonic({ mnemonic: "invalid words" });

    expect(result.isError).toBe(true);
    const payload = JSON.parse((result.content[0] as { text: string }).text);
    expect(payload.error).toBe("MNEMONIC_RESOLVE_FAILED");
  });

  it("walletGetActive returns address, chainId, and mode", async () => {
    persistenceMocks.getWalletState.mockReturnValue({
      mode: "private-key",
      chainId: 1,
      address: "0x4444444444444444444444444444444444444444",
    });

    const { walletGetActive } = await import("../../src/tools/wallet/index.js");
    const result = await walletGetActive();

    expect(result.isError).toBe(false);
    const payload = JSON.parse((result.content[0] as { text: string }).text);
    expect(payload).toEqual({
      address: "0x4444444444444444444444444444444444444444",
      chainId: 1,
      mode: "private-key",
    });
  });

  it("walletInfo reports OWS backend metadata and wallet state without secrets", async () => {
    const originalPassphrase = process.env.OWS_PASSPHRASE;
    process.env.OWS_PASSPHRASE = "owner-passphrase";
    backendSelectorMocks.getWalletBackend.mockReturnValue({
      info: {
        type: "ows",
        reason: "OWS wallet backend available with encrypted vault support",
        vaultPath: "~/.web3agent/ows/",
      },
    });
    persistenceMocks.getWalletState.mockReturnValue({
      mode: "mnemonic",
      chainId: 1,
      address: "0xBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB",
      accountIndex: 2,
      addressIndex: 5,
    });

    try {
      const { walletInfo } = await import("../../src/tools/wallet/index.js");
      const result = await walletInfo();

      expect(result.isError).toBe(false);
      const payload = JSON.parse((result.content[0] as { text: string }).text);
      expect(payload).toEqual({
        backend: "ows",
        backendReason: "OWS wallet backend available with encrypted vault support",
        vaultPath: "~/.web3agent/ows/",
        supportedChains: ["evm"],
        securityPosture: "encrypted-at-rest",
        passphraseConfigured: true,
        state: {
          mode: "mnemonic",
          address: "0xBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB",
          chainId: 1,
          accountIndex: 2,
          addressIndex: 5,
        },
      });
      const responseText = JSON.stringify(payload);
      expect(responseText).not.toContain("privateKey");
      expect(responseText).not.toContain("mnemonic phrase");
      expect(responseText).not.toContain("owner-passphrase");
    } finally {
      if (originalPassphrase === undefined) {
        // biome-ignore lint/performance/noDelete: process.env requires delete to truly unset; assignment sets string "undefined"
        delete process.env.OWS_PASSPHRASE;
      } else {
        process.env.OWS_PASSPHRASE = originalPassphrase;
      }
    }
  });

  it("walletInfo reports the effective OWS vault path from the selected backend", async () => {
    backendSelectorMocks.getWalletBackend.mockReturnValue({
      info: {
        type: "ows",
        reason: "OWS wallet backend available with encrypted vault support",
        vaultPath: "/tmp/web3agent-custom-ows-vault",
      },
    });
    persistenceMocks.getWalletState.mockReturnValue({
      mode: "read-only",
      address: "0x1111111111111111111111111111111111111111",
      chainId: 8453,
      accountIndex: 0,
      addressIndex: 0,
    });

    const { walletInfo } = await import("../../src/tools/wallet/index.js");
    const result = await walletInfo();

    expect(result.isError).toBe(false);
    const payload = JSON.parse((result.content[0] as { text: string }).text);
    expect(payload.vaultPath).toBe("/tmp/web3agent-custom-ows-vault");
    expect(payload.state).toMatchObject({
      mode: "read-only",
      address: "0x1111111111111111111111111111111111111111",
    });
  });

  it("walletInfo reports legacy backend metadata with null vault path", async () => {
    const originalPassphrase = process.env.OWS_PASSPHRASE;
    // biome-ignore lint/performance/noDelete: process.env requires delete to truly unset; assignment sets string "undefined"
    delete process.env.OWS_PASSPHRASE;
    persistenceMocks.getWalletState.mockReturnValue({
      mode: "read-only",
      chainId: 8453,
      accountIndex: 0,
      addressIndex: 0,
    });

    try {
      const { walletInfo } = await import("../../src/tools/wallet/index.js");
      const result = await walletInfo();

      expect(result.isError).toBe(false);
      const payload = JSON.parse((result.content[0] as { text: string }).text);
      expect(payload).toEqual({
        backend: "legacy",
        backendReason: "OWS wallet backend unavailable; using legacy persistence fallback",
        vaultPath: null,
        supportedChains: ["evm"],
        securityPosture: "legacy-wallet-json",
        passphraseConfigured: false,
        state: {
          mode: "read-only",
          address: null,
          chainId: 8453,
          accountIndex: 0,
          addressIndex: 0,
        },
      });
    } finally {
      if (originalPassphrase !== undefined) {
        process.env.OWS_PASSPHRASE = originalPassphrase;
      }
    }
  });

  it("walletInfo reports passphraseConfigured false for whitespace OWS passphrase", async () => {
    const originalPassphrase = process.env.OWS_PASSPHRASE;
    process.env.OWS_PASSPHRASE = "   ";

    try {
      const { walletInfo } = await import("../../src/tools/wallet/index.js");
      const result = await walletInfo();

      expect(result.isError).toBe(false);
      const payload = JSON.parse((result.content[0] as { text: string }).text);
      expect(payload.passphraseConfigured).toBe(false);
    } finally {
      if (originalPassphrase === undefined) {
        // biome-ignore lint/performance/noDelete: process.env requires delete to truly unset; assignment sets string "undefined"
        delete process.env.OWS_PASSPHRASE;
      } else {
        process.env.OWS_PASSPHRASE = originalPassphrase;
      }
    }
  });

  it("walletInfo reports passphraseConfigured from runtime config when set", async () => {
    Reflect.deleteProperty(process.env, "OWS_PASSPHRASE");
    configMocks.getConfig.mockReturnValue({ chainId: 1, owsPassphrase: "from-config" });
    const { walletInfo } = await import("../../src/tools/wallet/index.js");
    const result = await walletInfo();
    const payload = JSON.parse((result.content[0] as { text: string }).text);
    expect(payload.passphraseConfigured).toBe(true);
  });

  it("walletInfo falls back to process.env for the CLI/MCP server path", async () => {
    process.env.OWS_PASSPHRASE = "from-env";
    configMocks.getConfig.mockReturnValue({ chainId: 1, owsPassphrase: undefined });
    const { walletInfo } = await import("../../src/tools/wallet/index.js");
    const result = await walletInfo();
    const payload = JSON.parse((result.content[0] as { text: string }).text);
    expect(payload.passphraseConfigured).toBe(true);
    Reflect.deleteProperty(process.env, "OWS_PASSPHRASE");
  });

  it("walletInfo returns WALLET_INFO_FAILED when backend metadata cannot be read", async () => {
    backendSelectorMocks.getWalletBackend.mockImplementation(() => {
      throw new Error("backend selection failed");
    });

    const { walletInfo } = await import("../../src/tools/wallet/index.js");
    const result = await walletInfo();

    expect(result.isError).toBe(true);
    const payload = JSON.parse((result.content[0] as { text: string }).text);
    expect(payload.error).toBe("WALLET_INFO_FAILED");
    expect(payload.message).toBe("backend selection failed");
  });

  it("registers wallet_info as a read-only wallet tool", async () => {
    const { getWalletToolDefinitions } = await import("../../src/tools/register.js");

    const definition = getWalletToolDefinitions().find((tool) => tool.name === "wallet_info");

    expect(definition).toBeDefined();
    expect(definition?.category).toBe("wallet");
    expect(definition?.annotations).toEqual({ readOnlyHint: true });
    expect(definition?.riskLevel).toBeUndefined();
  });

  it("walletActivate returns pending_confirmation when confirmation is enabled", async () => {
    confirmationQueueMock.enabled = true;

    const { walletActivate } = await import("../../src/tools/wallet/index.js");
    const result = await walletActivate({
      privateKey: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    });

    expect(result.isError).toBe(false);
    expect(confirmationQueueMock.enqueue).toHaveBeenCalledTimes(1);
    expect(persistenceMocks.activateWallet).not.toHaveBeenCalled();
    const payload = JSON.parse((result.content[0] as { text: string }).text);
    expect(payload.status).toBe("pending_confirmation");
    expect(payload.id).toBe("pending-op-id");
  });

  it("walletActivate works from read-only mode (first activation)", async () => {
    persistenceMocks.getWalletState.mockReturnValue({
      mode: "read-only",
      chainId: 8453,
      address: "0x1234567890123456789012345678901234567890",
      accountIndex: 0,
      addressIndex: 0,
    });
    confirmationQueueMock.enabled = false;
    confirmationQueueMock.enqueue.mockReturnValue({
      queued: false,
      id: null,
      summary: "Confirmation bypassed",
    });
    persistenceMocks.activateWallet.mockResolvedValue({
      address: "0x5555555555555555555555555555555555555555",
      chainId: 8453,
      mode: "private-key",
    });

    const { walletActivate } = await import("../../src/tools/wallet/index.js");
    const result = await walletActivate({
      privateKey: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    });

    expect(result.isError).toBe(false);
    const payload = JSON.parse((result.content[0] as { text: string }).text);
    expect(payload.address).toBe("0x5555555555555555555555555555555555555555");
    expect(payload.mode).toBe("private-key");
  });

  it("walletActivate enqueues with walletAddress=undefined from read-only runtime state (H1 invariant)", async () => {
    persistenceMocks.getWalletState.mockReturnValue({
      mode: "read-only",
      chainId: 8453,
      address: "0x1234567890123456789012345678901234567890",
      accountIndex: 0,
      addressIndex: 0,
    });
    confirmationQueueMock.enabled = true;
    let enqueuedWalletAddress: string | undefined = "sentinel";
    confirmationQueueMock.enqueue.mockImplementation(
      (_type, _description, _params, _executor, walletAddress) => {
        enqueuedWalletAddress = walletAddress;
        return {
          queued: true,
          id: "pending-op-id",
          summary: "Confirmation queued",
        };
      }
    );

    const { walletActivate } = await import("../../src/tools/wallet/index.js");
    const result = await walletActivate({
      privateKey: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    });

    expect(result.isError).toBe(false);
    expect(enqueuedWalletAddress).toBeUndefined();
  });

  it("walletActivate does not pass secrets in enqueue params", async () => {
    confirmationQueueMock.enabled = true;

    const { walletActivate } = await import("../../src/tools/wallet/index.js");
    await walletActivate({
      privateKey: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    });

    const enqueueParams = confirmationQueueMock.enqueue.mock.calls[0][2] as Record<string, unknown>;
    expect(enqueueParams).not.toHaveProperty("privateKey");
    expect(enqueueParams).not.toHaveProperty("mnemonic");
    expect(enqueueParams.source).toBe("private-key");
  });

  it("walletActivate activates directly when confirmation is disabled", async () => {
    confirmationQueueMock.enabled = false;
    confirmationQueueMock.enqueue.mockReturnValue({
      queued: false,
      id: null,
      summary: "Confirmation bypassed",
    });
    persistenceMocks.activateWallet.mockResolvedValue({
      address: "0x5555555555555555555555555555555555555555",
      chainId: 8453,
      mode: "private-key",
    });

    const { walletActivate } = await import("../../src/tools/wallet/index.js");
    const result = await walletActivate({
      privateKey: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    });

    expect(result.isError).toBe(false);
    expect(confirmationQueueMock.enqueue).toHaveBeenCalledTimes(1);
    expect(persistenceMocks.activateWallet).toHaveBeenCalledWith({
      privateKey: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      mnemonic: undefined,
      accountIndex: undefined,
      addressIndex: undefined,
    });
    const payload = JSON.parse((result.content[0] as { text: string }).text);
    expect(payload).toEqual({
      address: "0x5555555555555555555555555555555555555555",
      chainId: 8453,
      mode: "private-key",
    });
  });

  it("walletDeactivate is a no-op-safe idempotent operation from read-only mode with no persisted key", async () => {
    persistenceMocks.getWalletState.mockReturnValue({
      mode: "read-only",
      chainId: 8453,
      address: "0x1234567890123456789012345678901234567890",
      accountIndex: 0,
      addressIndex: 0,
    });
    persistenceMocks.deactivateWallet.mockResolvedValue(undefined);
    persistenceMocks.hasPersistedWalletKey.mockReturnValue(false);
    confirmationQueueMock.enabled = true;

    const { walletDeactivate } = await import("../../src/tools/wallet/index.js");
    const result = await walletDeactivate();

    expect(result.isError).toBe(false);
    const payload = JSON.parse((result.content[0] as { text: string }).text);
    expect(payload.mode).toBeDefined();
    expect(persistenceMocks.deactivateWallet).toHaveBeenCalledTimes(1);
    // Confirmation queue must NOT have been used — true no-op short-circuit.
    expect(confirmationQueueMock.enqueue).not.toHaveBeenCalled();
  });

  it("walletDeactivate stays session-local and skips confirmation even when persisted wallet material exists", async () => {
    persistenceMocks.getWalletState.mockReturnValue({
      mode: "read-only",
      chainId: 8453,
      address: "0x1234567890123456789012345678901234567890",
      accountIndex: 0,
      addressIndex: 0,
    });
    persistenceMocks.deactivateWallet.mockResolvedValue(undefined);
    persistenceMocks.hasPersistedWalletKey.mockReturnValue(true);
    confirmationQueueMock.enabled = true;

    const { walletDeactivate } = await import("../../src/tools/wallet/index.js");
    const result = await walletDeactivate();

    expect(result.isError).toBe(false);
    expect(confirmationQueueMock.enqueue).not.toHaveBeenCalled();
    expect(persistenceMocks.deactivateWallet).toHaveBeenCalledTimes(1);
    const payload = JSON.parse((result.content[0] as { text: string }).text);
    expect(payload.message).toContain("session");
  });

  it("walletDelete returns pending_confirmation when confirmation is enabled", async () => {
    confirmationQueueMock.enabled = true;
    confirmationQueueMock.enqueue.mockReturnValueOnce({
      queued: true,
      id: "wallet-delete-op",
      summary: "Delete persisted wallet",
    });

    const { walletDelete } = await import("../../src/tools/wallet/index.js");
    const result = await walletDelete();

    expect(result.isError).toBe(false);
    expect(persistenceMocks.deletePersistedWallet).not.toHaveBeenCalled();
    const payload = JSON.parse((result.content[0] as { text: string }).text);
    expect(payload.status).toBe("pending_confirmation");
    expect(payload.id).toBe("wallet-delete-op");
  });

  it("walletDelete deletes persisted wallet material and returns read-only state", async () => {
    confirmationQueueMock.enabled = false;
    confirmationQueueMock.enqueue.mockReturnValue({
      queued: false,
      id: null,
      summary: "Confirmation bypassed",
    });
    persistenceMocks.deletePersistedWallet.mockResolvedValue(undefined);
    persistenceMocks.getWalletState.mockReturnValueOnce({
      mode: "read-only",
      chainId: 8453,
      address: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      accountIndex: 0,
      addressIndex: 0,
    });

    const { walletDelete } = await import("../../src/tools/wallet/index.js");
    const result = await walletDelete();

    expect(result.isError).toBe(false);
    expect(persistenceMocks.deletePersistedWallet).toHaveBeenCalledTimes(1);
    const payload = JSON.parse((result.content[0] as { text: string }).text);
    expect(payload.mode).toBe("read-only");
    expect(payload.message).toContain("Permanently deleted");
  });

  it("registers wallet_delete as destructive and keeps wallet_deactivate session-local", async () => {
    const { getWalletToolDefinitions } = await import("../../src/tools/register.js");

    const deactivateDefinition = getWalletToolDefinitions().find(
      (tool) => tool.name === "wallet_deactivate"
    );
    const deleteDefinition = getWalletToolDefinitions().find(
      (tool) => tool.name === "wallet_delete"
    );

    expect(deactivateDefinition?.description).toContain("current runtime/session");
    expect(deactivateDefinition?.description).not.toContain("delete persisted key file");
    expect(deactivateDefinition?.riskLevel).toBeUndefined();
    expect(deactivateDefinition?.annotations).toEqual({ idempotentHint: true });

    expect(deleteDefinition?.description).toContain("Permanently delete persisted wallet material");
    expect(deleteDefinition?.riskLevel).toBe("destructive");
    expect(deleteDefinition?.annotations).toEqual({ destructiveHint: true });
  });

  it("walletSetConfirmation enables confirmation directly without queueing", async () => {
    confirmationQueueMock.enabled = false;

    const { walletSetConfirmation } = await import("../../src/tools/wallet/index.js");
    const result = await walletSetConfirmation({ enabled: true });

    expect(result.isError).toBe(false);
    expect(confirmationQueueMock.enabled).toBe(true);
    expect(confirmationQueueMock.enqueue).not.toHaveBeenCalled();
    const payload = JSON.parse((result.content[0] as { text: string }).text);
    expect(payload.confirmationRequired).toBe(true);
    expect(payload.message).toContain("Write confirmation enabled");
  });

  it("walletSetConfirmation returns a no-op response when confirmation is already disabled", async () => {
    confirmationQueueMock.enabled = false;

    const { walletSetConfirmation } = await import("../../src/tools/wallet/index.js");
    const result = await walletSetConfirmation({ enabled: false });

    expect(result.isError).toBe(false);
    expect(confirmationQueueMock.enabled).toBe(false);
    expect(confirmationQueueMock.enqueue).not.toHaveBeenCalled();
    const payload = JSON.parse((result.content[0] as { text: string }).text);
    expect(payload.confirmationRequired).toBe(false);
    expect(payload.message).toContain("already disabled");
  });

  it("walletSetConfirmation queues disabling confirmation when it is currently enabled", async () => {
    confirmationQueueMock.enabled = true;

    const { walletSetConfirmation } = await import("../../src/tools/wallet/index.js");
    const result = await walletSetConfirmation({ enabled: false });

    expect(result.isError).toBe(false);
    expect(confirmationQueueMock.enabled).toBe(true);
    expect(confirmationQueueMock.enqueue).toHaveBeenCalledTimes(1);
    const payload = JSON.parse((result.content[0] as { text: string }).text);
    expect(payload.status).toBe("pending_confirmation");
    expect(payload.id).toBe("pending-op-id");
  });

  it("transactionList returns empty list when there are no pending operations", async () => {
    confirmationQueueMock.list.mockReturnValue([]);

    const { transactionList } = await import("../../src/tools/wallet/index.js");
    const result = await transactionList();

    expect(result.isError).toBe(false);
    const payload = JSON.parse((result.content[0] as { text: string }).text);
    expect(payload.count).toBe(0);
    expect(payload.operations).toEqual([]);
    expect(confirmationQueueMock.pruneExpired).toHaveBeenCalled();
  });

  it("transactionDeny returns NOT_FOUND for unknown ID", async () => {
    confirmationQueueMock.deny.mockReturnValue(false);

    const { transactionDeny } = await import("../../src/tools/wallet/index.js");
    const result = await transactionDeny({ id: "unknown-id" });

    expect(result.isError).toBe(true);
    const payload = JSON.parse((result.content[0] as { text: string }).text);
    expect(payload.error).toBe("NOT_FOUND");
  });

  it("transactionConfirm releases executing state after policy deny so retries are not stranded", async () => {
    const deniedOperation = {
      id: "policy-denied-op",
      type: "wallet_activate",
      description: "Activate wallet",
      params: { chainId: 8453 },
      executor: vi.fn(),
      createdAt: new Date(),
      ttlMs: 60_000,
      riskLevel: "financial" as const,
      walletAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    };
    const retryExecutor = vi
      .fn()
      .mockResolvedValue({ isError: false, content: [{ type: "text", text: "{}" }] });
    const retryOperation = {
      id: "policy-denied-op",
      type: "wallet_activate",
      description: "Activate wallet",
      params: { chainId: 8453 },
      executor: retryExecutor,
      createdAt: new Date(),
      ttlMs: 60_000,
      riskLevel: "financial" as const,
      walletAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    };
    confirmationQueueMock.list
      .mockReturnValueOnce([deniedOperation])
      .mockReturnValueOnce([retryOperation]);
    confirmationQueueMock.confirm.mockReturnValueOnce({ stale: false, operation: retryOperation });
    policyEngineMocks.evaluatePolicy
      .mockReturnValueOnce({
        action: "deny",
        message: "Denied by policy",
        reasonCode: "LIMIT",
        currentSpend: 25,
      })
      .mockReturnValueOnce({ action: "allow" });

    const { transactionConfirm } = await import("../../src/tools/wallet/index.js");

    const denied = await transactionConfirm({ id: "policy-denied-op" });
    const deniedPayload = JSON.parse((denied.content[0] as { text: string }).text);
    expect(deniedPayload.error).toBe("POLICY_DENIED");

    const retried = await transactionConfirm({ id: "policy-denied-op" });
    const retriedPayload = JSON.parse((retried.content[0] as { text: string }).text);
    expect(retriedPayload.error).not.toBe("NOT_FOUND");
    expect(retryExecutor).toHaveBeenCalledTimes(1);
  });

  it("transactionConfirm releases executing state after wallet mismatch so retries are not stranded", async () => {
    persistenceMocks.getWalletState.mockReturnValue({
      mode: "private-key",
      chainId: 8453,
      address: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    });
    const mismatchOperation = {
      id: "wallet-mismatch-op",
      type: "wallet_activate",
      description: "Activate wallet",
      params: {},
      executor: vi.fn(),
      createdAt: new Date(),
      ttlMs: 60_000,
      riskLevel: "destructive" as const,
      walletAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    };
    const retryExecutor = vi
      .fn()
      .mockResolvedValue({ isError: false, content: [{ type: "text", text: '{"done":true}' }] });
    const retryOperation = {
      id: "wallet-mismatch-op",
      type: "wallet_activate",
      description: "Activate wallet",
      params: {},
      executor: retryExecutor,
      createdAt: new Date(),
      ttlMs: 60_000,
      riskLevel: "destructive" as const,
      walletAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    };
    confirmationQueueMock.list
      .mockReturnValueOnce([mismatchOperation])
      .mockReturnValueOnce([retryOperation]);
    confirmationQueueMock.confirm.mockReturnValueOnce({ stale: false, operation: retryOperation });

    const { transactionConfirm } = await import("../../src/tools/wallet/index.js");

    const mismatch = await transactionConfirm({ id: "wallet-mismatch-op" });
    const mismatchPayload = JSON.parse((mismatch.content[0] as { text: string }).text);
    expect(mismatchPayload.error).toBe("WALLET_MISMATCH");
    expect(confirmationQueueMock.fail).not.toHaveBeenCalledWith("wallet-mismatch-op");

    persistenceMocks.getWalletState.mockReturnValue({
      mode: "private-key",
      chainId: 8453,
      address: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    });
    const retried = await transactionConfirm({ id: "wallet-mismatch-op" });

    expect(retried.isError).toBe(false);
    expect(retryExecutor).toHaveBeenCalledTimes(1);
    expect(confirmationQueueMock.complete).toHaveBeenCalledWith("wallet-mismatch-op");
  });

  it("transactionConfirm fails queued operation when executor throws", async () => {
    mockPendingOperation({
      id: "throwing-op",
      type: "wallet_activate",
      description: "Activate wallet",
      params: {},
      executor: vi.fn().mockRejectedValue(new Error("boom")),
      createdAt: new Date(),
      ttlMs: 60_000,
      riskLevel: "destructive",
    });

    const { transactionConfirm } = await import("../../src/tools/wallet/index.js");
    const result = await transactionConfirm({ id: "throwing-op" });

    const payload = JSON.parse((result.content[0] as { text: string }).text);
    expect(payload.error).toBe("CONFIRM_FAILED");
    expect(confirmationQueueMock.fail).toHaveBeenCalledWith("throwing-op");
    expect(confirmationQueueMock.complete).not.toHaveBeenCalled();
  });

  it("transactionConfirm expires stale confirmations instead of completing them", async () => {
    confirmationQueueMock.list.mockReturnValueOnce([
      {
        id: "stale-op",
        type: "wallet_activate",
        description: "Activate wallet",
        params: {},
        executor: vi.fn(),
        createdAt: new Date(Date.now() - 61_000),
        ttlMs: 60_000,
        riskLevel: "destructive",
      },
    ]);

    const { transactionConfirm } = await import("../../src/tools/wallet/index.js");
    const result = await transactionConfirm({ id: "stale-op" });

    const payload = JSON.parse((result.content[0] as { text: string }).text);
    expect(payload.error).toBe("OPERATION_EXPIRED");
    expect(confirmationQueueMock.pruneExpired).toHaveBeenCalled();
    expect(confirmationQueueMock.expire).not.toHaveBeenCalled();
    expect(confirmationQueueMock.complete).not.toHaveBeenCalled();
  });

  it("transactionConfirm fails queued operation and releases reservation when executor returns isError", async () => {
    mockPendingOperation({
      id: "exec-error-op",
      type: "ccxt_private_write",
      description: "CCXT createOrder on account binance_main",
      params: { method: "createOrder", account: "binance_main", estimatedUsd: 50 },
      executor: vi.fn().mockResolvedValue({
        isError: true,
        content: [{ type: "text", text: '{"error":"EXCHANGE_REJECTED"}' }],
      }),
      createdAt: new Date(),
      ttlMs: 60_000,
      riskLevel: "financial",
    });

    const { transactionConfirm } = await import("../../src/tools/wallet/index.js");
    const result = await transactionConfirm({ id: "exec-error-op" });

    expect(result.isError).toBe(true);
    expect(confirmationQueueMock.fail).toHaveBeenCalledWith("exec-error-op");
    expect(confirmationQueueMock.complete).not.toHaveBeenCalled();
    expect(spendTrackerMocks.commitReservation).not.toHaveBeenCalled();
    expect(spendTrackerMocks.releaseReservation).toHaveBeenCalledWith(123);
  });

  it("transactionConfirm allows non-wallet (CCXT) ops when wallet is read-only", async () => {
    persistenceMocks.getWalletState.mockReturnValue({
      mode: "read-only",
      chainId: 8453,
      address: null,
    });

    const ccxtExecutor = vi.fn().mockResolvedValue({
      isError: false,
      content: [{ type: "text", text: '{"status":"ok"}' }],
    });

    mockPendingOperation({
      id: "ccxt-read-only-op",
      type: "ccxt_private_write",
      description: "CCXT createOrder on account binance_main",
      params: { method: "createOrder", account: "binance_main", estimatedUsd: 50 },
      executor: ccxtExecutor,
      createdAt: new Date(),
      ttlMs: 60_000,
      riskLevel: "financial",
      // walletAddress intentionally omitted — off-chain op
    });

    const { transactionConfirm } = await import("../../src/tools/wallet/index.js");
    const result = await transactionConfirm({ id: "ccxt-read-only-op" });

    expect(result.isError).toBe(false);
    expect(ccxtExecutor).toHaveBeenCalledTimes(1);
    expect(confirmationQueueMock.complete).toHaveBeenCalledWith("ccxt-read-only-op");
  });

  it("transactionConfirm still rejects wallet-backed ops when wallet is read-only", async () => {
    persistenceMocks.getWalletState.mockReturnValue({
      mode: "read-only",
      chainId: 8453,
      address: null,
    });

    confirmationQueueMock.list.mockReturnValueOnce([
      {
        id: "evm-read-only-op",
        type: "evm_write_contract",
        description: "Write on contract",
        params: { chainId: 8453 },
        executor: vi.fn(),
        createdAt: new Date(),
        ttlMs: 60_000,
        riskLevel: "destructive",
        walletAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      },
    ]);

    const { transactionConfirm } = await import("../../src/tools/wallet/index.js");
    const result = await transactionConfirm({ id: "evm-read-only-op" });

    expect(result.isError).toBe(true);
    const payload = JSON.parse((result.content[0] as { text: string }).text);
    expect(payload.error).toBe("WALLET_READ_ONLY");
    expect(confirmationQueueMock.complete).not.toHaveBeenCalled();
    expect(confirmationQueueMock.fail).not.toHaveBeenCalled();
  });

  it("transactionConfirm releases reservation when confirm() returns null (concurrent race)", async () => {
    const operation = {
      id: "race-op",
      type: "evm_write_contract",
      description: "Write on contract",
      params: { chainId: 8453 },
      executor: vi.fn(),
      createdAt: new Date(),
      ttlMs: 60_000,
      riskLevel: "financial" as const,
      walletAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    };

    // list().find() succeeds (pre-check phase), but confirm() returns null
    // (simulated concurrent race — another caller already marked it executing)
    confirmationQueueMock.list.mockReturnValueOnce([operation]);
    confirmationQueueMock.confirm.mockReturnValueOnce(null);

    extractUsdMocks.extractEstimatedUsd.mockResolvedValueOnce(100);
    spendTrackerMocks.reserveSpend.mockReturnValueOnce(999);

    const { transactionConfirm } = await import("../../src/tools/wallet/index.js");
    const result = await transactionConfirm({ id: "race-op" });

    expect(result.isError).toBe(true);
    const payload = JSON.parse((result.content[0] as { text: string }).text);
    expect(payload.error).toBe("NOT_FOUND");
    expect(spendTrackerMocks.releaseReservation).toHaveBeenCalledWith(999);
    expect(spendTrackerMocks.commitReservation).not.toHaveBeenCalled();
  });

  it("transactionConfirm releases reservation when op becomes stale at confirm time", async () => {
    const operation = {
      id: "stale-race-op",
      type: "evm_write_contract",
      description: "Write on contract",
      params: { chainId: 8453 },
      executor: vi.fn(),
      createdAt: new Date(),
      ttlMs: 60_000,
      riskLevel: "financial" as const,
      walletAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    };

    // Pre-check elapsed < ttlMs (op looks fresh when list().find() runs),
    // but by the time confirm() is called, result.stale is true (clock skew
    // or the window expired during async policy eval).
    confirmationQueueMock.list.mockReturnValueOnce([operation]);
    confirmationQueueMock.confirm.mockReturnValueOnce({ stale: true, operation });

    extractUsdMocks.extractEstimatedUsd.mockResolvedValueOnce(100);
    spendTrackerMocks.reserveSpend.mockReturnValueOnce(888);

    const { transactionConfirm } = await import("../../src/tools/wallet/index.js");
    const result = await transactionConfirm({ id: "stale-race-op" });

    expect(result.isError).toBe(true);
    const payload = JSON.parse((result.content[0] as { text: string }).text);
    expect(payload.error).toBe("OPERATION_EXPIRED");
    expect(spendTrackerMocks.releaseReservation).toHaveBeenCalledWith(888);
    expect(spendTrackerMocks.commitReservation).not.toHaveBeenCalled();
  });

  describe("agent-visible secrets gating", () => {
    beforeEach(() => {
      agentVisibleSecretsMocks.isAgentVisibleSecretsEnabled.mockReturnValue(false);
    });

    it("walletGenerate returns AGENT_VISIBLE_SECRETS_DISABLED when secrets are disabled", async () => {
      const { walletGenerate } = await import("../../src/tools/wallet/index.js");
      const result = await walletGenerate();
      expect(result.isError).toBe(true);
      const payload = JSON.parse((result.content[0] as { text: string }).text);
      expect(payload.error).toBe("AGENT_VISIBLE_SECRETS_DISABLED");
    });

    it("walletGenerateMnemonic returns AGENT_VISIBLE_SECRETS_DISABLED when secrets are disabled", async () => {
      const { walletGenerateMnemonic } = await import("../../src/tools/wallet/index.js");
      const result = await walletGenerateMnemonic();
      expect(result.isError).toBe(true);
      const payload = JSON.parse((result.content[0] as { text: string }).text);
      expect(payload.error).toBe("AGENT_VISIBLE_SECRETS_DISABLED");
    });

    it("walletFromMnemonic returns AGENT_VISIBLE_SECRETS_DISABLED when secrets are disabled", async () => {
      const { walletFromMnemonic } = await import("../../src/tools/wallet/index.js");
      const result = await walletFromMnemonic({
        mnemonic: "test test test test test test test test test test test junk",
      });
      expect(result.isError).toBe(true);
      const payload = JSON.parse((result.content[0] as { text: string }).text);
      expect(payload.error).toBe("AGENT_VISIBLE_SECRETS_DISABLED");
    });

    it("walletDeriveAddresses returns AGENT_VISIBLE_SECRETS_DISABLED when secrets are disabled", async () => {
      const { walletDeriveAddresses } = await import("../../src/tools/wallet/index.js");
      const result = await walletDeriveAddresses({
        mnemonic: "test test test test test test test test test test test junk",
        count: 3,
      });
      expect(result.isError).toBe(true);
      const payload = JSON.parse((result.content[0] as { text: string }).text);
      expect(payload.error).toBe("AGENT_VISIBLE_SECRETS_DISABLED");
    });

    it("walletActivate returns AGENT_VISIBLE_SECRETS_DISABLED when input includes privateKey", async () => {
      const { walletActivate } = await import("../../src/tools/wallet/index.js");
      const result = await walletActivate({
        privateKey: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      });
      expect(result.isError).toBe(true);
      const payload = JSON.parse((result.content[0] as { text: string }).text);
      expect(payload.error).toBe("AGENT_VISIBLE_SECRETS_DISABLED");
    });

    it("walletActivate returns AGENT_VISIBLE_SECRETS_DISABLED when input includes mnemonic", async () => {
      const { walletActivate } = await import("../../src/tools/wallet/index.js");
      const result = await walletActivate({
        mnemonic: "test test test test test test test test test test test junk",
      });
      expect(result.isError).toBe(true);
      const payload = JSON.parse((result.content[0] as { text: string }).text);
      expect(payload.error).toBe("AGENT_VISIBLE_SECRETS_DISABLED");
    });

    it("gated tools include the disabled message mentioning the env var", async () => {
      const { walletGenerate } = await import("../../src/tools/wallet/index.js");
      const result = await walletGenerate();
      expect(result.isError).toBe(true);
      const payload = JSON.parse((result.content[0] as { text: string }).text);
      expect(payload.message).toContain("WEB3AGENT_ALLOW_AGENT_VISIBLE_SECRETS");
    });

    it("walletInfo is not gated by agent-visible secrets", async () => {
      const { walletInfo } = await import("../../src/tools/wallet/index.js");
      const result = await walletInfo();
      expect(result.isError).toBe(false);
    });

    it("walletGetActive is not gated by agent-visible secrets", async () => {
      const { walletGetActive } = await import("../../src/tools/wallet/index.js");
      const result = await walletGetActive();
      expect(result.isError).toBe(false);
    });

    it("walletDeactivate is not gated by agent-visible secrets", async () => {
      persistenceMocks.getWalletState.mockReturnValue({
        mode: "read-only",
        chainId: 8453,
        address: null,
        accountIndex: 0,
        addressIndex: 0,
      });
      persistenceMocks.deactivateWallet.mockResolvedValue(undefined);
      persistenceMocks.hasPersistedWalletKey.mockReturnValue(false);

      const { walletDeactivate } = await import("../../src/tools/wallet/index.js");
      const result = await walletDeactivate();
      expect(result.isError).toBe(false);
    });
  });
});
