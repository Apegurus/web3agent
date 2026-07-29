import {
  uniswapV4CalculatePositionSchema,
  uniswapV4CalculationInputSchema,
  uniswapV4CalculationSchema,
  uniswapV4DeploymentSchema,
  uniswapV4EventQuerySchema,
  uniswapV4GetDeploymentSchema,
  uniswapV4GetPoolSchema,
  uniswapV4GetPositionSchema,
  uniswapV4LifecycleOperationSchema,
  uniswapV4SimulationInputSchema,
} from "../../api/schemas.js";
import type {
  UniswapV4CalculatePositionInput,
  UniswapV4CalculationInput,
  UniswapV4EventQuery,
  UniswapV4GetDeploymentInput,
  UniswapV4GetPoolInput,
  UniswapV4GetPositionInput,
  UniswapV4LifecycleOperation,
  UniswapV4SimulationInput,
} from "../../api/types.js";
import { calculateCurrentPositionAmounts } from "../../uniswap-v4/analysis.js";
import { calculateUniswapV4 as dispatchUniswapV4Calculation } from "../../uniswap-v4/calculation-dispatch.js";
import { createUniswapV4ReadClient } from "../../uniswap-v4/client.js";
import { ROBINHOOD_UNISWAP_V4_PROVENANCE } from "../../uniswap-v4/deployment-provenance.js";
import { getUniswapV4Deployment } from "../../uniswap-v4/deployments.js";
import { getUniswapV4EventPage } from "../../uniswap-v4/events.js";
import {
  type UniswapV4OperationSimulationBackend,
  simulateUniswapV4OperationPlan,
} from "../../uniswap-v4/reconcile-operation.js";
import { createUniswapV4StateReader } from "../../uniswap-v4/state.js";
import { formatToolErrorFromUnknown } from "../../utils/errors.js";
import { requireActiveWallet } from "../../utils/tool-helpers.js";
import { validateInput } from "../../utils/validation.js";
import { executeWrite } from "../../utils/write.js";
import { registerExecutor } from "../../wallet/confirmation.js";
import { createToolHandler } from "../shared/handler-factory.js";
import { executeUniswapV4WritePlan } from "./write-executor.js";
import { prepareUniswapV4WritePlan } from "./write-planner.js";
import {
  uniswapV4BurnPositionSchema,
  uniswapV4CollectFeesSchema,
  uniswapV4DecreaseLiquiditySchema,
  uniswapV4IncreaseLiquiditySchema,
  uniswapV4MintPositionSchema,
} from "./write-schemas.js";

function getPublicDeployment(chainId: number) {
  const deployment = getUniswapV4Deployment(chainId);
  const provenance = ROBINHOOD_UNISWAP_V4_PROVENANCE;
  return uniswapV4DeploymentSchema.parse({
    ...deployment,
    permit2CodeHash: provenance.codeHashes.permit2,
    poolManagerCodeHash: provenance.codeHashes.poolManager,
    positionManagerCodeHash: provenance.codeHashes.positionManager,
    sourceReferences: [provenance.manifest.sourceRepository],
    stateViewCodeHash: provenance.codeHashes.stateView,
    verifiedAt: {
      blockHash: provenance.block.hash,
      blockNumber: BigInt(provenance.block.number).toString(),
      chainId,
    },
  });
}

export const uniswapV4GetDeployment = createToolHandler<UniswapV4GetDeploymentInput>(
  uniswapV4GetDeploymentSchema,
  async (input) => getPublicDeployment(input.chainId),
  "UNISWAP_V4_DEPLOYMENT_ERROR"
);

export const uniswapV4GetPool = createToolHandler<UniswapV4GetPoolInput>(
  uniswapV4GetPoolSchema,
  async (input) => {
    const deployment = getPublicDeployment(input.sourceBlock.chainId);
    const reader = createUniswapV4StateReader({
      deployment,
      readClient: createUniswapV4ReadClient({ chainId: input.sourceBlock.chainId, deployment }),
    });
    return reader.readPoolSnapshot(input);
  },
  "UNISWAP_V4_POOL_READ_ERROR"
);

export const uniswapV4GetPosition = createToolHandler<UniswapV4GetPositionInput>(
  uniswapV4GetPositionSchema,
  async (input) => {
    const deployment = getPublicDeployment(input.sourceBlock.chainId);
    const reader = createUniswapV4StateReader({
      deployment,
      readClient: createUniswapV4ReadClient({ chainId: input.sourceBlock.chainId, deployment }),
    });
    return reader.readPositionSnapshot(input);
  },
  "UNISWAP_V4_POSITION_READ_ERROR"
);

export const uniswapV4GetEvents = createToolHandler<UniswapV4EventQuery>(
  uniswapV4EventQuerySchema,
  async (input) => getUniswapV4EventPage(input),
  "UNISWAP_V4_EVENT_READ_ERROR"
);

export const uniswapV4CalculatePosition = createToolHandler<UniswapV4CalculatePositionInput>(
  uniswapV4CalculatePositionSchema,
  async (input) =>
    uniswapV4CalculationSchema.parse({
      kind: "liquidityAmounts",
      liquidity: input.position.liquidity,
      ...calculateCurrentPositionAmounts(input),
    }),
  "UNISWAP_V4_CALCULATION_ERROR"
);

export const uniswapV4Calculate = createToolHandler<UniswapV4CalculationInput>(
  uniswapV4CalculationInputSchema,
  async (input) => dispatchUniswapV4Calculation(input),
  "UNISWAP_V4_CALCULATION_ERROR"
);

export function createUniswapV4SimulateOperation(backend?: UniswapV4OperationSimulationBackend) {
  return createToolHandler<UniswapV4SimulationInput>(
    uniswapV4SimulationInputSchema,
    async (input) => simulateUniswapV4OperationPlan(input, backend),
    "UNISWAP_V4_SIMULATION_ERROR"
  );
}

export const uniswapV4SimulateOperation = createUniswapV4SimulateOperation();

export async function uniswapV4MintPosition(params: Record<string, unknown>) {
  const validation = validateInput(uniswapV4MintPositionSchema, params);
  if (!validation.success) return validation.error;
  return queueLifecycleWrite(validation.data, "uniswap_v4_mint_position");
}

export async function uniswapV4IncreaseLiquidity(params: Record<string, unknown>) {
  const validation = validateInput(uniswapV4IncreaseLiquiditySchema, params);
  if (!validation.success) return validation.error;
  return queueLifecycleWrite(validation.data, "uniswap_v4_increase_liquidity");
}

export async function uniswapV4DecreaseLiquidity(params: Record<string, unknown>) {
  const validation = validateInput(uniswapV4DecreaseLiquiditySchema, params);
  if (!validation.success) return validation.error;
  return queueLifecycleWrite(validation.data, "uniswap_v4_decrease_liquidity");
}

export async function uniswapV4CollectFees(params: Record<string, unknown>) {
  const validation = validateInput(uniswapV4CollectFeesSchema, params);
  if (!validation.success) return validation.error;
  return queueLifecycleWrite(validation.data, "uniswap_v4_collect_fees");
}

export async function uniswapV4BurnPosition(params: Record<string, unknown>) {
  const validation = validateInput(uniswapV4BurnPositionSchema, params);
  if (!validation.success) return validation.error;
  return queueLifecycleWrite(validation.data, "uniswap_v4_burn_position");
}

async function queueLifecycleWrite(rawOperation: unknown, toolName: string) {
  const parsed = uniswapV4LifecycleOperationSchema.safeParse(rawOperation);
  if (!parsed.success) {
    return formatToolErrorFromUnknown(
      "UNISWAP_V4_WRITE_PLAN_ERROR",
      parsed.error,
      "Failed to parse Uniswap v4 lifecycle operation"
    );
  }
  const operation: UniswapV4LifecycleOperation = parsed.data;
  const walletError = requireActiveWallet(toolName);
  if (walletError !== null) return walletError;
  try {
    const plan = await prepareUniswapV4WritePlan(operation);
    return executeWrite({
      description: `Execute persisted Uniswap v4 ${operation.kind} plan on chain ${operation.chainId}`,
      executor: executeUniswapV4WritePlan,
      params: { ...plan },
      riskLevel: "financial",
      toolName,
    });
  } catch (error: unknown) {
    return formatToolErrorFromUnknown(
      "UNISWAP_V4_WRITE_PLAN_ERROR",
      error,
      "Failed to prepare Uniswap v4 write plan"
    );
  }
}

export function registerUniswapV4Executors(): void {
  registerExecutor("uniswap_v4_mint_position", executeUniswapV4WritePlan);
  registerExecutor("uniswap_v4_increase_liquidity", executeUniswapV4WritePlan);
  registerExecutor("uniswap_v4_decrease_liquidity", executeUniswapV4WritePlan);
  registerExecutor("uniswap_v4_collect_fees", executeUniswapV4WritePlan);
  registerExecutor("uniswap_v4_burn_position", executeUniswapV4WritePlan);
}
