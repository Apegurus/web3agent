import { privateKeyToAccount } from "viem/accounts";
import { beforeEach, describe, expect, it, vi } from "vitest";

const chainMocks = vi.hoisted(() => ({
  createPublicClientForRuntimeChain: vi.fn(),
  getChainForRuntime: vi.fn(),
}));

vi.mock("../../src/operations/chain-access.js", () => ({
  createPublicClientForRuntimeChain: (...args: unknown[]) =>
    chainMocks.createPublicClientForRuntimeChain(...args),
  getChainForRuntime: (...args: unknown[]) => chainMocks.getChainForRuntime(...args),
}));

vi.mock("../../src/tokens/registry.js", () => ({
  lookupTokenByAddress: vi.fn().mockReturnValue({
    symbol: "USDC",
    decimals: 6,
    name: "USD Coin",
    address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  }),
}));

// Mock getConfirmedReceipt from shared.ts so we don't need full chain setup
const sharedMocks = vi.hoisted(() => ({
  getConfirmedReceipt: vi.fn(),
}));

vi.mock("../../src/api/operations/shared.js", () => ({
  getConfirmedReceipt: (...args: unknown[]) => sharedMocks.getConfirmedReceipt(...args),
}));

import { OperationPauseError, PreparedActionGoatWallet } from "../../src/operations/goat-wallet.js";

describe("PreparedActionGoatWallet", () => {
  let mockPublicClient: {
    getBalance: ReturnType<typeof vi.fn>;
    readContract: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    chainMocks.getChainForRuntime.mockReturnValue({
      id: 8453,
      nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    });

    mockPublicClient = {
      getBalance: vi.fn(),
      readContract: vi.fn(),
    };
    chainMocks.createPublicClientForRuntimeChain.mockReturnValue(mockPublicClient);
    sharedMocks.getConfirmedReceipt.mockResolvedValue({ status: "success" });
  });

  describe("signMessage", () => {
    it("throws OperationPauseError when no matching action result", async () => {
      const wallet = new PreparedActionGoatWallet({
        account: "0x1234567890123456789012345678901234567890",
        chainId: 8453,
        actionResults: {},
      });

      await expect(wallet.signMessage("hello")).rejects.toThrow(OperationPauseError);
      try {
        await wallet.signMessage("hello");
      } catch (err) {
        expect((err as OperationPauseError).action.type).toBe("signMessage");
      }
    });

    it("returns signature when matching result exists", async () => {
      const wallet = new PreparedActionGoatWallet({
        account: "0x1234567890123456789012345678901234567890",
        chainId: 8453,
        actionResults: {
          "sign-message:0": {
            type: "messageSignature",
            signature: "0xsig",
          },
        },
      });

      const result = await wallet.signMessage("hello");
      expect(result).toEqual({ signature: "0xsig" });
    });
  });

  describe("signTypedData", () => {
    it("throws OperationPauseError when no matching action result", async () => {
      const wallet = new PreparedActionGoatWallet({
        account: "0x1234567890123456789012345678901234567890",
        chainId: 8453,
        actionResults: {},
      });

      await expect(
        wallet.signTypedData({
          domain: {},
          types: { Test: [{ name: "message", type: "string" }] },
          primaryType: "Test",
          message: { message: "pause for this exact typed payload" },
        })
      ).rejects.toThrow(OperationPauseError);
    });

    it("rejects a signature from an account other than the prepared account", async () => {
      const signingAccount = privateKeyToAccount(
        "0x59c6995e998f97a5a0044966f0945382d700f7d7d4dd2a91957f90fcb3c3d9c1"
      );
      const preparedAccount = "0x1234567890123456789012345678901234567890";
      const typedData = {
        domain: { name: "GOAT test", version: "1", chainId: 8453 },
        types: { Test: [{ name: "message", type: "string" }] },
        primaryType: "Test",
        message: { message: "sign exactly this payload" },
      };
      const signature = await signingAccount.signTypedData(typedData);
      const wallet = new PreparedActionGoatWallet({
        account: preparedAccount,
        chainId: 8453,
        actionResults: {
          "sign-typed-data:0": { type: "signature", signature },
        },
      });

      await expect(wallet.signTypedData(typedData)).rejects.toThrow("signer does not match");
    });
  });

  describe("sendTransaction", () => {
    it("returns hash when matching result exists", async () => {
      const wallet = new PreparedActionGoatWallet({
        account: "0x1234567890123456789012345678901234567890",
        chainId: 8453,
        actionResults: {
          "transaction:0": {
            type: "transaction",
            txHash: "0xabc123",
            status: "confirmed" as const,
          },
        },
      });

      const result = await wallet.sendTransaction({
        to: "0x9999999999999999999999999999999999999999",
        data: "0x",
      });
      expect(result.hash).toBe("0xabc123");
    });

    it("verifies the exact nonempty calldata and native value that GOAT prepared", async () => {
      const wallet = new PreparedActionGoatWallet({
        account: "0x1234567890123456789012345678901234567890",
        chainId: 8453,
        actionResults: {
          "transaction:0": {
            type: "transaction",
            txHash: "0xabc123",
            status: "confirmed" as const,
          },
        },
      });

      await wallet.sendTransaction({
        to: "0x9999999999999999999999999999999999999999",
        data: "0xdeadbeef",
        value: 42n,
      });

      expect(sharedMocks.getConfirmedReceipt).toHaveBeenCalledWith(
        expect.objectContaining({
          tx: expect.objectContaining({
            chainId: 8453,
            data: "0xdeadbeef",
            to: "0x9999999999999999999999999999999999999999",
            value: "42",
          }),
        }),
        expect.anything()
      );
    });

    it("throws OperationPauseError when no matching result", async () => {
      const wallet = new PreparedActionGoatWallet({
        account: "0x1234567890123456789012345678901234567890",
        chainId: 8453,
        actionResults: {},
      });

      await expect(
        wallet.sendTransaction({
          to: "0x9999999999999999999999999999999999999999",
          data: "0x",
        })
      ).rejects.toThrow(OperationPauseError);
    });
  });

  describe("balanceOf", () => {
    it("returns native balance using the provided address", async () => {
      mockPublicClient.getBalance.mockResolvedValue(1000n);

      const wallet = new PreparedActionGoatWallet({
        account: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        chainId: 8453,
        actionResults: {},
      });

      const result = await wallet.balanceOf("0x1234567890123456789012345678901234567890");
      expect(mockPublicClient.getBalance).toHaveBeenCalledWith({
        address: "0x1234567890123456789012345678901234567890",
      });
      expect(result.symbol).toBe("ETH");
      expect(result.value).toBe("1000");
    });

    it("returns ERC20 balance", async () => {
      mockPublicClient.readContract.mockResolvedValue(500n);

      const tokenAddress = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
      const wallet = new PreparedActionGoatWallet({
        account: "0x1234567890123456789012345678901234567890",
        chainId: 8453,
        actionResults: {},
      });

      const result = await wallet.balanceOf(
        "0x1234567890123456789012345678901234567890",
        tokenAddress
      );
      expect(mockPublicClient.readContract).toHaveBeenCalled();
      expect(result.value).toBe("500");
      expect(result.symbol).toBe("USDC");
    });
  });
});
