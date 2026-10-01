import { GalaxyBackground } from "@/components/landing-atmosphere";
import { LandingHero } from "@/components/landing-hero";

export default function HomePage() {
  return (
    <main className="relative isolate -mt-16 flex min-h-dvh flex-col overflow-hidden pt-16">
      <GalaxyBackground />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgb(22_22_30/0.72)_0%,rgb(22_22_30/0.25)_55%,transparent_100%),radial-gradient(ellipse_70%_65%_at_38%_48%,transparent_0%,rgb(22_22_30/0.28)_55%,rgb(22_22_30/0.8)_100%)]"
      />
      <section className="pointer-events-none relative z-10 mx-auto flex w-full max-w-6xl flex-1 items-center px-6 py-16 lg:px-10">
        <LandingHero />
      </section>
    </main>
  );
}
