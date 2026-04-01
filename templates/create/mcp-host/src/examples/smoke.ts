import { startServer } from "web3agent/mcp";
import { createRuntime } from "web3agent/runtime";

process.stdout.write(
  `${JSON.stringify(
    {
      createRuntime: typeof createRuntime,
      startServer: typeof startServer,
    },
    null,
    2
  )}\n`
);
