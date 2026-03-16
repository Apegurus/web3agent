import { anthropic, createAnthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import type { LanguageModelV1 } from "ai";

const kimi = createAnthropic({
  baseURL: "https://api.kimi.com/coding/v1",
  apiKey: process.env.KIMI_API_KEY ?? "",
});

const providers: Record<string, { defaultModel: string; create: (id: string) => LanguageModelV1 }> =
  {
    anthropic: { defaultModel: "claude-sonnet-4-20250514", create: (id) => anthropic(id) },
    openai: { defaultModel: "gpt-4o", create: (id) => openai(id) },
    kimi: { defaultModel: "kimi-for-coding", create: (id) => kimi(id) },
  };

export function loadConfig() {
  const name = process.env.AI_PROVIDER ?? "anthropic";
  const provider = providers[name];

  if (!provider) {
    throw new Error(`Unsupported AI_PROVIDER "${name}". Use: ${Object.keys(providers).join(", ")}`);
  }

  const model = provider.create(process.env.AI_MODEL ?? provider.defaultModel);

  return { provider: name, model };
}
