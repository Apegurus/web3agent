import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";

import { createLogRequestScopeResolver } from "./log-request-bounds.mjs";

const ALLOWED_PATHS = [
  /^(?:README|WEB3_CONTEXT|package|pnpm-lock|tsup\.config)\.(?:md|json|yaml|ts)$/,
  /^docs\/architecture\/(?:browser-wallet-operations|uniswap-v4)\.md$/,
  /^examples\/uniswap-v4\.mjs$/,
  /^scripts\/uniswap-v4\/.+\.mjs$/,
  /^scripts\/(?:verify-uniswap-v4-evidence|qa-uniswap-v4)\.mjs$/,
  /^src\/(?:api|chains|operations|runtime|tokens|tools|uniswap-v4|zerox)\//,
  /^src\/utils\/errors\.ts$/,
  /^src\/(?:index|lifi\/route-execution)\.ts$/,
  /^src\/wallet\/(?:audit|confirmation|execution-metadata)\.ts$/,
  /^tests\/(?:api|chains|examples|operations|orbs|tools|uniswap-v4|wallet|zerox)\//,
  /^tests\/utils\/errors\.test\.ts$/,
  /^\.omo\/evidence\/robinhood-uniswap-v4\/implementation\/(?:task-20|f[1-4])-.*\.(?:txt|json|md)$/,
  /^task-(?:16|17|18|19)-adversarial-verify\.txt$/,
];
const FORBIDDEN_DEPENDENCIES = [
  "@uniswap/universal-router-sdk",
  "@uniswap/universal-router",
  "ethers",
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

function readIndexSource(cwd, path) {
  try {
    return indexSource(cwd, path);
  } catch {
    return undefined;
  }
}

export function inspectGitScope({ base, cwd, head }) {
  const committed = command(cwd, ["diff", "--name-only", `${base}...${head}`]);
  const staged = command(cwd, ["diff", "--cached", "--name-only"]);
  const modified = command(cwd, ["diff", "--name-only"]);
  const untracked = command(cwd, ["ls-files", "--others", "--exclude-standard"]);
  const changedPaths = [...new Set([...committed, ...staged, ...modified, ...untracked])]
    .filter((path) => !path.startsWith(".omo/"))
    .sort();
  const currentFiles = changedPaths
    .filter((path) => /\.(?:[cm]?ts|mjs|js)$/.test(path) && existsSync(resolve(cwd, path)))
    .map((path) => ({ path, source: readFileSync(resolve(cwd, path), "utf8") }));
  const stagedFiles = staged
    .filter((path) => /\.(?:[cm]?ts|mjs|js)$/.test(path))
    .flatMap((path) => {
      const source = readIndexSource(cwd, path);
      return source === undefined ? [] : [{ path, source }];
    });
  const workspacePackage = JSON.parse(readFileSync(resolve(cwd, "package.json"), "utf8"));
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
  const headIndex = readFileSync(resolve(cwd, "src/index.ts"), "utf8");
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
  return inspectScope({
    baseExports: exportedNames(baseIndex),
    changedPaths,
    files: [...currentFiles, ...stagedFiles],
    headExports: exportedNames(headIndex),
    headExportSnapshots: [
      exportedNames(headIndex),
      ...(stagedIndex === undefined ? [] : [exportedNames(stagedIndex)]),
    ],
    packageMetadata,
    requiredScopeEvidence: [
      "task-20-quality-gates.txt",
      "task-20-packed-consumer.txt",
      "task-20-package-contents.txt",
    ],
    scopeEvidencePaths,
  });
}

export function requirePassingScope(report) {
  const failures = Object.entries(report).filter(([, values]) => values.length > 0);
  if (failures.length > 0)
    throw new Error(`Scope validation failed: ${JSON.stringify(Object.fromEntries(failures))}`);
}
