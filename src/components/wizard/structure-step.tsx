"use client";

import { useCallback } from "react";

import { renumberChapter, structureTemplate } from "@/lib/structures";
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


const inputClass =
  "w-full rounded-md border border-input bg-card px-3 text-base transition-[border-color] duration-150 outline-none placeholder:text-subtle-foreground hover:border-border-strong focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

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
    update(next.map((c, i) => renumberChapter(c, i)));
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

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-4 elevated-1">
        <span className="mr-1 text-sm font-medium">Start from:</span>
        {[3, 4, 5].map((n) => (
          <Button key={n} variant="outline" size="sm" onClick={() => update(structureTemplate(n))}>
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
          <li key={chapter.id ?? `c-${ci}`} className="rounded-xl border border-border bg-card p-5 elevated-1">
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
