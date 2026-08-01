"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import { Wordmark } from "@/components/brand";
import { Mail, Loader2, CheckCircle2, Shield } from "lucide-react";

export default function LoginPage() {
  // useSearchParams must be inside a Suspense boundary during static generation
  return (
    <Suspense fallback={<LoginFallback />}>
      <LoginInner />
    </Suspense>
  );
}

function LoginFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-cream">
      <Loader2 className="h-6 w-6 animate-spin text-matcha" />
    </div>
  );
}

function LoginInner() {
  const supabase = createClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [devStatus, setDevStatus] = useState<"idle" | "loading">("idle");

  // Already logged in? Go straight to the app.
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.replace("/app");
    });
  }, [router, supabase]);

  // If redirected here with ?error=..., surface it
  useEffect(() => {
    const err = searchParams.get("error");
    if (err) {
      setStatus("error");
      setErrorMsg(decodeURIComponent(err));
    }
  }, [searchParams]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setStatus("sending");
    setErrorMsg("");
    localStorage.removeItem("saulsilver:instant_login");

    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        shouldCreateUser: true,
      },
    });

    if (error) {
      setStatus("error");
      setErrorMsg(error.message);
    } else {
      setStatus("sent");
    }
  };

  // DEV-ONLY: instant login that skips the rate-limited email sender entirely.
  // Uses the admin API to mint a magic link server-side and redirects to it
  // directly. Never available in production — the gate is in /api/dev-login.
  const handleDevLogin = async () => {
    if (!email.trim() || devStatus === "loading") return;
    setDevStatus("loading");
    try {
      const res = await fetch("/api/dev-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      // Set guest flag and redirect to minted link
      localStorage.setItem("saulsilver:instant_login", "1");
      window.location.href = data.actionLink;
    } catch (e) {
      setStatus("error");
      setErrorMsg(e instanceof Error ? e.message : "dev login failed");
      setDevStatus("idle");
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-cream px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mb-3 flex justify-center">
            <Wordmark className="[&_span]:text-2xl" />
          </div>
          <p className="text-sm text-ink-muted">
            The Vijaya Sommelier.
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-noir-card p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <Shield className="h-4 w-4 text-matcha" />
            <h1 className="font-display text-lg font-semibold">Sign in</h1>
          </div>
          <p className="mb-4 text-xs text-ink-muted">
            We&apos;ll email you a secure link. No password — just tap it and you&apos;re in.
          </p>

          <form onSubmit={handleLogin} className="space-y-3">
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
              <input
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  // Clear any prior error the moment the user edits — let them retry
                  if (status === "error") setStatus("idle");
                }}
                placeholder="you@example.com"
                required
                disabled={status === "sending" || status === "sent"}
                className="w-full rounded-lg border border-border bg-noir-card py-2.5 pl-9 pr-3 text-sm outline-none transition-colors placeholder:text-ink-muted/60 focus:border-matcha"
              />
            </div>

            <button
              type="submit"
              disabled={status === "sending" || status === "sent" || !email.trim()}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-matcha py-2.5 text-sm font-medium text-cream transition-colors hover:bg-matcha-dark disabled:opacity-50"
            >
              {status === "sending" && <Loader2 className="h-4 w-4 animate-spin" />}
              {status === "sent" && <CheckCircle2 className="h-4 w-4" />}
              {status === "sending"
                ? "Sending…"
                : status === "sent"
                ? "Link sent"
                : "Send magic link"}
            </button>
          </form>

          {status === "sent" && (
            <div className="mt-4 rounded-lg border border-matcha/30 bg-matcha/5 p-3 text-xs text-ink-soft">
              <p className="font-medium text-matcha">Check your inbox</p>
              <p className="mt-1">
                We sent a sign-in link to <span className="font-medium">{email}</span>. Click it to enter SaulSilver.
              </p>
            </div>
          )}

          {status === "error" && (
            <div className="mt-4 rounded-lg border border-vermillion/30 bg-vermillion/5 p-3 text-xs text-vermillion">
              {errorMsg}
            </div>
          )}

          {/* Instant login — bypasses the rate-limited email sender for demos */}
          <div className="mt-4 border-t border-dashed border-border pt-4">
            <p className="mb-2 text-center text-[11px] text-ink-muted">
              Enter your email above, then sign in instantly — no email needed.
            </p>
            <button
              type="button"
              onClick={handleDevLogin}
              disabled={devStatus === "loading" || !email.trim()}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-matcha/40 bg-matcha/5 py-2.5 text-sm font-medium text-matcha transition-colors hover:bg-matcha/10 disabled:opacity-50"
            >
              {devStatus === "loading" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Shield className="h-4 w-4" />
              )}
              {devStatus === "loading" ? "Signing in…" : "Sign in instantly (Demo)"}
            </button>
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-ink-muted">
          By signing in, you agree to use SaulSilver responsibly.
        </p>
      </div>
    </div>
  );
}
