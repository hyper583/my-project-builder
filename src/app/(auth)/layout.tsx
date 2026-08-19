import Link from "next/link";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main id="main" className="flex flex-1 items-center justify-center px-5 py-14">
      <div className="w-full max-w-md">
        <Link
          href="/"
          className="font-serif text-lg font-semibold tracking-tight text-muted-foreground hover:text-foreground"
        >
          My Project Builder
        </Link>
        <div className="mt-6 rounded-lg border border-border bg-card p-7 sm:p-9">{children}</div>
      </div>
    </main>
  );
}
