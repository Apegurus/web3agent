import { isHex } from "viem";

export function splitSignature(signature: string): {
  v: `0x${string}`;
  r: `0x${string}`;
  s: `0x${string}`;
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
    r: `0x${signature.slice(2, 66)}` as `0x${string}`,
    s: `0x${signature.slice(66, 130)}` as `0x${string}`,
    v: `0x${signature.slice(130, 132)}` as `0x${string}`,
  };
}

export function joinSignature(signature: {
  v: number | `0x${string}`;
  r: `0x${string}`;
  s: `0x${string}`;
}): `0x${string}` {
  if (!isHex(signature.r, { strict: true }) || signature.r.length !== 66) {
    throw new Error("Invalid signature.r: expected 32-byte hex value");
  }
  if (!isHex(signature.s, { strict: true }) || signature.s.length !== 66) {
    throw new Error("Invalid signature.s: expected 32-byte hex value");
  }

  const v =
    typeof signature.v === "number"
      ? (`0x${signature.v.toString(16).padStart(2, "0")}` as `0x${string}`)
      : signature.v;
  if (!isHex(v, { strict: true }) || v.length !== 4) {
    throw new Error("Invalid signature.v: expected 1-byte hex value");
  }

  return `${signature.r}${signature.s.slice(2)}${v.slice(2)}` as `0x${string}`;
}
