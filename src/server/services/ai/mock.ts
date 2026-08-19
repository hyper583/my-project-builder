import { createHash } from "node:crypto";
import type { z } from "zod";

import type {
  AIProvider,
  GenerateOptions,
  GenerateResult,
  StructuredOptions,
  StructuredResult,
} from "@/server/services/ai/types";

/**
 * Deterministic mock provider.
 *
 * Exists so the whole pipeline — job queue, worker, progress stream, editor —
 * can be built and tested without an API key and without spending money. Its
 * output is deliberately scaffolding, clearly marked as such: it must never be
 * mistaken for generated work, and it never invents research data.
 *
 * Same input always produces the same output, so tests can assert on it.
 */
export class MockProvider implements AIProvider {
  readonly name = "mock";
  readonly isConfigured = false;

  private hash(input: string): string {
    return createHash("sha256").update(input).digest("hex").slice(0, 8);
  }

  private scaffold(options: GenerateOptions): string {
    const fingerprint = this.hash(options.instruction + options.context);
    return [
      `[MOCK OUTPUT — no AI provider is configured on this installation.]`,
      ``,
      `This placeholder stands where generated prose will appear once an AI`,
      `provider is configured. It is not a draft and must not be submitted.`,
      ``,
      `Requested: ${options.instruction.split("\n")[0]?.slice(0, 160) ?? "(no instruction)"}`,
      `Deterministic id: ${fingerprint}`,
      ``,
      `[STUDENT DATA REQUIRED: this section's real content, once AI generation is enabled]`,
    ].join("\n");
  }

  private usage(text: string, options: GenerateOptions) {
    // Rough char/4 estimate — the mock bills nothing, but the pipeline reads
    // these fields, so they must be present and plausible.
    const input = Math.ceil((options.system.length + options.context.length + options.instruction.length) / 4);
    return { inputTokens: input, outputTokens: Math.ceil(text.length / 4), model: "mock" };
  }

  async generate(options: GenerateOptions): Promise<GenerateResult> {
    const text = this.scaffold(options);
    return { text, ...this.usage(text, options) };
  }

  async stream(
    options: GenerateOptions,
    onDelta: (text: string) => void,
  ): Promise<GenerateResult> {
    const text = this.scaffold(options);
    // Emit in chunks so streaming consumers are genuinely exercised.
    for (const line of text.split("\n")) {
      onDelta(`${line}\n`);
      await new Promise((resolve) => setTimeout(resolve, 15));
    }
    return { text, ...this.usage(text, options) };
  }

  async edit(options: GenerateOptions & { selection: string }): Promise<GenerateResult> {
    const text = [
      `[MOCK EDIT — no AI provider is configured.]`,
      ``,
      options.selection,
    ].join("\n");
    return { text, ...this.usage(text, options) };
  }

  async structured<T extends z.ZodType>(
    options: StructuredOptions<T>,
  ): Promise<StructuredResult<z.infer<T>>> {
    // A mock cannot invent a valid instance of an arbitrary schema, and
    // guessing would hide real failures. Fail loudly instead.
    throw new Error(
      `The mock AI provider cannot produce structured "${options.schemaName}" output. ` +
        `Set AI_PROVIDER=anthropic with an API key to use this feature.`,
    );
  }
}
