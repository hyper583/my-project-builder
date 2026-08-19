"use client";

import { useCallback } from "react";
import { ChevronDown, ChevronUp, Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { SaveIndicator, StepIntro } from "@/components/wizard/fields";
import { useAutosave } from "@/components/wizard/use-autosave";
import { saveStructureStep } from "@/server/actions/wizard";

export interface StructureSection {
  id?: string;
  title: string;
  number?: string;
}
export interface StructureChapter extends StructureSection {
  children: StructureSection[];
}
interface StructureValues {
  chapters: StructureChapter[];
}

const CHAPTER_WORDS = ["ONE", "TWO", "THREE", "FOUR", "FIVE", "SIX", "SEVEN", "EIGHT"];

/**
 * Common Nigerian/UK five-chapter shape, offered as a starting point only.
 * Not every discipline follows it, so nothing here is fixed — every chapter and
 * section can be renamed, reordered or removed.
 */
const FIVE_CHAPTER_TEMPLATE: StructureChapter[] = [
  {
    title: "Introduction",
    number: "1",
    children: [
      { title: "Background to the Study", number: "1.1" },
      { title: "Statement of the Problem", number: "1.2" },
      { title: "Aim and Objectives", number: "1.3" },
      { title: "Research Questions", number: "1.4" },
      { title: "Significance of the Study", number: "1.5" },
      { title: "Scope and Limitations", number: "1.6" },
      { title: "Definition of Terms", number: "1.7" },
    ],
  },
  {
    title: "Literature Review",
    number: "2",
    children: [
      { title: "Conceptual Framework", number: "2.1" },
      { title: "Theoretical Framework", number: "2.2" },
      { title: "Empirical Review", number: "2.3" },
      { title: "Summary of Literature", number: "2.4" },
    ],
  },
  {
    title: "Research Methodology",
    number: "3",
    children: [
      { title: "Research Design", number: "3.1" },
      { title: "Population of the Study", number: "3.2" },
      { title: "Sample Size and Sampling Technique", number: "3.3" },
      { title: "Instrumentation", number: "3.4" },
      { title: "Method of Data Collection", number: "3.5" },
      { title: "Method of Data Analysis", number: "3.6" },
    ],
  },
  {
    title: "Results and Discussion",
    number: "4",
    children: [
      { title: "Presentation of Results", number: "4.1" },
      { title: "Analysis of Findings", number: "4.2" },
      { title: "Discussion of Findings", number: "4.3" },
    ],
  },
  {
    title: "Summary, Conclusion and Recommendations",
    number: "5",
    children: [
      { title: "Summary of Findings", number: "5.1" },
      { title: "Conclusion", number: "5.2" },
      { title: "Recommendations", number: "5.3" },
      { title: "Suggestions for Further Research", number: "5.4" },
    ],
  },
];

function template(count: number): StructureChapter[] {
  if (count >= 5) return FIVE_CHAPTER_TEMPLATE.slice(0, count).map(clone);
  if (count === 4) {
    return [FIVE_CHAPTER_TEMPLATE[0]!, FIVE_CHAPTER_TEMPLATE[1]!, FIVE_CHAPTER_TEMPLATE[2]!, FIVE_CHAPTER_TEMPLATE[4]!]
      .map(clone)
      .map((c, i) => renumber(c, i));
  }
  return [FIVE_CHAPTER_TEMPLATE[0]!, FIVE_CHAPTER_TEMPLATE[2]!, FIVE_CHAPTER_TEMPLATE[4]!]
    .map(clone)
    .map((c, i) => renumber(c, i));
}

const clone = (c: StructureChapter): StructureChapter => ({
  title: c.title,
  number: c.number,
  children: c.children.map((s) => ({ title: s.title, number: s.number })),
});

const renumber = (c: StructureChapter, index: number): StructureChapter => ({
  ...c,
  number: String(index + 1),
  children: c.children.map((s, j) => ({ ...s, number: `${index + 1}.${j + 1}` })),
});

const inputClass =
  "w-full rounded-md border border-input bg-card px-3 text-base outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

function IconButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-md border border-border text-muted-foreground transition-colors duration-200 hover:bg-muted disabled:pointer-events-none disabled:opacity-40"
    >
      {children}
    </button>
  );
}

export function StructureStep({
  projectId,
  initial,
}: {
  projectId: string;
  initial: StructureChapter[];
}) {
  const save = useCallback(
    (v: StructureValues) => saveStructureStep({ projectId, chapters: v.chapters }),
    [projectId],
  );
  const { values, setField, state, message } = useAutosave<StructureValues>(
    { chapters: initial },
    save,
  );

  const chapters = values.chapters;
  const update = (next: StructureChapter[]) => setField("chapters", next);

  const move = (from: number, to: number) => {
    if (to < 0 || to >= chapters.length) return;
    const next = [...chapters];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved!);
    // Renumber after a move. Without this the display order and the chapter
    // numbers disagree — you get "1, 3, 2" in the blueprint and the export.
    // Numbers stay directly editable; a later move re-derives them again.
    update(next.map((c, i) => renumber(c, i)));
  };

  const patchChapter = (index: number, patch: Partial<StructureChapter>) =>
    update(chapters.map((c, i) => (i === index ? { ...c, ...patch } : c)));

  return (
    <div className="space-y-6">
      <StepIntro>
        How your project is organised. Not every discipline uses the same structure, so nothing
        here is fixed — rename, reorder, add or remove anything. Existing writing is kept when
        you rename or move a section.
      </StepIntro>

      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-4">
        <span className="mr-1 text-sm font-medium">Start from:</span>
        {[3, 4, 5].map((n) => (
          <Button key={n} variant="outline" size="sm" onClick={() => update(template(n))}>
            {n} chapters
          </Button>
        ))}
        <Button variant="ghost" size="sm" onClick={() => update([])}>
          Empty
        </Button>
      </div>

      {chapters.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <p className="leading-relaxed text-muted-foreground">
            No chapters yet. Choose a starting point above, or add a chapter of your own.
          </p>
        </div>
      ) : null}

      <ol className="space-y-4">
        {chapters.map((chapter, ci) => (
          <li key={chapter.id ?? `c-${ci}`} className="rounded-lg border border-border bg-card p-5">
            <div className="flex items-start gap-2">
              <div className="grid w-20 shrink-0 gap-1">
                <label className="sr-only" htmlFor={`ch-num-${ci}`}>
                  Chapter number
                </label>
                <input
                  id={`ch-num-${ci}`}
                  value={chapter.number ?? ""}
                  onChange={(e) => patchChapter(ci, { number: e.target.value })}
                  className={`h-11 text-center ${inputClass}`}
                />
              </div>
              <div className="flex-1">
                <label className="sr-only" htmlFor={`ch-title-${ci}`}>
                  Chapter {ci + 1} title
                </label>
                <input
                  id={`ch-title-${ci}`}
                  value={chapter.title}
                  onChange={(e) => patchChapter(ci, { title: e.target.value })}
                  className={`h-11 font-medium ${inputClass}`}
                />
                <p className="mt-1 text-sm text-muted-foreground">
                  Chapter {CHAPTER_WORDS[ci] ?? ci + 1}
                </p>
              </div>
              <div className="flex gap-1">
                <IconButton label={`Move chapter ${ci + 1} up`} onClick={() => move(ci, ci - 1)} disabled={ci === 0}>
                  <ChevronUp className="size-4" aria-hidden="true" />
                </IconButton>
                <IconButton label={`Move chapter ${ci + 1} down`} onClick={() => move(ci, ci + 1)} disabled={ci === chapters.length - 1}>
                  <ChevronDown className="size-4" aria-hidden="true" />
                </IconButton>
                <IconButton label={`Delete chapter ${ci + 1}`} onClick={() => update(chapters.filter((_, i) => i !== ci))}>
                  <X className="size-4" aria-hidden="true" />
                </IconButton>
              </div>
            </div>

            <ul className="mt-4 space-y-2 border-l border-border pl-4">
              {chapter.children.map((section, si) => (
                <li key={section.id ?? `s-${ci}-${si}`} className="flex items-center gap-2">
                  <label className="sr-only" htmlFor={`sec-num-${ci}-${si}`}>
                    Section number
                  </label>
                  <input
                    id={`sec-num-${ci}-${si}`}
                    value={section.number ?? ""}
                    onChange={(e) =>
                      patchChapter(ci, {
                        children: chapter.children.map((s, i) =>
                          i === si ? { ...s, number: e.target.value } : s,
                        ),
                      })
                    }
                    className={`h-10 w-20 shrink-0 text-center ${inputClass}`}
                  />
                  <label className="sr-only" htmlFor={`sec-title-${ci}-${si}`}>
                    Section title
                  </label>
                  <input
                    id={`sec-title-${ci}-${si}`}
                    value={section.title}
                    onChange={(e) =>
                      patchChapter(ci, {
                        children: chapter.children.map((s, i) =>
                          i === si ? { ...s, title: e.target.value } : s,
                        ),
                      })
                    }
                    className={`h-10 ${inputClass}`}
                  />
                  <IconButton
                    label={`Delete section ${section.number ?? si + 1}`}
                    onClick={() =>
                      patchChapter(ci, { children: chapter.children.filter((_, i) => i !== si) })
                    }
                  >
                    <X className="size-4" aria-hidden="true" />
                  </IconButton>
                </li>
              ))}
            </ul>

            <Button
              variant="outline"
              size="sm"
              className="mt-3 ml-4"
              onClick={() =>
                patchChapter(ci, {
                  children: [
                    ...chapter.children,
                    {
                      title: "New section",
                      number: `${chapter.number ?? ci + 1}.${chapter.children.length + 1}`,
                    },
                  ],
                })
              }
            >
              <Plus className="size-4" aria-hidden="true" />
              Add section
            </Button>
          </li>
        ))}
      </ol>

      <Button
        variant="outline"
        onClick={() =>
          update([
            ...chapters,
            { title: "New chapter", number: String(chapters.length + 1), children: [] },
          ])
        }
      >
        <Plus className="size-4" aria-hidden="true" />
        Add chapter
      </Button>

      <SaveIndicator state={state} message={message} />
    </div>
  );
}
