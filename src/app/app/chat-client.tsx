"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Send,
  Leaf,
  Shield,
  AlertCircle,
  CheckCircle2,
  FlaskConical,
  Beaker,
  Clock,
  Upload,
  RefreshCw,
} from "lucide-react";
import type {
  Brand,
  CannabisProduct,
  ChatMessage,
  Effect,
  Intent,
  ProductMatch,
  Tolerance,
  UserProfile,
} from "@/lib/types";
import { EFFECTS, TOLERANCES } from "@/lib/types";
import { formatINR } from "@/lib/utils";
import { usePaymentMode } from "@/lib/payment-mode";

type Stage =
  | "greeting"
  | "interview_effect"
  | "interview_tolerance"
  | "interview_ratio"
  | "matching"
  | "recommending"
  | "verifying"
  | "verifying_result"
  | "browsing"
  | "paying"
  | "completed";

export default function AppChat({
  savedAddress,
  intent,
}: {
  savedAddress: string | null;
  intent: Intent;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [stage, setStage] = useState<Stage>("greeting");
  const [profile, setProfile] = useState<UserProfile>({ intent, region: "IN" });
  const [busy, setBusy] = useState(false);
  const { demoMode } = usePaymentMode();
  const scrollRef = useRef<HTMLDivElement>(null);

  // ── Greeting on mount — different opening per intent ──
  useEffect(() => {
    const openers: Record<Intent, string> = {
      match: "I'm SaulSilver. Tell me the vibe — sleep, focus, calm, euphoria — and I'll find your gummy.",
      verify: "I'm SaulSilver. Name a brand and I'll tell you if it's legit. Lab tests, licence, the works.",
      browse: "I'm SaulSilver. Here's what's on the menu. Ask me about any of them.",
    };
    setMessages([
      {
        id: "welcome",
        role: "assistant",
        kind: "text",
        content: openers[intent],
        timestamp: new Date().toISOString(),
      },
    ]);
    const startStage: Stage = intent === "match" ? "interview_effect" : intent === "browse" ? "browsing" : "verifying";
    setStage(startStage);
    if (intent === "browse") loadCatalog();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intent]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  const pushAssistant = useCallback(
    (content: string, kind: ChatMessage["kind"] = "text", data?: unknown) => {
      setMessages((m) => [
        ...m,
        {
          id: `msg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
          role: "assistant",
          content,
          kind,
          data,
          timestamp: new Date().toISOString(),
        },
      ]);
    },
    []
  );

  // ── Handle user input ──
  const handleSend = async () => {
    if (!input.trim() || busy) return;
    const userText = input.trim();
    setInput("");
    const ta = document.querySelector("textarea");
    if (ta) ta.style.height = "auto";
    setMessages((m) => [
      ...m,
      { id: `user_${Date.now()}`, role: "user", content: userText, kind: "text", timestamp: new Date().toISOString() },
    ]);

    if (stage === "verifying" || stage === "verifying_result") {
      await verifyBrand(userText);
      return;
    }

    if (stage === "browsing") {
      pushAssistant("Tell me the vibe you're after and I'll match you properly. Or name a brand and I'll verify it.", "text");
      setStage("interview_effect");
      return;
    }

    // In interview, try to match their words to an effect
    if (stage === "interview_effect" || stage === "greeting") {
      const lower = userText.toLowerCase();
      const matched = EFFECTS.find(
        (e) => lower.includes(e.value) || lower.includes(e.label.toLowerCase())
      );
      if (matched) {
        setProfile((p) => ({ ...p, effect: matched.value }));
        pushAssistant(`${matched.blurb}. How experienced are you?`, "text");
        setStage("interview_tolerance");
      } else {
        pushAssistant("Sleep, focus, calm, euphoria, pain relief, couch-lock — what's the goal?", "text");
      }
    }
  };

  // ── Quick-pick handlers ──
  const pickEffect = (effect: Effect) => {
    const eff = EFFECTS.find((e) => e.value === effect)!;
    setMessages((m) => [...m, { id: `user_eff_${Date.now()}`, role: "user", content: eff.label, kind: "text", timestamp: new Date().toISOString() }]);
    setProfile((p) => ({ ...p, effect }));
    pushAssistant(`${eff.blurb}. How experienced are you?`, "text");
    setStage("interview_tolerance");
  };

  const pickTolerance = (tolerance: Tolerance) => {
    const tol = TOLERANCES.find((t) => t.value === tolerance)!;
    setMessages((m) => [...m, { id: `user_tol_${Date.now()}`, role: "user", content: tol.label, kind: "text", timestamp: new Date().toISOString() }]);
    setProfile((p) => ({ ...p, tolerance }));
    pushAssistant("Lean THC, lean CBD, balanced, or you decide?", "text");
    setStage("interview_ratio");
  };

  const pickRatio = (ratio: UserProfile["ratioPreference"]) => {
    const label = ratio === "you_decide" ? "You decide" : (ratio ?? "balanced");
    setMessages((m) => [...m, { id: `user_ratio_${Date.now()}`, role: "user", content: label, kind: "text", timestamp: new Date().toISOString() }]);
    const updated = { ...profile, ratioPreference: ratio };
    setProfile(updated);
    runMatch(updated);
  };

  // ── Run the sommelier match ──
  const runMatch = async (p: UserProfile) => {
    setBusy(true);
    setStage("matching");
    pushAssistant("On it. Checking what's on the menu…", "thinking");
    try {
      const res = await fetch("/api/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile: p }),
      });
      const data = await res.json();
      setMessages((m) => m.filter((msg) => msg.kind !== "thinking"));

      if (data.empty || !data.matches?.length) {
        pushAssistant("The catalog's thin right now. Tell me a brand and I'll research it live — or check back.", "text");
        setStage("verifying");
        return;
      }

      await new Promise((r) => setTimeout(r, 600));
      pushAssistant("", "recommendation", { matches: data.matches, profile: p });
      setStage("recommending");
    } catch (e) {
      setMessages((m) => m.filter((msg) => msg.kind !== "thinking"));
      pushAssistant(`Match failed: ${e instanceof Error ? e.message : "unknown error"}.`, "text");
      setStage("interview_effect");
    } finally {
      setBusy(false);
    }
  };

  // ── Verify a brand (the trust-check door) ──
  const verifyBrand = async (brandName: string) => {
    setBusy(true);
    setStage("verifying_result");
    pushAssistant(`Looking into ${brandName}…`, "thinking");
    try {
      const res = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandName }),
      });
      const data = await res.json();
      setMessages((m) => m.filter((msg) => msg.kind !== "thinking"));

      if (data.error) throw new Error(data.error);
      pushAssistant("", "dashboard", { brand: data.brand, products: data.products, research: data.research });
      setStage("recommending");
    } catch (e) {
      setMessages((m) => m.filter((msg) => msg.kind !== "thinking"));
      pushAssistant(`Couldn't research ${brandName}: ${e instanceof Error ? e.message : "unknown error"}.`, "text");
      setStage("verifying");
    } finally {
      setBusy(false);
    }
  };

  // ── Load catalog for browse ──
  const loadCatalog = async () => {
    try {
      const res = await fetch("/api/catalog");
      const data = await res.json();
      if (data.products?.length) {
        pushAssistant("", "recommendation", {
          matches: data.products.map((p: CannabisProduct) => ({
            product: p,
            brand: data.brands.find((b: Brand) => b.id === p.brand_id),
            score: 0.5,
            reasons: [`${p.pack_count} gummies`, formatINR(p.price_inr)],
          })),
          profile,
          browse: true,
        });
      }
    } catch {
      // ignore
    }
  };

  // ── Payment (reuses Prava) ──
  const runPayment = (product: CannabisProduct, brand: Brand) => {
    setBusy(true);
    setStage("paying");
    const perGummy = Math.round(product.price_inr / product.pack_count);
    pushAssistant(
      `${product.name} — ${formatINR(product.price_inr)} (${formatINR(perGummy)}/gummy). ` +
        `${brand.prescription_required ? "Needs a prescription — upload one or I'll route you to their doctor. " : ""}` +
        `Paying via Prava…`,
      "status"
    );
    setTimeout(() => {
      pushAssistant(
        `Done. ${product.name} ordered. ${brand.prescription_required ? "Their doctor will call you within 24h for the prescription." : "Ships pan-India in 2-4 days."}`,
        "confirmation",
        { product, brand }
      );
      setStage("completed");
      setBusy(false);
    }, 2000);
  };

  const reset = () => {
    setMessages([{ id: "welcome2", role: "assistant", kind: "text", content: "Next one. What's the vibe?", timestamp: new Date().toISOString() }]);
    setProfile({ intent: "match", region: "IN" });
    setStage("interview_effect");
  };

  return (
    <div className="flex h-[calc(100vh-57px)] flex-col overflow-hidden">
      <div ref={scrollRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
        {messages.map((m) => (
          <MessageBubble key={m.id} message={m} onPay={runPayment} />
        ))}

        {/* Effect quick-picks */}
        {stage === "interview_effect" && !busy && (
          <div className="flex items-start gap-3 animate-fade-in-up">
            <Avatar />
            <div className="w-full max-w-[88%]">
              <div className="mb-2 flex flex-wrap gap-2">
                {EFFECTS.map((e) => (
                  <button
                    key={e.value}
                    onClick={() => pickEffect(e.value)}
                    className="rounded-full border border-border bg-noir-card px-3.5 py-1.5 text-xs text-ink-soft transition-colors hover:border-resin/40 hover:bg-resin/5 hover:text-resin-light"
                  >
                    {e.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Tolerance quick-picks */}
        {stage === "interview_tolerance" && !busy && (
          <div className="flex items-start gap-3 animate-fade-in-up">
            <Avatar />
            <div className="w-full max-w-[88%] flex flex-wrap gap-2">
              {TOLERANCES.map((t) => (
                <button
                  key={t.value}
                  onClick={() => pickTolerance(t.value)}
                  className="rounded-full border border-border bg-noir-card px-4 py-2 text-sm text-ink-soft transition-colors hover:border-resin/40 hover:bg-resin/5 hover:text-resin-light"
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Ratio quick-picks */}
        {stage === "interview_ratio" && !busy && (
          <div className="flex items-start gap-3 animate-fade-in-up">
            <Avatar />
            <div className="w-full max-w-[88%] flex flex-wrap gap-2">
              {(["thc", "cbd", "balanced", "you_decide"] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => pickRatio(r)}
                  className="rounded-full border border-border bg-noir-card px-4 py-2 text-sm capitalize text-ink-soft transition-colors hover:border-resin/40 hover:bg-resin/5 hover:text-resin-light"
                >
                  {r === "you_decide" ? "You decide" : r}
                </button>
              ))}
            </div>
          </div>
        )}

        {busy && <ThinkingIndicator />}
        {stage === "completed" && !busy && (
          <div className="flex justify-center pt-2">
            <Button variant="secondary" size="sm" onClick={reset}>
              <RefreshCw className="h-4 w-4" /> Match me again
            </Button>
          </div>
        )}
        <div className="h-32 shrink-0" />
      </div>

      {/* Input bar */}
      <div className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-noir/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md">
        <div className="mx-auto max-w-4xl px-3 py-3 sm:px-6 sm:py-4">
          <div className="flex items-end gap-2">
            <div className="flex flex-1 items-end gap-1 rounded-2xl border border-border bg-noir-card px-1.5 py-1 transition-colors focus-within:border-resin">
              <label className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-xl text-ink-muted transition-colors hover:bg-noir-raised hover:text-resin">
                <input type="file" accept="image/*" className="hidden" onChange={() => {}} />
                <Upload className="h-5 w-5" />
              </label>
              <textarea
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  e.target.style.height = "auto";
                  e.target.style.height = `${Math.min(e.target.scrollHeight, 140)}px`;
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                rows={1}
                placeholder={stage === "verifying" ? "Name a brand…" : stage === "interview_effect" ? "Tell me the vibe…" : "Message…"}
                className="max-h-36 flex-1 resize-none bg-transparent px-1 py-2.5 text-base leading-snug outline-none placeholder:text-ink-muted/60"
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || busy}
                aria-label="Send"
                className="mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-resin text-noir transition-colors hover:bg-resin-light disabled:opacity-40"
              >
                <Send className="h-4.5 w-4.5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function Avatar() {
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-resin/10 text-resin">
      <Leaf className="h-4 w-4" />
    </div>
  );
}

function ThinkingIndicator() {
  return (
    <div className="flex items-center gap-3 text-ink-muted">
      <Avatar />
      <div className="flex gap-1 rounded-2xl rounded-tl-sm bg-noir-card px-4 py-3">
        <span className="h-2 w-2 animate-thinking-dot rounded-full bg-ink-muted" style={{ animationDelay: "0ms" }} />
        <span className="h-2 w-2 animate-thinking-dot rounded-full bg-ink-muted" style={{ animationDelay: "200ms" }} />
        <span className="h-2 w-2 animate-thinking-dot rounded-full bg-ink-muted" style={{ animationDelay: "400ms" }} />
      </div>
    </div>
  );
}

function MessageBubble({
  message,
  onPay,
}: {
  message: ChatMessage;
  onPay: (product: CannabisProduct, brand: Brand) => void;
}) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end animate-fade-in-up">
        <div className="max-w-[80%] whitespace-pre-line rounded-2xl rounded-tr-sm bg-resin px-4 py-2.5 text-sm text-noir">
          {message.content}
        </div>
      </div>
    );
  }

  if (message.kind === "recommendation" && message.data) {
    const { matches } = message.data as { matches: ProductMatch[] };
    return <RecommendationList matches={matches} onPay={onPay} />;
  }

  if (message.kind === "dashboard" && message.data) {
    const { brand, products, research } = message.data as {
      brand: Brand;
      products: CannabisProduct[];
      research: { verdict: string; findings: { summary: string; red_flags?: string[]; license?: string }; sources: string[] };
    };
    return <BrandReport brand={brand} products={products} research={research} />;
  }

  if (message.kind === "confirmation" && message.data) {
    const { product, brand } = message.data as { product: CannabisProduct; brand: Brand };
    return <ConfirmationCard product={product} brand={brand} />;
  }

  return (
    <div className="flex items-start gap-3 animate-fade-in-up">
      {message.kind !== "thinking" && <Avatar />}
      <div className="max-w-[80%] whitespace-pre-line rounded-2xl rounded-tl-sm bg-noir-card px-4 py-2.5 text-sm text-ink shadow-sm">
        {message.kind === "status" && <Shield className="mb-1 h-4 w-4 text-resin" />}
        {message.content}
      </div>
    </div>
  );
}

function RecommendationList({
  matches,
  onPay,
}: {
  matches: ProductMatch[];
  onPay: (product: CannabisProduct, brand: Brand) => void;
}) {
  return (
    <div className="space-y-4 animate-fade-in-up">
      <div className="flex items-start gap-3">
        <Avatar />
        <div className="w-full max-w-[88%]">
          <p className="mb-3 text-sm text-ink-soft">
            {matches.length === 1 ? "One match." : `${matches.length} on the menu.`} Here's how they stack up.
          </p>
          {matches.map((m, i) => (
            <ProductCard key={i} match={m} rank={i} onPay={onPay} />
          ))}
        </div>
      </div>
    </div>
  );
}

function ProductCard({
  match,
  rank,
  onPay,
}: {
  match: ProductMatch;
  rank: number;
  onPay: (product: CannabisProduct, brand: Brand) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const { product, brand, reasons, warnings } = match;
  const perGummy = Math.round(product.price_inr / product.pack_count);

  return (
    <Card className={`mb-3 ${rank === 0 ? "border-resin/40 glow-resin" : "border-border"} bg-noir-card`}>
      {rank === 0 && (
        <div className="flex items-center justify-between bg-resin/10 px-4 py-2">
          <span className="text-xs font-medium uppercase tracking-wide text-resin">Top match</span>
          <Badge variant="resin">Best fit</Badge>
        </div>
      )}
      <CardContent className="pt-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="font-display text-lg font-semibold text-ink">{product.name}</p>
            <p className="text-sm text-ink-muted">{brand.name}</p>
          </div>
          <div className="text-right">
            <p className="font-display text-xl font-semibold text-resin">{formatINR(product.price_inr)}</p>
            <p className="text-xs text-ink-muted">{formatINR(perGummy)}/gummy</p>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {reasons.map((r, i) => (
            <Badge key={i} variant={rank === 0 ? "resin" : "default"}>{r}</Badge>
          ))}
        </div>

        {warnings && warnings.length > 0 && (
          <div className="mt-3 rounded-lg border border-ember/30 bg-ember/5 p-3">
            {warnings.map((w, i) => (
              <p key={i} className="flex items-start gap-2 text-xs text-ember">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {w}
              </p>
            ))}
          </div>
        )}

        <div className="mt-3 flex flex-wrap gap-4 text-sm text-ink-soft">
          {product.cannabinoids.total_extract_mg && (
            <span className="flex items-center gap-1.5">
              <Beaker className="h-4 w-4 text-resin" />
              {product.cannabinoids.total_extract_mg}mg/gummy
            </span>
          )}
          {product.ratio && (
            <span className="flex items-center gap-1.5">
              <FlaskConical className="h-4 w-4 text-resin" />
              {product.ratio}
            </span>
          )}
          {product.onset_minutes && (
            <span className="flex items-center gap-1.5">
              <Clock className="h-4 w-4 text-resin" />
              ~{product.onset_minutes}min onset
            </span>
          )}
          {product.duration_hours && (
            <span className="flex items-center gap-1.5">
              <Clock className="h-4 w-4 text-resin" />
              {product.duration_hours}h
            </span>
          )}
        </div>

        {product.key_uses && (
          <button onClick={() => setExpanded(!expanded)} className="mt-3 text-xs text-resin hover:text-resin-light">
            {expanded ? "Hide details" : "Key uses, composition, warnings →"}
          </button>
        )}
        {expanded && (
          <div className="mt-3 space-y-3 rounded-lg border border-border bg-noir-soft p-3 text-xs">
            {product.key_uses && (
              <div>
                <p className="mb-1 font-medium text-ink">Key uses</p>
                <p className="text-ink-soft">{product.key_uses}</p>
              </div>
            )}
            {product.composition && Object.keys(product.composition).length > 0 && (
              <div>
                <p className="mb-1 font-medium text-ink">Composition</p>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(product.composition).map(([k, v]) => (
                    <span key={k} className="rounded bg-noir-raised px-2 py-0.5 text-ink-muted">{k} {v}</span>
                  ))}
                </div>
              </div>
            )}
            {product.warnings && product.warnings.length > 0 && (
              <div>
                <p className="mb-1 font-medium text-ink">Warnings</p>
                <ul className="space-y-0.5 text-ink-muted">
                  {product.warnings.map((w, i) => (<li key={i}>• {w}</li>))}
                </ul>
              </div>
            )}
          </div>
        )}

        {brand.instagram_followers && brand.instagram_followers > 0 && (
          <p className="mt-3 text-xs text-ink-muted">{brand.instagram_handle} · {formatFollowers(brand.instagram_followers)}</p>
        )}

        <Button className="mt-4 w-full" size="sm" onClick={() => onPay(product, brand)}>
          <Shield className="h-4 w-4" />
          {brand.prescription_required ? "Order — doctor prescription included" : `Order — ${formatINR(product.price_inr)}`}
        </Button>
      </CardContent>
    </Card>
  );
}

function BrandReport({
  brand,
  products,
  research,
}: {
  brand: Brand;
  products: CannabisProduct[];
  research: { verdict: string; findings: { summary: string; red_flags?: string[]; license?: string }; sources: string[] };
}) {
  const verdictColor = research.verdict === "verified" ? "leaf" : research.verdict === "caution" ? "gold" : "ember";
  return (
    <div className="flex items-start gap-3 animate-fade-in-up">
      <Avatar />
      <div className="w-full max-w-[88%]">
        <Card className="bg-noir-card">
          <div className="flex items-center justify-between bg-noir-raised px-5 py-3">
            <span className="font-display text-lg font-semibold text-ink">{brand.name}</span>
            <Badge variant={verdictColor}>{research.verdict}</Badge>
          </div>
          <CardContent className="pt-4">
            {brand.tagline && <p className="mb-3 text-sm italic text-ink-soft">{brand.tagline}</p>}
            <p className="text-sm text-ink">{research.findings.summary}</p>
            {research.findings.license && (
              <div className="mt-3 flex items-start gap-2 rounded-lg border border-leaf/20 bg-leaf/5 p-3 text-xs">
                <Shield className="mt-0.5 h-4 w-4 shrink-0 text-leaf-light" />
                <span className="text-ink-soft">{research.findings.license}</span>
              </div>
            )}
            {research.findings.red_flags && research.findings.red_flags.length > 0 && (
              <div className="mt-3">
                <p className="mb-1.5 text-xs font-medium text-ember">Red flags</p>
                <ul className="space-y-0.5 text-xs text-ink-muted">
                  {research.findings.red_flags.map((r, i) => (<li key={i}>• {r}</li>))}
                </ul>
              </div>
            )}
            {products.length > 0 && (
              <div className="mt-4 border-t border-border pt-3">
                <p className="mb-2 text-xs text-ink-muted">{products.length} product{products.length > 1 ? "s" : ""} on the menu</p>
                {products.map((p, i) => (
                  <div key={i} className="flex justify-between py-1 text-sm">
                    <span className="text-ink-soft">{p.name}</span>
                    <span className="text-ink-muted">{formatINR(p.price_inr)}</span>
                  </div>
                ))}
              </div>
            )}
            {brand.instagram_followers && brand.instagram_followers > 0 && (
              <p className="mt-3 text-xs text-ink-muted">{brand.instagram_handle} · {formatFollowers(brand.instagram_followers)}</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ConfirmationCard({ product, brand }: { product: CannabisProduct; brand: Brand }) {
  return (
    <div className="flex items-start gap-3 animate-fade-in-up">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-resin text-noir">
        <CheckCircle2 className="h-5 w-5" />
      </div>
      <div className="w-full max-w-[85%]">
        <Card className="border-resin/30 bg-noir-card">
          <CardContent className="pt-5">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-resin" />
              <p className="font-display text-lg font-semibold">Order placed</p>
            </div>
            <p className="mt-2 text-sm text-ink-soft">
              {product.name} from {brand.name}. {brand.prescription_required ? "Their doctor will call within 24h." : "Ships in 2-4 days."}
            </p>
            <div className="mt-4 grid grid-cols-3 gap-3 rounded-lg bg-noir-soft p-3 text-center">
              <div><p className="text-xs text-ink-muted">Total</p><p className="font-display font-semibold">{formatINR(product.price_inr)}</p></div>
              <div><p className="text-xs text-ink-muted">Pack</p><p className="font-display font-semibold">{product.pack_count}</p></div>
              <div><p className="text-xs text-ink-muted">Paid via</p><p className="font-display font-semibold">Prava</p></div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function formatFollowers(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M followers`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K followers`;
  return `${n} followers`;
}
