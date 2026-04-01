const config = {
  web3agent: {
    type: "stdio",
    command: "npm",
    args: ["run", "dev"],
  },
};

process.stdout.write(`${JSON.stringify(config, null, 2)}\n`);
