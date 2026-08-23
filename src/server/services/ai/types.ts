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

/**
 * A source the model is allowed to cite.
 *
 * A separate channel from `UntrustedSource` on purpose. Those are extracts of
 * whatever the student uploaded, so they are fenced and treated as hostile.
 * These are structured records retrieved from OpenAlex and Crossref: the
 * bibliographic detail is what the database holds and the DOI resolves, which
 * is exactly the claim that makes them safe to cite. Folding them into the
 * untrusted channel would tell the model to distrust the one input it is
 * supposed to rely on.
 */
export interface CitableReference {
  /** How the work should appear in text, already in the project's style. */
  readonly inText: string;
  /** The full entry, for the model to match against when choosing a citation. */
  readonly full: string;
}

/** One prior turn in an assistant conversation. */
export interface ChatTurn {
  readonly role: "user" | "assistant";
  readonly content: string;
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
  /**
   * Verified published works the model may cite, retrieved before any prose is
   * written. Stable for the whole project, so it rides in the cached prefix.
   */
  readonly references?: readonly CitableReference[];
  /**
   * Earlier turns of an assistant conversation, oldest first. Sent as real
   * message turns rather than folded into the instruction, so the model treats
   * them as conversation rather than as quoted text.
   */
  readonly history?: readonly ChatTurn[];
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
