import { type Hex, isHex } from "viem";

export function splitSignature(signature: string): {
  v: Hex;
  r: Hex;
  s: Hex;
} {
  if (!signature.startsWith("0x")) {
    throw new Error("Invalid signature: must start with 0x prefix");
  }
  if (signature.length !== 132) {
    throw new Error(
      `Invalid signature: expected 132 characters (0x + 130 hex), got ${signature.length}`
    );
  }
  if (!/^0x[0-9a-fA-F]{130}$/.test(signature)) {
    throw new Error("Invalid signature: contains non-hex characters");
  }

  return {
    r: `0x${signature.slice(2, 66)}` as Hex,
    s: `0x${signature.slice(66, 130)}` as Hex,
    v: `0x${signature.slice(130, 132)}` as Hex,
  };
}

export function joinSignature(signature: {
  v: number | Hex;
  r: Hex;
  s: Hex;
}): Hex {
  if (!isHex(signature.r, { strict: true }) || signature.r.length !== 66) {
    throw new Error("Invalid signature.r: expected 32-byte hex value");
  }
  if (!isHex(signature.s, { strict: true }) || signature.s.length !== 66) {
    throw new Error("Invalid signature.s: expected 32-byte hex value");
  }

  const v =
    typeof signature.v === "number"
      ? (`0x${signature.v.toString(16).padStart(2, "0")}` as Hex)
      : signature.v;
  if (!isHex(v, { strict: true }) || v.length !== 4) {
    throw new Error("Invalid signature.v: expected 1-byte hex value");
  }

  return `${signature.r}${signature.s.slice(2)}${v.slice(2)}` as Hex;
}
