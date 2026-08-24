import { env, isAiConfigured } from "@/lib/env";
import { AnthropicProvider } from "@/server/services/ai/anthropic";
import { MockProvider } from "@/server/services/ai/mock";
import type { AIProvider } from "@/server/services/ai/types";

export * from "@/server/services/ai/types";
export { SYSTEM_PROMPTS, assistantSystemPrompt } from "@/server/services/ai/prompts";

/**
 * Selects the provider from configuration.
 *
 * Falling back to the mock when AI_PROVIDER=anthropic but no key is present is
 * deliberate: it keeps the app running and the UI shows an explicit
 * "not configured" state, rather than every request failing at the boundary.
 */
function createProvider(): AIProvider {
  if (env.AI_PROVIDER === "anthropic") {
    if (!env.ANTHROPIC_API_KEY) {
      console.warn(
        "[ai] AI_PROVIDER=anthropic but ANTHROPIC_API_KEY is empty — using the mock provider.",
      );
      return new MockProvider();
    }
    return new AnthropicProvider(env.ANTHROPIC_API_KEY);
  }
  return new MockProvider();
}

export const ai: AIProvider = createProvider();

/** True only when a real model is reachable. Drives the UI's disabled states. */
export const aiConfigured = isAiConfigured && ai.isConfigured;
