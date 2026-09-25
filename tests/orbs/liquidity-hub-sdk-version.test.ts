import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as liquidityHubSdk from "@orbs-network/liquidity-hub-sdk";
import { describe, expect, it } from "vitest";

// @orbs-network/liquidity-hub-sdk 1.1.0 replaced `constructSDK` with `createClient`
// in a minor release, so a caret range crashes fresh installs at import time.
// Keep the range on 1.0.x until src/orbs/liquidity-hub.ts is migrated.
describe("@orbs-network/liquidity-hub-sdk dependency range", () => {
  const pkg = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf-8")) as {
    dependencies: Record<string, string>;
  };
  const range = pkg.dependencies["@orbs-network/liquidity-hub-sdk"];

  it("is restricted to the 1.0.x line", () => {
    expect(range).toMatch(/^~?1\.0\.\d+$/);
  });

  it("resolves to a version that exports constructSDK", () => {
    expect(typeof liquidityHubSdk.constructSDK).toBe("function");
  });
});
