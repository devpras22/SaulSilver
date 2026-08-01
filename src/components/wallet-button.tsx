"use client";

import { Wallet } from "lucide-react";
import { usePaymentMode } from "@/lib/payment-mode";

/**
 * WalletButton — the Demo/Live Prava toggle in the app header.
 *
 * Always enabled (sandbox-only, never production). Toggles between Demo (mock,
 * no Prava transaction) and Live (real sandbox session).
 */
export function WalletButton() {
  const { demoMode, setDemoMode } = usePaymentMode();

  return (
    <button
      onClick={() => setDemoMode(!demoMode)}
      className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-all ${
        demoMode
          ? "border-gold/40 bg-gold/10 text-gold"
          : "border-matcha/40 bg-matcha/10 text-matcha"
      }`}
      title={
        demoMode
          ? "Demo mode — no real Prava transactions. Click for Live."
          : "Live Prava — real sandbox transactions. Click for Demo."
      }
    >
      <Wallet className="h-3.5 w-3.5" />
      <span
        className="whitespace-nowrap"
        style={{ fontSize: "clamp(0.7rem, 3.5vw, 0.8rem)" }}
      >
        {demoMode ? "Demo" : "Live"}
      </span>
      <span className={`h-1.5 w-1.5 rounded-full ${demoMode ? "bg-gold" : "bg-matcha animate-pulse"}`} />
    </button>
  );
}
