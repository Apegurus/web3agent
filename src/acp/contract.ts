import type { Hex } from "viem";
import { getConfig } from "../config/env.js";
import type { RuntimeConfig } from "../types/config.js";

// ERC-8183 (ACP) contract ABI - all required functions
export const erc8183Abi = [
  // createJob(address provider, address evaluator, uint256 expiredAt, string description, address hook) returns (uint256 jobId)
  {
    name: "createJob",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "provider", type: "address" },
      { name: "evaluator", type: "address" },
      { name: "expiredAt", type: "uint256" },
      { name: "description", type: "string" },
      { name: "hook", type: "address" },
    ],
    outputs: [{ name: "jobId", type: "uint256" }],
  },
  // setBudget(uint256 jobId, uint256 amount, bytes optParams)
  {
    name: "setBudget",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "jobId", type: "uint256" },
      { name: "amount", type: "uint256" },
      { name: "optParams", type: "bytes" },
    ],
    outputs: [],
  },
  // fund(uint256 jobId, uint256 expectedBudget, bytes optParams)
  {
    name: "fund",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "jobId", type: "uint256" },
      { name: "expectedBudget", type: "uint256" },
      { name: "optParams", type: "bytes" },
    ],
    outputs: [],
  },
  // submit(uint256 jobId, bytes32 deliverable, bytes optParams)
  {
    name: "submit",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "jobId", type: "uint256" },
      { name: "deliverable", type: "bytes32" },
      { name: "optParams", type: "bytes" },
    ],
    outputs: [],
  },
  // complete(uint256 jobId, bytes32 reason, bytes optParams)
  {
    name: "complete",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "jobId", type: "uint256" },
      { name: "reason", type: "bytes32" },
      { name: "optParams", type: "bytes" },
    ],
    outputs: [],
  },
  // reject(uint256 jobId, bytes32 reason, bytes optParams)
  {
    name: "reject",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "jobId", type: "uint256" },
      { name: "reason", type: "bytes32" },
      { name: "optParams", type: "bytes" },
    ],
    outputs: [],
  },
  // claimRefund(uint256 jobId)
  {
    name: "claimRefund",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "jobId", type: "uint256" }],
    outputs: [],
  },
  // jobs(uint256 jobId) view returns (Job)
  {
    name: "jobs",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "jobId", type: "uint256" }],
    outputs: [
      { name: "client", type: "address" },
      { name: "provider", type: "address" },
      { name: "evaluator", type: "address" },
      { name: "paymentToken", type: "address" },
      { name: "budget", type: "uint256" },
      { name: "expiredAt", type: "uint256" },
      { name: "description", type: "string" },
      { name: "status", type: "uint8" },
      { name: "deliverable", type: "bytes32" },
    ],
  },
] as const;

// Minimal ERC-20 ABI for approve + allowance
export const erc20ApproveAbi = [
  {
    name: "approve",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "allowance",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

// Job status enum matching ERC-8183 spec
export enum JobStatus {
  Open = 0,
  Funded = 1,
  Submitted = 2,
  Completed = 3,
  Rejected = 4,
  Expired = 5,
}

// USDC addresses on major chains
export const USDC_ADDRESSES: Record<number, Hex> = {
  1: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", // Ethereum
  8453: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // Base
  84532: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", // Base Sepolia
  42161: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", // Arbitrum
  10: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85", // Optimism
  137: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", // Polygon
};

// Get ACP contract address from config — returns null if not configured
export function getAcpAddress(config?: RuntimeConfig): Hex | null {
  const cfg = config ?? getConfig();
  return (cfg.acpContractAddress as Hex) ?? null;
}

// Get payment token address for a chain — reads from config or defaults to USDC
export function getPaymentTokenAddress(chainId: number, config?: RuntimeConfig): Hex {
  const cfg = config ?? getConfig();
  if (cfg.acpPaymentToken) return cfg.acpPaymentToken as Hex;
  const usdc = USDC_ADDRESSES[chainId];
  if (!usdc)
    throw new Error(`No USDC address known for chain ${chainId}. Set ACP_PAYMENT_TOKEN env var.`);
  return usdc;
}
