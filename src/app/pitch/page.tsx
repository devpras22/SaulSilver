"use client";

import Link from "next/link";
import { Wordmark } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { ArrowRight, Leaf } from "lucide-react";

/**
 * /pitch — the startup case.
 *
 * The landing page sells Saul (the cannabis expert). This page sells the COMPANY:
 * the pattern that spawns any category expert with a wallet, a mailbox, a browser,
 * and deep category knowledge. Built to hit Localhost's "Most Startup-Ready" bar:
 * problem clarity, product readiness, user demand, distribution potential.
 *
 * Voice: Jack Butcher — short. Declarative. Bold contrasts. No fluff.
 */
export default function Pitch() {
  return (
    <div className="min-h-screen bg-noir">
      {/* Nav */}
      <header className="sticky top-0 z-40 border-b border-border/60 bg-noir/80 backdrop-blur-md">
        <nav className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2 text-ink-muted transition-colors hover:text-ink">
            <ArrowRight className="h-4 w-4 rotate-180" /> back
          </Link>
          <Wordmark />
        </nav>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-24">
        {/* ── The thesis in one line ── */}
        <section className="animate-fade-in-up">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-resin">the pitch</p>
          <h1 className="mt-6 font-display text-5xl font-semibold leading-[1.05] tracking-tight text-ink sm:text-6xl">
            Everyone has an expert friend.
            <br />
            <span className="italic text-resin">We're productizing them.</span>
          </h1>
        </section>

        {/* ── The problem ── */}
        <Section kicker="the problem">
          <BigLine>Buying anything hard is exhausting.</BigLine>
          <BigLine muted>A gaming chair. Headphones. A camera. A jacket.</BigLine>
          <BigLine muted>Too many brands. Fake reviews. Sketchy sellers.</BigLine>
          <BigLine>You ask a friend who knows. Because they cut through it.</BigLine>
          <BigLine muted>But your friend has a job. And one specialty.</BigLine>
        </Section>

        {/* ── The shift ── */}
        <Section kicker="the shift">
          <BigLine>An AI agent can be that friend.</BigLine>
          <BigLine muted>Not a chatbot that answers questions.</BigLine>
          <BigLine>A colleague that does the work.</BigLine>
          <BigLine muted>It searches. It verifies. It negotiates. It buys.</BigLine>
          <BigLine>You approve. It handles the rest.</BigLine>
        </Section>

        {/* ── Saul is the proof ── */}
        <Section kicker="the proof">
          <BigLine>
            Saul Silver is the gummies one.
          </BigLine>
          <BigLine muted>Built for the Agentic Commerce Hackathon. Shipping today.</BigLine>
          <BigLine>He interviews you. Matches the right product.</BigLine>
          <BigLine muted>Verifies the lab tests and the license.</BigLine>
          <BigLine>Then drives a real browser to the real checkout</BigLine>
          <BigLine muted>and pays with a Prava virtual card scoped to that one merchant.</BigLine>
          <BigLine>Your card never touches him. His inbox owns the receipt.</BigLine>
        </Section>

        {/* ── The loop, abstracted ── */}
        <Section kicker="the loop (it's category-agnostic)">
          <div className="space-y-3">
            <LoopRow n="01" label="Give it a wallet" detail="Prava issues a one-time card scoped to the purchase. The agent can spend. You stay in control." />
            <LoopRow n="02" label="Give it a mailbox" detail="Order confirmations, tracking, returns land at the agent's inbox — not yours. It comes back to you." />
            <LoopRow n="03" label="Give it a browser" detail="A headless browser navigates the real merchant, fills the checkout, captures the decline or success." />
            <LoopRow n="04" label="Give it expertise" detail="Deep category knowledge — gummies today, fashion, tech, gaming tomorrow. The matching engine swaps." />
          </div>
        </Section>

        {/* ── The company ── */}
        <Section kicker="the company">
          <BigLine>We don't sell gummy advice.</BigLine>
          <BigLine muted>We sell a way to spawn experts.</BigLine>
          <BigLine>
            Saul is vertical one.
          </BigLine>
          <BigLine muted>The same harness produces a fashion buyer, a tech spec-nerd, a sneaker plug.</BigLine>
          <BigLine>Each one a trusted friend in a category you don't have time to master.</BigLine>
        </Section>

        {/* ── Why now ── */}
        <Section kicker="why now">
          <div className="grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2">
            <Pillar title="Payments are agent-ready" body="Prava + Visa tokenization means an agent can hold a scoped, one-time card. The agent pays without ever seeing your PAN." />
            <Pillar title="Browsers are agent-ready" body="Stagehand + Browserbase means an agent can drive a real checkout form. Not a screenshot. A real transaction." />
            <Pillar title="Mailboxes are agent-ready" body="AgentMail means an agent owns an inbox. It receives. It replies. It tracks." />
            <Pillar title="Trust is agent-ready" body="Senso means an agent grounds its picks in verified context. No hallucinated recommendations." />
          </div>
          <BigLine className="mt-10">
            The rails exist. Nobody has connected them into an agent that closes.
          </BigLine>
          <BigLine muted>Until now.</BigLine>
        </Section>

        {/* ── The numbers / traction-ready ── */}
        <Section kicker="the shape of demand">
          <div className="grid gap-4 sm:grid-cols-3">
            <Stat value="12" label="Indian Vijaya brands verified" />
            <Stat value="∞" label="categories the loop generalizes to" />
            <Stat value="1" label="agent that does the whole job, today" />
          </div>
        </Section>

        {/* ── The ask ── */}
        <section className="mt-24 rounded-2xl border border-resin/30 bg-resin/5 p-10 text-center backdrop-blur-2xl">
          <Leaf className="mx-auto mb-4 h-8 w-8 text-resin" />
          <h2 className="font-display text-3xl font-semibold leading-tight text-ink sm:text-4xl">
            Saul is the demo.
            <br />
            <span className="italic text-resin">The platform is the company.</span>
          </h2>
          <p className="mx-auto mt-5 max-w-md text-ink-soft">
            One category proved. A hundred categories possible. Same loop. Same rails. New expert.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button size="lg" className="w-full px-8 glow-resin bg-gradient-to-t from-resin-dark to-resin text-noir font-semibold shadow-inner shadow-white/30 hover:brightness-110 border border-resin-light/50 transition-all sm:w-auto" asChild>
              <Link href="/app?intent=match">
                Try Saul Silver <ArrowRight className="ml-1.5 h-4 w-4" />
              </Link>
            </Button>
            <Button size="lg" variant="secondary" className="w-full px-8 bg-noir/40 backdrop-blur-md border border-white/10 hover:bg-white/10 text-ink shadow-lg transition-all sm:w-auto" asChild>
              <Link href="/">
                Back to the product
              </Link>
            </Button>
          </div>
        </section>

        {/* ── Footer ── */}
        <footer className="mt-24 border-t border-border pt-8 text-center">
          <p className="text-sm text-ink-muted">
            Built for the Agentic Commerce Hackathon.
            <br />
            Powered by{" "}
            <a href="https://prava.space" target="_blank" rel="noopener noreferrer" className="text-resin-light underline underline-offset-4 hover:text-resin">Prava</a>,{" "}
            <a href="https://senso.ai" target="_blank" rel="noopener noreferrer" className="text-resin-light underline underline-offset-4 hover:text-resin">Senso</a>,{" "}
            <a href="https://linqapp.com" target="_blank" rel="noopener noreferrer" className="text-resin-light underline underline-offset-4 hover:text-resin">Linq</a>,{" "}
            <a href="https://openai.com" target="_blank" rel="noopener noreferrer" className="text-resin-light underline underline-offset-4 hover:text-resin">OpenAI</a> &amp;{" "}
            <a href="https://browserbase.com" target="_blank" rel="noopener noreferrer" className="text-resin-light underline underline-offset-4 hover:text-resin">Browserbase</a>.
          </p>
        </footer>
      </main>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function Section({ kicker, children }: { kicker: string; children: React.ReactNode }) {
  return (
    <section className="mt-24 border-t border-border/50 pt-12">
      <p className="mb-8 text-xs font-medium uppercase tracking-[0.25em] text-resin">{kicker}</p>
      <div className="space-y-1">{children}</div>
    </section>
  );
}

function BigLine({ children, muted, className }: { children: React.ReactNode; muted?: boolean; className?: string }) {
  return (
    <p className={`font-display text-2xl font-medium leading-snug sm:text-3xl ${muted ? "text-ink-muted" : "text-ink"} ${className ?? ""}`}>
      {children}
    </p>
  );
}

function LoopRow({ n, label, detail }: { n: string; label: string; detail: string }) {
  return (
    <div className="flex gap-5 rounded-xl border border-border/40 bg-noir/40 p-5 backdrop-blur-xl">
      <span className="font-display text-2xl font-semibold text-resin/40">{n}</span>
      <div>
        <p className="font-display text-lg font-medium text-ink">{label}</p>
        <p className="mt-1 text-sm leading-relaxed text-ink-soft">{detail}</p>
      </div>
    </div>
  );
}

function Pillar({ title, body }: { title: string; body: string }) {
  return (
    <div className="bg-noir/50 p-7 backdrop-blur-2xl">
      <h3 className="mb-2 font-display text-lg font-medium text-resin-light">{title}</h3>
      <p className="text-sm leading-relaxed text-ink-soft">{body}</p>
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-xl border border-border/40 bg-noir/40 p-6 text-center backdrop-blur-xl">
      <p className="font-display text-4xl font-semibold text-resin">{value}</p>
      <p className="mt-2 text-xs uppercase tracking-wider text-ink-muted">{label}</p>
    </div>
  );
}
