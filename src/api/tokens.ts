import { getChainById } from "../chains/registry.js";
import {
  listTokens as listRegisteredTokens,
  resolveCanonicalToken as resolveCanonicalRegisteredToken,
  resolveCanonicalTokenSync as resolveCanonicalRegisteredTokenSync,
  resolveToken as resolveDiscoveredToken,
  resolveTokenSync as resolveDiscoveredTokenSync,
} from "../tokens/resolver.js";
import { listChainTokensSchema, resolveTokenSchema } from "../tools/tokens/schemas.js";
import { Web3AgentError } from "./errors.js";
import type { ListChainTokensInput, ResolveTokenInput, RootResolveTokenResult } from "./types.js";
import { parseInput } from "./validation.js";

export async function resolveToken(params: ResolveTokenInput): Promise<RootResolveTokenResult> {
  const { symbol, chainId } = parseInput(resolveTokenSchema, params);
  const chain = getChainById(chainId);
  if (!chain) {
    throw new Web3AgentError({
      code: "UNKNOWN_CHAIN",
      message: `Chain ${chainId} is not a known EVM chain`,
    });
  }

  const result = await resolveDiscoveredToken(symbol, chainId);
  if (!result) {
    throw new Web3AgentError({
      code: "TOKEN_NOT_FOUND",
      message: `Token '${symbol}' not found on ${chain.name} (${chainId})`,
    });
  }

  return result;
}

export async function resolveCanonicalToken(
  params: ResolveTokenInput
): Promise<RootResolveTokenResult> {
  const { symbol, chainId } = parseInput(resolveTokenSchema, params);
  const chain = getChainById(chainId);
  if (!chain) {
    throw new Web3AgentError({
      code: "UNKNOWN_CHAIN",
      message: `Chain ${chainId} is not a known EVM chain`,
    });
  }

  const result = await resolveCanonicalRegisteredToken(symbol, chainId);
  if (!result) {
    throw new Web3AgentError({
      code: "TOKEN_NOT_FOUND",
      message: `Canonical token '${symbol}' not found on ${chain.name} (${chainId}); call resolveToken() to use discovery fallback`,
    });
  }

  return result;
}

export function resolveTokenSync(params: ResolveTokenInput): RootResolveTokenResult | null {
  const { symbol, chainId } = parseInput(resolveTokenSchema, params);
  return resolveDiscoveredTokenSync(symbol, chainId);
}

export function resolveCanonicalTokenSync(
  params: ResolveTokenInput
): RootResolveTokenResult | null {
  const { symbol, chainId } = parseInput(resolveTokenSchema, params);
  return resolveCanonicalRegisteredTokenSync(symbol, chainId);
}

export function listChainTokens(params: ListChainTokensInput) {
  const { chainId } = parseInput(listChainTokensSchema, params);
  const chain = getChainById(chainId);
  if (!chain) {
    throw new Web3AgentError({
      code: "UNKNOWN_CHAIN",
      message: `Chain ${chainId} is not a known EVM chain`,
    });
  }

  return {
    chainId,
    chainName: chain.name,
    tokens: listRegisteredTokens(chainId),
  };
}
