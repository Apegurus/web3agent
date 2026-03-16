import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";

type Provider = "anthropic" | "openai";

const DEFAULTS: Record<Provider, { model: string }> = {
  anthropic: { model: "claude-sonnet-4-20250514" },
  openai: { model: "gpt-4o" },
};

export function loadConfig() {
  const provider = (process.env.AI_PROVIDER ?? "anthropic") as Provider;

  if (!(provider in DEFAULTS)) {
    throw new Error(`Unsupported AI_PROVIDER "${provider}". Use "anthropic" or "openai".`);
  }

  const model =
    provider === "anthropic"
      ? anthropic(process.env.AI_MODEL ?? DEFAULTS.anthropic.model)
      : openai(process.env.AI_MODEL ?? DEFAULTS.openai.model);

  return { provider, model };
}
