import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import type { LanguageModelV1 } from "ai";

const PROVIDERS: Record<
  string,
  { envKey: string; defaultModel: string; create: (id: string) => LanguageModelV1 }
> = {
  anthropic: {
    envKey: "ANTHROPIC_API_KEY",
    defaultModel: "claude-sonnet-4-5",
    create: (id) => anthropic(id),
  },
  openai: {
    envKey: "OPENAI_API_KEY",
    defaultModel: "gpt-5-mini",
    create: (id) => openai(id),
  },
};

export function loadConfig() {
  const providerName = process.env.AI_PROVIDER ?? "anthropic";
  const provider = PROVIDERS[providerName];
  if (!provider) {
    throw new Error(`Unsupported AI_PROVIDER "${providerName}"`);
  }
  if (!process.env[provider.envKey]) {
    throw new Error(`${provider.envKey} is required when AI_PROVIDER="${providerName}"`);
  }

  return {
    provider: providerName,
    model: provider.create(process.env.AI_MODEL ?? provider.defaultModel),
  };
}
