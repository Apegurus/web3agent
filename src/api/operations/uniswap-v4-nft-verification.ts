import { decodeFunctionData, recoverTypedDataAddress } from "viem";

import type { UniswapV4PersistedWritePlan } from "../../tools/uniswap-v4/write-schemas.js";
import { buildPositionManagerCalldataWithNftPermitSignature } from "../../uniswap-v4/sdk-adapter-api.js";
import { invalid } from "./uniswap-v4-facts.js";
import { nftPermitTypedData } from "./uniswap-v4-signature-validation.js";

const positionManagerSubmissionAbi = [
  {
    inputs: [{ name: "data", type: "bytes[]" }],
    name: "multicall",
    outputs: [],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [
      { name: "spender", type: "address" },
      { name: "tokenId", type: "uint256" },
      { name: "deadline", type: "uint256" },
      { name: "nonce", type: "uint256" },
      { name: "signature", type: "bytes" },
    ],
    name: "permit",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

export async function verifyNftSubmission(
  action: Extract<
    UniswapV4PersistedWritePlan["actions"][number],
    { readonly kind: "nftPermitSignature" }
  >,
  input: `0x${string}`,
  id: string
): Promise<void> {
  const outer = decodeFunctionData({ abi: positionManagerSubmissionAbi, data: input });
  if (outer.functionName !== "multicall")
    throw invalid("Uniswap v4 NFT submission must use PositionManager multicall");
  const [calls] = outer.args;
  if (calls.length !== 2)
    throw invalid("Uniswap v4 NFT submission must contain exactly permit and final calls");
  const permit = decodeFunctionData({ abi: positionManagerSubmissionAbi, data: calls[0] });
  if (permit.functionName !== "permit")
    throw invalid("Uniswap v4 NFT submission first call must be permit");
  const [spender, tokenId, deadline, nonce, signature] = permit.args;
  if (
    spender.toLowerCase() !== action.message.spender.toLowerCase() ||
    tokenId !== BigInt(action.message.tokenId) ||
    deadline !== BigInt(action.message.deadline) ||
    nonce !== BigInt(action.message.nonce) ||
    calls[1] !== action.unsignedFinal.data
  )
    throw invalid("Uniswap v4 NFT submission does not embed the canonical permit and final call");
  const signer = await recoverTypedDataAddress({ ...nftPermitTypedData(action), signature });
  if (signer.toLowerCase() !== action.expectedSigner.toLowerCase())
    throw invalid("Uniswap v4 NFT submission signer does not match NFT owner");
  const canonical = buildPositionManagerCalldataWithNftPermitSignature({
    deadline,
    nonce,
    signature,
    spender,
    tokenId,
    transaction: { calldata: action.unsignedFinal.data, value: BigInt(action.unsignedFinal.value) },
  });
  if (canonical.calldata !== input)
    throw invalid(
      `Action result ${id} transaction input does not match canonical PositionManager encoding`
    );
}
