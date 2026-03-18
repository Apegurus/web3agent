import { describe, expect, it } from "vitest";
import type {
  BlockscoutNftList,
  BlockscoutTokenTransferList,
} from "../../../src/api/explorer/blockscout/types.js";
import type {
  EtherscanNftTransfer,
  EtherscanTokenTransfer,
} from "../../../src/api/explorer/etherscan/types.js";
import {
  normalizeBlockscoutNfts,
  normalizeBlockscoutTokenTransfers,
  normalizeEtherscanNftTransfers,
  normalizeEtherscanTokenTransfers,
} from "../../../src/api/explorer/tokens.js";

const bsTransferList: BlockscoutTokenTransferList = {
  items: [
    {
      block_hash: "0xblockhash",
      block_number: 18000000,
      timestamp: "2024-01-15T10:00:00.000Z",
      from: { hash: "0xfrom1" },
      to: { hash: "0xto1" },
      token: {
        address: "0xusdc",
        symbol: "USDC",
        name: "USD Coin",
        decimals: "6",
        type: "ERC-20",
      },
      total: { value: "1000000", decimals: "6" },
      tx_hash: "0xtx1",
    },
    {
      block_hash: "0xblockhash2",
      block_number: 18000001,
      timestamp: "2024-01-15T10:01:00.000Z",
      from: { hash: "0xfrom2" },
      to: { hash: "0xto2" },
      token: {
        address: "0xnft",
        symbol: null,
        name: null,
        decimals: null,
        type: "ERC-721",
      },
      total: { value: "1", decimals: "0" },
      tx_hash: "0xtx2",
    },
  ],
  next_page_params: { page: "2" },
};

describe("normalizeBlockscoutTokenTransfers", () => {
  it("maps items to transfers", () => {
    const result = normalizeBlockscoutTokenTransfers(bsTransferList);
    expect(result.transfers).toHaveLength(2);
  });

  it("maps first transfer fields correctly", () => {
    const result = normalizeBlockscoutTokenTransfers(bsTransferList);
    expect(result.transfers[0]).toMatchObject({
      hash: "0xtx1",
      blockNumber: 18000000,
      timestamp: "2024-01-15T10:00:00.000Z",
      from: "0xfrom1",
      to: "0xto1",
      token: "0xusdc",
      symbol: "USDC",
      decimals: 6,
      value: "1000000",
      type: "ERC-20",
    });
  });

  it("handles null symbol and decimals", () => {
    const result = normalizeBlockscoutTokenTransfers(bsTransferList);
    expect(result.transfers[1].symbol).toBeUndefined();
    expect(result.transfers[1].decimals).toBeUndefined();
  });

  it("sets hasMore true when next_page_params exists", () => {
    const result = normalizeBlockscoutTokenTransfers(bsTransferList);
    expect(result.hasMore).toBe(true);
  });

  it("sets hasMore false when next_page_params is null", () => {
    const list: BlockscoutTokenTransferList = { ...bsTransferList, next_page_params: null };
    const result = normalizeBlockscoutTokenTransfers(list);
    expect(result.hasMore).toBe(false);
  });

  it("returns empty transfers for empty items", () => {
    const list: BlockscoutTokenTransferList = { items: [], next_page_params: null };
    const result = normalizeBlockscoutTokenTransfers(list);
    expect(result.transfers).toEqual([]);
  });
});

const esTransfers: EtherscanTokenTransfer[] = [
  {
    blockNumber: "18000000",
    timeStamp: "1705316600",
    hash: "0xestx1",
    nonce: "1",
    from: "0xesfrom",
    to: "0xesto",
    contractAddress: "0xestoken",
    tokenName: "Tether",
    tokenSymbol: "USDT",
    tokenDecimal: "6",
    value: "5000000",
    transactionIndex: "0",
    gas: "80000",
    gasPrice: "20000000000",
    gasUsed: "60000",
  },
  {
    blockNumber: "18000001",
    timeStamp: "1705316700",
    hash: "0xestx2",
    nonce: "2",
    from: "0xesfrom2",
    to: "0xesto2",
    contractAddress: "0xestoken2",
    tokenName: "",
    tokenSymbol: "",
    tokenDecimal: "",
    value: "100",
    transactionIndex: "1",
    gas: "21000",
    gasPrice: "15000000000",
    gasUsed: "21000",
  },
];

describe("normalizeEtherscanTokenTransfers", () => {
  it("maps transfer fields correctly", () => {
    const result = normalizeEtherscanTokenTransfers(esTransfers);
    expect(result.transfers).toHaveLength(2);
    expect(result.transfers[0]).toMatchObject({
      hash: "0xestx1",
      blockNumber: 18000000,
      from: "0xesfrom",
      to: "0xesto",
      token: "0xestoken",
      symbol: "USDT",
      decimals: 6,
      value: "5000000",
    });
  });

  it("converts timeStamp to ISO string", () => {
    const result = normalizeEtherscanTokenTransfers(esTransfers);
    expect(result.transfers[0].timestamp).toBe(new Date(1705316600 * 1000).toISOString());
  });

  it("omits symbol and decimals when empty/invalid", () => {
    const result = normalizeEtherscanTokenTransfers(esTransfers);
    expect(result.transfers[1].symbol).toBeUndefined();
    expect(result.transfers[1].decimals).toBeUndefined();
  });

  it("returns empty transfers for empty input", () => {
    const result = normalizeEtherscanTokenTransfers([]);
    expect(result.transfers).toEqual([]);
  });

  it("does not set hasMore (Etherscan no pagination info)", () => {
    const result = normalizeEtherscanTokenTransfers(esTransfers);
    expect(result.hasMore).toBeUndefined();
  });
});

const nftList: BlockscoutNftList = {
  items: [
    {
      token: {
        address: "0xnftcontract",
        name: "CryptoPunks",
        symbol: "PUNK",
        type: "ERC-721",
      },
      id: "1234",
      value: "1",
      metadata: { name: "Punk #1234", image: "ipfs://..." },
    },
    {
      token: {
        address: "0x1155contract",
        name: null,
        symbol: null,
        type: "ERC-1155",
      },
      id: "5",
      value: "3",
      metadata: null,
    },
  ],
  next_page_params: null,
};

describe("normalizeBlockscoutNfts", () => {
  it("sets address", () => {
    const result = normalizeBlockscoutNfts("0xowner", nftList);
    expect(result.address).toBe("0xowner");
  });

  it("maps NFT items", () => {
    const result = normalizeBlockscoutNfts("0xowner", nftList);
    expect(result.nfts).toHaveLength(2);
  });

  it("maps ERC-721 NFT correctly", () => {
    const result = normalizeBlockscoutNfts("0xowner", nftList);
    expect(result.nfts[0]).toMatchObject({
      contractAddress: "0xnftcontract",
      name: "CryptoPunks",
      symbol: "PUNK",
      tokenId: "1234",
      tokenType: "ERC-721",
      balance: "1",
    });
    expect(result.nfts[0].metadata).toMatchObject({ name: "Punk #1234" });
  });

  it("maps ERC-1155 NFT with null name/symbol", () => {
    const result = normalizeBlockscoutNfts("0xowner", nftList);
    expect(result.nfts[1].tokenType).toBe("ERC-1155");
    expect(result.nfts[1].name).toBeUndefined();
    expect(result.nfts[1].symbol).toBeUndefined();
    expect(result.nfts[1].balance).toBe("3");
    expect(result.nfts[1].metadata).toBeUndefined();
  });

  it("sets hasMore based on next_page_params", () => {
    const result = normalizeBlockscoutNfts("0xowner", nftList);
    expect(result.hasMore).toBe(false);
  });

  it("sets hasMore true when next_page_params exists", () => {
    const list: BlockscoutNftList = { ...nftList, next_page_params: { page: "2" } };
    const result = normalizeBlockscoutNfts("0xowner", list);
    expect(result.hasMore).toBe(true);
  });
});

const erc721Transfer: EtherscanNftTransfer = {
  blockNumber: "18000000",
  timeStamp: "1705316700",
  hash: "0xnfttx1",
  nonce: "1",
  from: "0xseller",
  to: "0xbuyer",
  contractAddress: "0xnftcontract",
  tokenName: "CryptoPunks",
  tokenSymbol: "PUNK",
  tokenDecimal: "0",
  tokenID: "1234",
  value: "1",
  transactionIndex: "0",
  gas: "100000",
  gasPrice: "20000000000",
  gasUsed: "80000",
};

const erc1155Transfer: EtherscanNftTransfer = {
  blockNumber: "18000001",
  timeStamp: "1705316600",
  hash: "0xnfttx2",
  nonce: "2",
  from: "0xminter",
  to: "0xcollector",
  contractAddress: "0x1155contract",
  tokenName: "GameItems",
  tokenSymbol: "ITEM",
  tokenDecimal: "0",
  tokenID: "42",
  value: "5",
  transactionIndex: "1",
  gas: "150000",
  gasPrice: "15000000000",
  gasUsed: "120000",
};

describe("normalizeEtherscanNftTransfers", () => {
  it("merges ERC-721 and ERC-1155 transfers", () => {
    const result = normalizeEtherscanNftTransfers([erc721Transfer], [erc1155Transfer]);
    expect(result.transfers).toHaveLength(2);
  });

  it("sorts by timestamp descending", () => {
    const result = normalizeEtherscanNftTransfers([erc721Transfer], [erc1155Transfer]);
    // erc721 has timeStamp 1705316700 (later), erc1155 has 1705316600 (earlier)
    expect(result.transfers[0].hash).toBe("0xnfttx1");
    expect(result.transfers[1].hash).toBe("0xnfttx2");
  });

  it("assigns correct type labels", () => {
    const result = normalizeEtherscanNftTransfers([erc721Transfer], [erc1155Transfer]);
    expect(result.transfers[0].type).toBe("ERC-721");
    expect(result.transfers[1].type).toBe("ERC-1155");
  });

  it("maps tokenID as value", () => {
    const result = normalizeEtherscanNftTransfers([erc721Transfer], []);
    expect(result.transfers[0].value).toBe("1234");
  });

  it("maps from, to, token fields", () => {
    const result = normalizeEtherscanNftTransfers([erc721Transfer], []);
    expect(result.transfers[0]).toMatchObject({
      from: "0xseller",
      to: "0xbuyer",
      token: "0xnftcontract",
      symbol: "PUNK",
    });
  });

  it("handles empty arrays", () => {
    const result = normalizeEtherscanNftTransfers([], []);
    expect(result.transfers).toEqual([]);
  });

  it("handles ERC-721 only", () => {
    const result = normalizeEtherscanNftTransfers([erc721Transfer], []);
    expect(result.transfers).toHaveLength(1);
    expect(result.transfers[0].type).toBe("ERC-721");
  });

  it("handles ERC-1155 only", () => {
    const result = normalizeEtherscanNftTransfers([], [erc1155Transfer]);
    expect(result.transfers).toHaveLength(1);
    expect(result.transfers[0].type).toBe("ERC-1155");
  });

  it("omits symbol when empty", () => {
    const noSymbol: EtherscanNftTransfer = { ...erc721Transfer, tokenSymbol: "" };
    const result = normalizeEtherscanNftTransfers([noSymbol], []);
    expect(result.transfers[0].symbol).toBeUndefined();
  });
});
