import Link from "next/link";
import {
  ArrowRight,
  ClipboardList,
  FileDown,
  FileSearch,
  GraduationCap,
  ListChecks,
  PenLine,
  ShieldCheck,
  Upload,
} from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Landing page sections.
 *
 * Section order follows the product brief. The visual treatment is deliberately
 * restrained — hierarchy comes from typography and spacing, not decoration,
 * because the product needs to read as serious academic software.
 */

function Container({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-6xl px-5 sm:px-8 ${className}`}>{children}</div>;
}

function SectionHeading({ eyebrow, title, lead }: { eyebrow: string; title: string; lead?: string }) {
  return (
    <div className="max-w-2xl">
      <p className="text-sm font-medium tracking-wide text-accent uppercase">{eyebrow}</p>
      <h2 className="mt-3 text-3xl font-semibold sm:text-4xl">{title}</h2>
      {lead ? <p className="mt-4 text-lg leading-relaxed text-muted-foreground">{lead}</p> : null}
    </div>
  );
}

export function Hero() {
  return (
    <section className="border-b border-border bg-card">
      <Container className="py-20 sm:py-28">
        <div className="max-w-3xl">
          <p className="text-sm font-medium tracking-[0.2em] text-accent uppercase">
            My Project Builder
          </p>
          <h1 className="mt-5 text-4xl leading-tight font-semibold sm:text-6xl">
            Build your academic project from the ground up.
          </h1>
          <p className="mt-6 text-lg leading-relaxed text-muted-foreground sm:text-xl">
            Give us your topic, department, research details, requirements and existing
            materials. My Project Builder turns your information into an organised, editable
            academic project workspace.
          </p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg">
              <Link href="/register">
                Build My Project
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="#how-it-works">See How It Works</Link>
            </Button>
          </div>
          <p className="mt-6 text-sm text-muted-foreground">
            Your project is built around the information you provide — not from a topic alone.
          </p>
        </div>
      </Container>
    </section>
  );
}

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
      <Container className="py-20 sm:py-24">
        <SectionHeading
          eyebrow="How it works"
          title="Six steps, in your order of work"
          lead="Nothing is generated until you have reviewed and approved the blueprint."
        />
        <ol className="mt-12 grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
          {STEPS.map((step, i) => (
            <li key={step.title} className="border-t border-border pt-5">
              <span className="font-serif text-2xl text-accent" aria-hidden="true">
                {String(i + 1).padStart(2, "0")}
              </span>
              <h3 className="mt-2 text-lg font-semibold">{step.title}</h3>
              <p className="mt-2 leading-relaxed text-muted-foreground">{step.body}</p>
            </li>
          ))}
        </ol>
      </Container>
    </section>
  );
}

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
    <section id="capabilities" className="scroll-mt-20 border-b border-border bg-card">
      <Container className="py-20 sm:py-24">
        <SectionHeading
          eyebrow="What you get"
          title="A workspace, not a one-shot generator"
          lead="The project stays yours to shape at every stage."
        />
        <div className="mt-12 grid gap-8 sm:grid-cols-2">
          {CAPABILITIES.map(({ icon: Icon, title, body }) => (
            <article key={title} className="rounded-lg border border-border bg-background p-6">
              <Icon className="size-6 text-primary" aria-hidden="true" />
              <h3 className="mt-4 text-xl font-semibold">{title}</h3>
              <p className="mt-2 leading-relaxed text-muted-foreground">{body}</p>
            </article>
          ))}
        </div>
      </Container>
    </section>
  );
}

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
      <Container className="py-20 sm:py-24">
        <SectionHeading eyebrow="Features" title="Built for how projects are actually supervised" />
        <ul className="mt-10 grid gap-x-10 gap-y-4 sm:grid-cols-2">
          {FEATURES.map((feature) => (
            <li key={feature} className="flex gap-3">
              <ListChecks className="mt-1 size-5 shrink-0 text-accent" aria-hidden="true" />
              <span className="leading-relaxed text-muted-foreground">{feature}</span>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}

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
    <section id="faq" className="scroll-mt-20 border-b border-border bg-card">
      <Container className="py-20 sm:py-24">
        <SectionHeading eyebrow="FAQ" title="Questions students ask first" />
        <div className="mt-10 max-w-3xl divide-y divide-border border-y border-border">
          {FAQS.map(({ q, a }) => (
            <details key={q} className="group py-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-lg font-medium">
                {q}
                <span
                  className="text-accent transition-transform duration-200 group-open:rotate-45"
                  aria-hidden="true"
                >
                  +
                </span>
              </summary>
              <p className="mt-3 leading-relaxed text-muted-foreground">{a}</p>
            </details>
          ))}
        </div>
      </Container>
    </section>
  );
}

export function FinalCta() {
  return (
    <section>
      <Container className="py-20 sm:py-24">
        <div className="rounded-lg border border-border bg-card p-10 sm:p-14">
          <GraduationCap className="size-8 text-primary" aria-hidden="true" />
          <h2 className="mt-5 max-w-2xl text-3xl font-semibold sm:text-4xl">
            Start with what you already know about your project.
          </h2>
          <p className="mt-4 max-w-2xl text-lg leading-relaxed text-muted-foreground">
            Your topic, your department, your supervisor&apos;s instructions and whatever
            materials you have so far. That is enough to begin.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg">
              <Link href="/register">
                Build My Project
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/login">I already have an account</Link>
            </Button>
          </div>
        </div>
      </Container>
    </section>
  );
}
