import Link from "next/link";

import { Button } from "@/components/ui/button";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-6 px-5 py-3 sm:px-8">
        <Link href="/" className="font-serif text-lg font-semibold tracking-tight">
          My Project Builder
        </Link>
        <nav aria-label="Main" className="hidden items-center gap-6 text-sm md:flex">
          <Link href="#how-it-works" className="text-muted-foreground hover:text-foreground">
            How it works
          </Link>
          <Link href="#capabilities" className="text-muted-foreground hover:text-foreground">
            Features
          </Link>
          <Link href="#faq" className="text-muted-foreground hover:text-foreground">
            FAQ
          </Link>
        </nav>
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link href="/login">Sign in</Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/register">Get started</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-5 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <p className="text-sm text-muted-foreground">
          My Project Builder — an academic project workspace.
        </p>
        <p className="max-w-md text-sm text-muted-foreground">
          Assists with drafting, organisation and formatting. It does not fabricate research
          results, participants or findings.
        </p>
      </div>
    </footer>
  );
}
