"use client";

import Link from "next/link";
import { Wordmark } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  MapPin,
  Shield,
  Sparkles,
  ArrowRight,
  Clock,
  IndianRupee,
  Heart,
  Upload,
  MessageSquare,
  CheckCircle2,
} from "lucide-react";

export default function Home() {
  return (
    <div className="relative min-h-screen">
      {/* Nav */}
      <header className="sticky top-0 z-40 border-b border-border/60 bg-cream/80 backdrop-blur-md">
        <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Wordmark />
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/app">Open App</Link>
            </Button>
            <Button variant="primary" size="sm" asChild>
              <Link href="/app">Order now</Link>
            </Button>
          </div>
        </nav>
      </header>

      {/* Hero */}
      <section className="relative w-full overflow-hidden">
        {/* Background Video (Desktop only stays here) */}
        <div className="absolute inset-0 z-0 bg-cream">
          <video
            autoPlay
            loop
            muted
            playsInline
            poster="/media/torii.jpg"
            className="hidden h-full w-full object-cover object-center opacity-80 mix-blend-multiply md:block"
          >
            <source src="/media/torii.webm" type="video/webm" />
            <source src="/media/torii.mp4" type="video/mp4" />
          </video>
          {/* Subtle overlay to ensure text readability */}
          <div className="absolute inset-0 bg-cream/50 backdrop-blur-[2px]"></div>
        </div>

        <div className="relative z-10 mx-auto grid max-w-6xl items-center gap-12 px-6 pt-10 pb-24 lg:grid-cols-2 lg:pt-12">
          <div className="animate-fade-in-up">
            <Badge variant="matcha" className="mb-5 bg-white/50 backdrop-blur-md">
              <Sparkles className="h-3 w-3" /> Agentic Commerce Hackathon 2026
            </Badge>
            <h1 className="font-display text-5xl font-semibold leading-[1.05] tracking-tight text-ink sm:text-6xl">
              The AI agent that{" "}
              <span className="italic text-matcha">gets your medicine</span>.
            </h1>
            <p className="mt-6 max-w-md text-lg leading-relaxed text-ink-soft">
              Tell Kusushi what you need. It finds the right pharmacy, negotiates
              on your priorities, and completes the order — without you opening
              five apps or making a single phone call.
            </p>
            <p className="mt-3 text-sm italic text-ink-muted">
              Named after 薬師 — a traditional Japanese word for healer.
            </p>
            <div className="relative mt-8 grid w-full max-w-sm grid-cols-2 gap-3 sm:max-w-none sm:flex sm:flex-row">
              {/* Mobile Video Hack: Mathematically pinned to the bottom of the buttons */}
              <div className="pointer-events-none absolute bottom-[-16px] left-1/2 -z-10 w-[100vw] -translate-x-1/2 md:hidden">
                <video
                  autoPlay
                  loop
                  muted
                  playsInline
                  poster="/media/torii.jpg"
                  className="h-auto w-full opacity-80 mix-blend-multiply"
                >
                  <source src="/media/torii.webm" type="video/webm" />
                  <source src="/media/torii.mp4" type="video/mp4" />
                </video>
                <div className="absolute inset-0 bg-cream/50 backdrop-blur-[2px]"></div>
              </div>

              <Button size="lg" className="w-full px-2 text-sm sm:px-8 sm:text-base shadow-lg shadow-matcha/20" asChild>
                <Link href="/app">
                  Try Kusushi <ArrowRight className="ml-1.5 h-4 w-4" />
                </Link>
              </Button>
              <Button size="lg" variant="secondary" className="w-full px-2 text-sm sm:px-8 sm:text-base bg-white/20 backdrop-blur-md border border-white/20 text-ink hover:bg-white/30" asChild>
                <a href="#how" onClick={(e) => {
                  e.preventDefault();
                  document.getElementById('how')?.scrollIntoView({ behavior: 'smooth' });
                }}>How it works</a>
              </Button>
            </div>
            
            {/* MOBILE TEXT WRAPPING FIX HERE */}
            <div className="mt-8 flex w-full flex-row items-center gap-3 text-[11px] text-ink-muted sm:gap-6 sm:text-sm">
              <span className="flex items-center gap-1 whitespace-nowrap">
                <Shield className="h-3 w-3 text-matcha sm:h-4 sm:w-4" /> Prava-secured payment
              </span>
              <span className="flex items-center gap-1 whitespace-nowrap">
                <CheckCircle2 className="h-3 w-3 text-matcha sm:h-4 sm:w-4" /> Real checkout, not a mock
              </span>
            </div>
          </div>

          {/* Demo card mockup */}
          <div className="relative animate-fade-in-up" style={{ animationDelay: "150ms" }}>
            <Card className="overflow-hidden p-0 shadow-xl shadow-matcha/5 bg-white/40 backdrop-blur-xl border border-white/40">
              <div className="border-b border-border bg-white/50 px-5 py-3 backdrop-blur-md">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-ink">
                    Kusushi · Live conversation
                  </span>
                  <span className="flex items-center gap-1 text-xs text-matcha">
                    <span className="h-1.5 w-1.5 rounded-full bg-matcha animate-pulse" />
                    Online
                  </span>
                </div>
              </div>
              <div className="space-y-3 p-5">
                {/* Bubble 1 */}
                <div
                  className="ml-auto max-w-[80%] rounded-2xl rounded-tr-sm bg-matcha px-4 py-2.5 text-sm text-cream shadow-sm animate-fade-in-up opacity-0 [animation-fill-mode:forwards]"
                  style={{ animationDelay: "400ms" }}
                >
                  My mother needs Metformin 500mg and a vitamin D3 supplement.
                  Cheapest option, delivered to Oberoi Exquisite Goregaon Mumbai.
                </div>
                
                {/* Bubble 2 & 3 Group */}
                <div className="max-w-[88%] space-y-2">
                  <div
                    className="rounded-2xl rounded-tl-sm bg-cream-dark px-4 py-2.5 text-sm text-ink shadow-sm animate-fade-in-up opacity-0 [animation-fill-mode:forwards]"
                    style={{ animationDelay: "1200ms" }}
                  >
                    On it. Checking 4 pharmacies near you…
                  </div>
                  <div
                    className="rounded-2xl rounded-tl-sm border border-border bg-white px-4 py-3 text-sm shadow-sm animate-fade-in-up opacity-0 [animation-fill-mode:forwards]"
                    style={{ animationDelay: "2400ms" }}
                  >
                    <p className="font-medium text-ink">
                      Recommended: Apollo Pharmacy
                    </p>
                    <p className="mt-1 text-xs text-ink-muted">
                      Both items in stock · 35 min delivery · ₹214 total
                    </p>
                    <div className="mt-2 flex gap-2">
                      <Badge variant="matcha">Lowest price</Badge>
                      <Badge variant="gold">In stock</Badge>
                    </div>
                  </div>
                </div>

                {/* Bubble 4 */}
                <div
                  className="ml-auto max-w-[80%] rounded-2xl rounded-tr-sm bg-matcha px-4 py-2.5 text-sm text-cream shadow-sm animate-fade-in-up opacity-0 [animation-fill-mode:forwards]"
                  style={{ animationDelay: "3800ms" }}
                >
                  Go ahead.
                </div>

                {/* Bubble 5 */}
                <div
                  className="rounded-2xl rounded-tl-sm bg-cream-dark px-4 py-2.5 text-sm text-ink shadow-sm animate-fade-in-up opacity-0 [animation-fill-mode:forwards]"
                  style={{ animationDelay: "4800ms" }}
                >
                  <span className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-matcha" />
                    Order placed. Arriving in 35 minutes.
                  </span>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </section>

      {/* Value Props */}
      <section className="border-t border-border bg-white py-24" id="how">
        <div className="mx-auto max-w-6xl px-6">
          <div className="grid gap-12 md:grid-cols-3">
            <div>
              <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-matcha/10 text-matcha">
                <MapPin className="h-6 w-6" />
              </div>
              <h3 className="mb-2 font-display text-xl font-medium text-ink">
                Hyperlocal Sourcing
              </h3>
              <p className="text-ink-soft">
                Kusushi instantly checks inventory at local pharmacies near your address.
                No central warehouse delays — your medicine comes straight from your neighborhood.
              </p>
            </div>
            <div>
              <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-matcha/10 text-matcha">
                <Heart className="h-6 w-6" />
              </div>
              <h3 className="mb-2 font-display text-xl font-medium text-ink">
                Intelligent Alternatives
              </h3>
              <p className="text-ink-soft">
                If your exact brand is out of stock, Kusushi consults the Senso
                knowledge base to find mathematically identical formulations approved
                by pharmacists.
              </p>
            </div>
            <div>
              <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-matcha/10 text-matcha">
                <IndianRupee className="h-6 w-6" />
              </div>
              <h3 className="mb-2 font-display text-xl font-medium text-ink">
                Autonomous Negotiation
              </h3>
              <p className="text-ink-soft">
                Prioritize delivery speed, cheapest price, or complete order fulfillment.
                Kusushi automatically compares live quotes and routes the order to the winner.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Two-tier: what works today vs roadmap */}
      <section className="border-t border-border bg-cream py-24">
        <div className="mx-auto max-w-5xl px-6">
          <div className="mb-12 text-center">
            <p className="text-sm font-medium uppercase tracking-wider text-matcha">
              Honest about the rails
            </p>
            <h2 className="mt-3 font-display text-3xl font-medium text-ink sm:text-4xl">
              What works today. What comes next.
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-ink-soft">
              Prava issues a virtual card scoped to one merchant. For that card to
              succeed, the merchant needs a real online checkout. We built for both realities.
            </p>
          </div>
          <div className="grid gap-6 md:grid-cols-2">
            <Card className="p-7">
              <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-matcha/10 text-matcha">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <Badge variant="matcha" className="mb-3">Live now</Badge>
              <h3 className="mb-2 font-display text-xl font-medium text-ink">
                Online pharmacies &amp; quick-commerce
              </h3>
              <p className="text-sm leading-relaxed text-ink-soft">
                Apollo, Tata 1mg, Netmeds, Pharmeasy, Zepto, Blinkit, and Swiggy
                Instamart. Each has a real online checkout — so the full Prava
                payment lifecycle closes end-to-end: session created, passkey
                approved, virtual card issued, checkout completed.
              </p>
            </Card>
            <Card className="p-7">
              <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-gold/15 text-gold">
                <Clock className="h-6 w-6" />
              </div>
              <Badge variant="gold" className="mb-3">Roadmap</Badge>
              <h3 className="mb-2 font-display text-xl font-medium text-ink">
                Your neighborhood Kirana store
              </h3>
              <p className="text-sm leading-relaxed text-ink-soft">
                Discovery already works — Kusushi finds nearby stores via Google
                Maps and calls them for stock. But local stores can&apos;t accept a
                Prava virtual card yet: they have no online portal. The fix is
                either onboarding them as Prava merchants, or a UPI-rail bridge.
                Kusushi is architected to plug in the day either ships.
              </p>
            </Card>
          </div>
        </div>
      </section>

      {/* Powered By */}
      <section className="bg-cream py-24">
        <div className="mx-auto max-w-4xl px-6 text-center">
          <h2 className="mb-12 font-display text-3xl font-medium text-ink">
            The infrastructure behind the agent
          </h2>
          <div className="grid gap-8 sm:grid-cols-3">
            <div className="flex flex-col items-center justify-center p-6 text-center">
              <div className="mb-4 h-12 w-12 text-ink-muted">
                {/* Linq Icon Placeholder */}
                <MessageSquare className="h-full w-full" />
              </div>
              <h4 className="font-medium text-ink">Linq API</h4>
              <p className="mt-2 text-sm text-ink-soft">
                Powering iMessage-native conversational memory and webhook routing.
              </p>
            </div>
            <div className="flex flex-col items-center justify-center p-6 text-center">
              <div className="mb-4 h-12 w-12 text-ink-muted">
                {/* Senso Icon Placeholder */}
                <Upload className="h-full w-full" />
              </div>
              <h4 className="font-medium text-ink">Senso Data</h4>
              <p className="mt-2 text-sm text-ink-soft">
                Live pharmaceutical index and real-time inventory bridging.
              </p>
            </div>
            <div className="flex flex-col items-center justify-center p-6 text-center">
              <div className="mb-4 h-12 w-12 text-ink-muted">
                {/* Prava Icon Placeholder */}
                <Shield className="h-full w-full" />
              </div>
              <h4 className="font-medium text-ink">Prava Auth</h4>
              <p className="mt-2 text-sm text-ink-soft">
                Secure, zero-knowledge payments and encrypted address storage.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border bg-cream-dark py-12">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 text-center sm:flex-row sm:text-left">
          <Wordmark />
          <p className="text-sm text-ink-muted">
            Built for the Agentic Commerce Hackathon. <br className="sm:hidden" />
            Powered by{" "}
            <a href="https://prava.space" target="_blank" rel="noopener noreferrer" className="underline underline-offset-4 hover:text-matcha transition-colors">Prava</a>,{" "}
            <a href="https://linqapp.com" target="_blank" rel="noopener noreferrer" className="underline underline-offset-4 hover:text-matcha transition-colors">Linq</a>,{" "}
            <a href="https://senso.ai" target="_blank" rel="noopener noreferrer" className="underline underline-offset-4 hover:text-matcha transition-colors">Senso</a> &amp;{" "}
            <a href="https://openai.com" target="_blank" rel="noopener noreferrer" className="underline underline-offset-4 hover:text-matcha transition-colors">OpenAI</a>.
          </p>
        </div>
      </footer>
    </div>
  );
}
