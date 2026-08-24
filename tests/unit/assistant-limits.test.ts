import { describe, expect, it } from "vitest";

import { ASSISTANT_MAX_TOKENS, PASS_ALLOWANCE, FREE_PROJECT_ALLOWANCE } from "@/config/plans";
import { SYSTEM_PROMPTS, assistantSystemPrompt } from "@/server/services/ai/prompts";

/**
 * The assistant's ceiling on an unpaid project.
 *
 * This is a paywall rather than a cost control, and it exists because the
 * chapter gate has an obvious way round it: a student whose Chapter 2 will not
 * generate can ask the chat to write Chapter 2 instead. Bounding what the
 * generator writes is worth nothing while a second door produces the same
 * prose on request.
 *
 * The prompt rule is worth having and is not the mechanism. Instructions can be
 * argued with; a token ceiling cannot.
 */

describe("what an unpaid assistant reply may be", () => {
  it("is short enough that a chapter cannot fit in one", async () => {
    /*
     * Roughly 750 words at 4 characters a token, against the ~1,500 a chapter
     * section runs to. The number is not sacred; being well under a chapter is.
     */
    expect(ASSISTANT_MAX_TOKENS.free).toBeLessThan(1200);
  });

  it("is long enough to answer a real question", async () => {
    // A ceiling that truncated ordinary help would make the free tier feel
    // broken rather than limited, which sells nothing.
    expect(ASSISTANT_MAX_TOKENS.free).toBeGreaterThanOrEqual(500);
  });

  it("gives a paid project materially more room", async () => {
    expect(ASSISTANT_MAX_TOKENS.paid).toBeGreaterThan(ASSISTANT_MAX_TOKENS.free * 2);
  });
});

describe("what an unpaid assistant is told", () => {
  it("carries the extra rule when the project has no pass", () => {
    const prompt = assistantSystemPrompt({ paid: false });

    expect(prompt).toContain(SYSTEM_PROMPTS.assistant);
    expect(prompt).toMatch(/do not draft\s+the unwritten chapters/i);
  });

  it("names the ways round it, because those are what will be tried", () => {
    // "Just an example", "an outline I can expand", "one section at a time" —
    // a rule that only forbids the literal request forbids nothing.
    const prompt = assistantSystemPrompt({ paid: false });

    expect(prompt).toMatch(/example/i);
    expect(prompt).toMatch(/outline/i);
    expect(prompt).toMatch(/section at a time/i);
  });

  it("still offers help rather than only refusing", () => {
    // A refusal with nothing after it reads as the product being broken.
    const prompt = assistantSystemPrompt({ paid: false });

    expect(prompt).toMatch(/critique|explain|suggest/i);
  });

  it("adds nothing at all once the project is paid for", () => {
    expect(assistantSystemPrompt({ paid: true })).toBe(SYSTEM_PROMPTS.assistant);
  });
});

describe("the allowances agree with each other", () => {
  it("gives a free project exactly one chapter", () => {
    // The whole leak, in one number. Anything above one and the product is
    // giving away most of what it sells again.
    expect(FREE_PROJECT_ALLOWANCE.maxChapters).toBe(1);
  });

  it("puts no chapter limit on a pass", () => {
    expect(PASS_ALLOWANCE.maxChapters).toBe(Number.POSITIVE_INFINITY);
  });
});
