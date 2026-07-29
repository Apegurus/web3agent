import { inspectScope, requirePassingScope } from "./scope-audit.mjs";

const PATH = "src/uniswap-v4/scope-fixture.ts";
const SCOPE_INPUT = {
  baseExports: new Set(),
  changedPaths: [PATH],
  headExports: new Set(),
  packageMetadata: {},
};

function scopeReport(source) {
  return inspectScope({ ...SCOPE_INPUT, files: [{ path: PATH, source }] });
}

function expectFailure(label, source) {
  try {
    requirePassingScope(scopeReport(source));
  } catch {
    return;
  }
  throw new Error(`Scope AST self-test did not reject ${label}`);
}

function expectPass(label, source) {
  try {
    requirePassingScope(scopeReport(source));
  } catch (error) {
    throw new Error(
      `Scope AST self-test rejected ${label}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

export function runScopeAstSelfTest() {
  for (const [label, source] of [
    ["unbounded identifier", "const request = { address }; client.getLogs(request);"],
    [
      "unbounded const alias",
      "const base = { address }; const request = base; client.getLogs(request);",
    ],
    [
      "spread without both bounds",
      "const base = { address, fromBlock: 1n }; const request = { ...base }; client.getLogs(request);",
    ],
    ["dynamic initializer", "const request = buildRequest(); client.getLogs(request);"],
    ["const cycle", "const first = second; const second = first; client.getLogs(first);"],
    [
      "let binding",
      "let request = { address, fromBlock: 1n, toBlock: 2n }; client.getLogs(request);",
    ],
    [
      "mutated binding",
      "let request = { address, fromBlock: 1n, toBlock: 2n }; request = buildRequest(); client.getLogs(request);",
    ],
    [
      "const property mutation",
      "const request = { address, fromBlock: 1n, toBlock: 2n }; request.toBlock = dynamic; client.getLogs(request);",
    ],
    [
      "computed property",
      'const request = { address, ["fromBlock"]: 1n, toBlock: 2n }; client.getLogs(request);',
    ],
    [
      "rest binding",
      "const base = { address, fromBlock: 1n, toBlock: 2n }; const { ...request } = base; client.getLogs(request);",
    ],
    [
      "spread override",
      "const bounds = { address, fromBlock: 1n, toBlock: 2n }; const request = { ...bounds, ...dynamic }; client.getLogs(request);",
    ],
  ])
    expectFailure(label, source);

  for (const [label, source] of [
    ["inline bounds", "client.getLogs({ address, fromBlock: 1n, toBlock: 2n });"],
    [
      "bounded const",
      "const request = { address, fromBlock: 1n, toBlock: 2n }; client.getLogs(request);",
    ],
    [
      "bounded spread",
      "const start = { address, fromBlock: 1n }; const request = { ...start, toBlock: 2n }; client.getLogs(request);",
    ],
  ])
    expectPass(label, source);
}
