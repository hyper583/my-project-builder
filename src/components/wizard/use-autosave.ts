"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { LIMITS } from "@/config/limits";
import type { ActionResult } from "@/server/errors";

export type SaveState = "idle" | "saving" | "saved" | "error";

/**
 * Debounced wizard autosave.
 *
 * Shared by every step so the save semantics are identical throughout: a pause
 * in typing writes through to Postgres, and hiding the tab flushes immediately
 * so nothing is lost when a student closes the laptop mid-sentence.
 *
 * Nothing of substance is ever held only in the browser.
 */
export function useAutosave<T extends object>(
  initial: T,
  save: (values: T) => Promise<ActionResult<unknown>>,
) {
  const [values, setValues] = useState<T>(initial);
  const [state, setState] = useState<SaveState>("idle");
  const [message, setMessage] = useState<string | null>(null);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(values);
  const dirty = useRef(false);

  // Refs are synced in an effect — writing one during render is unsafe.
  useEffect(() => {
    latest.current = values;
  }, [values]);

  const flush = useCallback(async () => {
    if (!dirty.current) return;
    dirty.current = false;
    setState("saving");
    const result = await save(latest.current);
    if (result.ok) {
      setState("saved");
      setMessage(null);
    } else {
      setState("error");
      setMessage(result.message);
      // Leave the change dirty so the next edit retries it.
      dirty.current = true;
    }
  }, [save]);

  /** Update a single field and schedule a save. */
  const setField = useCallback(<K extends keyof T>(key: K, value: T[K]) => {
    dirty.current = true;
    setValues((prev) => ({ ...prev, [key]: value }));
  }, []);

  useEffect(() => {
    if (!dirty.current) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void flush();
    }, LIMITS.wizard.autosaveDebounceMs);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [values, flush]);

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") void flush();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onHide);
    };
  }, [flush]);

  // Flush on unmount. Moving between wizard steps is a client-side navigation,
  // which fires no visibility or unload event — without this, an edit made
  // within the debounce window before pressing Next would be silently lost.
  useEffect(() => {
    return () => {
      if (dirty.current) {
        dirty.current = false;
        void save(latest.current);
      }
    };
  }, [save]);

  return { values, setValues, setField, state, message, flush };
}
