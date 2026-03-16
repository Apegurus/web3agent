import { anthropic, createAnthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";

type Provider = "anthropic" | "openai" | "kimi";

const DEFAULTS: Record<Provider, { model: string }> = {
  anthropic: { model: "claude-sonnet-4-20250514" },
  openai: { model: "gpt-4o" },
  kimi: { model: "kimi-for-coding" },
};

const kimi = createAnthropic({
  baseURL: "https://api.kimi.com/coding/v1",
  apiKey: process.env.KIMI_API_KEY ?? "",
});

export function loadConfig() {
  const provider = (process.env.AI_PROVIDER ?? "anthropic") as Provider;

  if (!(provider in DEFAULTS)) {
    throw new Error(`Unsupported AI_PROVIDER "${provider}". Use "anthropic", "openai", or "kimi".`);
  }

  const modelId = process.env.AI_MODEL ?? DEFAULTS[provider].model;

  const model =
    provider === "anthropic"
      ? anthropic(modelId)
      : provider === "openai"
        ? openai(modelId)
        : kimi(modelId);

  return { provider, model };
}
