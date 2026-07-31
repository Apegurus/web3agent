import { execFileSync, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

const script = resolve("scripts/verify-uniswap-v4-evidence.mjs");
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

describe("verify-uniswap-v4-evidence", () => {
  it("Given missing audit inputs, when evidence mode runs, then it fails instead of self-testing", async () => {
    const root = await temporaryRoot("missing");
    const result = spawnSync(process.execPath, [script], { cwd: root, encoding: "utf8" });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Evidence audit plan is missing");
    expect(result.stdout).not.toContain('"selfTest"');
  });

  it("Given an explicit self-test flag, when the verifier runs, then self-test remains available", async () => {
    const root = await temporaryRoot("self-test");
    const result = spawnSync(process.execPath, [script, "--self-test"], {
      cwd: root,
      encoding: "utf8",
    });

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('"selfTest":"evidence-and-scope"');
  });

  it("Given equals-form scope mode, when the verifier runs, then it executes the scope audit", async () => {
    const root = await temporaryRoot("scope");
    await mkdir(join(root, "src"));
    await writeFile(join(root, "package.json"), JSON.stringify({ name: "scope-fixture" }));
    await writeFile(join(root, "src", "index.ts"), "export const value = true;\n");
    const evidence = join(root, ".omo", "evidence", "robinhood-uniswap-v4", "implementation");
    await mkdir(evidence, { recursive: true });
    await Promise.all(
      [
        "task-20-quality-gates.txt",
        "task-20-packed-consumer.txt",
        "task-20-package-contents.txt",
      ].map((name) => writeFile(join(evidence, name), "fixture\n"))
    );
    git(root, ["init", "--quiet"]);
    git(root, ["config", "user.email", "scope@example.test"]);
    git(root, ["config", "user.name", "Scope Fixture"]);
    git(root, ["add", "."]);
    git(root, ["commit", "--quiet", "-m", "base"]);

    const result = spawnSync(
      process.execPath,
      [script, "--mode=scope", "--base", "HEAD", "--head", "HEAD"],
      { cwd: root, encoding: "utf8" }
    );

    expect(result.status, result.stderr).toBe(0);
    const report = JSON.parse(result.stdout) as {
      base: string;
      changedPaths: string[];
      head: string;
    };
    expect(report.base).toMatch(/^[a-f0-9]{40}$/);
    expect(report.head).toBe(report.base);
    expect(report.changedPaths).toEqual([]);
  });

  it("Given final evidence for an explicit PR slice, when evidence mode runs, then the report binds the audited commits and phase", async () => {
    const root = await createEvidenceRepository();
    const revision = gitOutput(root, ["rev-parse", "HEAD"]);

    const result = spawnSync(
      process.execPath,
      [
        script,
        "--phase=final",
        "--base",
        revision,
        "--head",
        revision,
        "--plan",
        "plan.md",
        "--evidence",
        "evidence",
      ],
      { cwd: root, encoding: "utf8" }
    );

    expect(result.status, result.stderr).toBe(0);
    const report = JSON.parse(result.stdout) as {
      base: string;
      changedPaths: string[];
      head: string;
      phase: string;
      scopeGuardViolations: string[];
    };
    expect(report).toMatchObject({
      base: revision,
      changedPaths: [],
      head: revision,
      phase: "final",
      scopeGuardViolations: [],
    });
  });

  it.each([
    ["unknown mode", ["--mode=bogus"]],
    ["unknown phase", ["--phase=bogus"]],
    ["misspelled option", ["--evidnce", "/definitely/missing"]],
    ["missing option value", ["--mode", "--base", "HEAD", "--head", "HEAD"]],
    ["duplicate option", ["--mode=scope", "--mode=scope"]],
    ["option-shaped git ref", ["--mode=scope", "--base=-R"]],
  ])("Given %s, when the verifier runs, then it rejects the invocation", (_name, args) => {
    const result = spawnSync(process.execPath, [script, ...args], {
      cwd: process.cwd(),
      encoding: "utf8",
    });

    expect(result.status, result.stdout).not.toBe(0);
  });

  it("Given a non-checked-out target revision with a forbidden import, when scope mode runs, then it audits target content", async () => {
    const root = await createScopeRepository();
    const base = gitOutput(root, ["rev-parse", "HEAD"]);
    await mkdir(join(root, "src", "uniswap-v4"));
    await writeFile(join(root, "src", "uniswap-v4", "unsafe.ts"), 'import "ethers";\n');
    git(root, ["add", "."]);
    git(root, ["commit", "--quiet", "-m", "unsafe target"]);
    const target = gitOutput(root, ["rev-parse", "HEAD"]);
    git(root, ["checkout", "--quiet", base]);

    const result = spawnSync(
      process.execPath,
      [script, "--mode=scope", "--base", base, "--head", target],
      { cwd: root, encoding: "utf8" }
    );

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("forbiddenDependencies");
  });
});

async function temporaryRoot(name: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), `web3agent-evidence-${name}-`));
  roots.push(root);
  return root;
}

function git(cwd: string, args: readonly string[]): void {
  execFileSync("git", args, { cwd, stdio: "ignore" });
}

function gitOutput(cwd: string, args: readonly string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

async function createScopeRepository(): Promise<string> {
  const root = await temporaryRoot("target");
  await mkdir(join(root, "src"));
  await writeFile(join(root, "package.json"), JSON.stringify({ name: "scope-target" }));
  await writeFile(join(root, "src", "index.ts"), "export const value = true;\n");
  const evidence = join(root, ".omo", "evidence", "robinhood-uniswap-v4", "implementation");
  await mkdir(evidence, { recursive: true });
  await Promise.all(
    [
      "task-20-quality-gates.txt",
      "task-20-packed-consumer.txt",
      "task-20-package-contents.txt",
    ].map((name) => writeFile(join(evidence, name), "fixture\n"))
  );
  git(root, ["init", "--quiet"]);
  git(root, ["config", "user.email", "scope@example.test"]);
  git(root, ["config", "user.name", "Scope Fixture"]);
  git(root, ["add", "."]);
  git(root, ["commit", "--quiet", "-m", "base"]);
  return root;
}

async function createEvidenceRepository(): Promise<string> {
  const root = await temporaryRoot("final");
  const evidence = join(root, "evidence");
  const scopeEvidence = join(root, ".omo", "evidence", "robinhood-uniswap-v4", "implementation");
  await mkdir(join(root, "src"));
  await mkdir(evidence);
  await mkdir(scopeEvidence, { recursive: true });
  await writeFile(join(root, "package.json"), JSON.stringify({ name: "evidence-target" }));
  await writeFile(join(root, "src", "index.ts"), "export const value = true;\n");
  await writeFile(
    join(root, "plan.md"),
    [
      ...Array.from({ length: 20 }, (_, index) => `- [x] ${index + 1}. task`),
      ...Array.from({ length: 4 }, (_, index) => `- [x] F${index + 1}. verifier`),
    ].join("\n")
  );
  await Promise.all([
    ...Array.from({ length: 20 }, (_, index) =>
      writeFile(
        join(evidence, `task-${index + 1}-command.txt`),
        `Command: task ${index + 1}\nExit: 0\nAssertions: verified\n`
      )
    ),
    ...Array.from({ length: 4 }, (_, index) =>
      writeFile(
        join(evidence, `f${index + 1}-verifier.txt`),
        "Result: PASS\nAssertions: verified\n"
      )
    ),
    ...[
      "task-20-quality-gates.txt",
      "task-20-packed-consumer.txt",
      "task-20-package-contents.txt",
    ].map((name) => writeFile(join(scopeEvidence, name), "fixture\n")),
  ]);
  git(root, ["init", "--quiet"]);
  git(root, ["config", "user.email", "evidence@example.test"]);
  git(root, ["config", "user.name", "Evidence Fixture"]);
  git(root, ["add", "."]);
  git(root, ["commit", "--quiet", "-m", "evidence"]);
  return root;
}
