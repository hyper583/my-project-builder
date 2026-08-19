import {
  Capabilities,
  Faq,
  Features,
  FinalCta,
  Hero,
  HowItWorks,
} from "@/components/marketing/sections";
import { SiteFooter, SiteHeader } from "@/components/marketing/site-chrome";

export default function LandingPage() {
  return (
    <>
      <SiteHeader />
      <main id="main" className="flex-1">
        <Hero />
        <HowItWorks />
        <Capabilities />
        <Features />
        <Faq />
        <FinalCta />
      </main>
      <SiteFooter />
    </>
  );
}
