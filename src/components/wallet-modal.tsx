"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Wallet, X, CreditCard, Loader2, CheckCircle2, Plus, Trash2, Shield } from "lucide-react";
import PravaCardForm from "@/components/prava-card-form";
import type { PaymentResultResponse } from "@/lib/prava";

/**
 * WalletModal — the playground experience.
 *
 * State machine (per Prava's page-integration template):
 *   idle → loading → card-entry (+ polling) → completed | failed
 *
 * The parent (this modal) creates ONE session and passes it to PravaCardForm.
 * Both the iframe and the polling use the same session_id (no duplicate sessions).
 * Completion is detected by polling payment-result, NOT by the onSuccess callback.
 */

export interface SavedCard {
  id: string;
  prava_card_id: string;
  last4: string | null;
  brand: string | null;
  exp_month: number | null;
  exp_year: number | null;
  is_default: boolean;
}

type Flow = "idle" | "loading" | "card-entry" | "completed" | "failed";

export function WalletModal({
  open,
  onOpenChange,
  cards,
  onCardsChanged,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  cards: SavedCard[];
  onCardsChanged: () => void;
}) {
  const [flow, setFlow] = useState<Flow>("idle");
  const [session, setSession] = useState<{
    session_id: string;
    session_token: string;
    iframe_url: string;
    order_id: string;
    expires_at: string;
  } | null>(null);
  const [paymentResult, setPaymentResult] = useState<PaymentResultResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Reset everything when the modal closes.
  useEffect(() => {
    if (!open) {
      stopPolling();
      setFlow("idle");
      setSession(null);
      setPaymentResult(null);
      setErrorMsg("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      if ((pollingRef.current as any).isCustomInterval) {
        (pollingRef.current as any).stop();
      } else {
        clearTimeout(pollingRef.current as any);
      }
      pollingRef.current = null;
    }
  }, []);

  const startPolling = useCallback((sessionId: string) => {
    let isStopped = false;
    const doPoll = async () => {
      if (isStopped) return;
      try {
        const res = await fetch(`/api/wallet/result?sessionId=${encodeURIComponent(sessionId)}&_t=${Date.now()}`, {
          cache: "no-store" as RequestCache,
        });
        const result: PaymentResultResponse = await res.json();
        if (result.status === "completed" || result.status === "failed") {
          setPaymentResult(result);
          setFlow(result.status === "completed" ? "completed" : "failed");
          if (result.status === "failed") {
            const msg = result.transactions?.[0]?.error?.message || "Card enrollment failed";
            setErrorMsg(msg);
          }
          return;
        }
      } catch {
        // Keep polling on transient errors
      }
      if (!isStopped) {
        pollingRef.current = setTimeout(doPoll, 3000) as any;
      }
    };
    
    doPoll();
    
    pollingRef.current = {
      isCustomInterval: true,
      stop: () => { isStopped = true; }
    } as any;
  }, []);

  // Clean up polling on unmount
  useEffect(() => () => stopPolling(), [stopPolling]);

  const beginEnrollment = useCallback(async () => {
    setFlow("loading");
    setErrorMsg("");
    setPaymentResult(null);

    try {
      // Create ONE session — reused by both the iframe and the polling.
      // Real merchant (SaulSilver) + real amount (₹1 test) + real product.
      // Prava auto-shows saved cards for returning users.
      const res = await fetch("/api/wallet/session", { method: "POST" });
      const s = await res.json();
      if (!res.ok) throw new Error(s.error || "Failed to create session");

      setSession(s);
      setFlow("card-entry");
      startPolling(s.session_id);
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Unknown error");
      setFlow("failed");
    }
  }, [startPolling]);

  // When enrollment completes, save the card reference + report APPROVED.
  useEffect(() => {
    if (flow !== "completed" || !paymentResult) return;
    const lineItem = paymentResult.transactions?.[0]?.line_items?.[0];
    if (!lineItem) return;

    (async () => {
      // Report APPROVED so the transaction doesn't stick in awaiting_result.
      try {
        await fetch("/api/wallet/report", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: paymentResult.session_id,
            txnRefId: lineItem.txn_ref_id,
            status: "APPROVED",
          }),
        });
      } catch {
        // non-fatal
      }

      // Fetch the card details from onSuccess — but since onSuccess is a no-op
      // per the template, we extract what we can from the payment result + listCards.
      // The enrollmentId isn't in payment-result, so we list the user's cards
      // and save the most recent one.
      try {
        const cardsRes = await fetch("/api/wallet/sync-cards", { method: "POST" });
        if (cardsRes.ok) await onCardsChanged();
      } catch {
        // non-fatal
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flow, paymentResult]);

  const handleReset = () => {
    stopPolling();
    setSession(null);
    setPaymentResult(null);
    setErrorMsg("");
    setFlow("idle");
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-noir/90 data-[state=open]:animate-fade-in" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[95vh] w-[calc(100vw-1rem)] max-w-md -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-border bg-noir-card shadow-2xl focus:outline-none data-[state=open]:animate-fade-in-up">
          {/* Header */}
          <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-4">
            <div>
              <Dialog.Title className="flex items-center gap-2 font-display text-lg font-semibold text-ink">
                <Wallet className="h-5 w-5 text-resin" />
                {flow === "card-entry" || flow === "loading" ? "Add your card" : "Your wallet"}
              </Dialog.Title>
              <Dialog.Description className="mt-0.5 text-xs text-ink-muted">
                Secured by Prava. Tokenized — we never see the number.
              </Dialog.Description>
            </div>
            <Dialog.Close className="rounded-lg p-1.5 text-ink-muted transition-colors hover:bg-noir-raised hover:text-ink">
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-5 py-4">
            {/* idle — saved cards + add card CTA */}
            {flow === "idle" && (
              <>
                {cards.length > 0 && (
                  <div className="mb-4 space-y-2">
                    {cards.map((c) => (
                      <div key={c.id} className="flex items-center gap-3 rounded-xl border border-border bg-noir-soft px-4 py-3">
                        <CreditCard className="h-5 w-5 shrink-0 text-ink-muted" />
                        <div className="flex-1">
                          <p className="text-sm font-medium text-ink">
                            {c.brand ? capitalize(c.brand) : "Card"} •••• {c.last4}
                          </p>
                          <p className="text-xs text-ink-muted">
                            {c.exp_month}/{c.exp_year}
                            {c.is_default && " · default"}
                          </p>
                        </div>
                        <DeleteCardButton id={c.id} onDeleted={onCardsChanged} />
                      </div>
                    ))}
                  </div>
                )}
                <button
                  onClick={beginEnrollment}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-resin/40 bg-resin/10 px-4 py-3.5 text-sm font-medium text-resin transition-colors hover:bg-resin/20"
                >
                  <Plus className="h-4 w-4" />
                  {cards.length > 0 ? "Add another card" : "Add a card"}
                </button>
              </>
            )}

            {/* loading — creating session */}
            {flow === "loading" && (
              <div className="flex items-center justify-center gap-2 rounded-xl border border-border bg-noir-soft px-4 py-12 text-sm text-ink-muted">
                <Loader2 className="h-5 w-5 animate-spin text-resin" />
                Setting up your card…
              </div>
            )}

            {/* card-entry — iframe mounted, polling in background */}
            {flow === "card-entry" && session && (
              <div>
                <PravaCardForm
                  session={session}
                  onError={(err) => {
                    setErrorMsg(err.message);
                    stopPolling();
                    setFlow("failed");
                  }}
                />
                <p className="mt-3 flex items-center justify-center gap-2 text-xs text-ink-muted">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Waiting for you to complete the card flow…
                </p>
                <button
                  onClick={handleReset}
                  className="mt-2 w-full text-center text-xs font-medium text-ink-muted underline hover:text-ink"
                >
                  Cancel
                </button>
              </div>
            )}

            {/* completed */}
            {flow === "completed" && (
              <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-leaf/30 bg-leaf/10 px-4 py-10 text-center text-sm text-leaf-light">
                <CheckCircle2 className="h-8 w-8" />
                <p className="font-medium">Card added to your wallet</p>
                <button
                  onClick={handleReset}
                  className="mt-2 text-xs font-medium text-ink-muted underline hover:text-ink"
                >
                  Done
                </button>
              </div>
            )}

            {/* failed */}
            {flow === "failed" && (
              <div className="rounded-xl border border-ember/30 bg-ember/5 px-4 py-4 text-center">
                <p className="text-sm text-ember">{errorMsg || "Something went wrong"}</p>
                <button
                  onClick={beginEnrollment}
                  className="mt-3 text-xs font-medium text-ink-muted underline hover:text-ink"
                >
                  Try again
                </button>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex shrink-0 items-center gap-2 border-t border-border bg-noir/50 px-5 py-3 text-xs text-ink-muted">
            <Shield className="h-3.5 w-3.5 shrink-0 text-leaf" />
            First time on this browser needs device binding (OTP: 456789). Then passkey.
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function DeleteCardButton({ id, onDeleted }: { id: string; onDeleted: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      disabled={busy}
      onClick={async (e) => {
        e.stopPropagation();
        setBusy(true);
        await fetch(`/api/wallet/cards?id=${id}`, { method: "DELETE" });
        await onDeleted();
        setBusy(false);
      }}
      className="text-ink-muted transition-colors hover:text-ember disabled:opacity-40"
      aria-label="Remove card"
    >
      <Trash2 className="h-4 w-4" />
    </button>
  );
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
