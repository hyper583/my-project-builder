"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { AlertCircle, Building2, Check, Loader2, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  createCitationStyle,
  createDepartment,
  createFaculty,
  createInstitution,
  createProjectType,
  deleteCitationStyle,
  deleteInstitution,
  deleteProjectType,
  renameProjectType,
} from "@/server/actions/admin-presets";

type Result = { ok: boolean; message?: string };

export interface PresetRow {
  readonly id: string;
  readonly key: string;
  readonly label: string;
  readonly used: number;
}

/**
 * Readonly throughout, mirroring what the service returns.
 *
 * The component never mutates these, and saying so means the page can pass the
 * service's own values straight through instead of cloning them to satisfy a
 * type that promised more than it needed.
 */
export interface InstitutionRow {
  readonly id: string;
  readonly name: string;
  readonly country: string | null;
  readonly used: number;
  readonly faculties: ReadonlyArray<{
    readonly id: string;
    readonly name: string;
    readonly departments: ReadonlyArray<{
      readonly id: string;
      readonly name: string;
      readonly used: number;
    }>;
  }>;
}

/** Shared state for the three panels, so one error region serves all of them. */
function useAction() {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function run(key: string, action: () => Promise<Result>, onDone?: () => void) {
    setBusy(key);
    setError(null);
    startTransition(async () => {
      const result = await action();
      setBusy(null);
      if (!result.ok) {
        setError(result.message ?? "That did not work.");
        return;
      }
      onDone?.();
      router.refresh();
    });
  }

  return { busy, error, run };
}

function ErrorNote({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="flex items-start gap-2.5 rounded-md border border-destructive/35 bg-destructive-subtle p-3 text-sm text-destructive"
    >
      <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      {message}
    </p>
  );
}

/**
 * A count of what currently names this preset.
 *
 * Presets are referenced by key or name rather than by a foreign key, so there
 * is no constraint to stop a removal that would strand projects. This number is
 * the only warning an admin gets, so it is shown before they reach for delete
 * rather than after.
 */
function UsageBadge({ used }: { used: number }) {
  if (used === 0) {
    return <span className="mono text-[0.625rem] text-subtle-foreground">unused</span>;
  }
  return (
    <span className="mono text-[0.625rem] text-warning">
      {used} project{used === 1 ? "" : "s"}
    </span>
  );
}

export function ProjectTypePanel({ types }: { types: readonly PresetRow[] }) {
  const { busy, error, run } = useAction();
  const [adding, setAdding] = useState(false);
  const [key, setKey] = useState("");
  const [label, setLabel] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  return (
    <section>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-[-0.02em]">Project types</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            These decide the chapter structure a new project starts with.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => setAdding((v) => !v)}>
          <Plus className="size-4" aria-hidden="true" />
          Add type
        </Button>
      </div>

      <div className="mt-4 space-y-3">
        <ErrorNote message={error} />

        {adding ? (
          <div className="rounded-xl border border-border bg-card p-4 elevated-1">
            <div className="flex flex-col gap-3 sm:flex-row">
              <div className="flex-1">
                <label htmlFor="type-key" className="mb-1.5 block text-sm font-medium">
                  Key
                </label>
                <input
                  id="type-key"
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                  placeholder="e.g. capstone-project"
                  className="h-10 w-full field px-3 text-sm"
                />
                {/* The rule is in code, not only in the schema: defaultStructureFor
                    branches on this exact string. */}
                <p className="mt-1.5 text-xs text-subtle-foreground">
                  Lowercase and hyphens. Stored on every project that picks it, so it cannot
                  be changed later.
                </p>
              </div>
              <div className="flex-1">
                <label htmlFor="type-label" className="mb-1.5 block text-sm font-medium">
                  Label
                </label>
                <input
                  id="type-label"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="e.g. Capstone Project"
                  className="h-10 w-full field px-3 text-sm"
                />
              </div>
            </div>
            <Button
              size="sm"
              className="mt-3"
              disabled={busy !== null || key.trim().length < 2 || label.trim().length < 2}
              onClick={() =>
                run("add-type", () => createProjectType({ key: key.trim(), label: label.trim() }), () => {
                  setKey("");
                  setLabel("");
                  setAdding(false);
                })
              }
            >
              {busy === "add-type" ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : null}
              Add
            </Button>
          </div>
        ) : null}

        <ul className="overflow-hidden rounded-xl border border-border bg-card elevated-1">
          {types.map((type, index) => (
            <li
              key={type.id}
              className={`flex flex-wrap items-center gap-3 px-4 py-3 ${index > 0 ? "border-t border-border" : ""}`}
            >
              {editing === type.id ? (
                <>
                  <input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    aria-label={`New label for ${type.label}`}
                    className="h-9 min-w-0 flex-1 field px-3 text-sm"
                  />
                  <Button
                    size="sm"
                    disabled={busy !== null || draft.trim().length < 2}
                    onClick={() =>
                      run(
                        `rename-${type.id}`,
                        () => renameProjectType({ id: type.id, label: draft.trim() }),
                        () => setEditing(null),
                      )
                    }
                  >
                    <Check className="size-4" aria-hidden="true" />
                    Save
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                    Cancel
                  </Button>
                </>
              ) : (
                <>
                  <span className="min-w-0 flex-1">
                    <span className="text-sm font-medium">{type.label}</span>
                    <span className="mono ml-2 text-[0.625rem] text-subtle-foreground">
                      {type.key}
                    </span>
                  </span>
                  <UsageBadge used={type.used} />
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setEditing(type.id);
                      setDraft(type.label);
                    }}
                  >
                    Rename
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy !== null}
                    // Unconditional: the button is an icon, so `title` alone
                    // left the unused ones announcing as "button".
                    aria-label={`Delete ${type.label}`}
                    title={
                      type.used > 0
                        ? `${type.used} projects use this. Removal will be refused.`
                        : undefined
                    }
                    onClick={() => run(`del-${type.id}`, () => deleteProjectType({ id: type.id }))}
                  >
                    {busy === `del-${type.id}` ? (
                      <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <Trash2 className="size-4" aria-hidden="true" />
                    )}
                  </Button>
                </>
              )}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function CitationStylePanel({ styles }: { styles: readonly PresetRow[] }) {
  const { busy, error, run } = useAction();
  const [key, setKey] = useState("");
  const [label, setLabel] = useState("");

  return (
    <section>
      <h2 className="text-lg font-semibold tracking-[-0.02em]">Citation styles</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Offered in the formatting step, and passed to the model when it writes references.
      </p>

      <div className="mt-4 space-y-3">
        <ErrorNote message={error} />

        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            value={key}
            onChange={(e) => setKey(e.target.value)}
            aria-label="Citation style key"
            placeholder="key, e.g. vancouver"
            className="h-10 flex-1 field px-3 text-sm"
          />
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            aria-label="Citation style label"
            placeholder="label, e.g. Vancouver"
            className="h-10 flex-1 field px-3 text-sm"
          />
          <Button
            size="sm"
            variant="outline"
            disabled={busy !== null || key.trim().length < 2 || label.trim().length < 2}
            onClick={() =>
              run("add-style", () => createCitationStyle({ key: key.trim(), label: label.trim() }), () => {
                setKey("");
                setLabel("");
              })
            }
          >
            {busy === "add-style" ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Plus className="size-4" aria-hidden="true" />
            )}
            Add
          </Button>
        </div>

        <ul className="overflow-hidden rounded-xl border border-border bg-card elevated-1">
          {styles.map((style, index) => (
            <li
              key={style.id}
              className={`flex items-center gap-3 px-4 py-3 ${index > 0 ? "border-t border-border" : ""}`}
            >
              <span className="min-w-0 flex-1">
                <span className="text-sm font-medium">{style.label}</span>
                <span className="mono ml-2 text-[0.625rem] text-subtle-foreground">
                  {style.key}
                </span>
              </span>
              <UsageBadge used={style.used} />
              <Button
                size="sm"
                variant="ghost"
                disabled={busy !== null}
                aria-label={`Delete ${style.label}`}
                title={
                  style.used > 0
                    ? `${style.used} projects use this. Removal will be refused.`
                    : undefined
                }
                onClick={() => run(`del-${style.id}`, () => deleteCitationStyle({ id: style.id }))}
              >
                {busy === `del-${style.id}` ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Trash2 className="size-4" aria-hidden="true" />
                )}
              </Button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function InstitutionPanel({ institutions }: { institutions: readonly InstitutionRow[] }) {
  const { busy, error, run } = useAction();
  const [name, setName] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [childName, setChildName] = useState("");
  const [childTarget, setChildTarget] = useState<{ kind: "faculty" | "department"; id: string } | null>(
    null,
  );

  return (
    <section>
      <h2 className="text-lg font-semibold tracking-[-0.02em]">Institutions</h2>
      <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
        These populate the wizard&apos;s autocomplete. A student can always type something
        that is not listed — the list makes the common case fast, it does not restrict
        anyone.
      </p>

      <div className="mt-4 space-y-3">
        <ErrorNote message={error} />

        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-label="Institution name"
            placeholder="e.g. University of Nigeria, Nsukka"
            className="h-10 flex-1 field px-3 text-sm"
          />
          <Button
            size="sm"
            variant="outline"
            disabled={busy !== null || name.trim().length < 2}
            onClick={() =>
              run("add-inst", () => createInstitution({ name: name.trim() }), () => setName(""))
            }
          >
            {busy === "add-inst" ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Plus className="size-4" aria-hidden="true" />
            )}
            Add institution
          </Button>
        </div>

        <ul className="space-y-2">
          {institutions.map((institution) => (
            <li
              key={institution.id}
              className="overflow-hidden rounded-xl border border-border bg-card elevated-1"
            >
              <div className="flex flex-wrap items-center gap-3 px-4 py-3">
                <button
                  type="button"
                  onClick={() => setOpen(open === institution.id ? null : institution.id)}
                  aria-expanded={open === institution.id}
                  className="focus-glow flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 rounded-md text-left"
                >
                  <Building2 className="size-4 shrink-0 text-subtle-foreground" aria-hidden="true" />
                  <span className="truncate text-sm font-medium">{institution.name}</span>
                  <span className="mono shrink-0 text-[0.625rem] text-subtle-foreground">
                    {institution.faculties.length} faculties
                  </span>
                </button>
                <UsageBadge used={institution.used} />
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy !== null}
                  aria-label={`Delete ${institution.name}`}
                  title={
                    institution.used > 0
                      ? `${institution.used} projects name this. Removal will be refused.`
                      : "Removes its faculties and departments too."
                  }
                  onClick={() =>
                    run(`del-inst-${institution.id}`, () =>
                      deleteInstitution({ id: institution.id }),
                    )
                  }
                >
                  {busy === `del-inst-${institution.id}` ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Trash2 className="size-4" aria-hidden="true" />
                  )}
                </Button>
              </div>

              {open === institution.id ? (
                <div className="border-t border-border bg-surface-sunken/40 px-4 py-3">
                  <div className="mb-3 flex flex-col gap-2 sm:flex-row">
                    <input
                      value={childTarget?.kind === "faculty" ? childName : ""}
                      onChange={(e) => {
                        setChildTarget({ kind: "faculty", id: institution.id });
                        setChildName(e.target.value);
                      }}
                      aria-label={`New faculty in ${institution.name}`}
                      placeholder="Add a faculty"
                      className="h-9 flex-1 field px-3 text-sm"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={
                        busy !== null ||
                        childTarget?.kind !== "faculty" ||
                        childName.trim().length < 2
                      }
                      onClick={() =>
                        run(
                          "add-faculty",
                          () =>
                            createFaculty({
                              institutionId: institution.id,
                              name: childName.trim(),
                            }),
                          () => {
                            setChildName("");
                            setChildTarget(null);
                          },
                        )
                      }
                    >
                      Add
                    </Button>
                  </div>

                  {institution.faculties.length === 0 ? (
                    <p className="text-sm text-subtle-foreground">No faculties yet.</p>
                  ) : (
                    <ul className="space-y-3">
                      {institution.faculties.map((faculty) => (
                        <li key={faculty.id}>
                          <p className="label-caps">{faculty.name}</p>

                          <ul className="mt-1.5 ml-1 space-y-1 border-l border-border pl-3">
                            {faculty.departments.map((department) => (
                              <li
                                key={department.id}
                                className="flex items-center gap-3 text-sm text-muted-foreground"
                              >
                                <span className="min-w-0 flex-1 truncate">{department.name}</span>
                                <UsageBadge used={department.used} />
                              </li>
                            ))}
                          </ul>

                          <div className="mt-2 ml-4 flex gap-2">
                            <input
                              value={
                                childTarget?.kind === "department" && childTarget.id === faculty.id
                                  ? childName
                                  : ""
                              }
                              onChange={(e) => {
                                setChildTarget({ kind: "department", id: faculty.id });
                                setChildName(e.target.value);
                              }}
                              aria-label={`New department in ${faculty.name}`}
                              placeholder="Add a department"
                              className="h-9 max-w-xs flex-1 field px-3 text-sm"
                            />
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={
                                busy !== null ||
                                childTarget?.kind !== "department" ||
                                childTarget.id !== faculty.id ||
                                childName.trim().length < 2
                              }
                              onClick={() =>
                                run(
                                  "add-department",
                                  () =>
                                    createDepartment({
                                      facultyId: faculty.id,
                                      name: childName.trim(),
                                    }),
                                  () => {
                                    setChildName("");
                                    setChildTarget(null);
                                  },
                                )
                              }
                            >
                              Add
                            </Button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
