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
