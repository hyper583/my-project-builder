"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CornerDownLeft } from "lucide-react";

import { rankCommands, type Command } from "@/components/shell/commands";
import { useDismissable } from "@/lib/use-dismissable";

/**
 * The command palette.
 *
 * The keyboard surface of the product: anything reachable by clicking should be
 * reachable here in two keystrokes and a few letters. That is the strongest
 * single signal that a tool was built for people who use it daily rather than
 * for a screenshot.
 *
 * Mount it only while it is open — `{open ? <CommandPalette … /> : null}`.
 * Presence is the state, so every opening starts on an empty query with the
 * cursor at the top, without an effect reaching in to reset anything.
 *
 * Composition is left to the caller (`AppShell` owns the shortcut and builds
 * the list) so this stays a presentation surface with no knowledge of routes,
 * projects or themes.
 */
export function CommandPalette({
  onClose,
  commands,
}: {
  onClose: () => void;
  commands: readonly Command[];
}) {
  const panel = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [query, setQuery] = useState("");
  const [wanted, setWanted] = useState(0);

  useDismissable(onClose, panel);

  const results = useMemo(() => rankCommands(commands, query), [commands, query]);

  // Clamped during render rather than corrected by an effect. The list shrinks
  // as the query narrows, and a cursor left pointing past the end would
  // silently make Enter do nothing.
  const cursor = results.length === 0 ? 0 : Math.min(wanted, results.length - 1);

  // Group headings are decided once per result set. Doing it by mutating a
  // variable inside the render's map would be a write after render completes.
  const rows = useMemo(
    () =>
      results.map((command, index) => ({
        command,
        // A heading appears where the group changes, so a group only shows up
        // when the current query actually left something in it.
        heading: results[index - 1]?.group === command.group ? null : command.group,
      })),
    [results],
  );

  // Keep the highlighted row on screen when the keyboard drives the cursor
  // past the visible window. Reads and writes the DOM only — no state.
  useEffect(() => {
    const active = listRef.current?.querySelector('[data-active="true"]');
    active?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  // The palette only ever opens from a user action, so a document exists by
  // the time this runs.
  if (typeof document === "undefined") return null;

  function choose(command: Command | undefined) {
    if (!command) return;
    // Closed before running, so a navigation does not race the unmount and
    // focus returns to the trigger before the new route claims it.
    onClose();
    command.run();
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setWanted(results.length === 0 ? 0 : (cursor + 1) % results.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setWanted(results.length === 0 ? 0 : (cursor - 1 + results.length) % results.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      choose(results[cursor]);
    } else if (event.key === "Home") {
      event.preventDefault();
      setWanted(0);
    } else if (event.key === "End") {
      event.preventDefault();
      setWanted(Math.max(0, results.length - 1));
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-start justify-center px-4 pt-[12vh]">
      <button
        type="button"
        aria-label="Close command palette"
        onClick={onClose}
        className="fade-in absolute inset-0 cursor-default bg-black/55"
      />

      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="rise-in relative flex max-h-[60vh] w-full max-w-xl flex-col overflow-hidden rounded-xl border border-border bg-surface elevated-4"
      >
        {/*
         * No magnifier here. It was decorative — `aria-hidden`, no handler —
         * but it sits at the head of a text field, which is where a control
         * belongs, so it read as a button that did nothing when clicked. The
         * placeholder already says what the field is for.
         */}
        <div className="flex shrink-0 items-center border-b border-border px-4">
          <input
            data-autofocus
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              // A new query means a new list; start at the top of it.
              setWanted(0);
            }}
            onKeyDown={onKeyDown}
            placeholder="Search projects, sections and commands…"
            aria-label="Search commands"
            aria-controls="command-results"
            aria-activedescendant={results[cursor] ? `command-${results[cursor].id}` : undefined}
            role="combobox"
            aria-expanded="true"
            autoComplete="off"
            spellCheck={false}
            className="h-12 min-w-0 flex-1 bg-transparent text-[0.9375rem] outline-none placeholder:text-subtle-foreground"
          />
          <kbd className="mono hidden shrink-0 rounded border border-border px-1.5 py-0.5 text-[0.6875rem] text-subtle-foreground sm:block">
            ESC
          </kbd>
        </div>

        {rows.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">
            Nothing matches “{query}”.
          </p>
        ) : (
          <ul
            ref={listRef}
            id="command-results"
            role="listbox"
            aria-label="Commands"
            className="min-h-0 flex-1 overflow-y-auto p-1.5"
          >
            {rows.map(({ command, heading }, index) => {
              const active = index === cursor;
              const Icon = command.icon;

              return (
                <li key={command.id}>
                  {heading ? (
                    <p className="label-caps px-2.5 pt-3 pb-1.5 first:pt-1.5">{heading}</p>
                  ) : null}
                  <div
                    id={`command-${command.id}`}
                    role="option"
                    aria-selected={active}
                    data-active={active}
                    onClick={() => choose(command)}
                    onMouseMove={() => setWanted(index)}
                    className={`flex cursor-pointer items-center gap-3 rounded-md px-2.5 py-2 text-sm ${
                      active ? "bg-primary-subtle text-foreground" : "text-muted-foreground"
                    }`}
                  >
                    <Icon
                      className={`size-4 shrink-0 ${active ? "text-primary" : "text-subtle-foreground"}`}
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1 truncate">{command.label}</span>
                    {command.hint ? (
                      <span className="mono shrink-0 text-[0.6875rem] text-subtle-foreground">
                        {command.hint}
                      </span>
                    ) : null}
                    {active ? (
                      <CornerDownLeft
                        className="size-3.5 shrink-0 text-subtle-foreground"
                        aria-hidden="true"
                      />
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>,
    document.body,
  );
}
