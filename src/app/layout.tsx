import type { Metadata } from "next";
import { EB_Garamond, Inter } from "next/font/google";

import { ThemeProvider } from "@/components/theme/theme-provider";
import { THEME_STORAGE_KEY } from "@/lib/theme";

import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
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
 * Applies a stored theme before the first paint.
 *
 * This has to be a blocking inline script: React cannot help, because by the
 * time it hydrates the browser has already painted, and the user sees a white
 * flash before the dark theme lands. Absence of a stored value is meaningful —
 * it means "follow the system", so the attribute is left off and the CSS
 * `prefers-color-scheme` block decides.
 */
const themeScript = `(function(){try{var t=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)});if(t==="dark"||t==="light"){document.documentElement.setAttribute("data-theme",t);}}catch(e){}})();`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // The pre-paint script mutates <html> before React hydrates, so the
    // server and client markup differ here by design.
    <html
      lang="en"
      suppressHydrationWarning
      className={`${inter.variable} ${ebGaramond.variable} h-full antialiased`}
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
