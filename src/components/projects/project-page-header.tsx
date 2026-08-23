import Link from "next/link";

/**
 * The heading every project page shares.
 *
 * Each of these pages answers one question, and the eyebrow says which project
 * it is being asked about — without it, four pages that look alike become four
 * pages you can get lost between. The title links back to the project so the
 * name is a way home rather than decoration.
 */
export function ProjectPageHeader({
  projectId,
  projectTitle,
  section,
  children,
}: {
  projectId: string;
  projectTitle: string;
  section: string;
  /** One line on what this page is for. */
  children?: React.ReactNode;
}) {
  return (
    <header>
      <Link
        href={`/projects/${projectId}/blueprint`}
        className="label-caps focus-glow inline-block rounded-sm transition-colors duration-150 hover:text-muted-foreground"
      >
        {projectTitle}
      </Link>
      <h1 className="mt-2 text-[2rem] leading-none font-semibold tracking-[-0.035em]">
        {section}
      </h1>
      {children ? (
        <p className="mt-2.5 max-w-2xl leading-relaxed text-muted-foreground">{children}</p>
      ) : null}
    </header>
  );
}
