import type { Hex } from "viem";
import { Web3AgentError } from "../api/errors.js";
import {
  DEPLOYMENT_CONTRACTS,
  type DeploymentContract,
  ROBINHOOD_CHAIN_ID,
  ROBINHOOD_UNISWAP_V4_PROVENANCE,
  type UniswapV4Deployment,
} from "./deployment-provenance.js";

export type { UniswapV4Deployment } from "./deployment-provenance.js";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export type UniswapV4DeploymentEvidence = {
  readonly deployment: UniswapV4Deployment;
  readonly observedChainId: number;
  readonly observedCodeHashes: Readonly<Record<DeploymentContract, Hex | null>>;
};

const ROBINHOOD_DEPLOYMENT = ROBINHOOD_UNISWAP_V4_PROVENANCE.deployment;

const DEPLOYMENTS_BY_CHAIN_ID = Object.freeze({
  [ROBINHOOD_CHAIN_ID]: ROBINHOOD_DEPLOYMENT,
});

const ROBINHOOD_CODE_HASHES = ROBINHOOD_UNISWAP_V4_PROVENANCE.codeHashes;

function throwUnverifiedDeployment(reason: string): never {
  throw new Web3AgentError({
    code: "UNISWAP_V4_DEPLOYMENT_UNVERIFIED",
    message: `Uniswap v4 deployment evidence is invalid: ${reason}`,
  });
}

export function getUniswapV4Deployment(chainId: number): UniswapV4Deployment {
  if (chainId === ROBINHOOD_CHAIN_ID) {
    return DEPLOYMENTS_BY_CHAIN_ID[ROBINHOOD_CHAIN_ID];
  }

  throw new Web3AgentError({
    code: "UNISWAP_V4_UNAVAILABLE",
    message: `Uniswap v4 is not verified on chain ${chainId}`,
    details: { chainId },
  });
}

export function assertUniswapV4DeploymentEvidence(evidence: UniswapV4DeploymentEvidence): void {
  if (evidence.deployment.chainId !== ROBINHOOD_CHAIN_ID) {
    throwUnverifiedDeployment("unsupported deployment chain");
  }

  if (evidence.observedChainId !== evidence.deployment.chainId) {
    throwUnverifiedDeployment("observed chain does not match deployment chain");
  }

  const addresses = DEPLOYMENT_CONTRACTS.map((contract) => evidence.deployment[contract]);
  if (addresses.some((address) => address.toLowerCase() === ZERO_ADDRESS)) {
    throwUnverifiedDeployment("zero address");
  }

  if (new Set(addresses.map((address) => address.toLowerCase())).size !== addresses.length) {
    throwUnverifiedDeployment("contract address collision");
  }

  for (const contract of DEPLOYMENT_CONTRACTS) {
    if (evidence.deployment[contract] !== ROBINHOOD_DEPLOYMENT[contract]) {
      throwUnverifiedDeployment(`unexpected ${contract} address`);
    }

    if (evidence.observedCodeHashes[contract] !== ROBINHOOD_CODE_HASHES[contract]) {
      throwUnverifiedDeployment(`unexpected ${contract} bytecode hash`);
    }
  }
}
