"use client";

import { useState, useEffect, useCallback } from "react";
import { Wallet } from "lucide-react";
import { WalletModal, type SavedCard } from "@/components/wallet-modal";

/**
 * WalletButton — the app-header wallet.
 *
 * One track. No Demo/Live toggle. Click opens the wallet modal where the user
 * enrolls their card via Prava's embedded collectPAN surface (device binding,
 * OTP, passkey — all on Prava's iframe). We hold only a card reference.
 */
export function WalletButton() {
  const [open, setOpen] = useState(false);
  const [cards, setCards] = useState<SavedCard[]>([]);
  const [loading, setLoading] = useState(true);

  const refreshCards = useCallback(async () => {
    try {
      const res = await fetch("/api/wallet/cards");
      const data = await res.json();
      setCards(data.cards ?? []);
    } catch {
      setCards([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshCards();
  }, [refreshCards]);

  const hasCard = cards.length > 0;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-all ${
          hasCard
            ? "border-resin/40 bg-resin/10 text-resin"
            : "border-border bg-noir-card text-ink-soft hover:border-resin/40 hover:text-resin-light"
        }`}
        title={hasCard ? `${cards.length} card${cards.length > 1 ? "s" : ""} saved` : "Add a card to your wallet"}
      >
        <Wallet className="h-3.5 w-3.5" />
        <span className="whitespace-nowrap" style={{ fontSize: "clamp(0.7rem, 3.5vw, 0.8rem)" }}>
          {loading ? "Wallet" : hasCard ? `${cards.length} card${cards.length > 1 ? "s" : ""}` : "Add card"}
        </span>
        <span className={`h-1.5 w-1.5 rounded-full ${hasCard ? "bg-resin" : "bg-ink-muted/40"}`} />
      </button>

      <WalletModal
        open={open}
        onOpenChange={setOpen}
        cards={cards}
        onCardsChanged={refreshCards}
      />
    </>
  );
}
