import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { inspectEvidence, requirePassingEvidence } from "./uniswap-v4/evidence-core.mjs";
import { requireSafeReport, runPackedFixture } from "./uniswap-v4/fixture-core.mjs";

function option(name, fallback) {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : (process.argv[index + 1] ?? fallback);
}

function expectFailure(action, label) {
  try {
    action();
  } catch {
    return;
  }
  throw new Error(`Self-test did not reject ${label}`);
}

function runSelfTest() {
  const root = mkdtempSync(join(tmpdir(), "web3agent-fixture-self-test-"));
  try {
    const plan = join(root, "plan.md");
    const evidence = join(root, "evidence");
    mkdirSync(evidence);
    writeFileSync(plan, "- [x] 1. one\n- [ ] 20. twenty\n- [ ] F1. final\n");
    expectFailure(
      () => requirePassingEvidence(inspectEvidence({ evidencePath: evidence, planPath: plan })),
      "missing evidence"
    );
    writeFileSync(join(evidence, "task-1-command.txt"), "exit 0\n");
    writeFileSync(join(evidence, "task-20-command.txt"), "exit 0\n");
    utimesSync(join(evidence, "task-20-command.txt"), new Date(0), new Date(0));
    expectFailure(
      () => requirePassingEvidence(inspectEvidence({ evidencePath: evidence, planPath: plan })),
      "stale evidence"
    );
    expectFailure(
      () => requireSafeReport({ stdoutProtocolViolations: [], walletSubmissions: 1 }),
      "wallet submission"
    );
    expectFailure(
      () =>
        requireSafeReport({
          observed: { cliCalls: [], sdkCalls: [], swapCalls: [] },
          stdoutProtocolViolations: [],
          walletSubmissions: 0,
        }),
      "a packed report with no observed package flows"
    );
    process.stdout.write(`${JSON.stringify({ ok: true, selfTest: "fixture-safety" })}\n`);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
}

if (process.argv.includes("--self-test")) {
  runSelfTest();
} else {
  const report = runPackedFixture({
    fixture: option("--fixture", "tests/uniswap-v4/fixtures/robinhood-v4.json"),
    root: process.cwd(),
  });
  const json = option("--json", "");
  const payload = `${JSON.stringify(report, null, 2)}\n`;
  if (json) writeFileSync(resolve(json), payload);
  process.stdout.write(payload);
}
