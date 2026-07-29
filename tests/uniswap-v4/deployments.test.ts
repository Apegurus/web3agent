import { describe, expect, it } from "vitest";
import {
  assertUniswapV4DeploymentEvidence,
  getUniswapV4Deployment,
} from "../../src/uniswap-v4/deployments.js";

const DEPLOYMENT = {
  chainId: 4663,
  poolManager: "0x8366a39CC670B4001A1121B8F6A443A643e40951",
  positionManager: "0x58daec3116aae6D93017bAAea7749052E8a04fA7",
  stateView: "0xF3334192D15450CdD385c8B70e03f9A6bD9E673b",
  permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
} as const;

const LIVE_CODE_HASHES = {
  poolManager: "0xbd3881180b547f5fe817545743cfb4343e96b1bc6640dcd70c106b0066e95626",
  positionManager: "0xc873e135dc9aaec88489cfbad146b4cb49d6a32e0d80326377784b7ba17670b2",
  stateView: "0x7d9c591e0956fd89d98feb4ffcfe8bf1f7a62bd485edd979fa21d104b49878a6",
  permit2: "0x5208783f52488f7d3493e5e38311ab707c1d75457fe472a19b0b4d57d66a7fca",
} as const;

const ZERO_ADDRESS: `0x${string}` = "0x0000000000000000000000000000000000000000";
const WRONG_CODE_HASH: `0x${string}` =
  "0x0000000000000000000000000000000000000000000000000000000000000000";

const VALID_EVIDENCE = {
  deployment: DEPLOYMENT,
  observedChainId: 4663,
  observedCodeHashes: LIVE_CODE_HASHES,
} as const;

describe("Uniswap v4 Robinhood deployment", () => {
  it("returns the checksummed verified Chain 4663 deployment", () => {
    // Given: the verified Robinhood Chain id
    // When: the immutable registry is read
    const deployment = getUniswapV4Deployment(4663);

    // Then: all four verified addresses are returned unchanged
    expect(deployment).toEqual(DEPLOYMENT);
  });

  it("throws UNISWAP_V4_UNAVAILABLE for an unsupported chain", () => {
    // Given: a chain without a verified deployment
    // When: the registry is read
    const readUnavailableDeployment = () => getUniswapV4Deployment(1);

    // Then: callers receive the stable typed error code
    expect(readUnavailableDeployment).toThrowError(
      expect.objectContaining({ code: "UNISWAP_V4_UNAVAILABLE" })
    );
  });

  it("rejects a zero-address fixture", () => {
    // Given: a candidate with a zero Permit2 address
    const evidence = {
      ...VALID_EVIDENCE,
      deployment: { ...DEPLOYMENT, permit2: ZERO_ADDRESS },
    };

    // When: deployment evidence is validated
    const validateEvidence = () => assertUniswapV4DeploymentEvidence(evidence);

    // Then: the fixture fails closed
    expect(validateEvidence).toThrowError(
      expect.objectContaining({ code: "UNISWAP_V4_DEPLOYMENT_UNVERIFIED" })
    );
  });

  it("rejects an EOA fixture", () => {
    // Given: a candidate whose PoolManager has no runtime code hash
    const evidence = {
      ...VALID_EVIDENCE,
      observedCodeHashes: { ...LIVE_CODE_HASHES, poolManager: null },
    };

    // When: deployment evidence is validated
    const validateEvidence = () => assertUniswapV4DeploymentEvidence(evidence);

    // Then: the fixture fails closed
    expect(validateEvidence).toThrowError(
      expect.objectContaining({ code: "UNISWAP_V4_DEPLOYMENT_UNVERIFIED" })
    );
  });

  it("rejects address-collision fixtures", () => {
    // Given: a candidate that aliases PositionManager to PoolManager
    const evidence = {
      ...VALID_EVIDENCE,
      deployment: { ...DEPLOYMENT, positionManager: DEPLOYMENT.poolManager },
    };

    // When: deployment evidence is validated
    const validateEvidence = () => assertUniswapV4DeploymentEvidence(evidence);

    // Then: the fixture fails closed
    expect(validateEvidence).toThrowError(
      expect.objectContaining({ code: "UNISWAP_V4_DEPLOYMENT_UNVERIFIED" })
    );
  });

  it("rejects wrong-chain evidence", () => {
    // Given: valid-looking bytecode evidence from another chain
    const evidence = { ...VALID_EVIDENCE, observedChainId: 1 };

    // When: deployment evidence is validated
    const validateEvidence = () => assertUniswapV4DeploymentEvidence(evidence);

    // Then: the fixture fails closed
    expect(validateEvidence).toThrowError(
      expect.objectContaining({ code: "UNISWAP_V4_DEPLOYMENT_UNVERIFIED" })
    );
  });

  it("rejects mismatched code hashes", () => {
    // Given: a candidate with a wrong StateView bytecode hash
    const evidence = {
      ...VALID_EVIDENCE,
      observedCodeHashes: {
        ...LIVE_CODE_HASHES,
        stateView: WRONG_CODE_HASH,
      },
    };

    // When: deployment evidence is validated
    const validateEvidence = () => assertUniswapV4DeploymentEvidence(evidence);

    // Then: the fixture fails closed
    expect(validateEvidence).toThrowError(
      expect.objectContaining({ code: "UNISWAP_V4_DEPLOYMENT_UNVERIFIED" })
    );
  });
});
