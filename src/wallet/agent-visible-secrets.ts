const ENV_VAR = "WEB3AGENT_ALLOW_AGENT_VISIBLE_SECRETS";

export function isAgentVisibleSecretsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env[ENV_VAR] === "1";
}

export function getAgentVisibleSecretsDisabledMessage(): string {
  return `Exposing wallet secrets to an AI agent's inference context is disabled by default. Set ${ENV_VAR}=1 to allow secrets to be returned in API responses visible to the agent.`;
}
