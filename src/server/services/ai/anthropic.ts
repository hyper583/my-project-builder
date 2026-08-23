import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";

import { env } from "@/lib/env";
import { AppError } from "@/server/errors";
import { normaliseHistory } from "@/server/services/ai/history";
import { buildUserMessage, renderReferences, renderSources } from "@/server/services/ai/prompts";
import type {
  AIProvider,
  GenerateOptions,
  GenerateResult,
  StructuredOptions,
  StructuredResult,
} from "@/server/services/ai/types";

/**
 * Anthropic provider.
 *
 * Two design points worth knowing:
 *
 * **Prompt caching.** The staged generation pipeline re-sends the same project
 * context on every stage. The stable part (system prompt, project facts,
 * uploaded sources) is marked cacheable and the volatile instruction is sent
 * last, so later stages read the cached prefix at roughly a tenth of the input
 * price instead of paying for it a dozen times.
 *
 * **Refusals are a content outcome, not an error.** A declined request returns
 * HTTP 200 with `stop_reason: "refusal"` and possibly empty content, so
 * `stop_reason` is checked before the content array is read.
 */
export class AnthropicProvider implements AIProvider {
  readonly name = "anthropic";
  readonly isConfigured = true;

  private readonly client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  /**
   * The cacheable prefix: project facts and uploaded sources.
   *
   * Anything that changes per call must stay out of these blocks, or the
   * cache is missed on every request.
   */
  private stableBlocks(options: GenerateOptions): Anthropic.TextBlockParam[] {
    const stable: string[] = [];
    if (options.context.trim()) {
      stable.push(`<project_context>\n${options.context.trim()}\n</project_context>`);
    }
    // Before the uploads, and inside the cached prefix: the reference list is
    // identical for every section of a project, so it is written to cache once
    // and read back at a tenth of the price on each of the twenty-odd calls
    // that follow.
    if (options.references && options.references.length > 0) {
      stable.push(renderReferences(options.references));
    }
    if (options.sources && options.sources.length > 0) {
      stable.push(renderSources(options.sources));
    }
    if (stable.length === 0) return [];

    return [
      {
        type: "text",
        text: stable.join("\n\n"),
        // Breakpoint: everything above is reused across the pipeline's stages
        // and across the turns of a conversation.
        cache_control: { type: "ephemeral" },
      },
    ];
  }

  /** The volatile suffix — the live request, never cached. */
  private volatileText(options: GenerateOptions & { selection?: string }): string {
    const parts: string[] = [];
    if (options.selection) {
      parts.push(`<selected_passage>\n${options.selection}\n</selected_passage>`);
    }
    parts.push(options.instruction.trim());
    return parts.join("\n\n");
  }

  /**
   * Assembles the message array.
   *
   * The cacheable project context rides on the FIRST user turn so the prefix
   * stays byte-identical as a conversation grows; earlier turns follow it and
   * the live request is always the final user turn. History is normalised
   * first because a stored transcript can break the alternation the API
   * requires.
   */
  private buildMessages(
    options: GenerateOptions & { selection?: string },
  ): Anthropic.MessageParam[] {
    const stable = this.stableBlocks(options);
    const volatile = this.volatileText(options);
    const history = normaliseHistory(options.history ?? []);

    if (history.length === 0) {
      return [{ role: "user", content: [...stable, { type: "text", text: volatile }] }];
    }

    const [first, ...rest] = history;
    const messages: Anthropic.MessageParam[] = [
      { role: "user", content: [...stable, { type: "text", text: first!.content }] },
    ];
    for (const turn of rest) {
      messages.push({ role: turn.role, content: turn.content });
    }
    messages.push({ role: "user", content: volatile });
    return messages;
  }

  private systemBlocks(system: string): Anthropic.TextBlockParam[] {
    return [{ type: "text", text: system, cache_control: { type: "ephemeral" } }];
  }

  /** Extracts text, having first confirmed the model did not decline. */
  private readText(message: Anthropic.Message): string {
    if (message.stop_reason === "refusal") {
      throw new AppError("AI_FAILED", {
        message: `Model declined the request (${message.stop_details?.category ?? "unspecified"})`,
      });
    }
    return message.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("")
      .trim();
  }

  private effort(options: GenerateOptions) {
    return { effort: options.effort ?? "high" } as const;
  }

  async generate(options: GenerateOptions): Promise<GenerateResult> {
    try {
      const message = await this.client.messages.create({
        model: env.AI_MODEL_GENERATION,
        max_tokens: options.maxTokens ?? 16000,
        system: this.systemBlocks(options.system),
        output_config: this.effort(options),
        messages: this.buildMessages(options),
      });

      return {
        text: this.readText(message),
        inputTokens: message.usage.input_tokens,
        outputTokens: message.usage.output_tokens,
        model: message.model,
      };
    } catch (error) {
      throw this.wrap(error);
    }
  }

  async stream(
    options: GenerateOptions,
    onDelta: (text: string) => void,
  ): Promise<GenerateResult> {
    try {
      // Streaming lifts the practical max_tokens ceiling — a non-streaming
      // request at this size risks an SDK HTTP timeout.
      const stream = this.client.messages.stream({
        model: env.AI_MODEL_GENERATION,
        max_tokens: options.maxTokens ?? 64000,
        system: this.systemBlocks(options.system),
        output_config: this.effort(options),
        messages: this.buildMessages(options),
      });

      stream.on("text", onDelta);
      const message = await stream.finalMessage();

      return {
        text: this.readText(message),
        inputTokens: message.usage.input_tokens,
        outputTokens: message.usage.output_tokens,
        model: message.model,
      };
    } catch (error) {
      throw this.wrap(error);
    }
  }

  async edit(options: GenerateOptions & { selection: string }): Promise<GenerateResult> {
    try {
      const message = await this.client.messages.create({
        model: env.AI_MODEL_EDITING,
        max_tokens: options.maxTokens ?? 8000,
        system: this.systemBlocks(options.system),
        output_config: this.effort(options),
        messages: this.buildMessages(options),
      });

      return {
        text: this.readText(message),
        inputTokens: message.usage.input_tokens,
        outputTokens: message.usage.output_tokens,
        model: message.model,
      };
    } catch (error) {
      throw this.wrap(error);
    }
  }

  async structured<T extends z.ZodType>(
    options: StructuredOptions<T>,
  ): Promise<StructuredResult<z.infer<T>>> {
    try {
      const message = await this.client.messages.parse({
        model: env.AI_MODEL_GENERATION,
        max_tokens: options.maxTokens ?? 16000,
        system: this.systemBlocks(options.system),
        output_config: { format: zodOutputFormat(options.schema) },
        messages: [
          {
            role: "user",
            content: buildUserMessage({
              context: options.context,
              instruction: options.instruction,
              sources: options.sources,
            }),
          },
        ],
      });

      if (message.stop_reason === "refusal") {
        throw new AppError("AI_FAILED", { message: "Model declined the request" });
      }
      if (!message.parsed_output) {
        // Schema validation failed — surfacing this beats silently accepting
        // a shape the rest of the pipeline cannot rely on.
        throw new AppError("AI_FAILED", {
          message: `Model returned no valid "${options.schemaName}" object`,
        });
      }

      return {
        data: message.parsed_output,
        inputTokens: message.usage.input_tokens,
        outputTokens: message.usage.output_tokens,
        model: message.model,
      };
    } catch (error) {
      throw this.wrap(error);
    }
  }

  /** Maps SDK errors onto the app's taxonomy, logging the detail server-side. */
  private wrap(error: unknown): AppError {
    if (error instanceof AppError) return error;

    if (error instanceof Anthropic.RateLimitError) {
      return new AppError("RATE_LIMITED", { message: "Anthropic rate limit", cause: error });
    }
    if (error instanceof Anthropic.AuthenticationError) {
      return new AppError("AI_NOT_CONFIGURED", {
        message: "Anthropic rejected the API key",
        cause: error,
      });
    }
    console.error("[ai:anthropic]", error);
    return new AppError("AI_FAILED", { message: "Anthropic request failed", cause: error });
  }
}
