import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";

import { runConsumerFixture } from "./fixture-consumer.mjs";
import { writeFixturePreload } from "./fixture-stubs.mjs";
import { V4_TOOLS, V4_WRITE_TOOLS } from "./fixture-tools.mjs";

export { V4_TOOLS } from "./fixture-tools.mjs";

function run(command, args, cwd, environment = {}) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...environment },
  });
  if (result.status !== 0)
    throw new Error(`${command} ${args.join(" ")} failed:\n${result.stdout}\n${result.stderr}`);
  return { stderr: result.stderr, stdout: result.stdout };
}

function resolveFixture(root, requested) {
  const path = resolve(root, requested);
  if (existsSync(path)) return path;
  if (basename(path) === "robinhood.json")
    return resolve(root, "tests/uniswap-v4/fixtures/robinhood-v4.json");
  throw new Error(`Fixture does not exist: ${requested}`);
}

function pack(root, output) {
  run("pnpm", ["run", "build:package"], root);
  run("pnpm", ["pack", "--pack-destination", output], root);
  const name = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).name;
  const files = execFileSync(
    "node",
    [
      "-e",
      "process.stdout.write(require('node:fs').readdirSync(process.argv[1]).join('\\n'))",
      output,
    ],
    { encoding: "utf8" }
  );
  const tarball = files
    .split("\n")
    .find((file) => file.startsWith(`${name}-`) && file.endsWith(".tgz"));
  if (!tarball) throw new Error("pnpm pack did not create a package tarball");
  return join(output, tarball);
}

function installConsumer(root, tarball) {
  const consumer = join(root, "consumer");
  mkdirSync(consumer);
  writeFileSync(
    join(consumer, "package.json"),
    JSON.stringify({ name: "v4-fixture-consumer", private: true, type: "module" })
  );
  run("npm", ["install", "--ignore-scripts", tarball], consumer, {
    npm_config_cache: join(root, "npm-cache"),
  });
  return consumer;
}

function assertTarball(tarball) {
  const contents = execFileSync("tar", ["-tzf", tarball], { encoding: "utf8" }).split("\n");
  const required = [
    "package/dist/runtime/index.js",
    "package/examples/uniswap-v4.mjs",
    "package/docs/architecture/uniswap-v4.md",
  ];
  const missing = required.filter((path) => !contents.includes(path));
  const excluded = contents.filter((path) => /(?:^package\/\.omo\/|\.env$|secret)/i.test(path));
  if (missing.length > 0 || excluded.length > 0)
    throw new Error(`Tarball content violation: missing=${missing} excluded=${excluded}`);
  return { excluded, fileCount: contents.filter(Boolean).length, missing };
}

function hash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function resultFor(observed, tool) {
  const call = observed.cliCalls.find((candidate) => candidate.tool === tool);
  if (!call?.payload?.data) throw new Error(`Missing observed ${tool} output`);
  return call.payload.data;
}

export function requireSafeReport(report) {
  if (report.walletSubmissions !== 0)
    throw new Error(`Expected zero wallet submissions, received ${report.walletSubmissions}`);
  if (report.stdoutProtocolViolations.length > 0) throw new Error("CLI stdout protocol violation");
  if (report.observed.rpcCalls < 1)
    throw new Error("Packed fixture did not observe RPC-backed package code");
  if (report.observed.sdkCalls.length < 9 || !report.observed.simulationSucceeded)
    throw new Error(
      "Packed fixture did not exercise root SDK reads, simulation, and prepared flows"
    );
  if (report.swapProviders.join(",") !== "0x,lifi")
    throw new Error("Packed fixture did not observe 0x success and LI.FI fallback");
  if (Object.values(report.writes).some((status) => status !== "pending_confirmation"))
    throw new Error("Packed fixture write escaped confirmation gating");
}

export function runPackedFixture({ fixture: requestedFixture, root }) {
  const fixturePath = resolveFixture(root, requestedFixture);
  const temp = mkdtempSync(join(tmpdir(), "web3agent-v4-consumer-"));
  try {
    const tarball = pack(root, temp);
    const consumer = installConsumer(temp, tarball);
    const consumerFixture = join(temp, "fixture.json");
    const counterPath = join(temp, "wallet-counter.json");
    writeFileSync(consumerFixture, readFileSync(fixturePath));
    writeFileSync(counterPath, JSON.stringify({ rpcCalls: 0, walletSubmissions: 0 }));
    const observed = runConsumerFixture({
      consumer,
      counterPath,
      fixturePath: consumerFixture,
      preloadPath: writeFixturePreload(temp),
    });
    const writes = Object.fromEntries(
      observed.cliCalls
        .filter((call) => V4_WRITE_TOOLS.has(call.tool))
        .map((call) => [call.tool, resultFor(observed, call.tool).status])
    );
    const report = {
      cliTools: observed.cliCalls.map((call) => call.tool),
      fixtureHashes: {
        calculation: hash(resultFor(observed, "uniswap_v4_calculate_position")),
        pool: hash(resultFor(observed, "uniswap_v4_get_pool")),
        position: hash(resultFor(observed, "uniswap_v4_get_position")),
        quote: hash(observed.sdk.swaps.zeroEx),
      },
      fixturePath: fixturePath.replace(`${root}/`, ""),
      observed: {
        rpcCalls: observed.counter.rpcCalls ?? 0,
        sdkCalls: observed.sdk.sdkCalls,
        simulationSucceeded: observed.sdk.simulation.success,
        simulationStages: resultFor(observed, "uniswap_v4_simulate_operation").stages.map(
          (stage) => stage.status
        ),
      },
      packageContents: assertTarball(tarball),
      sdkExports: observed.sdk.sdkCalls,
      stdoutProtocolViolations: observed.stdoutProtocolViolations,
      swapProviders: [
        observed.sdk.swaps.zeroEx.meta.provider,
        observed.sdk.swaps.lifi.meta.provider,
      ],
      walletSubmissions: observed.counter.walletSubmissions ?? 0,
      writes,
    };
    requireSafeReport(report);
    return report;
  } finally {
    rmSync(temp, { force: true, recursive: true });
  }
}
