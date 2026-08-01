"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import PravaCardForm from "@/components/prava-card-form";
import type { PaymentResultResponse } from "@/lib/prava";

/**
 * PravaPaymentModal — the purchase flow.
 *
 * Same state machine as the wallet modal (idle→loading→card-entry+polling→completed|failed),
 * but the session is created for a real purchase (real merchant + real amount).
 *
 * Prava auto-detects returning users: first time shows the card form, repeat
 * shows saved-cards + passkey. The parent creates the session and passes it in;
 * this modal mounts the iframe and polls for completion.
 *
 * Opened by the chat Order button.
 */

type Flow = "loading" | "card-entry" | "completed" | "failed";

export interface PendingPurchase {
  product: { id: string; name: string; price_inr: number };
  brand: { name: string; website?: string; prescription_required?: boolean };
}

export function PravaPaymentModal({
  open,
  onOpenChange,
  purchase,
  cardId,
  onPaid,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  purchase: PendingPurchase | null;
  cardId: string | null;
  onPaid: (result: { txnRefId: string; sessionId: string }) => void;
}) {
  const [flow, setFlow] = useState<Flow>("loading");
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

  const startPolling = useCallback(
    (sessionId: string) => {
      let isStopped = false;
      const doPoll = async () => {
        if (isStopped) return;
        try {
          const res = await fetch(
            `/api/pay/poll`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ sessionId }),
            }
          );
          const result: PaymentResultResponse = await res.json();
          if (result.status === "completed" || result.status === "failed" || result.status === "awaiting_result") {
            setPaymentResult(result);
            setFlow(result.status === "failed" ? "failed" : "completed");
            if (result.status === "failed") {
              setErrorMsg(result.transactions?.[0]?.error?.message || "Payment failed");
            }
            return; // stop polling
          }
        } catch {
          // keep polling
        }
        if (!isStopped) {
          pollingRef.current = setTimeout(doPoll, 3000) as any;
        }
      };
      
      doPoll();
      
      // Override stopPolling to also set the flag
      pollingRef.current = {
        isCustomInterval: true,
        stop: () => { isStopped = true; }
      } as any;
    },
    []
  );

  // Create the session when opened with a purchase.
  useEffect(() => {
    if (!open || !purchase) return;
    let cancelled = false;
    (async () => {
      setFlow("loading");
      setErrorMsg("");
      setPaymentResult(null);
      try {
        const res = await fetch("/api/pay", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items: [{ name: purchase.product.name }],
            total: purchase.product.price_inr,
            merchantName: purchase.brand.name,
            merchantUrl: purchase.brand.website ?? "https://saul.pras.fun",
            cardId: cardId ?? undefined,
          }),
        });
        const s = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(s.error || "Failed to create session");
        setSession(s);
        setFlow("card-entry");
        startPolling(s.session_id);
      } catch (e) {
        if (cancelled) return;
        setErrorMsg(e instanceof Error ? e.message : "Unknown error");
        setFlow("failed");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, purchase, cardId, startPolling]);

  // On completed, report APPROVED + fire onPaid.
  useEffect(() => {
    if (flow !== "completed" || !paymentResult) return;
    const txnRefId = paymentResult.transactions?.[0]?.line_items?.[0]?.txn_ref_id || paymentResult.transactions?.[0]?.txn_id;

    (async () => {
      // Report APPROVED so the transaction doesn't stick in awaiting_result.
      if (txnRefId) {
        try {
          await fetch("/api/pay/report", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              sessionId: paymentResult.session_id,
              txnRefId,
              status: "APPROVED",
            }),
          });
        } catch {
          // non-fatal
        }
        onPaid({ txnRefId, sessionId: paymentResult.session_id });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flow, paymentResult]);

  // Reset on close
  useEffect(() => {
    if (!open) {
      stopPolling();
      setSession(null);
      setPaymentResult(null);
      setErrorMsg("");
      setFlow("loading");
    }
  }, [open, stopPolling]);

  useEffect(() => () => stopPolling(), [stopPolling]);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-noir/90 data-[state=open]:animate-fade-in" />
        {/* No `transform` on Content or any ancestor of the Prava iframe — a
            transformed containing block around a cross-origin iframe is a
            documented WebKit crash trigger when Safari suspends the render
            tree to drop the native Touch ID sheet. Center with flexbox instead. */}
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2">
        <Dialog.Content className="flex max-h-[95vh] w-[calc(100vw-1rem)] max-w-md flex-col overflow-hidden rounded-2xl border border-border bg-noir-card shadow-2xl focus:outline-none data-[state=open]:animate-fade-in-up">
          <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-4">
            <Dialog.Title className="font-display text-lg font-semibold text-ink">
              {purchase ? `Pay for ${purchase.product.name}` : "Payment"}
            </Dialog.Title>
            <Dialog.Close className="rounded-lg p-1.5 text-ink-muted transition-colors hover:bg-noir-raised hover:text-ink">
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-4">
            {flow === "loading" && (
              <div className="flex items-center justify-center gap-2 rounded-xl border border-border bg-noir-soft px-4 py-12 text-sm text-ink-muted">
                <Loader2 className="h-5 w-5 animate-spin text-resin" />
                Setting up your payment…
              </div>
            )}

            {flow === "card-entry" && session && (
              <div>
                <PravaCardForm session={session} onError={(err) => setErrorMsg(err.message)} />
                <p className="mt-3 flex items-center justify-center gap-2 text-xs text-ink-muted">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Waiting for you to approve with passkey…
                </p>
              </div>
            )}

            {flow === "completed" && (
              <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-leaf/30 bg-leaf/10 px-4 py-10 text-center text-sm text-leaf-light">
                <CheckCircle2 className="h-8 w-8" />
                <p className="font-medium">Payment successful</p>
              </div>
            )}

            {flow === "failed" && (
              <div className="rounded-xl border border-ember/30 bg-ember/5 px-4 py-4 text-center">
                <p className="flex items-center justify-center gap-2 text-sm text-ember">
                  <AlertCircle className="h-4 w-4" />
                  {errorMsg || "Payment failed"}
                </p>
              </div>
            )}
          </div>
        </Dialog.Content>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
