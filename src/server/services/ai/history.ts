import type { ChatTurn } from "@/server/services/ai/types";

/**
 * Normalises a stored conversation into turns a provider will accept.
 *
 * Anthropic requires message roles to strictly alternate, starting with
 * `user`. A real transcript does not always satisfy that, and each violation
 * is a 400 rather than a degraded answer:
 *
 * - the replay window is a fixed number of the most recent rows, so it can
 *   open part-way through a pair and start on an assistant turn;
 * - a question whose stream failed before producing any text leaves a user
 *   turn with no reply, putting two user turns side by side.
 *
 * Returned turns always start with `user`, alternate, and end with
 * `assistant`, so the live question can be appended as the final user turn.
 */
export function normaliseHistory(history: readonly ChatTurn[]): ChatTurn[] {
  const turns: ChatTurn[] = [];

  for (const turn of history) {
    if (!turn.content.trim()) continue;

    // The window opened mid-pair; a reply with no question reads as noise.
    if (turns.length === 0 && turn.role === "assistant") continue;

    const last = turns[turns.length - 1];
    if (last && last.role === turn.role) {
      turns[turns.length - 1] = {
        role: last.role,
        content: `${last.content}\n\n${turn.content}`,
      };
      continue;
    }

    turns.push(turn);
  }

  // A trailing question was never answered, and the question being asked now
  // supersedes it. Keeping it would put two user turns in a row.
  if (turns[turns.length - 1]?.role === "user") turns.pop();

  return turns;
}
