import { PLACEHOLDER_LABEL, findPlaceholders } from "@/lib/placeholders";
import { prisma } from "@/server/db";

/**
 * Keeps a section's tracked markers in step with its text.
 *
 * Shared by every path that writes section content — the editor's autosave,
 * the generation pipeline and a version restore — so the tally cannot depend
 * on which route the text arrived by.
 *
 * Resolved markers are left alone. A student who has ticked one off has made a
 * judgement about their own work, and rewriting the sentence should not
 * silently reopen it.
 */
export async function syncPlaceholders(sectionId: string, text: string): Promise<number> {
  const found = findPlaceholders(text);

  await prisma.sectionPlaceholder.deleteMany({ where: { sectionId, resolved: false } });

  if (found.length === 0) return 0;

  await prisma.sectionPlaceholder.createMany({
    data: found.map((detail) => ({
      sectionId,
      label: PLACEHOLDER_LABEL,
      detail: detail.slice(0, 500),
    })),
  });

  return found.length;
}
