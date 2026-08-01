"use client";

import Link from "next/link";
import { Wordmark } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Leaf,
  Shield,
  Sparkles,
  ArrowRight,
  Beaker,
  Flame,
  Search,
} from "lucide-react";

const BRANDS = [
  "Magiccann", "Sanan Relief", "Polyherbs", "The Trost", "MediCann",
  "Andyou", "Hebe Wellness", "Cannazo", "Cure By Design", "Cannavedic",
  "Qurist", "Kushiva", "Moon Impact",
];

export default function Home() {
  return (
    <div className="relative min-h-screen">
      {/* Nav */}
      <header className="sticky top-0 z-40 border-b border-border/60 bg-noir/80 backdrop-blur-md">
        <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Wordmark />
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/app">Open App</Link>
            </Button>
            <Button variant="primary" size="sm" asChild>
              <Link href="/app">Find my gummy</Link>
            </Button>
          </div>
        </nav>
      </header>

      {/* Hero */}
      <section className="relative w-full overflow-hidden">
        {/* Soft resin + leaf glows behind the hero */}
        <div className="pointer-events-none absolute inset-0 z-0">
          <div className="absolute left-[-10%] top-[10%] h-[420px] w-[420px] rounded-full bg-resin/10 blur-[120px]" />
          <div className="absolute right-[-5%] bottom-[5%] h-[380px] w-[380px] rounded-full bg-leaf/10 blur-[120px]" />
        </div>

        <div className="relative z-10 mx-auto max-w-4xl px-6 pt-24 pb-28 text-center">
          <div className="animate-fade-in-up">
            <Badge variant="resin" className="mb-7">
              <Leaf className="h-3 w-3" /> the cannabis sommelier
            </Badge>
          </div>

          <h1 className="animate-fade-in-up font-display text-5xl font-semibold leading-[1.02] tracking-tight text-ink sm:text-7xl">
            Too many brands.
            <br />
            <span className="italic text-resin">One opinionated guide.</span>
          </h1>

          <p className="mx-auto mt-8 max-w-xl animate-fade-in-up text-lg leading-relaxed text-ink-soft" style={{ animationDelay: "100ms" }}>
            Thirteen brands. Hundreds of gummies. Zero idea what to pick.
            <br />
            SaulSilver interviews you.
            <br />
            Verifies the pick.
            <br />
            Then buys it.
          </p>

          <div className="mt-10 flex animate-fade-in-up flex-col items-center justify-center gap-3 sm:flex-row" style={{ animationDelay: "200ms" }}>
            <Button size="lg" className="w-full px-8 glow-resin sm:w-auto" asChild>
              <Link href="/app">
                Match me <ArrowRight className="ml-1.5 h-4 w-4" />
              </Link>
            </Button>
            <Button size="lg" variant="secondary" className="w-full px-8 sm:w-auto" asChild>
              <Link href="/app">
                Is this brand any good?
              </Link>
            </Button>
          </div>

          <p className="mt-6 animate-fade-in-up text-xs uppercase tracking-[0.2em] text-ink-muted" style={{ animationDelay: "300ms" }}>
            21+ · legal markets only · Prava-secured checkout
          </p>
        </div>
      </section>

      {/* The reframe — the core thesis */}
      <section className="border-y border-border bg-noir-soft py-28">
        <div className="mx-auto max-w-5xl px-6">
          <div className="grid gap-px overflow-hidden rounded-2xl border border-border bg-border md:grid-cols-2">
            <ReframeCell
              label="The problem"
              lines={[
                "Pharmacies know stock.",
                "Stoners know strains.",
                "Nobody knows what's safe.",
              ]}
              tone="muted"
            />
            <ReframeCell
              label="The fix"
              lines={[
                "A sommelier that interviews you.",
                "An engine that verifies the pick.",
                "A checkout that closes.",
              ]}
              tone="resin"
            />
          </div>

          <p className="mx-auto mt-10 max-w-2xl text-center font-display text-2xl font-medium leading-snug text-ink">
            Other agents find you the cheapest gummy.
            <br />
            <span className="italic text-resin">SaulSilver finds you the right one.</span>
          </p>
        </div>
      </section>

      {/* The three doors */}
      <section className="bg-noir py-28">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mb-14 text-center">
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-resin">three ways in</p>
            <h2 className="mt-4 font-display text-4xl font-medium text-ink sm:text-5xl">
              What do you want to do?
            </h2>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            <DoorCard
              icon={<Sparkles className="h-6 w-6" />}
              tone="resin"
              kicker="Match me"
              title="The sommelier"
              body="Tell it your vibe. Sleep, anxiety, focus, euphoria. First-timer or seasoned. It interviews you, then picks."
              cta="Get matched"
              badge="Headliner"
            />
            <DoorCard
              icon={<Shield className="h-6 w-6" />}
              tone="frost"
              kicker="Trust check"
              title="Is this brand legit?"
              body="A friend told you to buy X. SaulSilver checks the lab tests, the license, the reviews. Tells you straight."
              cta="Verify a brand"
            />
            <DoorCard
              icon={<Beaker className="h-6 w-6" />}
              tone="leaf"
              kicker="Just buy it"
              title="The checkout"
              body="Found the one. Finds who stocks it, compares price and delivery, closes a real Prava-secured transaction."
              cta="Browse the menu"
            />
          </div>
        </div>
      </section>

      {/* The good vice — cost-per-hour reframe */}
      <section className="border-y border-border bg-noir-soft py-28">
        <div className="mx-auto max-w-5xl px-6">
          <div className="mb-14 text-center">
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-resin">the good vice</p>
            <h2 className="mt-4 font-display text-4xl font-medium leading-tight text-ink sm:text-5xl">
              The expensive night out
              <br />
              <span className="italic text-resin">is the cheap one.</span>
            </h2>
          </div>

          {/* The reframe — three lines, observational */}
          <div className="mx-auto mb-16 max-w-2xl space-y-2 text-center">
            <p className="font-display text-2xl font-medium leading-snug text-ink-soft">
              Beer costs ₹300.
            </p>
            <p className="font-display text-2xl font-medium leading-snug text-ink-soft">
              It also costs tomorrow.
            </p>
            <p className="font-display text-2xl font-medium leading-snug text-ink">
              A gummy costs the same. <span className="italic text-resin">The morning is free.</span>
            </p>
          </div>

          {/* The math — two-column comparison */}
          <div className="grid gap-px overflow-hidden rounded-2xl border border-border bg-border md:grid-cols-2">
            {/* Beer */}
            <div className="bg-noir-card p-8">
              <div className="mb-6 flex items-center gap-3">
                <span className="text-3xl">🍺</span>
                <span className="font-display text-xl font-medium text-ink-soft">One pint</span>
              </div>
              <div className="space-y-4">
                <MathRow label="Price" value="₹300" tone="muted" />
                <MathRow label="Hours of effect" value="~2" tone="muted" />
                <MathRow label="Cost per hour" value="₹150" tone="muted" />
                <MathRow label="Tomorrow" value="Lost" tone="ember" />
              </div>
            </div>
            {/* Gummy */}
            <div className="bg-noir-card p-8 glow-resin">
              <div className="mb-6 flex items-center gap-3">
                <Leaf className="h-7 w-7 text-resin" />
                <span className="font-display text-xl font-medium text-ink">One gummy</span>
              </div>
              <div className="space-y-4">
                <MathRow label="Price" value="₹300" tone="ink" sub="from a ₹3,000 pack of 10" />
                <MathRow label="Hours of effect" value="6–8" tone="ink" />
                <MathRow label="Cost per hour" value="₹43" tone="resin" />
                <MathRow label="Tomorrow" value="Clear" tone="resin" />
              </div>
            </div>
          </div>

          {/* The punchline */}
          <p className="mx-auto mt-12 max-w-xl text-center font-display text-2xl font-medium leading-snug text-ink">
            Same price.
            <br />
            <span className="text-ink-muted">A third of the cost per hour.</span>
            <br />
            <span className="italic text-resin">And you keep your morning.</span>
          </p>
        </div>
      </section>

      {/* The brands marquee */}
      <section className="border-y border-border bg-noir-soft py-20">
        <div className="mx-auto max-w-5xl px-6 text-center">
          <p className="text-xs uppercase tracking-[0.25em] text-ink-muted">the menu, today</p>
          <h2 className="mt-4 font-display text-3xl font-medium text-ink">
            13 brands. Every Indian cannabis gummy worth knowing.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-ink-soft">
            Curated, not scraped. Each verified for cannabinoid profile, lab status, and legality before it hits the menu.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            {BRANDS.map((b) => (
              <span
                key={b}
                className="rounded-full border border-border bg-noir-card px-4 py-2 text-sm text-ink-soft transition-colors hover:border-resin/40 hover:text-resin-light"
              >
                {b}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Two-tier: honest about the rails */}
      <section className="bg-noir py-28">
        <div className="mx-auto max-w-5xl px-6">
          <div className="mb-14 text-center">
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-resin">honest about the rails</p>
            <h2 className="mt-4 font-display text-4xl font-medium text-ink">
              What closes today. What's coming.
            </h2>
            <p className="mx-auto mt-5 max-w-2xl text-ink-soft">
              Prava issues a virtual card scoped to one merchant. For that card to land, the merchant needs a real checkout. SaulSilver is built for both realities.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <Card className="border-resin/30 bg-noir-card p-8 glow-resin">
              <div className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-resin/15 text-resin">
                <Shield className="h-6 w-6" />
              </div>
              <Badge variant="resin" className="mb-4">Closes live</Badge>
              <h3 className="mb-3 font-display text-2xl font-medium text-ink">
                Direct-to-consumer brands
              </h3>
              <p className="text-sm leading-relaxed text-ink-soft">
                Moon Impact, The Trost, Hebe Wellness, Cure By Design, Qurist.
                Real <code className="rounded bg-noir-raised px-1.5 py-0.5 text-xs text-resin-light">https</code> checkouts.
                The full Prava lifecycle closes end to end — session created, passkey approved, virtual card issued, checkout completed.
              </p>
            </Card>

            <Card className="border-leaf/30 bg-noir-card p-8 glow-leaf">
              <div className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-leaf/15 text-leaf-light">
                <Flame className="h-6 w-6" />
              </div>
              <Badge variant="leaf" className="mb-4">Discovery + trust</Badge>
              <h3 className="mb-3 font-display text-2xl font-medium text-ink">
                Marketplace brands
              </h3>
              <p className="text-sm leading-relaxed text-ink-soft">
                Brands sold via ItsHemp, Hempkart, Hempiverse, THCStore.
                The sommelier matches and verifies them live. Checkout resolves to the marketplace rail.
                Both paths ship the moment marketplace onboarding or a UPI bridge lands.
              </p>
            </Card>
          </div>
        </div>
      </section>

      {/* How it works — compressed */}
      <section className="border-t border-border bg-noir-soft py-28">
        <div className="mx-auto max-w-4xl px-6">
          <div className="mb-14 text-center">
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-resin">the loop</p>
            <h2 className="mt-4 font-display text-4xl font-medium text-ink">Four steps. Zero busywork.</h2>
          </div>

          <div className="space-y-px overflow-hidden rounded-2xl border border-border">
            <StepRow n="01" title="Tell it the vibe" body="Sleep. Focus. Euphoria. Couch-lock. One line is enough." />
            <StepRow n="02" title="It interviews you" body="Tolerance, ratio preference, flavor. Like a good budtender, faster." />
            <StepRow n="03" title="It verifies" body="Lab tests. License. Legality in your state. Senso backs the verdict." />
            <StepRow n="04" title="It buys" body="Finds stock, compares price, closes the Prava transaction. You approve." />
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="relative overflow-hidden bg-noir py-32">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute left-1/2 top-1/2 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-resin/8 blur-[140px]" />
        </div>
        <div className="relative z-10 mx-auto max-w-2xl px-6 text-center">
          <h2 className="font-display text-4xl font-medium leading-tight text-ink sm:text-5xl">
            Stop guessing.
            <br />
            <span className="italic text-resin">Start matching.</span>
          </h2>
          <p className="mx-auto mt-6 max-w-md text-ink-soft">
            The first cannabis concierge that interviews you, verifies the pick, and closes the deal.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button size="lg" className="w-full px-8 glow-resin sm:w-auto" asChild>
              <Link href="/app">
                Talk to SaulSilver <ArrowRight className="ml-1.5 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border bg-noir-soft py-12">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 text-center sm:flex-row sm:text-left">
          <Wordmark />
          <p className="text-sm text-ink-muted">
            Built for the Agentic Commerce Hackathon.
            <br className="sm:hidden" />
            {" "}Powered by{" "}
            <a href="https://prava.space" target="_blank" rel="noopener noreferrer" className="text-resin-light underline underline-offset-4 transition-colors hover:text-resin">Prava</a>,{" "}
            <a href="https://senso.ai" target="_blank" rel="noopener noreferrer" className="text-resin-light underline underline-offset-4 transition-colors hover:text-resin">Senso</a> &amp;{" "}
            <a href="https://openai.com" target="_blank" rel="noopener noreferrer" className="text-resin-light underline underline-offset-4 transition-colors hover:text-resin">OpenAI</a>.
          </p>
        </div>
        <div className="mx-auto mt-6 max-w-6xl px-6">
          <p className="text-center text-xs text-ink-muted">
            For legal markets only. Not medical advice. Not a seller. SaulSilver is a discovery and trust layer.
          </p>
        </div>
      </footer>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function ReframeCell({
  label,
  lines,
  tone,
}: {
  label: string;
  lines: string[];
  tone: "muted" | "resin";
}) {
  const isResin = tone === "resin";
  return (
    <div className={`p-10 ${isResin ? "bg-noir-card" : "bg-noir"}`}>
      <p className={`mb-5 text-xs uppercase tracking-[0.2em] ${isResin ? "text-resin" : "text-ink-muted"}`}>
        {label}
      </p>
      <div className="space-y-2">
        {lines.map((l) => (
          <p key={l} className={`font-display text-2xl font-medium leading-snug ${isResin ? "text-ink" : "text-ink-muted"}`}>
            {l}
          </p>
        ))}
      </div>
    </div>
  );
}

function DoorCard({
  icon,
  tone,
  kicker,
  title,
  body,
  cta,
  badge,
}: {
  icon: React.ReactNode;
  tone: "resin" | "frost" | "leaf";
  kicker: string;
  title: string;
  body: string;
  cta: string;
  badge?: string;
}) {
  const toneMap = {
    resin: { bg: "bg-resin/15", text: "text-resin", hover: "hover:border-resin/40" },
    frost: { bg: "bg-frost/15", text: "text-frost", hover: "hover:border-frost/40" },
    leaf: { bg: "bg-leaf/15", text: "text-leaf-light", hover: "hover:border-leaf/40" },
  }[tone];

  return (
    <Card className={`group relative flex flex-col bg-noir-card p-8 transition-colors ${toneMap.hover}`}>
      {badge && (
        <Badge variant="resin" className="absolute right-6 top-6">{badge}</Badge>
      )}
      <div className={`mb-6 inline-flex h-12 w-12 items-center justify-center rounded-xl ${toneMap.bg} ${toneMap.text}`}>
        {icon}
      </div>
      <p className={`mb-2 text-xs uppercase tracking-[0.2em] ${toneMap.text}`}>{kicker}</p>
      <h3 className="mb-3 font-display text-2xl font-medium text-ink">{title}</h3>
      <p className="mb-6 flex-1 text-sm leading-relaxed text-ink-soft">{body}</p>
      <Link
        href="/app"
        className={`inline-flex items-center gap-1.5 text-sm font-medium ${toneMap.text} transition-colors`}
      >
        {cta} <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
      </Link>
    </Card>
  );
}

function StepRow({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <div className="flex items-start gap-6 bg-noir-card p-7">
      <span className="font-display text-3xl font-semibold text-resin/50">{n}</span>
      <div>
        <h3 className="font-display text-lg font-medium text-ink">{title}</h3>
        <p className="mt-1 text-sm text-ink-soft">{body}</p>
      </div>
    </div>
  );
}

function MathRow({
  label,
  value,
  tone,
  sub,
}: {
  label: string;
  value: string;
  tone: "muted" | "ink" | "resin" | "ember";
  sub?: string;
}) {
  const toneMap = {
    muted: "text-ink-muted",
    ink: "text-ink",
    resin: "text-resin",
    ember: "text-ember",
  }[tone];
  return (
    <div className="flex items-baseline justify-between border-b border-border/50 pb-3 last:border-0 last:pb-0">
      <span className="text-sm text-ink-soft">
        {label}
        {sub && <span className="block text-xs text-ink-muted">{sub}</span>}
      </span>
      <span className={`font-display text-xl font-semibold ${toneMap}`}>{value}</span>
    </div>
  );
}
