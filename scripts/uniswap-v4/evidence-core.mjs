import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const TASK_PATTERN = /^- \[[ x]\] (\d+)\./gm;
const FINAL_PATTERN = /^- \[[ x]\] (F\d)\./gm;

function listFiles(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? listFiles(path) : [path];
  });
}

function numberedItems(plan, pattern) {
  return [...plan.matchAll(pattern)].map((match) => match[1]);
}

function evidenceForTask(files, task) {
  return files.filter((file) => new RegExp(`task-${task}(?:-|\\.)`).test(file));
}

function commandRecords(files) {
  return files.flatMap((file) => {
    const content = readFileSync(file, "utf8");
    const labeled = content
      .split(/^Command:\s*/m)
      .slice(1)
      .map((record) => {
        return {
          failed: /^(?:Exit|Status):\s*(?:exit\s*)?[1-9]\d*\b/im.test(record),
          file,
          succeeded:
            /^(?:Exit|Status):\s*(?:exit\s*)?0\b/im.test(record) ||
            /^Result:\s*PASS\b/im.test(record),
        };
      });
    if (labeled.length > 0) return labeled;
    const command = /\b(?:git|lsp_diagnostics|node|npx|pnpm|vitest)\b/.test(content);
    const succeeded =
      /(?:=>\s*[^\n]*\bpass(?:ed)?\b|^\s*(?:[-*]\s*)?(?:exit\s+0\b|PASS\b)|Result:\s*(?:PASS\b|[^\n]*\bpass(?:ed)?\b|exit\s+0\b)|\b(?:PASS|passed)\b)/im.test(
        content
      );
    return command && succeeded ? [{ failed: false, file, succeeded: true }] : [];
  });
}

function inspectTaskEvidence(files, task) {
  const artifacts = evidenceForTask(files, task);
  const records = commandRecords(artifacts);
  const content = artifacts.map((file) => readFileSync(file, "utf8")).join("\n");
  return {
    artifacts: artifacts.map((file) => file.split("/").at(-1)),
    assertionKeyPresent:
      /\b(?:assert(?:ion|ions)?|acceptance criteria|coverage|facts|verified)\b/i.test(content),
    failedCommandFiles: records.filter((record) => record.failed).map((record) => record.file),
    successfulCommandFiles: records
      .filter((record) => record.succeeded)
      .map((record) => record.file),
    task,
  };
}

export function inspectEvidence({ planPath, evidencePath, phase = "current" }) {
  const plan = readFileSync(planPath, "utf8");
  const files = listFiles(evidencePath);
  const planMtime = statSync(planPath).mtimeMs;
  const planTasks = numberedItems(plan, TASK_PATTERN);
  const finalVerifiers = numberedItems(plan, FINAL_PATTERN);
  const hasTask20 = evidenceForTask(files, "20").length > 0;
  const requiredTasks =
    phase === "final"
      ? Array.from({ length: 20 }, (_, index) => String(index + 1))
      : hasTask20
        ? planTasks
        : planTasks.filter((task) => task !== "20");
  const taskEvidence = requiredTasks.map((task) => inspectTaskEvidence(files, task));
  const missingEvidence = taskEvidence
    .filter((evidence) => evidence.artifacts.length === 0)
    .map((evidence) => `task-${evidence.task}`);
  const staleEvidence = evidenceForTask(files, "20")
    .filter((file) => statSync(file).mtimeMs < planMtime)
    .map((file) => file.replace(`${evidencePath}/`, ""));
  const failedCommands = taskEvidence.flatMap((evidence) => [
    ...evidence.failedCommandFiles.map(
      (file) => `task-${evidence.task} records a nonzero exit in ${file}`
    ),
    ...(evidence.successfulCommandFiles.length === 0
      ? [`task-${evidence.task} lacks an independently recorded successful command`]
      : []),
  ]);
  const missingFinalEvidence =
    phase === "final"
      ? finalVerifiers.filter(
          (verifier) => !files.some((file) => file.includes(`${verifier.toLowerCase()}-`))
        )
      : [];

  return {
    failedCommands,
    finalVerifiers: finalVerifiers.length,
    implementationTasks: requiredTasks.length,
    missingEvidence: [...missingEvidence, ...missingFinalEvidence],
    scopeGuardViolations: [],
    staleEvidence,
    taskEvidence,
    unmetAcceptance: taskEvidence
      .filter((evidence) => !evidence.assertionKeyPresent)
      .map((evidence) => `task-${evidence.task} lacks assertion evidence`),
  };
}

export function requirePassingEvidence(report) {
  const failures = [
    ...report.missingEvidence,
    ...report.staleEvidence,
    ...report.failedCommands,
    ...report.unmetAcceptance,
  ];
  if (failures.length > 0) throw new Error(`Evidence validation failed: ${failures.join(", ")}`);
}
