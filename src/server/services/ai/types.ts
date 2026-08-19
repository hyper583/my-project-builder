import { z } from "zod";

/**
 * AI provider abstraction.
 *
 * Everything that touches a model goes through this interface, so swapping
 * providers is a driver change rather than a rewrite. Structured results are
 * validated with Zod rather than parsed out of prose — the brief requires
 * structured output wherever it is available, not fragile string parsing.
 */

export interface UntrustedSource {
  /** Where the text came from, shown to the model as a label only. */
  readonly label: string;
  readonly text: string;
}

export interface GenerateOptions {
  /** Fixed operator instruction. Never contains user or document content. */
  readonly system: string;
  /** Trusted, structured project facts assembled by our own code. */
  readonly context: string;
  /** The student's own request or the stage instruction. */
  readonly instruction: string;
  /**
   * Text extracted from uploaded documents. Passed only inside delimited
   * blocks in a user-role message — never concatenated into the system prompt.
   */
  readonly sources?: readonly UntrustedSource[];
  readonly maxTokens?: number;
  readonly effort?: "low" | "medium" | "high";
}

export interface GenerateResult {
  readonly text: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly model: string;
}

export interface StructuredOptions<T extends z.ZodType> extends GenerateOptions {
  readonly schema: T;
  readonly schemaName: string;
}

export interface StructuredResult<T> {
  readonly data: T;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly model: string;
}

/** A tracked request for the student's own data — never invented content. */
export const placeholderSchema = z.object({
  label: z.string(),
  detail: z.string(),
});

export const outlineSchema = z.object({
  chapters: z
    .array(
      z.object({
        number: z.string(),
        title: z.string(),
        sections: z.array(z.object({ number: z.string(), title: z.string() })),
      }),
    )
    .max(20),
});

export const consistencySchema = z.object({
  issues: z
    .array(
      z.object({
        kind: z.string(),
        severity: z.enum(["LOW", "MEDIUM", "HIGH"]),
        summary: z.string(),
        detail: z.string(),
        sectionNumbers: z.array(z.string()).max(20),
      }),
    )
    .max(50),
});

export type Outline = z.infer<typeof outlineSchema>;
export type ConsistencyReport = z.infer<typeof consistencySchema>;

export interface AIProvider {
  /** Human-readable provider name, surfaced in usage records and errors. */
  readonly name: string;
  /** False when the provider cannot actually reach a model. */
  readonly isConfigured: boolean;

  generate(options: GenerateOptions): Promise<GenerateResult>;

  /** Streams text deltas. Returns totals once the stream completes. */
  stream(
    options: GenerateOptions,
    onDelta: (text: string) => void,
  ): Promise<GenerateResult>;

  /** Rewrites a selected passage under a named instruction. */
  edit(options: GenerateOptions & { selection: string }): Promise<GenerateResult>;

  /** Any call needing a validated object rather than prose. */
  structured<T extends z.ZodType>(
    options: StructuredOptions<T>,
  ): Promise<StructuredResult<z.infer<T>>>;
}
