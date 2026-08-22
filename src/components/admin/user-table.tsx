"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { AlertCircle, Loader2, ShieldCheck, UserRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import { setUserPlan, setUserRole, setUserSuspended } from "@/server/actions/admin";

export interface UserRow {
  id: string;
  name: string;
  email: string;
  role: "STUDENT" | "ADMIN";
  planTier: "FREE" | "PAID";
  planLabel: string;
  suspended: boolean;
  createdAt: string;
  projects: number;
  generations: number;
  generationLimit: number;
  edits: number;
  editLimit: number;
  lastActiveAdmin: boolean;
  isSelf: boolean;
}

/**
 * The people using the product.
 *
 * Controls that cannot succeed are disabled with the reason attached, rather
 * than offered and then rejected — an admin should not have to press a button
 * to discover it was never going to work. The server enforces the same rules
 * regardless; this is courtesy, not security.
 */
export function UserTable({ users }: { users: UserRow[] }) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function run(key: string, action: () => Promise<{ ok: boolean; message?: string }>) {
    setPending(key);
    setError(null);
    startTransition(async () => {
      const result = await action();
      setPending(null);
      if (!result.ok) {
        setError(result.message ?? "That did not work.");
        return;
      }
      router.refresh();
    });
  }

  if (users.length === 0) {
    return (
      <p className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground elevated-1">
        Nobody matches that search.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {error ? (
        <p
          role="alert"
          className="flex items-start gap-2.5 rounded-md border border-destructive/35 bg-destructive-subtle p-3 text-sm text-destructive"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : null}

      <ul className="space-y-3">
        {users.map((user) => {
          // Both rules the server enforces, mirrored so the reason can be shown.
          const locked = user.isSelf
            ? "You cannot change your own account."
            : user.lastActiveAdmin
              ? "The only active admin. Promote someone else first."
              : null;

          return (
            <li
              key={user.id}
              className="rounded-xl border border-border bg-card p-4 elevated-1 sm:p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-[0.9375rem] font-semibold tracking-[-0.014em]">
                    {user.role === "ADMIN" ? (
                      <ShieldCheck className="size-4 shrink-0 text-primary" aria-hidden="true" />
                    ) : (
                      <UserRound
                        className="size-4 shrink-0 text-subtle-foreground"
                        aria-hidden="true"
                      />
                    )}
                    <span className="truncate">{user.name}</span>
                    {user.isSelf ? (
                      <span className="mono text-[0.625rem] text-subtle-foreground">(you)</span>
                    ) : null}
                  </p>
                  <p className="mt-1 truncate text-sm text-muted-foreground">{user.email}</p>
                  <p className="label-caps mt-2">
                    {user.planLabel} · joined {user.createdAt} · {user.projects} project
                    {user.projects === 1 ? "" : "s"}
                  </p>
                </div>

                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  {user.suspended ? (
                    <span className="mono rounded-full border border-destructive/40 bg-destructive-subtle px-2 py-0.5 text-[0.625rem] font-medium tracking-[0.06em] text-destructive uppercase">
                      Suspended
                    </span>
                  ) : null}
                  <span className="mono text-[0.625rem] text-subtle-foreground">
                    {user.generations}/{user.generationLimit} runs · {user.edits}/{user.editLimit}{" "}
                    edits
                  </span>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant={user.suspended ? "outline" : "destructive"}
                  disabled={pending !== null || locked !== null}
                  title={locked ?? undefined}
                  onClick={() =>
                    run(`${user.id}:suspend`, () =>
                      setUserSuspended({ userId: user.id, suspended: !user.suspended }),
                    )
                  }
                >
                  {pending === `${user.id}:suspend` ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  ) : null}
                  {user.suspended ? "Restore access" : "Suspend"}
                </Button>

                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending !== null || locked !== null}
                  title={locked ?? undefined}
                  onClick={() =>
                    run(`${user.id}:role`, () =>
                      setUserRole({
                        userId: user.id,
                        role: user.role === "ADMIN" ? "STUDENT" : "ADMIN",
                      }),
                    )
                  }
                >
                  {pending === `${user.id}:role` ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  ) : null}
                  {user.role === "ADMIN" ? "Remove admin" : "Make admin"}
                </Button>

                <Button
                  size="sm"
                  variant="ghost"
                  disabled={pending !== null || user.isSelf}
                  title={
                    user.isSelf
                      ? "You cannot change your own account."
                      : "Overrides the tier directly. It does not create a payment record."
                  }
                  onClick={() =>
                    run(`${user.id}:plan`, () =>
                      setUserPlan({
                        userId: user.id,
                        planTier: user.planTier === "PAID" ? "FREE" : "PAID",
                      }),
                    )
                  }
                >
                  {pending === `${user.id}:plan` ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  ) : null}
                  {user.planTier === "PAID" ? "Move to Free" : "Move to Student Pro"}
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
