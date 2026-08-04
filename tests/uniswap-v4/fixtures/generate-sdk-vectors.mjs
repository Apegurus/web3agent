import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Percent, Token } from "@uniswap/sdk-core";
import { Pool, Position, V4PositionManager } from "@uniswap/v4-sdk";

const here = fileURLToPath(new URL(".", import.meta.url));
const output =
  process.env.TASK5_OUTPUT ?? fileURLToPath(new URL("sdk-vectors.json", import.meta.url));
const generatorSource = process.env.TASK5_GENERATOR_SOURCE ?? fileURLToPath(import.meta.url);
const source = await readFile(generatorSource);
const DAI = new Token(1, "0x6B175474E89094C44Da98b954EedeAC495271d0F", 18, "DAI", "DAI Stablecoin");
const USDC = new Token(1, "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", 6, "USDC", "USD Coin");
const recipient = "0x0000000000000000000000000000000000000003";
const poolKey = Pool.getPoolKey(DAI, USDC, 500, 10, "0x0000000000000000000000000000000000000000");
const pool = new Pool(
  DAI,
  USDC,
  poolKey.fee,
  poolKey.tickSpacing,
  poolKey.hooks,
  "79228162514264337593543",
  "99999999999999999976",
  -276325,
  []
);
const position = new Position({
  pool,
  liquidity: "99999999999999999976",
  tickLower: -276340,
  tickUpper: -276300,
});
const options = { slippageTolerance: new Percent(1, 100), deadline: "123" };
const serialize = (value) =>
  JSON.parse(
    JSON.stringify(value, (_, item) =>
      typeof item === "bigint" || (Array.isArray(item) && "sign" in item) ? item.toString() : item
    )
  );
const transaction = (value) => ({ calldata: value.calldata, value: value.value });
const permit = position.permitBatchData(new Percent(1, 100), recipient, "7", "123");
const vectors = {
  provenance: {
    package: "@uniswap/v4-sdk",
    version: "2.3.0",
    gitHead: "ab3a18a62922c0bda493130e53f2c8f6fad59558",
    integrityReference:
      "sha512-aMsDxVFjnwxjWeX8lXJy+4SRPgllfEU05SJ6CRsiPOeqBMd9RHxvb0RXF4q42wNG/iKoUVg9O2q6s5uoRDXPrQ==",
    generatorSha256: createHash("sha256").update(source).digest("hex"),
  },
  inputs: { recipient, poolKey, tokenId: "1", deadline: "123" },
  poolId: Pool.getPoolId(DAI, USDC, poolKey.fee, poolKey.tickSpacing, poolKey.hooks),
  position: {
    mintMaximum: serialize(position.mintAmountsWithSlippage(new Percent(0))),
    burnMinimum: serialize(position.burnAmountsWithSlippage(new Percent(0))),
  },
  permit2: serialize({ permit }),
  transactions: {
    create: transaction(V4PositionManager.createCallParameters(poolKey, "79228162514264337593543")),
    mint: transaction(V4PositionManager.addCallParameters(position, { ...options, recipient })),
    increase: transaction(
      V4PositionManager.addCallParameters(position, { ...options, tokenId: "1" })
    ),
    decrease: transaction(
      V4PositionManager.removeCallParameters(position, {
        ...options,
        tokenId: "1",
        liquidityPercentage: new Percent(1, 4),
      })
    ),
    collect: transaction(
      V4PositionManager.collectCallParameters(position, { ...options, tokenId: "1", recipient })
    ),
    burn: transaction(
      V4PositionManager.removeCallParameters(position, {
        ...options,
        tokenId: "1",
        liquidityPercentage: new Percent(1),
        burnToken: true,
      })
    ),
  },
};
await writeFile(output, `${JSON.stringify(vectors, null, 2)}\n`);
process.stdout.write(`${here}sdk-vectors.json\n`);
