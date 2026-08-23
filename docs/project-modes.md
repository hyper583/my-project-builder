# Project modes

The three ways a project can exist, and the rules that separate them. This is
the decision record — code that touches fabrication, export marking or the
generation prompts should agree with this file.

## The modes

| Mode | Origin | Fabricated content | Export |
|---|---|---|---|
| **Sample** | Seeded fixture, identical for every user, no AI involved | Pre-written, illustrative | Marked · paid for students · clean + audited for admins |
| **Demo** | The student's own topic, AI-generated | **Yes, deliberately** | Marked · paid for students · clean + audited for admins |
| **Real** | The student's own topic, AI-generated | **Never** — `[STUDENT DATA REQUIRED]` markers instead | Clean |

Sample and Demo are both `Project.kind = DEMO` in the database, so every
existing safeguard applies to both without change. They differ by origin, which
is what `demoOrigin` records.

`kind` is immutable at the database level — a trigger raises on any attempt to
change it. A demo can never become a real project by editing a row; converting
one creates a new project and strips fabricated content back to markers.

## Why fabrication is gated on mode

A student who wants to see what a finished project looks like on *their* topic
is asking a reasonable question, and answering it is the product's hook. A
student writing a real project must never be handed invented results, because
they cannot tell which numbers are theirs.

Gating on `kind` makes that a property of the data rather than of a prompt:
the pipeline branches on it, the export policy branches on it, and the mode
cannot be changed after creation.

## Decisions

### The title page of a personal demo carries the student's real details

Institution, faculty, department, programme and name are printed as entered,
exactly as a real export would.

The consequence, recorded because it shapes everything else: **a personal demo
is visually identical to a finished submission apart from its markings.** The
markings are therefore the whole safeguard, which is why:

- All three must be present — title-page block, running footer on every page,
  page watermark — and an export is refused unless all three are found in the
  produced bytes by `verifyDisclaimer`, not merely claimed by the renderer.
- The generated prose itself states that the study is illustrative, so a reader
  who sees only one page still learns what the document is.
- Every admin clean export writes an `AuditLog` row naming the person.

### Generate free, export paid

| Plan | Generate a demo | Read it in the workspace | Download the file |
|---|---|---|---|
| Free | yes | yes | **no** |
| Paid | yes | yes | yes |

Already the behaviour: `canExportDemo: false` on the free plan blocks the
download, and generation is limited by `maxGenerationsPerMonth` rather than by
mode. A free student experiences the whole project before paying; the
downloadable artifact — the thing that could be misused — stays gated.

### Topic goes straight to generation

The nine-step wizard is optional. A student may supply a topic and generate
immediately, in either mode. Everything the wizard collects remains available
and improves the result, but none of it is required.

For a **real** project this changes nothing about integrity: without a stated
sample size, population or instrument, the generated methodology and results
carry `[STUDENT DATA REQUIRED]` markers wherever those values belong. Less
input means more markers, not invented values.

## Invariants

1. A `REAL` project never contains fabricated results, participants,
   statistics, interviews or observations. Missing data becomes a tracked
   marker.
2. `kind` cannot change after creation.
3. A student's demo export always carries all three markings, verified against
   the produced bytes.
4. An admin's clean demo export is always audit-logged.
5. Nothing invents publication data for references, in any mode.
