import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { inspectEvidence, requirePassingEvidence } from "./uniswap-v4/evidence-core.mjs";
import { runScopeAstSelfTest } from "./uniswap-v4/scope-audit-self-test.mjs";
import { inspectGitScope, inspectScope, requirePassingScope } from "./uniswap-v4/scope-audit.mjs";

function option(name, fallback) {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : (process.argv[index + 1] ?? fallback);
}

function writeReport(path, report) {
  const payload = `${JSON.stringify(report, null, 2)}\n`;
  if (path) writeFileSync(resolve(path), payload);
  process.stdout.write(payload);
}

function expectFailure(action, label) {
  try {
    action();
  } catch {
    return;
  }
  throw new Error(`Self-test did not reject ${label}`);
}

function git(cwd, args) {
  execFileSync("git", args, { cwd, stdio: "ignore" });
}

function createScopeFixture(root) {
  mkdirSync(join(root, "src", "wallet"), { recursive: true });
  writeFileSync(join(root, "package.json"), JSON.stringify({ dependencies: {} }));
  writeFileSync(join(root, "src", "index.ts"), "export const preserved = true;\n");
  git(root, ["init"]);
  git(root, ["config", "user.email", "test@example.test"]);
  git(root, ["config", "user.name", "Test"]);
  git(root, ["add", "."]);
  git(root, ["commit", "-m", "base"]);
}

function runSelfTest() {
  const root = mkdtempSync(join(tmpdir(), "web3agent-evidence-"));
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
    const stale = new Date(0);
    utimesSync(join(evidence, "task-20-command.txt"), stale, stale);
    expectFailure(
      () => requirePassingEvidence(inspectEvidence({ evidencePath: evidence, planPath: plan })),
      "stale evidence"
    );
    writeFileSync(
      join(evidence, "task-1-command.txt"),
      "Command: task one\nExit: 1\nAssertions: task-one\n"
    );
    writeFileSync(
      join(evidence, "task-20-command.txt"),
      "Command: task twenty\nExit: 0\nAssertions: task-twenty\n"
    );
    expectFailure(
      () => requirePassingEvidence(inspectEvidence({ evidencePath: evidence, planPath: plan })),
      "a failed task-one transcript masked by task twenty"
    );
    writeFileSync(join(evidence, "task-1-command.txt"), "Command: task one\nExit: 0\n");
    expectFailure(
      () => requirePassingEvidence(inspectEvidence({ evidencePath: evidence, planPath: plan })),
      "a task transcript without assertion evidence"
    );
    writeFileSync(join(evidence, "task-1-command.txt"), "exit 1\n");
    writeFileSync(join(evidence, "task-20-command.txt"), "exit 0\n");
    expectFailure(
      () => requirePassingEvidence(inspectEvidence({ evidencePath: evidence, planPath: plan })),
      "failed task one masked by task twenty"
    );
    const base = new Set(["preserved"]);
    const clean = {
      changedPaths: ["src/uniswap-v4/a.ts"],
      files: [],
      packageMetadata: {},
      baseExports: base,
      headExports: base,
    };
    const cases = [
      ["dependency", { ...clean, packageMetadata: { dependencies: { ethers: "1" } } }],
      ["feature", { ...clean, files: [{ path: "src/a.ts", source: "const x = ethers;" }] }],
      ["export", { ...clean, headExports: new Set() }],
      ["wallet", { ...clean, changedPaths: ["src/wallet/persistence.ts"] }],
      ["logs", { ...clean, files: [{ path: "src/a.ts", source: "client.getLogs({ address });" }] }],
      ["path", { ...clean, changedPaths: ["unrelated.txt"] }],
    ];
    for (const [label, input] of cases)
      expectFailure(() => requirePassingScope(inspectScope(input)), label);
    const scopeRoot = join(root, "scope");
    mkdirSync(scopeRoot);
    createScopeFixture(scopeRoot);
    writeFileSync(
      join(scopeRoot, "src", "wallet", "persistence.ts"),
      "export const changed = true;\n"
    );
    git(scopeRoot, ["add", "src/wallet/persistence.ts"]);
    expectFailure(
      () => requirePassingScope(inspectGitScope({ base: "HEAD", cwd: scopeRoot, head: "HEAD" })),
      "staged wallet backend path"
    );
    git(scopeRoot, ["reset", "--hard", "HEAD"]);
    writeFileSync(
      join(scopeRoot, "src", "index.ts"),
      "import 'ethers';\nexport const preserved = true;\n"
    );
    expectFailure(
      () => requirePassingScope(inspectGitScope({ base: "HEAD", cwd: scopeRoot, head: "HEAD" })),
      "unstaged forbidden dependency"
    );
    git(scopeRoot, ["reset", "--hard", "HEAD"]);
    mkdirSync(join(scopeRoot, "src", "uniswap-v4"));
    writeFileSync(
      join(scopeRoot, "src", "uniswap-v4", "staged-dependency.ts"),
      "import 'ethers';\n"
    );
    git(scopeRoot, ["add", "src/uniswap-v4/staged-dependency.ts"]);
    expectFailure(
      () => requirePassingScope(inspectGitScope({ base: "HEAD", cwd: scopeRoot, head: "HEAD" })),
      "staged forbidden dependency"
    );
    git(scopeRoot, ["reset", "--hard", "HEAD"]);
    writeFileSync(join(scopeRoot, "src", "untracked-feature.ts"), "client.getLogs({ address });\n");
    expectFailure(
      () => requirePassingScope(inspectGitScope({ base: "HEAD", cwd: scopeRoot, head: "HEAD" })),
      "untracked forbidden feature"
    );
    runScopeAstSelfTest();
    process.stdout.write(`${JSON.stringify({ ok: true, selfTest: "evidence-and-scope" })}\n`);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
}

function command(cwd, args) {
  execFileSync("git", args, { cwd, stdio: "ignore" });
}

function withGitFixture(action) {
  const root = mkdtempSync(join(tmpdir(), "web3agent-scope-"));
  try {
    mkdirSync(join(root, "src"), { recursive: true });
    writeFileSync(join(root, "package.json"), JSON.stringify({ name: "scope-fixture" }));
    writeFileSync(join(root, "src", "index.ts"), "export const preserved = true;\n");
    command(root, ["init", "--quiet"]);
    command(root, ["config", "user.email", "scope@example.test"]);
    command(root, ["config", "user.name", "Scope Fixture"]);
    command(root, ["add", "."]);
    command(root, ["commit", "--quiet", "-m", "base"]);
    action(
      root,
      execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim()
    );
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
}

function assertGitScopeFailure(root, base, label) {
  expectFailure(
    () => requirePassingScope(inspectGitScope({ base, cwd: root, head: "HEAD" })),
    label
  );
}

function runScopeSelfTest() {
  runScopeAstSelfTest();
  withGitFixture((root, base) => {
    mkdirSync(join(root, "src", "wallet"));
    writeFileSync(join(root, "src", "wallet", "persistence.ts"), "export const fixture = true;\n");
    command(root, ["add", "src/wallet/persistence.ts"]);
    assertGitScopeFailure(root, base, "a staged wallet backend change");
  });
  withGitFixture((root, base) => {
    writeFileSync(join(root, "package.json"), JSON.stringify({ dependencies: { ethers: "1" } }));
    command(root, ["add", "package.json"]);
    writeFileSync(join(root, "package.json"), JSON.stringify({ name: "scope-fixture" }));
    assertGitScopeFailure(root, base, "a staged forbidden dependency");
  });
  withGitFixture((root, base) => {
    mkdirSync(join(root, "src", "uniswap-v4"));
    writeFileSync(join(root, "src", "uniswap-v4", "unsafe.ts"), 'import "ethers";\n');
    assertGitScopeFailure(root, base, "an unstaged forbidden feature");
  });
  withGitFixture((root, base) => {
    writeFileSync(join(root, "unrelated.txt"), "outside approved scope\n");
    assertGitScopeFailure(root, base, "an untracked unrelated path");
  });
  process.stdout.write(`${JSON.stringify({ ok: true, selfTest: "git-scope-layers" })}\n`);
}

if (process.argv.includes("--self-test-scope")) {
  runScopeSelfTest();
} else if (process.argv.includes("--self-test")) {
  runSelfTest();
} else {
  const mode = option("--mode", "evidence");
  const report =
    mode === "scope"
      ? inspectGitScope({
          base: option("--base", "122f159904d46747abbedd5c0aada4171c6e9c15"),
          cwd: process.cwd(),
          head: option("--head", "HEAD"),
        })
      : inspectEvidence({
          evidencePath: option("--evidence", ".omo/evidence/robinhood-uniswap-v4/implementation"),
          phase: option("--phase", "current"),
          planPath: option("--plan", ".omo/plans/robinhood-uniswap-v4.md"),
        });
  if (mode === "scope") requirePassingScope(report);
  else requirePassingEvidence(report);
  writeReport(option("--json", ""), report);
}
