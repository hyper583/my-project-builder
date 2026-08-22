# The admin console

Decision record for Milestone D. Written before the code so the access rules
are a decision rather than a consequence of how it happened to get built.

## Why it is sliced

Milestone D as originally scoped is not one project. It is an operations
console, a user-administration surface, a preset content-management area, a
metrics dashboard, and a separate hardening pass. Each gets its own slice and
its own plan.

**D1 — Operations and monitoring** is first because it is the only one the
product cannot run without. Today a generation job can fail and nobody finds
out.

## The problem D1 solves

Several different failures are indistinguishable from outside. Each looks like
"nothing is happening", and each needs a different fix:

| State | Cause | Fix |
|---|---|---|
| `FAILED` | Retries exhausted | Requeue |
| `QUEUED`, `attempts >= maxAttempts` | Exhausted but never marked failed | Requeue — it can never be claimed |
| `RUNNING`, heartbeat older than 3 minutes | Worker died mid-run | Another worker reclaims it, if one is polling |
| `QUEUED`, no worker running its provider | Provider pinning, working as intended | Start a worker for that provider |
| `QUEUED`, no workers at all | Worker process is down | Start the worker |

The fourth row was introduced deliberately, by pinning jobs to the provider
that queued them. That pinning is correct — it stops a stale worker writing
placeholder text into a real project — but it means a job can now wait forever
for a worker that does not exist. Surfacing that distinction is the point of
this slice, not a decoration on it.

## Access

**`/admin`, unlinked.** Admins type the URL or use the command palette. Nothing
in the student interface hints the console exists, and `requireAdmin()` already
throws `NOT_FOUND` rather than a forbidden error, so probing the route tells an
attacker nothing about whether it is there.

The cost is discoverability, which is acceptable: there are very few admins and
they only have to learn it once. The alternative — a role-conditional sidebar
link — makes the navigation depend on role, and a rendering bug in that branch
turns an information leak into a cosmetic-looking mistake.

## Student content

**Metadata by default. Content on a deliberate, audited action.**

Admins see titles, status, kind, dates and counts freely. Reading the actual
prose is a separate action that writes an `AuditLog` row naming the admin, the
project and the time.

This is what reconciles support with the promise that a student's project is
private: the capability exists, because otherwise nobody can investigate a
report of bad output, but it is never silent.

## Error records

**Type, route and stack always. Message redacted by default, revealed on a
deliberate and audited action.**

An `AI_FAILED` error can carry a chunk of the student's draft in its message,
and an upload error can carry document text. Storing those unredacted would
quietly make the error table a second copy of student work with no access
control around it.

Storing nothing but a code and a path is the opposite mistake: most production
bugs are not diagnosable from that alone, which defeats having the log.

So both are kept — a sanitised summary shown in the list, the full record
behind the same reveal-and-audit gate that project content uses.

Only unexpected failures are recorded: `INTERNAL`, `AI_FAILED`,
`EXPORT_FAILED`. Logging `VALIDATION` and `PLAN_LIMIT` would bury real
incidents under people typing things wrong and hitting their plan ceiling,
which are normal events rather than faults.

## What D1 will not do

- **No metric the data cannot support.** "AI spend over time" needs a
  cost-per-token figure that is not recorded; token counts are, so token counts
  are what it shows. A plausible-looking cost graph would be a fabricated
  number in a product whose whole premise is not fabricating them.
- **No project content viewer.** That belongs with the Projects slice, where
  the reveal-and-audit path can be built once and properly, rather than half
  here.
