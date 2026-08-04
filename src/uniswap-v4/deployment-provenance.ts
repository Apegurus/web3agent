import type { Address, Hex } from "viem";

export const ROBINHOOD_CHAIN_ID = 4663;
export const UNISWAP_V4_MANIFEST_URL = "https://developers.uniswap.org/deployments.json";
export const ROBINHOOD_PUBLIC_RPC_URL = "https://rpc.mainnet.chain.robinhood.com";

export const DEPLOYMENT_CONTRACTS = [
  "poolManager",
  "positionManager",
  "stateView",
  "permit2",
] as const;

export type DeploymentContract = (typeof DEPLOYMENT_CONTRACTS)[number];

export type UniswapV4Deployment = {
  readonly chainId: number;
  readonly poolManager: Address;
  readonly positionManager: Address;
  readonly stateView: Address;
  readonly permit2: Address;
};

export type DeploymentAdmissionProvenance = {
  readonly manifest: {
    readonly sourceCommit: string;
    readonly sourceRepository: string;
  };
  readonly deployment: UniswapV4Deployment;
  readonly block: {
    readonly hash: Hex;
    readonly number: Hex;
  };
  readonly codeHashes: Readonly<Record<DeploymentContract, Hex>>;
  readonly probes: readonly {
    readonly contract: DeploymentContract;
    readonly data: Hex;
    readonly result: Hex;
  }[];
};

const deployment = Object.freeze({
  chainId: ROBINHOOD_CHAIN_ID,
  poolManager: "0x8366a39CC670B4001A1121B8F6A443A643e40951",
  positionManager: "0x58daec3116aae6D93017bAAea7749052E8a04fA7",
  stateView: "0xF3334192D15450CdD385c8B70e03f9A6bD9E673b",
  permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
} satisfies UniswapV4Deployment);

const codeHashes = Object.freeze({
  poolManager: "0xbd3881180b547f5fe817545743cfb4343e96b1bc6640dcd70c106b0066e95626",
  positionManager: "0xc873e135dc9aaec88489cfbad146b4cb49d6a32e0d80326377784b7ba17670b2",
  stateView: "0x7d9c591e0956fd89d98feb4ffcfe8bf1f7a62bd485edd979fa21d104b49878a6",
  permit2: "0x5208783f52488f7d3493e5e38311ab707c1d75457fe472a19b0b4d57d66a7fca",
} satisfies Readonly<Record<DeploymentContract, Hex>>);

export const ROBINHOOD_UNISWAP_V4_PROVENANCE = Object.freeze({
  manifest: Object.freeze({
    sourceCommit: "37936185dee7decf681360ec799c124e0e034672",
    sourceRepository: "https://github.com/Uniswap/contracts",
  }),
  deployment,
  block: Object.freeze({
    hash: "0x1832b3e7fdb1110b4321deae270b194cd7afd0905eb5befd06d9766148ca9798",
    number: "0xfad14f",
  }),
  codeHashes,
  probes: Object.freeze([
    Object.freeze({
      contract: "poolManager",
      data: "0xf02de3b2",
      result: "0x0000000000000000000000000000000000000000000000000000000000000000",
    }),
    Object.freeze({
      contract: "positionManager",
      data: "0xdc4c90d3",
      result: "0x0000000000000000000000008366a39cc670b4001a1121b8f6a443a643e40951",
    }),
    Object.freeze({
      contract: "stateView",
      data: "0xdc4c90d3",
      result: "0x0000000000000000000000008366a39cc670b4001a1121b8f6a443a643e40951",
    }),
    Object.freeze({
      contract: "stateView",
      data: "0xc815641c0000000000000000000000000000000000000000000000000000000000000000",
      result:
        "0x0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
    }),
    Object.freeze({
      contract: "permit2",
      data: "0x3644e515",
      result: "0x448684463b1f7965c1ec7c249cee11520df24c07242efc2b20f6e54c85614fad",
    }),
  ]),
} satisfies DeploymentAdmissionProvenance);
