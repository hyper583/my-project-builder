import { describe, expect, it } from "vitest";
import { z } from "zod";

import { AppError, toUserMessage } from "@/server/errors";

/**
 * What a user is actually told when something is refused.
 *
 * The default has to stay closed — an unexamined message must never reach the
 * client — but a refusal the user is expected to act on is useless if it
 * renders as "check your details". These tests hold both halves of that.
 */

describe("the safe default", () => {
  it("shows the friendly text, not the internal message", () => {
    // `message` is for logs. It can name a project, a provider, a row id.
    const error = new AppError("INTERNAL", { message: "connection to db-7 refused" });

    expect(toUserMessage(error).message).not.toContain("db-7");
    expect(toUserMessage(error).message).toBe("Something went wrong on our end. Please try again.");
  });

  it("never leaks an unknown error's contents", () => {
    const result = toUserMessage(new Error("Prisma: relation user does not exist"));

    expect(result.code).toBe("INTERNAL");
    expect(result.message).not.toMatch(/prisma|relation/i);
  });

  it("leaks nothing from a thrown non-error either", () => {
    expect(toUserMessage("raw string with /var/secrets in it").message).not.toContain("/var");
  });
});

describe("the deliberate opt-in", () => {
  it("shows userMessage when one is authored", () => {
    // A policy refusal an admin has to read to resolve.
    const error = new AppError("VALIDATION", {
      userMessage: "That is the only active admin. Promote someone else first.",
    });

    expect(toUserMessage(error).message).toBe(
      "That is the only active admin. Promote someone else first.",
    );
  });

  it("keeps the internal message internal even when both are given", () => {
    const error = new AppError("CONFLICT", {
      message: "job 7f3a locked by worker 22500",
      userMessage: "That job is running. Wait for it to finish.",
    });

    expect(toUserMessage(error).message).toBe("That job is running. Wait for it to finish.");
    expect(error.message).toContain("7f3a");
  });
});

describe("schema failures", () => {
  const schema = z.object({
    topic: z.string().min(12, "Describe your topic in a few words"),
  });

  it("reports the authored message rather than an internal error", () => {
    // This fell through to INTERNAL before — telling the user something went
    // wrong on our end, which was both untrue and unactionable.
    let caught: unknown;
    try {
      schema.parse({ topic: "test" });
    } catch (error) {
      caught = error;
    }

    const result = toUserMessage(caught);
    expect(result.code).toBe("VALIDATION");
    expect(result.message).toBe("Describe your topic in a few words");
  });

  it("classifies it as the user's input, not a server fault", () => {
    let caught: unknown;
    try {
      schema.parse({ topic: 42 });
    } catch (error) {
      caught = error;
    }

    // The code matters beyond the wording: `INTERNAL` is recorded as a fault in
    // the operations console, so misclassifying a typo would fill the incident
    // log with people typing things wrong.
    expect(toUserMessage(caught).code).toBe("VALIDATION");
  });
});
