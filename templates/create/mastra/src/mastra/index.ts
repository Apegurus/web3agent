import { Mastra } from "@mastra/core";
import { web3Agent } from "./agents/web3-agent.js";

export const mastra = new Mastra({
  agents: {
    web3Agent,
  },
});
