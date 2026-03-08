export function splitSignature(signature: string): {
  v: `0x${string}`;
  r: `0x${string}`;
  s: `0x${string}`;
} {
  return {
    r: `0x${signature.slice(2, 66)}` as `0x${string}`,
    s: `0x${signature.slice(66, 130)}` as `0x${string}`,
    v: `0x${signature.slice(130, 132)}` as `0x${string}`,
  };
}
