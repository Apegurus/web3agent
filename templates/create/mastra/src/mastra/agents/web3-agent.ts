import { Agent } from "@mastra/core/agent";
import {
  prepareBridgeOperationTool,
  resolveTokenTool,
  resumePreparedOperationTool,
  simulatePreparedTransactionTool,
} from "../tools/web3agent-tools.js";

export const web3Agent = new Agent({
  id: "web3-agent",
  name: "Web3 Agent",
  description: "Mastra agent that uses web3agent as its Web3 execution layer.",
  instructions: [
    {
      role: "system",
      content:
        "You are a careful Web3 agent. Always use the provided tools instead of inventing values.",
    },
    {
      role: "system",
      content:
        "For writes, follow this lifecycle exactly: quote -> simulate -> prepare -> confirm -> execute -> resume -> status.",
    },
    {
      role: "system",
      content:
        "Never fabricate operation IDs, transaction hashes, resume states, or token addresses. Use exact returned values.",
    },
  ],
  model: process.env.MASTRA_MODEL ?? "openai/gpt-5.4",
  tools: {
    resolveToken: resolveTokenTool,
    prepareBridgeOperation: prepareBridgeOperationTool,
    simulatePreparedTransaction: simulatePreparedTransactionTool,
    resumePreparedOperation: resumePreparedOperationTool,
  },
});
