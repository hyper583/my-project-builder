import { afterEach, describe, expect, it, vi } from "vitest";

import { GENERIC_OAUTH_ERROR, describeOAuthError } from "@/lib/oauth-errors";

/**
 * The messages shown when Google sends someone back with an error.
 *
 * These exist because the mapping was wrong in a way nothing could catch: the
 * code that actually occurs is `account_not_linked`, which is not a constant
 * anywhere in Better Auth — the sign-in path returns the string "account not
 * linked" and the callback route replaces the spaces. The named constant that
 * looks correct, `unable_to_link_account`, is for a different flow.
 *
 * The result was that the only failure a student would realistically hit fell
 * through to "please try again", which is advice that cannot work: trying
 * again produces the same refusal every time.
 */

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the code that actually occurs", () => {
  it("explains account_not_linked", () => {
    // Spelled out rather than imported, because the string is constructed at
    // runtime by Better Auth and there is nothing to import. If they change
    // how it is built, this fails — which is the point.
    const message = describeOAuthError("account_not_linked");

    expect(message).not.toBe(GENERIC_OAUTH_ERROR);
    expect(message).toMatch(/already an account/i);
  });

  it("tells the student what to actually do about it", () => {
    /*
     * "Please try again" is the wrong advice here — the refusal is
     * deliberate and permanent until the local address is confirmed. The
     * message has to name both steps, because neither is guessable.
     */
    const message = describeOAuthError("account_not_linked")!;

    expect(message).toMatch(/sign in with that password/i);
    expect(message).toMatch(/confirm your email/i);
    expect(message).toMatch(/settings/i);
  });

  it("still handles the explicit-link code, which is a different flow", () => {
    expect(describeOAuthError("unable_to_link_account")).not.toBe(GENERIC_OAUTH_ERROR);
  });
});

describe("the rest of the codes", () => {
  it("has something specific for each one Better Auth can redirect with", () => {
    for (const code of [
      "email_not_verified",
      "account_already_linked_to_different_user",
      "email_does_not_match",
      "email_not_found",
      "access_denied",
    ]) {
      expect(describeOAuthError(code), code).not.toBe(GENERIC_OAUTH_ERROR);
    }
  });

  it("never leaves a raw code on screen", () => {
    // Whatever arrives, the student reads a sentence rather than
    // "oauth_provider_not_found".
    const message = describeOAuthError("some_code_from_a_future_version")!;
    expect(message).toBe(GENERIC_OAUTH_ERROR);
    expect(message).not.toContain("_");
  });
});

describe("when nothing went wrong", () => {
  it("says nothing at all", () => {
    for (const value of [undefined, null, "", 42, ["a"]]) {
      expect(describeOAuthError(value)).toBeNull();
    }
  });

  it("does not log for an absent code", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    describeOAuthError(undefined);
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("an unrecognised code", () => {
  it("is logged, so the next one is findable", () => {
    // The failure this whole file was written after was a vague message with
    // no way for anyone — including whoever is debugging it — to learn what
    // the code had been.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    describeOAuthError("brand_new_failure_mode");

    expect(warn).toHaveBeenCalledOnce();
    expect(String(warn.mock.calls[0]![0])).toContain("brand_new_failure_mode");
  });

  it("is not logged when it is one we know", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    describeOAuthError("account_not_linked");
    expect(warn).not.toHaveBeenCalled();
  });
});
