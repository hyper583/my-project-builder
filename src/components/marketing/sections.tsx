import Link from "next/link";
import {
  ArrowRight,
  ClipboardList,
  FileDown,
  FileSearch,
  PenLine,
  Plus,
  ShieldCheck,
  Upload,
} from "lucide-react";

import { Reveal } from "@/components/motion/reveal";
import { Button } from "@/components/ui/button";

/**
 * Landing page sections.
 *
 * Swiss Modernism supplies the structure: a twelve-column grid, mathematical
 * spacing, hairline rules and a single accent used only to mark position.
 * Hierarchy is carried by type size and whitespace, never by decoration —
 * which is what keeps a serious academic product from looking like every
 * other AI landing page.
 */

function Container({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={`mx-auto w-full max-w-6xl px-5 sm:px-8 ${className}`}>{children}</div>;
}

/** Section label: index, rule, name. The Swiss signature of the page. */
function Eyebrow({ index, children }: { index: string; children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-3 text-xs font-semibold tracking-[0.18em] uppercase">
      <span className="mono text-primary">{index}</span>
      <span aria-hidden="true" className="draw-rule h-px w-8 bg-border-strong" />
      <span className="text-muted-foreground">{children}</span>
    </p>
  );
}

function SectionHeading({
  index,
  eyebrow,
  title,
  lead,
}: {
  index: string;
  eyebrow: string;
  title: string;
  lead?: string;
}) {
  return (
    <Reveal className="max-w-2xl">
      <Eyebrow index={index}>{eyebrow}</Eyebrow>
      <h2 className="mt-5 text-3xl font-semibold sm:text-[2.6rem] sm:leading-[1.1]">{title}</h2>
      {lead ? (
        <p className="mt-4 text-lg leading-relaxed text-muted-foreground">{lead}</p>
      ) : null}
    </Reveal>
  );
}

/* ------------------------------------------------------------------ */

export function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-border">
      <Container className="relative py-16 sm:py-24 lg:py-28">
        <div className="grid items-center gap-12 lg:grid-cols-12 lg:gap-10">
          <div className="lg:col-span-7">
            <Reveal>
              <Eyebrow index="01">For final year projects, theses and dissertations</Eyebrow>
            </Reveal>

            <Reveal delay={80}>
              <h1 className="mt-6 text-[2.6rem] leading-[1.05] font-semibold sm:text-6xl lg:text-[4.1rem]">
                Build your academic project from the ground up.
              </h1>
            </Reveal>

            <Reveal delay={160}>
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
                Give us your topic, department, research details, requirements and existing
                materials. My Project Builder turns your information into an organised, editable
                academic project workspace.
              </p>
            </Reveal>

            <Reveal delay={240}>
              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <Button asChild size="lg">
                  <Link href="/register">
                    Build My Project
                    <ArrowRight
                      className="size-4 transition-transform duration-200 group-hover:translate-x-0.5"
                      aria-hidden="true"
                    />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <Link href="#how-it-works">See how it works</Link>
                </Button>
              </div>
            </Reveal>

            <Reveal delay={320}>
              <p className="mt-7 border-l-2 border-accent pl-4 text-sm leading-relaxed text-muted-foreground">
                Your project is built around the information you provide — not from a topic
                alone. Results, participants and findings are never invented.
              </p>
            </Reveal>
          </div>

          {/*
            The grid line sits on the column boundary rather than at 50% of the
            section. Centred, it cut straight through the headline, which spans
            seven of twelve columns.
          */}
          <div className="lg:col-span-5 lg:border-l lg:border-border lg:pl-10">
            <Reveal delay={200}>
              <StructureFigure />
            </Reveal>
          </div>
        </div>
      </Container>
    </section>
  );
}

/**
 * A diagram of the chapter structure the product produces.
 *
 * Deliberately a diagram rather than a screenshot mock-up: it shows the shape
 * of the output without dressing up invented content as a real project.
 */
function StructureFigure() {
  const chapters = [
    { number: "1", title: "Introduction", sections: ["Background to the Study", "Statement of the Problem", "Aim and Objectives"] },
    { number: "2", title: "Literature Review", sections: ["Conceptual Framework", "Empirical Review"] },
    { number: "3", title: "Research Methodology", sections: ["Research Design", "Population of the Study"] },
  ];

  return (
    <figure className="rounded-xl border border-border bg-card p-5 elevated-2 sm:p-6">
      <figcaption className="mb-4 flex items-center justify-between border-b border-border pb-3">
        <span className="label-caps">Project structure</span>
        <span className="mono text-[0.625rem] text-subtle-foreground">Editable</span>
      </figcaption>

      <ol className="space-y-4">
        {chapters.map((chapter) => (
          <li key={chapter.number}>
            <p className="flex items-baseline gap-2.5 text-sm font-semibold">
              <span className="mono text-xs text-primary">{chapter.number}</span>
              {chapter.title}
            </p>
            <ul className="mt-1.5 space-y-1 border-l border-border pl-4">
              {chapter.sections.map((section, index) => (
                <li key={section} className="flex items-baseline gap-2.5 text-sm">
                  <span className="mono text-[0.625rem] text-subtle-foreground">
                    {chapter.number}.{index + 1}
                  </span>
                  <span className="text-muted-foreground">{section}</span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>

      <p className="mt-5 border-t border-border pt-4 text-xs leading-relaxed text-muted-foreground">
        Choose three, four, five or a custom number of chapters. Rename, reorder and delete
        sections to match your department.
      </p>
    </figure>
  );
}

/* ------------------------------------------------------------------ */

const STEPS = [
  {
    title: "Tell us about your project",
    body: "Institution, department, programme and level. Your approved topic, research problem, aim and objectives.",
  },
  {
    title: "Add your research detail",
    body: "Design, population, sample size, sampling technique, variables, instruments and analysis method.",
  },
  {
    title: "Upload what you already have",
    body: "Supervisor instructions, department guidelines, existing chapters, proposals, questionnaires and papers.",
  },
  {
    title: "Review your blueprint",
    body: "Check every detail and the proposed chapter structure before a single word is generated.",
  },
  {
    title: "Work in your project workspace",
    body: "Edit any section, ask for help on a selection, and keep everything consistent as the project grows.",
  },
  {
    title: "Export to Word or PDF",
    body: "Your formatting, your citation style, your chapter numbering — as a professional academic document.",
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="scroll-mt-20 border-b border-border">
      <Container className="py-20 sm:py-28">
        <SectionHeading
          index="02"
          eyebrow="How it works"
          title="Six steps, in your order of work"
          lead="Nothing is generated until you have reviewed and approved the blueprint."
        />

        <ol className="mt-14 grid gap-x-10 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
          {STEPS.map((step, i) => (
            <Reveal as="li" key={step.title} delay={i * 60} className="border-t border-border pt-5">
              <span
                className="mono-figure text-[1.75rem] leading-none font-medium text-primary"
                aria-hidden="true"
              >
                {String(i + 1).padStart(2, "0")}
              </span>
              <h3 className="mt-3 text-lg font-semibold">{step.title}</h3>
              <p className="mt-2 leading-relaxed text-muted-foreground">{step.body}</p>
            </Reveal>
          ))}
        </ol>
      </Container>
    </section>
  );
}

/* ------------------------------------------------------------------ */

const CAPABILITIES = [
  {
    icon: ClipboardList,
    title: "Project Builder",
    body: "A guided setup that collects institution, project type, topic, research information, methodology, existing materials, formatting and chapter structure. Every field is optional — skip what you don't have and come back to it. Your progress saves as you go.",
  },
  {
    icon: PenLine,
    title: "AI Project Editor",
    body: "Select any passage and ask for a rewrite, an expansion, a simplification or a smoother transition. Edits are made with your project's own research context in view, not in isolation.",
  },
  {
    icon: FileSearch,
    title: "Project Intelligence",
    body: "A project-wide check for contradictions — a sample size that changes between chapters, an objective with no matching research question, a citation with no reference. Findings are shown for your decision; research facts are never changed silently.",
  },
  {
    icon: Upload,
    title: "Document Uploads",
    body: "Add PDFs, Word documents and notes. Text is extracted and becomes part of your project's source library, so your own materials inform the work rather than sitting unused.",
  },
  {
    icon: FileDown,
    title: "DOCX and PDF Export",
    body: "Export a professional academic document with your headings, page numbering, chapter structure, tables, references and title pages preserved. Continue editing in Word afterwards.",
  },
  {
    icon: ShieldCheck,
    title: "Honest about your data",
    body: "Results, participants and statistical findings are never invented. Where your real data belongs, the project marks the spot clearly instead of filling it with something plausible.",
  },
];

export function Capabilities() {
  return (
    <section id="capabilities" className="scroll-mt-20 border-b border-border bg-surface">
      <Container className="py-20 sm:py-28">
        <SectionHeading
          index="03"
          eyebrow="What you get"
          title="A workspace, not a one-shot generator"
          lead="The project stays yours to shape at every stage."
        />

        <div className="mt-14 grid gap-5 sm:grid-cols-2">
          {CAPABILITIES.map(({ icon: Icon, title, body }, i) => (
            <Reveal as="article" key={title} delay={i * 60}>
              <div className="group h-full rounded-xl border border-border bg-card p-6 transition-[box-shadow,border-color,translate] duration-200 elevated-1 hover:-translate-y-0.5 hover:border-border-strong hover:elevated-3">
              <span className="flex size-10 items-center justify-center rounded-lg bg-muted transition-colors duration-200 group-hover:bg-accent-subtle">
                <Icon
                  className="size-5 text-primary transition-colors duration-200 group-hover:text-accent"
                  aria-hidden="true"
                />
              </span>
                <h3 className="mt-4 text-xl font-semibold">{title}</h3>
                <p className="mt-2 leading-relaxed text-muted-foreground">{body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </Container>
    </section>
  );
}

/* ------------------------------------------------------------------ */

const FEATURES = [
  "Institution, faculty, department and programme presets — with custom values always allowed",
  "Eleven project types, from final year project to dissertation, laboratory and software projects",
  "Methodology forms that change to match your project type",
  "Twenty-three research fields, from research problem through to key terminology",
  "An unrestricted field for supervisor instructions and anything else that doesn't fit a form",
  "APA 7, MLA, Chicago, Harvard, IEEE, Vancouver, or your department's own style",
  "Three, four, five or a custom number of chapters, with sections you can rename and reorder",
  "Reference management that marks unverifiable details for review rather than inventing them",
  "Version history, so you can return to how the project looked before a round of corrections",
];

export function Features() {
  return (
    <section className="border-b border-border">
      <Container className="py-20 sm:py-28">
        <SectionHeading
          index="04"
          eyebrow="Features"
          title="Built for how projects are actually supervised"
        />

        <ul className="mt-12 grid border-t border-border sm:grid-cols-2">
          {FEATURES.map((feature, index) => (
            <li
              key={feature}
              className={`flex gap-4 border-b border-border py-4 ${
                index % 2 === 0 ? "sm:pr-8" : "sm:border-l sm:pl-8"
              }`}
            >
              <span
                className="tabular mt-0.5 shrink-0 text-xs text-subtle-foreground"
                aria-hidden="true"
              >
                {String(index + 1).padStart(2, "0")}
              </span>
              <span className="leading-relaxed text-muted-foreground">{feature}</span>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}

/* ------------------------------------------------------------------ */

const FAQS = [
  {
    q: "Will it write my whole project for me?",
    a: "It drafts, organises, rewrites and formats around the information you supply. It will not invent your results, your participants or your statistical findings — where your own data belongs, it marks the section clearly so you can add it.",
  },
  {
    q: "What if my department has its own requirements?",
    a: "Add them. There is an unrestricted field for supervisor instructions, departmental requirements, preferred theories, formatting rules and anything else that doesn't fit a form. You can also upload your department's template.",
  },
  {
    q: "Do I have to fill in every field?",
    a: "No. Every field is optional and you can return to any step later. Your progress saves as you work, so you can leave and come back.",
  },
  {
    q: "Can I change the chapter structure?",
    a: "Yes. Choose three, four, five or a custom number of chapters, then add, rename, reorder and delete sections. Not every discipline follows the same structure, so none is imposed.",
  },
  {
    q: "What happens to documents I upload?",
    a: "They are stored privately against your project and the text is extracted so it can inform the work. They are visible only to you, and you can delete them at any time.",
  },
  {
    q: "Can I keep working in Microsoft Word?",
    a: "Yes. Export to DOCX with your headings, numbering, tables and references intact, and carry on in Word.",
  },
];

export function Faq() {
  return (
    <section id="faq" className="scroll-mt-20 border-b border-border bg-surface">
      <Container className="py-20 sm:py-28">
        <SectionHeading index="05" eyebrow="FAQ" title="Questions students ask first" />

        <div className="mt-12 max-w-3xl border-t border-border">
          {FAQS.map(({ q, a }) => (
            <details key={q} className="group border-b border-border">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-5 text-lg font-medium transition-colors duration-150 hover:text-accent">
                {q}
                <Plus
                  className="size-4 shrink-0 text-accent transition-transform duration-200 group-open:rotate-45"
                  aria-hidden="true"
                />
              </summary>
              <p className="pr-10 pb-5 leading-relaxed text-muted-foreground">{a}</p>
            </details>
          ))}
        </div>
      </Container>
    </section>
  );
}

/* ------------------------------------------------------------------ */

export function FinalCta() {
  return (
    <section>
      <Container className="py-20 sm:py-28">
        {/*
          The one place the ink colour is used as a field rather than as text.
          Its rarity is what gives it weight.
        */}
        <div className="relative overflow-hidden rounded-2xl bg-ink px-8 py-14 elevated-3 sm:px-14 sm:py-16">
          <div
            aria-hidden="true"
            className="absolute inset-y-0 right-10 hidden w-px bg-on-ink/15 lg:block"
          />

          <div className="relative max-w-2xl">
            <p className="flex items-center gap-3 text-xs font-semibold tracking-[0.18em] text-on-ink/70 uppercase">
              <span className="tabular">06</span>
              <span aria-hidden="true" className="h-px w-8 bg-on-ink/30" />
              Get started
            </p>

            <h2 className="mt-5 text-3xl font-semibold text-on-ink sm:text-[2.6rem] sm:leading-[1.1]">
              Start with what you already know about your project.
            </h2>

            <p className="mt-4 text-lg leading-relaxed text-on-ink/80">
              Your topic, your department, your supervisor&apos;s instructions and whatever
              materials you have so far. That is enough to begin.
            </p>

            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" variant="accent">
                <Link href="/register">
                  Build My Project
                  <ArrowRight
                    className="size-4 transition-transform duration-200 group-hover:translate-x-0.5"
                    aria-hidden="true"
                  />
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="border-on-ink/25 bg-transparent text-on-ink hover:border-on-ink/40 hover:bg-on-ink/10"
              >
                <Link href="/login">I already have an account</Link>
              </Button>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
