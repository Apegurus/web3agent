import type { UniswapV4PersistedWritePlan } from "../../tools/uniswap-v4/write-schemas.js";
import { createUniswapV4ReadClient } from "../../uniswap-v4/client.js";
import { invalid } from "./uniswap-v4-facts.js";

export async function assertPermit2PostTransactionState(
  plan: UniswapV4PersistedWritePlan,
  id: string
): Promise<void> {
  const permit = plan.actions.find((action) => action.kind === "permit2Signature");
  if (!id.endsWith(":submit") || permit?.kind !== "permit2Signature") return;
  const client = createUniswapV4ReadClient({
    chainId: plan.operation.chainId,
    deployment: plan.deployment,
  });
  for (const detail of permit.message.details) {
    const current = await client.readPermit2Allowance({
      owner: plan.account,
      spender: permit.message.spender,
      token: detail.token,
    });
    if (
      current.nonce !== BigInt(detail.nonce) + 1n ||
      current.amount < BigInt(detail.amount) ||
      current.expiration !== BigInt(detail.expiration)
    )
      throw invalid("Uniswap v4 Permit2 submission did not produce the planned allowance state");
  }
}
