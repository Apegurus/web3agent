import { beforeEach, describe, expect, it, vi } from "vitest";

const sharedMocks = vi.hoisted(() => ({
  getRuntime: vi.fn(),
  invokeAndRequireData: vi.fn(),
}));

vi.mock("../../src/api/shared.js", () => ({
  getRuntime: (...args: unknown[]) => sharedMocks.getRuntime(...args),
  invokeAndRequireData: (...args: unknown[]) => sharedMocks.invokeAndRequireData(...args),
}));

const ADDR = "0x1234567890abcdef1234567890abcdef12345678";
const TX_HASH = "0xabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd";
const CONTRACT = "0xaabbccddaabbccddaabbccddaabbccddaabbccdd";

describe("explorer SDK functions", () => {
  const fakeRuntime = { invokeTool: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks();
    sharedMocks.getRuntime.mockResolvedValue(fakeRuntime);
    sharedMocks.invokeAndRequireData.mockResolvedValue({});
  });

  it("getAddressInfo invokes explorer_get_address_info", async () => {
    const { getAddressInfo } = await import("../../src/api/explorer.js");
    const mockResult = { address: ADDR, balance: "100" };
    sharedMocks.invokeAndRequireData.mockResolvedValue(mockResult);

    const result = await getAddressInfo({ chainId: 1, address: ADDR });

    expect(result).toEqual(mockResult);
    expect(sharedMocks.getRuntime).toHaveBeenCalledWith(undefined);
    expect(sharedMocks.invokeAndRequireData).toHaveBeenCalledWith(
      fakeRuntime,
      "explorer_get_address_info",
      expect.objectContaining({ chainId: 1, address: ADDR })
    );
  });

  it("getTokensByAddress invokes explorer_get_tokens_by_address", async () => {
    const { getTokensByAddress } = await import("../../src/api/explorer.js");
    await getTokensByAddress({ chainId: 1, address: ADDR });

    expect(sharedMocks.invokeAndRequireData).toHaveBeenCalledWith(
      fakeRuntime,
      "explorer_get_tokens_by_address",
      expect.objectContaining({ chainId: 1, address: ADDR })
    );
  });

  it("getTransactionHistory invokes explorer_get_tx_history", async () => {
    const { getTransactionHistory } = await import("../../src/api/explorer.js");
    await getTransactionHistory({ chainId: 1, address: ADDR, page: 2 });

    expect(sharedMocks.invokeAndRequireData).toHaveBeenCalledWith(
      fakeRuntime,
      "explorer_get_tx_history",
      expect.objectContaining({ chainId: 1, address: ADDR, page: 2 })
    );
  });

  it("getTransactionDetails invokes explorer_get_tx_details", async () => {
    const { getTransactionDetails } = await import("../../src/api/explorer.js");
    await getTransactionDetails({ chainId: 1, txHash: TX_HASH });

    expect(sharedMocks.invokeAndRequireData).toHaveBeenCalledWith(
      fakeRuntime,
      "explorer_get_tx_details",
      expect.objectContaining({ chainId: 1, txHash: TX_HASH })
    );
  });

  it("getTransactionReceipt invokes explorer_get_tx_receipt", async () => {
    const { getTransactionReceipt } = await import("../../src/api/explorer.js");
    await getTransactionReceipt({ chainId: 1, txHash: TX_HASH });

    expect(sharedMocks.invokeAndRequireData).toHaveBeenCalledWith(
      fakeRuntime,
      "explorer_get_tx_receipt",
      expect.objectContaining({ chainId: 1, txHash: TX_HASH })
    );
  });

  it("getTokenTransfers invokes explorer_get_token_transfers", async () => {
    const { getTokenTransfers } = await import("../../src/api/explorer.js");
    await getTokenTransfers({
      chainId: 1,
      address: ADDR,
      tokenContract: CONTRACT,
    });

    expect(sharedMocks.invokeAndRequireData).toHaveBeenCalledWith(
      fakeRuntime,
      "explorer_get_token_transfers",
      expect.objectContaining({
        chainId: 1,
        address: ADDR,
        tokenContract: CONTRACT,
      })
    );
  });

  it("getNftInventory invokes explorer_get_nft_inventory", async () => {
    const { getNftInventory } = await import("../../src/api/explorer.js");
    await getNftInventory({ chainId: 1, address: ADDR });

    expect(sharedMocks.invokeAndRequireData).toHaveBeenCalledWith(
      fakeRuntime,
      "explorer_get_nft_inventory",
      expect.objectContaining({ chainId: 1, address: ADDR })
    );
  });

  it("getContractAbi invokes explorer_get_contract_abi", async () => {
    const { getContractAbi } = await import("../../src/api/explorer.js");
    await getContractAbi({ chainId: 1, contractAddress: CONTRACT });

    expect(sharedMocks.invokeAndRequireData).toHaveBeenCalledWith(
      fakeRuntime,
      "explorer_get_contract_abi",
      expect.objectContaining({ chainId: 1, contractAddress: CONTRACT })
    );
  });

  it("getContractSource invokes explorer_get_contract_source", async () => {
    const { getContractSource } = await import("../../src/api/explorer.js");
    await getContractSource({ chainId: 1, contractAddress: CONTRACT });

    expect(sharedMocks.invokeAndRequireData).toHaveBeenCalledWith(
      fakeRuntime,
      "explorer_get_contract_source",
      expect.objectContaining({ chainId: 1, contractAddress: CONTRACT })
    );
  });

  it("getBlock invokes explorer_get_block", async () => {
    const { getBlock } = await import("../../src/api/explorer.js");
    await getBlock({ chainId: 1, blockNumber: 12345 });

    expect(sharedMocks.invokeAndRequireData).toHaveBeenCalledWith(
      fakeRuntime,
      "explorer_get_block",
      expect.objectContaining({ chainId: 1, blockNumber: 12345 })
    );
  });

  it("passes runtime options through", async () => {
    const { getAddressInfo } = await import("../../src/api/explorer.js");
    const customRuntime = { invokeTool: vi.fn() };
    sharedMocks.getRuntime.mockResolvedValue(customRuntime);
    sharedMocks.invokeAndRequireData.mockResolvedValue({ address: ADDR });

    await getAddressInfo({ chainId: 1, address: ADDR }, { runtime: customRuntime as never });

    expect(sharedMocks.getRuntime).toHaveBeenCalledWith({ runtime: customRuntime });
    expect(sharedMocks.invokeAndRequireData).toHaveBeenCalledWith(
      customRuntime,
      "explorer_get_address_info",
      expect.any(Object)
    );
  });
});
