import { describe, expect, it } from "vitest";

import * as publicSchemas from "../../src/api/schemas/uniswap-v4.js";
import * as calculationInputs from "../../src/api/schemas/uniswap-v4/calculation-inputs.js";
import * as calculations from "../../src/api/schemas/uniswap-v4/calculations.js";
import * as events from "../../src/api/schemas/uniswap-v4/events.js";
import * as lifecycle from "../../src/api/schemas/uniswap-v4/lifecycle.js";
import * as outputs from "../../src/api/schemas/uniswap-v4/outputs.js";
import * as primitives from "../../src/api/schemas/uniswap-v4/primitives.js";
import * as simulation from "../../src/api/schemas/uniswap-v4/simulation.js";
import * as state from "../../src/api/schemas/uniswap-v4/state.js";

const sourceExports = Object.keys({
  ...primitives,
  ...state,
  ...events,
  ...calculations,
  ...calculationInputs,
  ...lifecycle,
  ...simulation,
}).sort();

describe("Uniswap v4 schema output exports", () => {
  it("Given the domain schema modules When collected by the output barrel Then it preserves every legacy export", () => {
    expect(Object.keys(outputs).sort()).toEqual(sourceExports);
    expect(Object.keys(publicSchemas).sort()).toEqual(sourceExports);
  });
});
