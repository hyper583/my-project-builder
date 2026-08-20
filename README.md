# My Project Builder

An AI-powered academic project workspace. A student supplies extensive context about their
project — institution, research design, methodology, supervisor instructions, existing
materials — *before* anything is generated, then works in a persistent, editable workspace and
exports to Word or PDF.

The product principle is deliberately not `topic → generate`. It is:

```
student context → blueprint → staged generation → editable workspace → consistency → export
```

## Status

**Milestone A (Foundation) — in progress.** See "What works today" below for exactly what is
built and verified, and what is not. Nothing in this repository is presented as complete when it
is only mocked.

## Architecture

```
Browser (React 19 / Next 16 App Router)
   │  server actions + route handlers (all Zod-validated)
   ▼
Data Access Layer  ── requireSession() / requireProject()  ← every query passes here
   │
   ├── Prisma 7 Client (+ PrismaPg adapter) ──► PostgreSQL 17
   ├── StorageDriver     (local disk │ Supabase Storage │ S3)   — Milestone A
   ├── AIProvider        (anthropic │ mock)                     — Milestone B
   ├── EmailDriver       (console │ SMTP)
   └── JobQueue (Postgres) ◄── worker process                   — Milestone B
```

### Three decisions worth knowing before you read the code

**Authorisation lives in the Data Access Layer, never in `proxy.ts`.** Next 16 renamed
`middleware.ts` to `proxy.ts`, and after CVE-2025-29927 its own documentation states that proxy
"should not be used as a full session management or authorization solution". Worse, a leftover
`middleware.ts` is silently ignored at build time, which would leave protected routes publicly
reachable with no error. So every project read and write goes through `requireProject()` in
`src/server/dal/`, and a project owned by someone else returns **404, not 403**, so an id never
reveals whether it exists.

**Prisma 7 is configured differently from every pre-v7 tutorial.** The generator provider is
`prisma-client` (not `prisma-client-js`), `output` is mandatory, a driver adapter
(`@prisma/adapter-pg`) is required at runtime, `url` is no longer allowed in the schema's
datasource block, and the client is imported from a path ending in `/client`. Migrations read
`DIRECT_URL` via `prisma.config.ts`; the app runtime reads `DATABASE_URL`.

**Background work will use a Postgres-backed queue, not Redis.** `GenerationJob` and
`GenerationStep` rows are claimed with `FOR UPDATE SKIP LOCKED` by a separate worker process.
Generation progress shown in the UI is read from those rows, so it always reflects real backend
state rather than an animation.

## Setup

Requires **Node 20+** (developed on 24.11.1) and npm.

```bash
npm install
cp .env.example .env.local
```

### Database

Two supported paths. Both are real PostgreSQL, so the schema is identical either way.

**Local, no Docker required** — this is what the project is currently developed against:

```bash
npx prisma dev --name mpb --detach
```

It prints a `postgres://…` URL. Create a dedicated database on it and use that — do **not** point
Prisma at the default `template1`, because Postgres copies `template1` to build Prisma's shadow
database and migrations then fail with `type "UserRole" already exists`.

**Supabase (or any hosted Postgres)** — from the dashboard, open **Connect → ORMs → Prisma** and
copy both strings verbatim rather than assembling them by hand:

```bash
DATABASE_URL="…pooler…:6543/postgres?pgbouncer=true"   # app runtime
DIRECT_URL="…:5432/postgres"                            # migrations
```

`DIRECT_URL` must be the direct connection. Running migrations through pgBouncer fails with
`prepared statement "s0" already exists`.

Then:

```bash
npm run db:migrate      # apply migrations
npm run db:seed         # reference data: institutions, project types, citation styles
npm run dev
```

### Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | App runtime connection (pooled in production) |
| `DIRECT_URL` | yes | Migrations only — must be a direct connection |
| `BETTER_AUTH_SECRET` | yes | Session signing. `openssl rand -base64 32` |
| `BETTER_AUTH_URL` | yes | Base URL, e.g. `http://localhost:3000` |
| `ADMIN_BOOTSTRAP_EMAIL` | no | This account is promoted to ADMIN on creation. The only automatic promotion; never self-service |
| `AI_PROVIDER` | no | `mock` (default) or `anthropic` |
| `ANTHROPIC_API_KEY` | no | Required only when `AI_PROVIDER=anthropic` |
| `AI_MODEL_GENERATION` | no | Defaults to `claude-opus-5` |
| `AI_MODEL_EDITING` | no | Defaults to `claude-sonnet-5` |
| `STORAGE_DRIVER` | no | `local` (default), `supabase` or `s3` |
| `MAX_UPLOAD_MB` | no | Defaults to 25 |
| `EMAIL_DRIVER` | no | `console` (default) prints reset links to the server log |

**Password reset works locally with no SMTP account.** Use "Forgot your password?" on the
sign-in page; the console driver prints a genuine reset link to the `next dev` output. Open it
to reach `/reset-password`. Links last an hour and are single-use, and an expired one is
explained on arrival rather than after a new password has been typed twice. The confirmation
screen is identical whether or not the address has an account, so the form cannot be used to
discover which emails are registered.

Environment is validated by Zod at boot (`src/lib/env.ts`), so a misconfiguration fails loudly at
startup rather than confusingly at runtime.

### Getting an Anthropic API key

Only needed for Milestone B. Go to <https://console.anthropic.com> → **Settings → Billing** and add
credit (pay-as-you-go, no subscription) → **API Keys → Create Key**. Copy it immediately; it is
shown once. Put it in `.env.local` as `ANTHROPIC_API_KEY` and set `AI_PROVIDER=anthropic`.

Until then the app runs normally with `AI_PROVIDER=mock` and shows an explicit "AI not configured"
state rather than fabricating output.

## Scripts

```bash
npm run verify       # lint + typecheck + tests + build (run before committing)
npm run dev          # development server
npm run build        # production build
npm run typecheck    # tsc --noEmit
npm run lint         # eslint
npm run db:migrate   # prisma migrate dev
npm run db:seed      # reference data
npm run db:studio    # browse the database
npm test             # all tests
npm run test:unit    # unit tests only (no database needed)
```

### Running the tests

Unit tests need nothing. Integration tests need an isolated database — they
truncate tables, so they refuse to run against anything not named `*_test`, and
refuse outright to run against Supabase:

```bash
npx prisma dev --name mpb --detach     # local Postgres, no Docker
```

Then create a `mpb_test` database on it, apply migrations, and put the URL in
`.env.test` as `TEST_DATABASE_URL`. Point it at the `mpb_test` database, never
at `template1` — Postgres copies `template1` to build Prisma's shadow database,
and migrations then fail with `type "UserRole" already exists`.

## Demo projects and academic integrity

Every project carries `kind = REAL | DEMO`, set at creation and never mutated.

**REAL projects** never contain fabricated results, participants or statistics. Sections needing
the student's own data emit tracked `[STUDENT DATA REQUIRED]` markers stored in
`SectionPlaceholder`, so missing data is countable rather than a matter of trusting the prose.

**DEMO projects** may contain illustrative fabricated data — that is the point of a sample. Export
is governed by one function, `resolveExportPolicy()` in
`src/server/services/export/policy.ts`, and every renderer consumes its result so the formats
cannot drift apart:

| Actor | Demo export | Disclaimer + watermark |
|---|---|---|
| Student, free plan | Blocked (upgrade prompt) | — |
| Student, paid plan | Allowed | **Always** |
| Admin | Allowed | **None** — clean file, audit-logged |

The disclaimer is a property of the resolved policy rather than of a template, so a renderer that
fails to draw it produces a failed export rather than a silently clean file.

Plan entitlements live in `src/config/plans.ts`. Pricing is never hard-coded into feature logic.

**`kind` is immutable at the database level.** A trigger (migration
`20260819100000_project_kind_immutable`) raises on any attempt to change it, so
a demo full of illustrative figures can never be reclassified as real work — by
this app, a future admin tool, a migration script, or someone at a psql prompt.

**Converting a sample to a real project creates a new project.** It carries the
chapter structure and formatting preferences only. The sample's research data
and its written prose are deliberately not copied — they describe a study that
is not the student's — and every section arrives with a tracked
`SectionPlaceholder` saying what it still needs.

## Security notes

- Ownership enforced in the DAL on every access; unauthorised reads return 404, not 403.
- `role` and `planTier` are `input: false` in the Better Auth config, so a registration payload
  cannot set its own role or plan.
- Session role, plan and suspension are re-read from the database on every request rather than
  trusted from the session payload, so a suspension takes effect immediately.
- Uploaded document text will be treated as untrusted and passed only inside delimited
  `<untrusted_source>` blocks in user-role messages; the system prompt is a fixed constant never
  templated with user or document content.

## Supabase operational notes

**Row Level Security is enabled on all 36 tables, with no policies** (migration
`20260819071500_enable_rls`). Supabase exposes the `public` schema over PostgREST to the `anon`
and `authenticated` roles, and the anon key is publishable by design — without RLS, anyone
holding it could read or write every row, including `account` password hashes. This app does not
use supabase-js; Prisma connects as `postgres`, which owns the tables and therefore bypasses RLS,
so the application is unaffected. Verified after enabling: a valid anon key returns HTTP 200 with
**0 rows** on `project`, `user` and `account`, and an insert is rejected with `42501`.

If supabase-js is ever adopted, add explicit policies *before* using it.

**Password must be percent-encoded in the connection URL.** If your database password contains
`@`, `#`, `/`, `?` or `%`, it must be percent-encoded (`@` becomes `%40`) or the URL parser will
mistake it for the credentials/host delimiter. Symptom: `password authentication failed` even
though the password is correct.

**The Supavisor pooler intermittently refuses connections.** `prisma migrate deploy` occasionally
fails with `P1001: Can't reach database server` on port 5432 and succeeds on an immediate retry.
Retry once before investigating.

## End-to-end tests

```bash
npm run test:e2e
```

Playwright drives the real application, so it registers users and creates projects. It therefore
boots **its own** Next server on port 3100 against the isolated test database and never touches the
one in `.env.local` — `playwright.config.ts` refuses to start if `TEST_DATABASE_URL` is missing,
points at Supabase, or does not look like a test database.

First-time setup:

```bash
npx prisma dev --name mpb --detach
```

Create `mpb_test`, set `TEST_DATABASE_URL` in `.env.test`, apply migrations, then seed the
reference data the wizard needs:

```bash
DATABASE_URL="$TEST_DATABASE_URL" npx tsx prisma/seed/index.ts
```

The suite runs with `AI_PROVIDER=mock` and an empty API key, so it spends no credit and exercises
the "AI not configured" state the brief requires.

**`prisma dev` runs PGLite, a wasm build of Postgres that cannot serve concurrent connections.**
Signing out alone fires several overlapping server requests, and with the default pool most fail
with `ConnectionClosed` — measured at 5 of 20 concurrent queries succeeding, against 20 of 20 with
a pool of one. The e2e config therefore sets `DATABASE_POOL_MAX=1`. This is a property of the local
test engine, not of the application; leave the variable unset everywhere else.

What the suite covers: registration, sign-out and sign-in; the dashboard refusing an
unauthenticated visitor; a rejected password; password reset returning an identical confirmation
for a known and an unknown address, so it cannot be used to discover which emails are registered;
an expired reset link explained rather than shown as a form; wizard answers surviving a hard
reload; the step rail reflecting what has actually been filled in; every field being skippable;
the sample project being badged and carrying its disclaimer; a free student being unable to export
it; the assistant reporting that AI is not configured instead of faking output; one `h1` per page
in the workspace; theme choice persisting and `aria-pressed` agreeing with it; and no horizontal
overflow at 375px.

## Dependency notes

`npm audit` reports **0 vulnerabilities**.

An earlier note here claimed the `deepmerge-ts` advisory (GHSA-ggr8-5vv4-36mx, stack exhaustion on
recursive object graphs) was confined to the Prisma **CLI** and therefore not shipped. That was
wrong: `@prisma/client` depends on `prisma`, and `better-auth` reaches it through
`@better-auth/prisma-adapter`, so `@prisma/config` — and with it `deepmerge-ts` — was present in a
production install.

`@prisma/config` pins `deepmerge-ts` to an exact `7.1.5`, so it is raised with an `overrides` entry
in `package.json`:

```json
"overrides": { "deepmerge-ts": "^8.0.1" }
```

npm's own `audit fix --force` instead downgrades to Prisma 6, which would undo the v7 architecture.
The override was verified rather than assumed: `prisma validate`, `prisma generate`, the full test
suite and a production build all pass on 8.0.1. Revisit it when `@prisma/config` relaxes its pin.
