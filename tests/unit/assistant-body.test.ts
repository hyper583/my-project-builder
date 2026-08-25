import { describe, expect, it } from "vitest";

import { bodySchema } from "@/app/api/projects/[id]/assistant/route";

/**
 * What the assistant endpoint accepts as a request body.
 *
 * These exist because of a bug that made the chat assistant unusable and went
 * unnoticed for the entire life of the feature. The schema used `.optional()`
 * on the two ids, which accepts `undefined` — and JSON has no `undefined`. The
 * browser sends `null` for "no conversation yet" (`conversation?.id ?? null`)
 * and for "no section open", so the FIRST message of every conversation was
 * rejected with "Invalid input: expected string, received null".
 *
 * Not an edge case: it is the opening move. Nobody could ever start a
 * conversation. It survived because nothing had ever sent a message through
 * the endpoint — the code read correctly, and reading is not running.
 *
 * The schema is exported solely so this boundary can be tested directly. It is
 * the boundary that was wrong, so it is the boundary worth pinning.
 */

const MESSAGE = "What is missing from this section?";

describe("the ids the browser actually sends", () => {
  it("accepts a null conversationId, which is what a first message carries", () => {
    const result = bodySchema.safeParse({
      message: MESSAGE,
      sectionId: "sec_1",
      conversationId: null,
    });

    expect(result.success).toBe(true);
    // Normalised, so the handler has one absent value rather than two.
    expect(result.data?.conversationId).toBeUndefined();
  });

  it("accepts a null sectionId, which is what an unopened section carries", () => {
    const result = bodySchema.safeParse({
      message: MESSAGE,
      sectionId: null,
      conversationId: null,
    });

    expect(result.success).toBe(true);
    expect(result.data?.sectionId).toBeUndefined();
  });

  it("still accepts them omitted entirely", () => {
    const result = bodySchema.safeParse({ message: MESSAGE });

    expect(result.success).toBe(true);
    expect(result.data?.sectionId).toBeUndefined();
    expect(result.data?.conversationId).toBeUndefined();
  });

  it("carries real ids through unchanged", () => {
    const result = bodySchema.safeParse({
      message: MESSAGE,
      sectionId: "sec_1",
      conversationId: "conv_1",
    });

    expect(result.data?.sectionId).toBe("sec_1");
    expect(result.data?.conversationId).toBe("conv_1");
  });
});

describe("what it still refuses", () => {
  it("rejects an empty message rather than calling the model with nothing", () => {
    expect(bodySchema.safeParse({ message: "   " }).success).toBe(false);
  });

  it("rejects an empty-string id, which is a bug rather than an absence", () => {
    // `null` means "there isn't one". "" means something built an id wrongly,
    // and looking it up would find nothing.
    expect(
      bodySchema.safeParse({ message: MESSAGE, conversationId: "" }).success,
    ).toBe(false);
  });

  it("bounds the message length", () => {
    expect(bodySchema.safeParse({ message: "x".repeat(8001) }).success).toBe(false);
  });
});
