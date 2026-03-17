import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getSpotContracts } from "../../src/orbs/spot-config.js";
import { prepareSpotOrder } from "../../src/orbs/spot-prepare.js";
import type { SpotOrderParams } from "../../src/orbs/spot-prepare.js";

const FAKE_NOW = new Date("2025-01-01T00:00:00Z");
const FAKE_NOW_S = Math.floor(FAKE_NOW.getTime() / 1000);

const contracts = getSpotContracts();

function baseParams(overrides: Partial<SpotOrderParams> = {}): SpotOrderParams {
  return {
    chainId: 42161,
    swapper: "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa",
    fromToken: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
    fromAmount: "1000000000000000000",
    toToken: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9",
    ...overrides,
  };
}

describe("prepareSpotOrder", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FAKE_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("builds a minimal market order with defaults", () => {
    const result = prepareSpotOrder(baseParams());

    expect(result.typedData.domain).toEqual({
      name: "RePermit",
      version: "1",
      chainId: 42161,
      verifyingContract: contracts.repermit,
    });
    expect(result.typedData.primaryType).toBe("RePermitWitnessTransferFrom");
    expect(result.typedData.message.permitted.token).toBe(baseParams().fromToken);
    expect(result.typedData.message.permitted.amount).toBe(baseParams().fromAmount);
    expect(result.typedData.message.spender).toBe(contracts.reactor);
    expect(result.typedData.message.witness.reactor).toBe(contracts.reactor);
    expect(result.typedData.message.witness.executor).toBe(contracts.executor);
    expect(result.typedData.message.witness.swapper).toBe(baseParams().swapper);
    expect(result.typedData.message.witness.chainid).toBe(42161);
    expect(result.typedData.message.witness.exclusivity).toBe(0);
    expect(result.typedData.message.witness.freshness).toBe(30);
    expect(result.typedData.message.witness.slippage).toBe(500);
    expect(result.typedData.message.witness.input.token).toBe(baseParams().fromToken);
    expect(result.typedData.message.witness.input.amount).toBe(baseParams().fromAmount);
    expect(result.typedData.message.witness.input.maxAmount).toBe(baseParams().fromAmount);
    expect(result.typedData.message.witness.output.token).toBe(baseParams().toToken);
    expect(result.typedData.message.witness.output.limit).toBe("0");
    expect(result.typedData.message.witness.output.triggerLower).toBe("0");
    expect(result.typedData.message.witness.output.triggerUpper).toBe("0");
    expect(result.typedData.message.witness.output.recipient).toBe(baseParams().swapper);
    expect(result.meta.kind).toBe("single");
    expect(result.meta.chunkCount).toBe(1);
  });

  it("applies defaults: nonce=now, start=now, deadline=start+300", () => {
    const result = prepareSpotOrder(baseParams());
    const msg = result.typedData.message;

    expect(msg.nonce).toBe(String(FAKE_NOW_S));
    expect(msg.witness.nonce).toBe(String(FAKE_NOW_S));
    expect(msg.witness.start).toBe(String(FAKE_NOW_S));
    // single order: epoch=0, chunkCount=1, deadline = start + 300 + 1*0 = start+300
    expect(msg.deadline).toBe(String(FAKE_NOW_S + 300));
    expect(msg.witness.deadline).toBe(String(FAKE_NOW_S + 300));
    expect(result.meta.start).toBe(FAKE_NOW_S);
    expect(result.meta.deadline).toBe(FAKE_NOW_S + 300);
    expect(result.meta.epoch).toBe(0);
  });

  it("builds a chunked order with epoch > 0", () => {
    const result = prepareSpotOrder(
      baseParams({
        fromAmount: "1000000000000000000",
        fromMaxAmount: "5000000000000000000",
        epoch: 3600,
      })
    );

    expect(result.meta.kind).toBe("chunked");
    expect(result.meta.chunkCount).toBe(5);
    expect(result.meta.epoch).toBe(3600);
    // deadline = start + 300 + 5 * 3600
    expect(result.meta.deadline).toBe(FAKE_NOW_S + 300 + 5 * 3600);
    expect(result.typedData.message.witness.epoch).toBe(3600);
  });

  it("defaults epoch to 60 for chunked orders when not specified", () => {
    const result = prepareSpotOrder(
      baseParams({
        fromAmount: "1000000000000000000",
        fromMaxAmount: "3000000000000000000",
      })
    );

    expect(result.meta.kind).toBe("chunked");
    expect(result.meta.chunkCount).toBe(3);
    expect(result.meta.epoch).toBe(60);
    expect(result.typedData.message.witness.epoch).toBe(60);
  });

  it("rounds down maxAmount when not divisible by amount", () => {
    const result = prepareSpotOrder(
      baseParams({
        fromAmount: "3000000000000000000",
        fromMaxAmount: "10000000000000000000",
        epoch: 60,
      })
    );

    // 10 / 3 = 3 chunks (rounds down), effectiveMaxAmount = 3 * 3 = 9
    expect(result.meta.chunkCount).toBe(3);
    expect(result.warnings.some((w) => w.includes("fromMaxAmount rounded down"))).toBe(true);
    // input.maxAmount and permitted.amount should use the rounded value
    expect(result.typedData.message.witness.input.maxAmount).toBe("9000000000000000000");
    expect(result.typedData.message.permitted.amount).toBe("9000000000000000000");
    expect(result.approval.amount).toBe("9000000000000000000");
  });

  it("builds a limit order with output.limit > 0", () => {
    const result = prepareSpotOrder(baseParams({ outputLimit: "2000000" }));

    expect(result.typedData.message.witness.output.limit).toBe("2000000");
    expect(result.meta.limit).toBe("2000000");
  });

  it("builds a stop-loss order with triggerLower", () => {
    const result = prepareSpotOrder(baseParams({ outputTriggerLower: "1500000" }));

    expect(result.typedData.message.witness.output.triggerLower).toBe("1500000");
  });

  it("includes approval calldata for RePermit (unlimited by default)", () => {
    const result = prepareSpotOrder(baseParams());

    expect(result.approval.token).toBe(baseParams().fromToken);
    expect(result.approval.spender).toBe(contracts.repermit);
    expect(result.approval.amount).toBe(baseParams().fromAmount);
    expect(result.approval.exactApproval).toBe(false);
    expect(result.approval.tx.to).toBe(baseParams().fromToken);
    // approve function selector: 0x095ea7b3
    expect(result.approval.tx.data.startsWith("0x095ea7b3")).toBe(true);
    // unlimited approval: data should contain MaxUint256 (all f's)
    expect(result.approval.tx.data).toContain(
      "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"
    );
    expect(result.approval.tx.value).toBe("0");
  });

  it("includes submit URL and body template", () => {
    const result = prepareSpotOrder(baseParams());

    expect(result.submit.url).toContain("agents-sink");
    expect(result.submit.url).toContain("/orders/new");
    expect(result.submit.body.signature).toBeNull();
    expect(result.submit.body.status).toBe("pending");
    expect(result.submit.body.order).toBeDefined();
  });

  it("throws when chainId is unsupported", () => {
    expect(() => prepareSpotOrder(baseParams({ chainId: 999999 }))).toThrow();
  });

  it("throws when fromAmount is 0", () => {
    expect(() => prepareSpotOrder(baseParams({ fromAmount: "0" }))).toThrow();
  });

  it("throws when fromAmount > fromMaxAmount", () => {
    expect(() =>
      prepareSpotOrder(
        baseParams({
          fromAmount: "2000000000000000000",
          fromMaxAmount: "1000000000000000000",
        })
      )
    ).toThrow();
  });

  it("throws when input and output token are the same", () => {
    expect(() =>
      prepareSpotOrder(
        baseParams({
          fromToken: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
          toToken: "0x82af49447d8a07e3bd95bd0d56f35241523fbab1",
        })
      )
    ).toThrow();
  });

  it("throws when chunked order has epoch = 0", () => {
    expect(() =>
      prepareSpotOrder(
        baseParams({
          fromAmount: "1000000000000000000",
          fromMaxAmount: "3000000000000000000",
          epoch: 0,
        })
      )
    ).toThrow();
  });

  it("throws when slippage exceeds max (5000)", () => {
    expect(() => prepareSpotOrder(baseParams({ slippage: 5001 }))).toThrow();
  });

  it("throws when triggerLower > triggerUpper", () => {
    expect(() =>
      prepareSpotOrder(
        baseParams({
          outputTriggerLower: "2000000",
          outputTriggerUpper: "1000000",
        })
      )
    ).toThrow();
  });

  it("throws when fromToken is native zero address", () => {
    expect(() =>
      prepareSpotOrder(baseParams({ fromToken: "0x0000000000000000000000000000000000000000" }))
    ).toThrow("native input token not supported");
  });

  it("throws when freshness >= epoch", () => {
    // Default freshness is 30; epoch=30 means freshness >= epoch
    expect(() =>
      prepareSpotOrder(
        baseParams({
          fromAmount: "1000000000000000000",
          fromMaxAmount: "3000000000000000000",
          epoch: 30,
        })
      )
    ).toThrow();
  });

  it("warns when slippage is below default 500", () => {
    const result = prepareSpotOrder(baseParams({ slippage: 100 }));
    expect(result.warnings.some((w) => w.includes("slippage below default"))).toBe(true);
  });

  it("warns when recipient differs from swapper", () => {
    const result = prepareSpotOrder(
      baseParams({
        outputRecipient: "0xBBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB",
      })
    );
    expect(result.warnings).toContain("recipient differs from swapper");
  });

  it("respects explicit deadline", () => {
    const deadline = FAKE_NOW_S + 999;
    const result = prepareSpotOrder(baseParams({ deadline }));

    expect(result.meta.deadline).toBe(deadline);
    expect(result.typedData.message.deadline).toBe(String(deadline));
  });

  it("respects explicit nonce", () => {
    const result = prepareSpotOrder(baseParams({ nonce: 42 }));

    expect(result.typedData.message.nonce).toBe("42");
    expect(result.typedData.message.witness.nonce).toBe("42");
  });

  it("respects future start time", () => {
    const futureStart = FAKE_NOW_S + 600;
    const result = prepareSpotOrder(baseParams({ start: futureStart }));

    expect(result.typedData.message.witness.start).toBe(String(futureStart));
    expect(result.meta.start).toBe(futureStart);
    // deadline should be based on the future start
    expect(result.meta.deadline).toBe(futureStart + 300);
  });

  it("includes query URL", () => {
    const result = prepareSpotOrder(baseParams());
    expect(result.query.url).toContain("agents-sink");
    expect(result.query.url).toContain("/orders");
  });

  it("uses exact approval amount when exactApproval is true", () => {
    const result = prepareSpotOrder({ ...baseParams(), exactApproval: true });
    expect(result.approval.exactApproval).toBe(true);
    // exact approval data should NOT contain MaxUint256
    expect(result.approval.tx.data).not.toContain(
      "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"
    );
  });

  it("uses unlimited approval by default", () => {
    const result = prepareSpotOrder(baseParams());
    expect(result.approval.exactApproval).toBe(false);
    // approval data should contain MaxUint256
    expect(result.approval.tx.data).toContain(
      "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"
    );
  });
});
