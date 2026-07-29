import { type Address, type Hex, encodeFunctionData } from "viem";

export const permit2Abi = [
  {
    inputs: [
      { name: "owner", type: "address" },
      {
        components: [
          {
            components: [
              { name: "token", type: "address" },
              { name: "amount", type: "uint160" },
              { name: "expiration", type: "uint48" },
              { name: "nonce", type: "uint48" },
            ],
            name: "details",
            type: "tuple[]",
          },
          { name: "spender", type: "address" },
          { name: "sigDeadline", type: "uint256" },
        ],
        name: "permitBatch",
        type: "tuple",
      },
      { name: "signature", type: "bytes" },
    ],
    name: "permit",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

export const permit2Types = {
  PermitBatch: [
    { name: "details", type: "PermitDetails[]" },
    { name: "spender", type: "address" },
    { name: "sigDeadline", type: "uint256" },
  ],
  PermitDetails: [
    { name: "token", type: "address" },
    { name: "amount", type: "uint160" },
    { name: "expiration", type: "uint48" },
    { name: "nonce", type: "uint48" },
  ],
} as const;

export type Permit2Permit = {
  readonly details: readonly {
    readonly amount: string;
    readonly expiration: string;
    readonly nonce: string;
    readonly token: Address;
  }[];
  readonly sigDeadline: string;
  readonly spender: Address;
};

export function buildPermit2PermitTransaction(input: {
  readonly account: Address;
  readonly permit: Permit2Permit;
  readonly permit2: Address;
  readonly signature: Hex;
}): { readonly data: Hex; readonly to: Address; readonly value: "0" } {
  const permit = {
    details: input.permit.details.map((detail) => ({
      amount: BigInt(detail.amount),
      expiration: Number(detail.expiration),
      nonce: Number(detail.nonce),
      token: detail.token,
    })),
    sigDeadline: BigInt(input.permit.sigDeadline),
    spender: input.permit.spender,
  };
  return {
    data: encodeFunctionData({
      abi: permit2Abi,
      args: [input.account, permit, input.signature],
      functionName: "permit",
    }),
    to: input.permit2,
    value: "0",
  };
}
