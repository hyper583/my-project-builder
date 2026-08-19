import { describe, expect, it } from "vitest";

import { normaliseHistory } from "@/server/services/ai/history";
import type { ChatTurn } from "@/server/services/ai/types";

/**
 * Conversation replay.
 *
 * The provider appends the live question as the final user turn, so history
 * has to start with `user`, alternate, and end with `assistant`. A stored
 * transcript does not guarantee that, and every violation is an API 400
 * rather than a merely worse answer — so the invariant is tested here rather
 * than discovered in production.
 */

const user = (content: string): ChatTurn => ({ role: "user", content });
const assistant = (content: string): ChatTurn => ({ role: "assistant", content });

/** Asserts the shape the Anthropic messages API requires. */
function expectValidReplay(turns: ChatTurn[]) {
  if (turns.length === 0) return;
  expect(turns[0]!.role).toBe("user");
  expect(turns[turns.length - 1]!.role).toBe("assistant");
  for (let i = 1; i < turns.length; i += 1) {
    expect(turns[i]!.role).not.toBe(turns[i - 1]!.role);
  }
}

describe("normaliseHistory", () => {
  it("passes a well-formed transcript through unchanged", () => {
    const history = [user("What is my aim?"), assistant("Your stated aim is…")];
    expect(normaliseHistory(history)).toEqual(history);
    expectValidReplay(normaliseHistory(history));
  });

  it("drops a leading assistant turn when the window opens mid-pair", () => {
    // A fixed-size replay window can cut between a question and its answer.
    const result = normaliseHistory([
      assistant("…the rest of an earlier answer"),
      user("And the sample size?"),
      assistant("You recorded 120 respondents."),
    ]);

    expect(result).toEqual([user("And the sample size?"), assistant("You recorded 120 respondents.")]);
    expectValidReplay(result);
  });

  it("merges consecutive user turns left by a failed stream", () => {
    // A question whose stream died before producing text has no reply row.
    const result = normaliseHistory([
      user("First question"),
      user("Second question"),
      assistant("An answer to both"),
    ]);

    expect(result).toEqual([user("First question\n\nSecond question"), assistant("An answer to both")]);
    expectValidReplay(result);
  });

  it("merges consecutive assistant turns", () => {
    const result = normaliseHistory([
      user("Question"),
      assistant("Partial answer"),
      assistant("Continued answer"),
    ]);

    expect(result).toEqual([user("Question"), assistant("Partial answer\n\nContinued answer")]);
    expectValidReplay(result);
  });

  it("drops a trailing unanswered question, which the live one supersedes", () => {
    const result = normaliseHistory([
      user("Answered question"),
      assistant("An answer"),
      user("Never answered"),
    ]);

    expect(result).toEqual([user("Answered question"), assistant("An answer")]);
    expectValidReplay(result);
  });

  it("ignores blank turns rather than sending empty content", () => {
    const result = normaliseHistory([
      user("Question"),
      assistant("   "),
      assistant("The real answer"),
    ]);

    expect(result).toEqual([user("Question"), assistant("The real answer")]);
    expectValidReplay(result);
  });

  it("returns nothing when no complete exchange survives", () => {
    expect(normaliseHistory([])).toEqual([]);
    expect(normaliseHistory([user("Unanswered")])).toEqual([]);
    expect(normaliseHistory([assistant("Orphaned reply")])).toEqual([]);
  });

  it("holds the replay invariant across an awkward transcript", () => {
    const result = normaliseHistory([
      assistant("orphan"),
      user("a"),
      user("b"),
      assistant("c"),
      assistant("d"),
      user("e"),
    ]);

    expect(result).toEqual([user("a\n\nb"), assistant("c\n\nd")]);
    expectValidReplay(result);
  });
});
