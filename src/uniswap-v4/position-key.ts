import { encodePacked, keccak256, toHex } from "viem";
import type { Address, Hex } from "viem";

export type UniswapV4PositionKeyInput = {
  readonly owner: Address;
  readonly tickLower: number;
  readonly tickUpper: number;
  readonly tokenId: bigint;
};

export function getUniswapV4PositionSalt(tokenId: bigint): Hex {
  return toHex(tokenId, { size: 32 });
}

export function deriveUniswapV4PositionId(input: UniswapV4PositionKeyInput): Hex {
  return keccak256(
    encodePacked(
      ["address", "int24", "int24", "bytes32"],
      [input.owner, input.tickLower, input.tickUpper, getUniswapV4PositionSalt(input.tokenId)]
    )
  );
}
