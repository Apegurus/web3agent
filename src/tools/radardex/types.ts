import type {
  QuoteRequest,
  RadarExecutionResult,
  RadarQuoteResult,
  RadarRouteHealthEntry,
  RadarToken,
} from "../../providers/radardex/index.js";

export type RadarDexToolDependencies = {
  readonly listTokens: () => Promise<readonly RadarToken[]>;
  readonly getQuote: (input: QuoteRequest) => Promise<RadarQuoteResult>;
  readonly getRouteHealth: () => Promise<readonly RadarRouteHealthEntry[]>;
  readonly executeSwap: (input: QuoteRequest) => Promise<RadarExecutionResult>;
};
