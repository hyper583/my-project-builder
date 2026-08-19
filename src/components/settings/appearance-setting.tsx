"use client";

import { Monitor, Moon, Sun } from "lucide-react";

import { useTheme } from "@/components/theme/theme-provider";
import type { Theme } from "@/lib/theme";

const CHOICES: ReadonlyArray<{
  value: Theme;
  label: string;
  hint: string;
  Icon: typeof Sun;
}> = [
  { value: "light", label: "Light", hint: "Always light", Icon: Sun },
  { value: "system", label: "System", hint: "Match your device", Icon: Monitor },
  { value: "dark", label: "Dark", hint: "Always dark", Icon: Moon },
];

/** Theme picker, shown as cards so the current choice is legible at a glance. */
export function AppearanceSetting() {
  const { theme, resolved, setTheme } = useTheme();

  return (
    <div>
      <div role="radiogroup" aria-label="Colour theme" className="grid gap-2.5 sm:grid-cols-3">
        {CHOICES.map(({ value, label, hint, Icon }) => {
          const active = theme === value;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setTheme(value)}
              className={`flex cursor-pointer flex-col items-start gap-1 rounded-lg border p-3.5 text-left transition-colors duration-150 ${
                active
                  ? "border-primary bg-muted"
                  : "border-border hover:border-border-strong hover:bg-muted/50"
              }`}
            >
              <Icon
                className={`size-4 ${active ? "text-primary" : "text-muted-foreground"}`}
                aria-hidden="true"
              />
              <span className="mt-1 text-sm font-medium">{label}</span>
              <span className="text-xs text-muted-foreground">{hint}</span>
            </button>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Currently showing the {resolved} theme.
      </p>
    </div>
  );
}
