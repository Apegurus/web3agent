import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";

import { createLogRequestScopeResolver } from "./log-request-bounds.mjs";

const ALLOWED_PATHS = [
  /^(?:CHANGELOG|README|WEB3_CONTEXT|package|pnpm-lock|tsup\.config)\.(?:md|json|yaml|ts)$/,
  /^vitest\.config\.ts$/,
  /^server\.json$/,
  /^smithery\.yaml$/,
  /^docs\/architecture\/(?:browser-wallet-operations|uniswap-v4)\.md$/,
  /^examples\/uniswap-v4\.mjs$/,
  /^examples\/agent-playground\/\.env\.example$/,
  /^mcpb\/(?:README\.md|manifest\.json|server\/web3agent\.mjs)$/,
  /^scripts\/uniswap-v4\/.+\.mjs$/,
  /^scripts\/(?:verify-uniswap-v4-evidence|qa-uniswap-v4)\.mjs$/,
  /^src\/(?:api|chains|config|operations|runtime|tokens|tools|types|uniswap-v4|zerox)\//,
  /^src\/utils\/(?:canonical-json|errors)\.ts$/,
  /^src\/(?:index|lifi\/(?:config|route-authority|route-execution))\.ts$/,
  /^src\/wallet\/(?:audit|confirmation|confirmation-persistence|confirmation-restore|execution-metadata)\.ts$/,
  /^tests\/(?:api|chains|config|examples|operations|orbs|tools|uniswap-v4|wallet|zerox)\//,
  /^tests\/scripts\/verify-uniswap-v4-evidence\.test\.ts$/,
  /^tests\/global-setup\.ts$/,
  /^tests\/(?:e2e\/(?:cli-parity|create-web3agent-bin-symlink|host-matrix|packaging)|lifi\/(?:config|route-execution|slippage)|utils\/(?:canonical-json|errors))\.test\.ts$/,
  /^templates\/create\/(?:mastra|mcp-host|vercel-ai-sdk)\/\.env\.example$/,
  /^\.omo\/evidence\/robinhood-uniswap-v4\/implementation\/(?:task-20|f[1-4])-.*\.(?:txt|json|md)$/,
  /^task-(?:16|17|18|19)-adversarial-verify\.txt$/,
];
const FORBIDDEN_DEPENDENCIES = [
  "@uniswap/universal-router-sdk",
  "@uniswap/universal-router",
  "ethers",
];
const SCOPE_VIOLATION_KEYS = [
  "forbiddenDependencies",
  "forbiddenFeatures",
  "missingScopeEvidence",
  "publicExportRemovals",
  "unboundedLogQueries",
  "unexpectedChangedPaths",
  "walletBackendChanges",
];
function parseImports(path, source) {
  const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
  const imports = [];
  const logs = [];
  const features = [];
  const hasProvenLogBounds = createLogRequestScopeResolver(file);
  function visit(node) {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier))
      imports.push(node.moduleSpecifier.text);
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      if (node.expression.name.text === "getLogs") {
        const argument = node.arguments[0];
        if (!argument || !hasProvenLogBounds(argument, node)) logs.push(path);
      }
    }
    if (
      path.startsWith("src/") &&
      ts.isIdentifier(node) &&
      ["UniversalRouter", "ethers"].includes(node.text)
    )
      features.push(node.text);
    ts.forEachChild(node, visit);
  }
  visit(file);
  return { features, imports, logs };
}

function exportedNames(source) {
  const file = ts.createSourceFile("index.ts", source, ts.ScriptTarget.Latest, true);
  const names = new Set();
  for (const statement of file.statements) {
    if (
      ts.isExportDeclaration(statement) &&
      statement.exportClause &&
      ts.isNamedExports(statement.exportClause)
    ) {
      for (const item of statement.exportClause.elements) names.add(item.name.text);
    }
    if (
      ts.isFunctionDeclaration(statement) ||
      ts.isClassDeclaration(statement) ||
      ts.isVariableStatement(statement)
    ) {
      const modifiers = ts.getModifiers(statement) ?? [];
      if (modifiers.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)) {
        if ("name" in statement && statement.name) names.add(statement.name.text);
      }
    }
  }
  return names;
}

export function inspectScope({
  changedPaths,
  files,
  packageMetadata,
  baseExports,
  headExports,
  headExportSnapshots = [headExports],
  requiredScopeEvidence = [],
  scopeEvidencePaths = [],
}) {
  const imports = files.flatMap(({ path, source }) => parseImports(path, source).imports);
  const parsed = files.map(({ path, source }) => ({ path, ...parseImports(path, source) }));
  const packageSnapshots = Array.isArray(packageMetadata) ? packageMetadata : [packageMetadata];
  const dependencies = [
    ...packageSnapshots.flatMap((metadata) => Object.keys(metadata.dependencies ?? {})),
    ...imports,
  ];
  return {
    changedPaths,
    forbiddenDependencies: dependencies.filter((value) => FORBIDDEN_DEPENDENCIES.includes(value)),
    forbiddenFeatures: parsed.flatMap((item) =>
      item.features.map((feature) => `${item.path}:${feature}`)
    ),
    missingScopeEvidence: requiredScopeEvidence.filter(
      (path) => !scopeEvidencePaths.includes(path)
    ),
    publicExportRemovals: [...baseExports].filter((item) =>
      headExportSnapshots.some((snapshot) => !snapshot.has(item))
    ),
    unboundedLogQueries: parsed.flatMap((item) => item.logs),
    unexpectedChangedPaths: changedPaths.filter(
      (path) => !ALLOWED_PATHS.some((allowed) => allowed.test(path))
    ),
    walletBackendChanges: changedPaths.filter((path) =>
      /src\/wallet\/(?:backend-selector|persistence)\.ts$/.test(path)
    ),
  };
}

function command(cwd, args) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).split("\n").filter(Boolean);
}

function indexSource(cwd, path) {
  return execFileSync("git", ["show", `:${path}`], { cwd, encoding: "utf8" });
}

function revisionSource(cwd, revision, path) {
  return execFileSync("git", ["show", `${revision}:${path}`], { cwd, encoding: "utf8" });
}

function readIndexSource(cwd, path) {
  try {
    return indexSource(cwd, path);
  } catch {
    return undefined;
  }
}

export function inspectGitScope({ base, cwd, head, requireScopeEvidence = true }) {
  if (base.startsWith("-") || head.startsWith("-"))
    throw new Error("Git refs cannot start with '-'");
  const currentHead = execFileSync("git", ["rev-parse", "HEAD"], { cwd, encoding: "utf8" }).trim();
  const targetBase = execFileSync("git", ["rev-parse", base], { cwd, encoding: "utf8" }).trim();
  const targetHead = execFileSync("git", ["rev-parse", head], { cwd, encoding: "utf8" }).trim();
  const includeWorkspace = currentHead === targetHead;
  const committed = command(cwd, ["diff", "--name-only", `${base}...${head}`, "--"]);
  const staged = includeWorkspace ? command(cwd, ["diff", "--cached", "--name-only"]) : [];
  const modified = includeWorkspace ? command(cwd, ["diff", "--name-only"]) : [];
  const untracked = includeWorkspace
    ? command(cwd, ["ls-files", "--others", "--exclude-standard"])
    : [];
  const changedPaths = [...new Set([...committed, ...staged, ...modified, ...untracked])]
    .filter((path) => !path.startsWith(".omo/"))
    .sort();
  const currentFiles = changedPaths
    .filter((path) => /\.(?:[cm]?ts|mjs|js)$/.test(path))
    .flatMap((path) => {
      if (includeWorkspace && existsSync(resolve(cwd, path))) {
        return [{ path, source: readFileSync(resolve(cwd, path), "utf8") }];
      }
      try {
        return [{ path, source: revisionSource(cwd, head, path) }];
      } catch {
        return [];
      }
    });
  const stagedFiles = staged
    .filter((path) => /\.(?:[cm]?ts|mjs|js)$/.test(path))
    .flatMap((path) => {
      const source = readIndexSource(cwd, path);
      return source === undefined ? [] : [{ path, source }];
    });
  const workspacePackage = JSON.parse(
    includeWorkspace
      ? readFileSync(resolve(cwd, "package.json"), "utf8")
      : revisionSource(cwd, head, "package.json")
  );
  const stagedPackage = staged.includes("package.json")
    ? readIndexSource(cwd, "package.json")
    : undefined;
  const packageMetadata = [
    workspacePackage,
    ...(stagedPackage === undefined ? [] : [JSON.parse(stagedPackage)]),
  ];
  const baseIndex = execFileSync("git", ["show", `${base}:src/index.ts`], {
    cwd,
    encoding: "utf8",
  });
  const headIndex = includeWorkspace
    ? readFileSync(resolve(cwd, "src/index.ts"), "utf8")
    : revisionSource(cwd, head, "src/index.ts");
  const stagedIndex = staged.includes("src/index.ts")
    ? readIndexSource(cwd, "src/index.ts")
    : undefined;
  const scopeEvidencePaths = [
    "task-20-quality-gates.txt",
    "task-20-packed-consumer.txt",
    "task-20-package-contents.txt",
  ].filter((file) =>
    existsSync(resolve(cwd, ".omo/evidence/robinhood-uniswap-v4/implementation", file))
  );
  return {
    base: targetBase,
    head: targetHead,
    ...inspectScope({
      baseExports: exportedNames(baseIndex),
      changedPaths,
      files: [...currentFiles, ...stagedFiles],
      headExports: exportedNames(headIndex),
      headExportSnapshots: [
        exportedNames(headIndex),
        ...(stagedIndex === undefined ? [] : [exportedNames(stagedIndex)]),
      ],
      packageMetadata,
      requiredScopeEvidence: requireScopeEvidence
        ? [
            "task-20-quality-gates.txt",
            "task-20-packed-consumer.txt",
            "task-20-package-contents.txt",
          ]
        : [],
      scopeEvidencePaths,
    }),
  };
}

export function scopeGuardViolations(report) {
  return SCOPE_VIOLATION_KEYS.flatMap((key) => {
    const values = report[key] ?? [];
    return values.length === 0 ? [] : [`${key}: ${JSON.stringify(values)}`];
  });
}

export function requirePassingScope(report) {
  const failures = scopeGuardViolations(report);
  if (failures.length > 0) throw new Error(`Scope validation failed: ${failures.join(", ")}`);
}
