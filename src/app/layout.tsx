import type { Metadata } from "next";
import { EB_Garamond, Geist, Geist_Mono } from "next/font/google";

import { ThemeProvider } from "@/components/theme/theme-provider";
import { THEME_STORAGE_KEY } from "@/lib/theme";

import "./globals.css";

/**
 * Three faces, three jobs.
 *
 * Geist is the instrument — every piece of chrome. Geist Mono is the technical
 * register: percentages, word counts, step numbers, statuses. EB Garamond is
 * the artifact, and appears only inside `.document`, where an actual academic
 * document is being written. Confining the serif to that one place is what
 * keeps it meaningful rather than decorative.
 *
 * All three are self-hosted by `next/font`, so no request leaves for a CDN and
 * there is no flash of fallback text.
 */
const geist = Geist({
  variable: "--font-geist",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

const ebGaramond = EB_Garamond({
  variable: "--font-eb-garamond",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "My Project Builder",
    template: "%s · My Project Builder",
  },
  description:
    "Build your academic project from the ground up. Give My Project Builder your topic, " +
    "department, research details, requirements and existing materials, and it turns them " +
    "into an organised, editable academic project workspace.",
};

/**
 * Applies the theme before the first paint.
 *
 * This has to be a blocking inline script: React cannot help, because by the
 * time it hydrates the browser has already painted and the user has seen a
 * white flash.
 *
 * Three stored states, and the absence of any:
 *
 *   "light" | "dark"  →  stamp the attribute, an explicit choice
 *   "system"          →  remove it, and let `prefers-color-scheme` decide
 *   nothing stored    →  stamp "dark", the product default
 *
 * That last line is the one that makes the product dark-first. "System" has to
 * be stored explicitly now precisely because absence no longer means it.
 */
const themeScript = `(function(){try{var k=${JSON.stringify(THEME_STORAGE_KEY)};var t=localStorage.getItem(k);if(t==="light"||t==="dark"){document.documentElement.setAttribute("data-theme",t);}else if(t!=="system"){document.documentElement.setAttribute("data-theme","dark");}}catch(e){document.documentElement.setAttribute("data-theme","dark");}})();`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // The pre-paint script mutates <html> before React hydrates, so the
    // server and client markup differ here by design.
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geist.variable} ${geistMono.variable} ${ebGaramond.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="flex min-h-full flex-col bg-background text-foreground">
        <a href="#main" className="skip-link">
          Skip to main content
        </a>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
