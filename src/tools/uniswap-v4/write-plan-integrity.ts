import { Web3AgentError } from "../../api/errors.js";
import type { UniswapV4PersistedWritePlan } from "./write-schemas.js";

export function assertUniswapV4WriteTargets(
  plan: UniswapV4PersistedWritePlan,
  deployment: UniswapV4PersistedWritePlan["deployment"]
): void {
  const allowedTokens = [
    plan.operation.poolKey.currency0,
    plan.operation.poolKey.currency1,
  ].flatMap((currency) => (currency.kind === "erc20" ? [currency.address.toLowerCase()] : []));
  const lastAction = plan.actions.at(-1);
  if (
    lastAction?.kind !== "positionManager" ||
    plan.actions.filter((action) => action.kind === "positionManager").length !== 1
  ) {
    throw invalidStageOrder("Persisted Uniswap v4 plan must end with one PositionManager stage");
  }
  let previousStage = 0;
  for (const action of plan.actions) {
    const stage = stageOrder(action.kind);
    if (stage < previousStage) {
      throw invalidStageOrder("Persisted Uniswap v4 plan stages are out of order");
    }
    previousStage = stage;
    switch (action.kind) {
      case "erc20Approval":
        if (
          action.to.toLowerCase() !== action.token.toLowerCase() ||
          action.spender.toLowerCase() !== deployment.permit2.toLowerCase() ||
          !allowedTokens.includes(action.token.toLowerCase())
        ) {
          throw invalidTarget("Approval target is not canonical");
        }
        break;
      case "permit2Signature":
        if (
          action.domain.chainId !== plan.operation.chainId ||
          action.domain.verifyingContract.toLowerCase() !== deployment.permit2.toLowerCase() ||
          action.message.spender.toLowerCase() !== deployment.positionManager.toLowerCase() ||
          action.message.details.some(
            (detail) => !allowedTokens.includes(detail.token.toLowerCase())
          )
        ) {
          throw invalidTarget("Permit2 payload is not canonical");
        }
        break;
      case "poolInitialization":
        if (
          action.to.toLowerCase() !== deployment.poolManager.toLowerCase() ||
          plan.operation.kind !== "mint" ||
          !plan.operation.createPool
        ) {
          throw invalidTarget("Pool initialization target is not canonical");
        }
        break;
      case "nftPermitSignature":
        if (
          action.domain.chainId !== plan.operation.chainId ||
          action.domain.verifyingContract.toLowerCase() !==
            deployment.positionManager.toLowerCase() ||
          action.message.spender.toLowerCase() !== plan.account.toLowerCase() ||
          action.unsignedFinal.to.toLowerCase() !== deployment.positionManager.toLowerCase()
        ) {
          throw invalidTarget("NFT permit payload is not canonical");
        }
        break;
      case "positionManager":
        if (action.to.toLowerCase() !== deployment.positionManager.toLowerCase()) {
          throw invalidTarget("PositionManager target is not canonical");
        }
        break;
    }
  }
  if (
    plan.operation.kind === "mint" &&
    plan.operation.createPool &&
    !plan.actions.some((action) => action.kind === "poolInitialization")
  ) {
    throw invalidStageOrder(
      "Pool-creating mint plans must include a PoolManager initialization stage"
    );
  }
}

function stageOrder(kind: UniswapV4PersistedWritePlan["actions"][number]["kind"]): number {
  switch (kind) {
    case "erc20Approval":
      return 1;
    case "permit2Signature":
      return 2;
    case "poolInitialization":
      return 3;
    case "nftPermitSignature":
      return 4;
    case "positionManager":
      return 5;
  }
}

function invalidStageOrder(message: string): Web3AgentError {
  return new Web3AgentError({ code: "UNISWAP_V4_PLAN_STAGE_ORDER_INVALID", message });
}

function invalidTarget(message: string): Web3AgentError {
  return new Web3AgentError({ code: "UNISWAP_V4_PLAN_TARGET_INVALID", message });
}
