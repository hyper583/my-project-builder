import Link from "next/link";

import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Button } from "@/components/ui/button";

const NAV = [
  { href: "#how-it-works", label: "How it works" },
  { href: "#capabilities", label: "What you get" },
  { href: "#faq", label: "FAQ" },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur-sm">
      <div className="mx-auto flex w-full max-w-6xl items-center gap-3 px-5 py-3 sm:gap-6 sm:px-8">
        <Link href="/" className="flex shrink-0 items-center gap-2.5">
          <span
            aria-hidden="true"
            className="flex size-7 items-center justify-center rounded-md bg-primary font-serif text-sm font-semibold text-on-primary"
          >
            M
          </span>
          {/*
            The wordmark is dropped below `sm`. With it, the mark plus the two
            auth buttons overflowed a 375px viewport by ~115px; the monogram
            still identifies the product, and the link still reads "My Project
            Builder" to a screen reader.
          */}
          <span className="hidden font-serif text-lg font-semibold tracking-tight sm:inline">
            My Project Builder
          </span>
          <span className="sr-only sm:hidden">My Project Builder</span>
        </Link>

        <nav aria-label="Main" className="hidden flex-1 items-center gap-7 text-sm md:flex">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-muted-foreground transition-colors duration-150 hover:text-foreground"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2 md:ml-0">
          <ThemeToggle className="hidden sm:inline-flex" />
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
    <footer className="border-t border-border bg-surface">
      <div className="mx-auto w-full max-w-6xl px-5 py-12 sm:px-8">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-2">
            <div className="flex items-center gap-2.5">
              <span
                aria-hidden="true"
                className="flex size-7 items-center justify-center rounded-md bg-primary font-serif text-sm font-semibold text-on-primary"
              >
                M
              </span>
              <span className="font-serif text-lg font-semibold tracking-tight">
                My Project Builder
              </span>
            </div>
            <p className="mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">
              An academic project workspace. It assists with drafting, organisation and
              formatting — it does not fabricate research results, participants or findings.
            </p>
          </div>

          <div>
            <h2 className="text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">
              Product
            </h2>
            <ul className="mt-3 space-y-2 text-sm">
              {NAV.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="text-muted-foreground transition-colors duration-150 hover:text-foreground"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h2 className="text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">
              Account
            </h2>
            <ul className="mt-3 space-y-2 text-sm">
              <li>
                <Link
                  href="/login"
                  className="text-muted-foreground transition-colors duration-150 hover:text-foreground"
                >
                  Sign in
                </Link>
              </li>
              <li>
                <Link
                  href="/register"
                  className="text-muted-foreground transition-colors duration-150 hover:text-foreground"
                >
                  Create an account
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-10 flex flex-col items-start justify-between gap-4 border-t border-border pt-6 sm:flex-row sm:items-center">
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} My Project Builder. All rights reserved.
          </p>
          <ThemeToggle />
        </div>
      </div>
    </footer>
  );
}
