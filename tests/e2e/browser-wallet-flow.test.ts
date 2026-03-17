import { describe, expect, it } from "vitest";

const requiredEnv = [
  "BROWSER_WALLET_E2E",
  "BROWSER_WALLET_E2E_CHAIN_ID",
  "BROWSER_WALLET_E2E_ACCOUNT",
  "BROWSER_WALLET_E2E_FROM_TOKEN",
  "BROWSER_WALLET_E2E_TO_TOKEN",
  "BROWSER_WALLET_E2E_IN_AMOUNT",
  "BROWSER_WALLET_E2E_SIGNATURE",
].every((name) => Boolean(process.env[name]));

const runIf = requiredEnv ? it : it.skip;

describe("browser wallet flow (env gated)", () => {
  runIf("prepares, simulates, and submits a signed swap on Base Sepolia", async () => {
    const { prepareSwapIntent, simulateTransaction, submitSignedSwap } = await import(
      "../../src/index.js"
    );
    const chainId = Number(process.env.BROWSER_WALLET_E2E_CHAIN_ID);
    const account = process.env.BROWSER_WALLET_E2E_ACCOUNT as string;
    const fromToken = process.env.BROWSER_WALLET_E2E_FROM_TOKEN as string;
    const toToken = process.env.BROWSER_WALLET_E2E_TO_TOKEN as string;
    const fromAmount = process.env.BROWSER_WALLET_E2E_IN_AMOUNT as string;
    const signature = process.env.BROWSER_WALLET_E2E_SIGNATURE as string;

    const intent = await prepareSwapIntent({
      chainId,
      fromToken,
      toToken,
      fromAmount,
      account,
    });

    expect(intent.eip712.primaryType).toBeTruthy();

    const firstStep = intent.requiredApprovals[0];
    if (firstStep?.tx.data) {
      const simulation = await simulateTransaction({
        chainId,
        from: account,
        to: firstStep.tx.to,
        data: firstStep.tx.data,
        ...(firstStep.tx.value ? { value: firstStep.tx.value } : {}),
      });
      expect(simulation.success).toBe(true);
    }

    const submission = await submitSignedSwap({
      chainId,
      quote: intent.quote,
      signature,
    });

    expect(submission.status).toMatch(/submitted|completed/);
  });
});
