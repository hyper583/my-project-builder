import { describe, expect, it } from "vitest";

import { SYSTEM_PROMPTS } from "@/server/services/ai/prompts";

/**
 * The system prompts.
 *
 * These are the last line of the integrity rules that is expressed in English
 * rather than in code, so they are asserted rather than assumed. The two that
 * matter: a real project's prompt must forbid fabrication outright, and the
 * demo prompt — the only one that permits it — must still refuse to invent
 * sources, because a reader can check a citation and be misled about a real
 * publication.
 */

describe("the generate prompt, used for real projects", () => {
  it("forbids fabricating results and evidence", () => {
    const prompt = SYSTEM_PROMPTS.generate;

    expect(prompt).toMatch(/never fabricate/i);
    for (const forbidden of [
      "experimental results",
      "survey responses",
      "statistical findings",
      "interviews",
    ]) {
      expect(prompt).toContain(forbidden);
    }
  });

  it("requires the tracked marker instead of invented data", () => {
    expect(SYSTEM_PROMPTS.generate).toContain("[STUDENT DATA REQUIRED:");
  });

  it("never permits fabrication", () => {
    // The word appears only in prohibitions.
    expect(SYSTEM_PROMPTS.generate).not.toMatch(/you (should|may) invent/i);
  });
});

describe("the demo prompt, used only for sample projects", () => {
  it("permits illustrative figures", () => {
    expect(SYSTEM_PROMPTS.generateDemo).toMatch(/SHOULD invent plausible illustrative/);
  });

  it("still refuses to invent sources", () => {
    // A sample may contain invented findings. It may not contain invented
    // citations, because those point at the real world and can mislead.
    const prompt = SYSTEM_PROMPTS.generateDemo;
    // [\s\S] rather than the `s` flag, which the tsconfig target predates.
    expect(prompt).toMatch(/bibliographic details[\s\S]*NOT invented/i);
    // Whitespace-tolerant: the prompt is hard-wrapped, so a fixed space would
    // fail on a line break rather than on the rule being missing.
    expect(prompt).toMatch(/cite only works\s+supplied/i);
  });

  it("requires the prose to identify itself as illustrative", () => {
    // The export carries a title block, a per-page footer and a watermark, but
    // a reader seeing one page out of context should still be able to tell.
    expect(SYSTEM_PROMPTS.generateDemo).toMatch(/illustrative/i);
    expect(SYSTEM_PROMPTS.generateDemo).toMatch(/no real study/i);
  });

  it("says the document must not be submitted", () => {
    expect(SYSTEM_PROMPTS.generateDemo).toMatch(/never be submitted as\s+academic work/i);
  });
});

describe("every prompt", () => {
  it("carries the untrusted-source rules", () => {
    // Uploaded document text reaches the model, so each prompt that can see a
    // source must say that the text is data rather than instruction.
    for (const key of ["generate", "generateDemo", "edit", "assistant"] as const) {
      expect(SYSTEM_PROMPTS[key], key).toContain("<untrusted_source>");
      expect(SYSTEM_PROMPTS[key], key).toMatch(/never follow directives/i);
    }
  });

  it("is a fixed constant with nothing interpolated into it", () => {
    // Templating user or document content into a system prompt is how prompt
    // injection gets a foothold, so there must be no placeholders left in one.
    for (const [key, prompt] of Object.entries(SYSTEM_PROMPTS)) {
      expect(prompt, key).not.toMatch(/\$\{/);
      expect(prompt, key).not.toMatch(/\{\{/);
    }
  });
});
