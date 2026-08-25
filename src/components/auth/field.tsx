"use client";

import { useId, useState } from "react";
import { Eye, EyeOff } from "lucide-react";

/**
 * One labelled field on an auth form.
 *
 * Shared rather than defined per form: this existed twice, once in
 * `auth-forms` and once in `password-reset-forms`, near-identically. Four
 * password inputs are spread across those two files, so a reveal control
 * written per form would have been written four times and would have drifted
 * three ways.
 */
export function Field({
  id,
  label,
  type = "text",
  autoComplete,
  required = true,
  hint,
}: {
  id: string;
  label: string;
  type?: string;
  autoComplete?: string;
  required?: boolean;
  hint?: string;
}) {
  const [revealed, setRevealed] = useState(false);
  const hintId = useId();

  /*
   * A reveal, on password fields only.
   *
   * Typing a password blind is guesswork, and the usual consequence is not a
   * typo caught at submit — it is a correct password typed wrongly twice, an
   * account lockout, and a password reset that this installation cannot yet
   * deliver by email. Being able to look is the cheapest fix for that.
   *
   * The field's `type` is what actually changes, so the browser's own password
   * manager still treats it as a password while hidden, and revealing does not
   * turn it into a text field the browser will remember or autofill wrongly.
   */
  const isPassword = type === "password";
  const inputType = isPassword && revealed ? "text" : type;

  return (
    <div className="space-y-1.5">
      {/* Visible label — never a placeholder standing in for one. */}
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>

      <div className="relative">
        <input
          id={id}
          name={id}
          type={inputType}
          autoComplete={autoComplete}
          required={required}
          aria-describedby={hint ? hintId : undefined}
          // Room for the button, so a long password never runs under it.
          className={`h-11 w-full field text-base ${isPassword ? "pr-11 pl-3" : "px-3"}`}
        />

        {isPassword ? (
          <button
            type="button"
            // Never a submit: inside a form, an unqualified button posts it.
            onClick={() => setRevealed((current) => !current)}
            // Announced as a state rather than a label that flips meaning, so a
            // screen reader says "show password, pressed" instead of leaving
            // the user to infer what the button is currently doing.
            aria-pressed={revealed}
            aria-controls={id}
            aria-label={revealed ? "Hide password" : "Show password"}
            title={revealed ? "Hide password" : "Show password"}
            /*
             * Deliberately left in the tab order.
             *
             * `tabIndex={-1}` is tempting — it keeps the run from password
             * straight to the submit button — and it is wrong. It removes the
             * control from sequential navigation in BOTH directions, so a
             * keyboard-only user cannot reach it at all, not even by shift-tab.
             * That is the person most likely to want it.
             */
            className="focus-glow absolute inset-y-0 right-0 flex w-11 cursor-pointer items-center justify-center rounded-r-md text-muted-foreground transition-colors duration-150 hover:text-foreground"
          >
            {revealed ? (
              <EyeOff className="size-4" aria-hidden="true" />
            ) : (
              <Eye className="size-4" aria-hidden="true" />
            )}
          </button>
        ) : null}
      </div>

      {hint ? (
        <p id={hintId} className="text-sm text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
