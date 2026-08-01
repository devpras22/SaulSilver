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
  Loader2,
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
import { AddressDialog } from "@/components/header-address";
import { PravaPaymentModal } from "@/components/prava-payment-modal";
import type { PaymentResultResponse } from "@/lib/prava";

/**
 * Detects the WebKit browser engine (the thing that crashes during the Prava
 * passkey sheet). Catches desktop Safari AND every browser on iOS — Chrome,
 * Firefox, Edge on iPhone all run on iOS WebKit, not their own engines, so
 * they share the same crash risk as Safari. Non-WebKit (Chrome/Firefox/Edge
 * on desktop, Chrome on Android) gets the richer embedded-modal UX.
 *
 * On WebKit we open the whole Prava flow in a new tab and poll for completion
 * — our page never mounts the cross-origin iframe, which is what was killing
 * the tab during the cross-window WebAuthn handshake.
 */
function isWebKitEngine(): boolean {
  if (typeof window === "undefined") return false;
  // iOS = always WebKit (Apple's policy). Catches every iOS browser.
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  // Desktop Safari: AppleWebKit + no Chrome/CriOS/EdgiOS/FxiOS + vendor Apple.
  // This excludes Chrome-on-Mac (which has "Chrome/" in UA) and Firefox/Edge.
  const ua = navigator.userAgent;
  const isDesktopSafari = /AppleWebKit/.test(ua) &&
    /Safari/.test(ua) &&
    !/Chrome|CriOS|EdgiOS|FxiOS|Edg\//.test(ua) &&
    navigator.vendor === "Apple Computer, Inc.";
  return isIOS || isDesktopSafari;
}

export default function AppChat({
  savedAddress,
  intent,
}: {
  savedAddress: string | null;
  intent: Intent;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatId, setChatId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [addressModalOpen, setAddressModalOpen] = useState(false);
  const [savedCardId, setSavedCardId] = useState<string | null>(null);

  // Fetch the user's saved card so the Order button can reuse it (passkey-only
  // checkout — no card form reappears).
  useEffect(() => {
    fetch("/api/wallet/cards")
      .then((r) => r.json())
      .then((data) => {
        const card = (data.cards ?? [])[0];
        if (card?.prava_card_id) setSavedCardId(card.prava_card_id);
      })
      .catch(() => {});
  }, []);
  const [pendingPayment, setPendingPayment] = useState<{product: CannabisProduct, brand: Brand} | null>(null);

  const searchParams = useSearchParams();

  // ── Greeting on mount — different opening per intent ──
  useEffect(() => {
    const loadChatId = searchParams.get("chat");
    if (loadChatId) {
      fetch(`/api/chats/${loadChatId}`)
        .then(r => r.json())
        .then(s => {
          if (s.messages?.length) {
            setMessages(s.messages);
            setChatId(loadChatId);
          }
        })
        .catch(() => {});
      return;
    }

    const openers: Record<Intent, string> = {
      match: "I'm Saul Silver. Tell me if you are looking for better sleep, deep focus, or just a calm evening. I will find the perfect recommendation for you.",
      verify: "I'm Saul Silver. Drop a brand name below. I'll check their lab tests and licenses to tell you if they're legit.",
      browse: "I'm Saul Silver. The menu is open. What catches your eye?",
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
    if (intent === "browse") loadCatalog();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intent, searchParams]);

  useEffect(() => {
    if (messages.length > 1) {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    } else {
      scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    }
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

  // Save chat to history whenever messages update (if there is at least one user message)
  useEffect(() => {
    const hasUserMsg = messages.some(m => m.role === "user");
    if (!hasUserMsg) return;

    const timer = setTimeout(() => {
      fetch("/api/chats/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: chatId || undefined, // undefined will insert a new row
          messages,
        }),
      })
      .then(r => r.json())
      .then(data => {
        if (data.id && data.id !== chatId) setChatId(data.id);
      })
      .catch(() => {});
    }, 1000);

    return () => clearTimeout(timer);
  }, [messages, chatId]);

  // ── Handle user input ──
  const handleSend = async (overrideText?: string | React.MouseEvent | React.KeyboardEvent) => {
    const textToUse = typeof overrideText === "string" ? overrideText : input.trim();
    if (!textToUse || busy) return;
    
    if (typeof overrideText !== "string") {
      setInput("");
      const ta = document.querySelector("textarea");
      if (ta) ta.style.height = "auto";
    }
    
    const userText = textToUse;
    setMessages((m) => [
      ...m,
      { id: `user_${Date.now()}`, role: "user", content: userText, kind: "text", timestamp: new Date().toISOString() },
    ]);

    // Handle prescription flow branches natively in chat
    if (pendingPrescription) {
      if (userText === "I need a consultation") {
        pushAssistant("Got it. What's the best phone number for their doctor to reach you at?", "text");
        return;
      }
      if (userText === "I have a prescription") {
        pushAssistant("Perfect. Tap the paperclip below to upload a photo or PDF of it.", "text");
        return;
      }
      
      // If we are in pending prescription state and the last message asked for a phone number
      const lastAssistantMsg = messages.filter(m => m.role === "assistant").pop()?.content || "";
      if (lastAssistantMsg.includes("best phone number")) {
        setBusy(true);
        pushAssistant("Sending details to the medical team...", "thinking");
        try {
          await fetch("/api/prescription", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              brandName: pendingPrescription.brand.name,
              productName: pendingPrescription.product.name,
              orderId: pendingPrescription.sessionId,
              doctorRouting: pendingPrescription.brand.doctor_routing,
              phone: userText,
            }),
          });
          const effect = pendingPrescription.product.effect_tags?.[0] || "health";
          const dynamicEffect = effect === "sleep" ? "insomnia" : effect === "pain" ? "pain" : effect === "anxiety" ? "anxiety" : "condition";
          pushAssistant(`Sent. I let their medical team know you need this to help with the ${dynamicEffect}. They'll call you within 24 hours. Hang tight.`, "text");
        } finally {
          setBusy(false);
          setPendingPrescription(null);
        }
        return;
      }
    }

    setBusy(true);
    pushAssistant("Thinking...", "thinking");

    try {
      const currentMessages = messages
        .filter(m => m.role === "user" || m.role === "assistant")
        .map(m => ({ role: m.role, content: m.content || "(Sent a dashboard widget)" }));
      
      currentMessages.push({ role: "user", content: userText });

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: currentMessages }),
      });
      const data = await res.json();
      
      setMessages((m) => m.filter((msg) => msg.kind !== "thinking"));

      if (data.tool_calls && data.tool_calls.length > 0) {
        for (const tool of data.tool_calls) {
          if (tool.function.name === "matchProducts") {
            const args = JSON.parse(tool.function.arguments);
            pushAssistant(`Let me see what I have for ${args.effect}...`, "text");
            await runMatch({ ...args, intent: "match", region: "IN" });
          } else if (tool.function.name === "researchBrand") {
            const args = JSON.parse(tool.function.arguments);
            pushAssistant(`Sure, pulling up the dossier on ${args.brandName}...`, "text");
            await verifyBrand(args.brandName);
          }
        }
      } else if (data.content) {
        pushAssistant(data.content, "text");
      }
    } catch (e) {
      setMessages((m) => m.filter((msg) => msg.kind !== "thinking"));
      pushAssistant("Sorry, my brain glitched. Try again.", "text");
    } finally {
      setBusy(false);
    }
  };

  const handleUpload = async (file: File) => {
    if (!pendingPrescription) {
      pushAssistant("Upload successful. (File uploads outside of checkout are not fully supported yet).", "text");
      return;
    }
    
    setMessages((m) => [...m, { id: `user_${Date.now()}`, role: "user", content: `[Uploaded ${file.name}]`, kind: "text", timestamp: new Date().toISOString() }]);
    setBusy(true);
    pushAssistant("Sending prescription to fulfillment...", "thinking");
    try {
      await fetch("/api/prescription", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            brandName: pendingPrescription.brand.name,
            productName: pendingPrescription.product.name,
            orderId: pendingPrescription.sessionId,
            doctorRouting: pendingPrescription.brand.doctor_routing,
            hasFile: true,
          }),
      });
      const effect = pendingPrescription.product.effect_tags?.[0] || "health";
      const dynamicEffect = effect === "sleep" ? "insomnia" : effect === "pain" ? "pain" : effect === "anxiety" ? "anxiety" : "condition";
      pushAssistant(`Got it. Sent it straight to Moon Impact's fulfillment team so they can ship it immediately. Hope this finally helps with the ${dynamicEffect}.`, "text");
    } finally {
      setBusy(false);
      setPendingPrescription(null);
    }
  };

  // ── Run the sommelier match ──
  const runMatch = async (p: UserProfile) => {
    setBusy(true);
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
        return;
      }

      await new Promise((r) => setTimeout(r, 600));
      pushAssistant("", "recommendation", { matches: data.matches, profile: p });
    } catch (e) {
      setMessages((m) => m.filter((msg) => msg.kind !== "thinking"));
      pushAssistant(`Match failed: ${e instanceof Error ? e.message : "unknown error"}.`, "text");
    } finally {
      setBusy(false);
    }
  };

  // ── Verify a brand (the trust-check door) ──
  const verifyBrand = async (brandName: string) => {
    setBusy(true);
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
    } catch (e) {
      setMessages((m) => m.filter((msg) => msg.kind !== "thinking"));
      pushAssistant(`Couldn't research ${brandName}: ${e instanceof Error ? e.message : "unknown error"}.`, "text");
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
          profile: { intent: "browse", region: "IN" },
          browse: true,
        });
      }
    } catch {
      // ignore
    }
  };

  // ── Payment ──
  //
  // Two paths, same handler on completion:
  //   • WebKit engine (Safari desktop + all iOS browsers): the cross-origin
  //     Prava iframe kills the tab during the cross-window WebAuthn passkey
  //     handshake. So we open the WHOLE Prava flow in a new tab and poll for
  //     completion — our page never mounts the iframe.
  //   • Non-WebKit (Chrome/Firefox/Edge desktop, Chrome Android): the richer
  //     embedded modal (PravaCardForm iframe + in-page UX), which works fine.
  const [activePurchase, setActivePurchase] = useState<{ product: CannabisProduct; brand: Brand } | null>(null);
  const [pendingPrescription, setPendingPrescription] = useState<{ product: CannabisProduct; brand: Brand; sessionId: string } | null>(null);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [webkitPollingSession, setWebkitPollingSession] = useState<string | null>(null);
  const webkitPollingRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Reference to the checkout tab so we can close() it on completion.
  // No `noopener` on window.open so the handle stays usable.
  const webkitCheckoutTabRef = useRef<Window | null>(null);
  // The id of the inline "Opening secure checkout…" status bubble, so the
  // poller can remove it (and its spinner) when payment completes.
  const webkitPaymentMsgRef = useRef<string | null>(null);

  const runPayment = async (product: CannabisProduct, brand: Brand, skipAddressCheck = false) => {
    if (!savedAddress && !skipAddressCheck) {
      setPendingPayment({ product, brand });
      setAddressModalOpen(true);
      return;
    }
    // Gate: no saved card → tell the user to add one first.
    if (!savedCardId) {
      pushAssistant(
        `Add a card to your wallet first (top-right) — then I can check you out with just a passkey tap.`,
        "text"
      );
      return;
    }

    setActivePurchase({ product, brand });

    // ── WebKit path: new tab, no iframe on our page ──
    if (isWebKitEngine()) {
      // Single status bubble with a known id, so we can update + remove it.
      const paymentMsgId = `pay_${Date.now().toString(36)}`;
      webkitPaymentMsgRef.current = paymentMsgId;
      setMessages((m) => [
        ...m,
        {
          id: paymentMsgId,
          role: "assistant",
          content: "Opening secure checkout…",
          kind: "payment",
          data: { step: "Opening secure checkout…" },
          timestamp: new Date().toISOString(),
        },
      ]);
      try {
        const res = await fetch("/api/pay", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items: [{ name: product.name }],
            total: product.price_inr,
            merchantName: brand.name,
            merchantUrl: brand.website ?? "https://saul.pras.fun",
            cardId: savedCardId ?? undefined,
          }),
        });
        const s = await res.json();
        if (!res.ok) throw new Error(s.error || "Failed to create session");

        // Open the FULL Prava flow in a new tab. Our page hosts no iframe →
        // the cross-window WebAuthn handshake can't crash us. No `noopener`
        // so we keep a handle to close the tab on completion.
        webkitCheckoutTabRef.current = window.open(s.iframe_url, "_blank");

        // Update the SAME status bubble to the "waiting" state — no new bubble.
        setMessages((m) =>
          m.map((msg) =>
            msg.id === paymentMsgId
              ? {
                  ...msg,
                  content: "Checkout opened in a new tab.",
                  data: {
                    step: "Waiting for passkey approval…",
                    detail: "Approve it in the tab that just opened — I'll wait here.",
                  },
                }
              : msg
          )
        );
        setWebkitPollingSession(s.session_id);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Unknown error";
        // Remove the status bubble, then show the error.
        setMessages((m) => m.filter((msg) => msg.id !== paymentMsgId));
        pushAssistant(`Couldn't start checkout: ${msg}`, "text");
        setActivePurchase(null);
      }
      return;
    }

    // ── Non-WebKit path: embedded modal ──
    setPaymentModalOpen(true);
  };

  // Poll for the WebKit new-tab payment. Same completion handler (onPaid) as
  // the modal path. Recursive setTimeout with strict cleanup — no leaked timers.
  useEffect(() => {
    if (!webkitPollingSession) return;
    let stopped = false;

    const doPoll = async () => {
      if (stopped) return;
      try {
        const res = await fetch("/api/pay/poll", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: webkitPollingSession }),
        });
        const result: PaymentResultResponse = await res.json();
        // Completion states. Prava pauses passkey transactions at
        // "awaiting_result" / "creds_generated" — it won't finalize the charge
        // until the merchant explicitly reports APPROVED. The modal path handles
        // this on its completion effect; the new-tab path must do the same, or
        // the dashboard stalls at creds_generated and the charge never completes.
        const isDone =
          result.status === "completed" ||
          result.status === "failed" ||
          result.status === "awaiting_result" ||
          result.status === "creds_generated";
        if (isDone) {
          setWebkitPollingSession(null);

          // Remove the "Opening secure checkout…" status bubble + spinner,
          // and try to close the checkout tab (browsers may block this if the
          // user interacted with the cross-origin tab — best-effort).
          const msgId = webkitPaymentMsgRef.current;
          if (msgId) setMessages((m) => m.filter((msg) => msg.id !== msgId));
          webkitPaymentMsgRef.current = null;
          try { webkitCheckoutTabRef.current?.close(); } catch { /* cross-origin */ }
          webkitCheckoutTabRef.current = null;

          if (result.status === "failed") {
            pushAssistant(`Payment failed: ${result.transactions?.[0]?.error?.message || "unknown"}.`, "text");
            setActivePurchase(null);
          } else {
            const txnRefId = result.transactions?.[0]?.line_items?.[0]?.txn_ref_id || result.transactions?.[0]?.txn_id;
            if (txnRefId) {
              // Paused state (creds_generated / awaiting_result): report APPROVED
              // so Prava finalizes the charge. For already-completed it's a no-op
              // confirmation. Mirrors the modal path's /api/pay/report call.
              if (result.status === "awaiting_result" || result.status === "creds_generated") {
                try {
                  await fetch("/api/pay/report", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ sessionId: result.session_id, txnRefId, status: "APPROVED" }),
                  });
                } catch {
                  // non-fatal — still surface success to the user
                }
              }
              onPaid({ txnRefId, sessionId: result.session_id });
            }
          }
          return;
        }
      } catch {
        // keep polling on transient errors
      }
      if (!stopped) {
        webkitPollingRef.current = setTimeout(doPoll, 3000);
      }
    };

    doPoll();
    return () => {
      stopped = true;
      if (webkitPollingRef.current) {
        clearTimeout(webkitPollingRef.current);
        webkitPollingRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [webkitPollingSession]);

  // Called when the payment modal reports success.
  const onPaid = async ({ txnRefId, sessionId }: { txnRefId: string; sessionId: string }) => {
    if (!activePurchase) return;
    const { product, brand } = activePurchase;
    setPaymentModalOpen(false);
    setBusy(true);

    try {
      // Save the order
      await fetch("/api/orders/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: [{ id: product.id, name: product.name, quantity: 1, type: "supplement" }],
          address: savedAddress ?? "",
          priority: "effect",
          quote: { pharmacyName: brand.name, total: product.price_inr, deliveryEtaMinutes: 2880 },
          pravaSessionId: sessionId,
          pravaTxnRef: txnRefId,
          paymentMode: "prava",
          status: "completed",
        }),
      });

      // Prescription routing logic
      if (brand.prescription_required) {
        setPendingPrescription({ product, brand, sessionId });
        pushAssistant(
          `Done. ${product.name} ordered and paid.`,
          "confirmation",
          { product, brand, txnRef: txnRefId, sessionId, doctorRouted: false }
        );
        setTimeout(() => {
          pushAssistant("By law in India, a medical prescription is required before this can ship. Do you already have a prescription, or do you need a doctor's consultation?", "text");
        }, 800);
      } else {
        pushAssistant(
          `Done. ${product.name} ordered and paid. Ships pan-India in 2-4 days.`,
          "confirmation",
          { product, brand, txnRef: txnRefId, sessionId, doctorRouted: false }
        );
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to save order";
      pushAssistant(`Payment succeeded but order save failed: ${msg}`, "text");
    } finally {
      setBusy(false);
      setActivePurchase(null);
    }
  };

  const reset = () => {
    setMessages([{ id: "welcome2", role: "assistant", kind: "text", content: "Next one. What's the vibe?", timestamp: new Date().toISOString() }]);
  };

  return (
    <div className="flex h-[calc(100vh-57px)] flex-col overflow-hidden">
      <div ref={scrollRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
        {messages.map((m) => (
          <MessageBubble key={m.id} message={m} onPay={runPayment} />
        ))}

        {(() => {
          const lastMsg = messages[messages.length - 1];
          const isAssistant = lastMsg?.role === "assistant" && lastMsg?.kind === "text";
          const lastText = lastMsg?.content?.toLowerCase() || "";

          const showEffects = messages.length === 1 && intent === "match";
          const showTolerance = isAssistant && !showEffects && (lastText.includes("tolerance") || lastText.includes("experienced") || lastText.includes("experience") || lastText.includes("beginner"));
          const showRatio = isAssistant && !showEffects && !showTolerance && (lastText.includes("ratio") || lastText.includes("cbd") || lastText.includes("thc") || lastText.includes("lean"));

          return (
            <>
              {/* Effect quick-picks */}
              {showEffects && !busy && (
                <div className="flex flex-wrap gap-2 pl-[44px] pr-4 pt-1 animate-fade-in-up">
                  {EFFECTS.map((e) => (
                    <button
                      key={e.value}
                      onClick={() => handleSend(e.label)}
                      className="rounded-full border border-border bg-noir/80 shadow-sm px-4 py-2 text-sm text-ink-soft transition-all hover:-translate-y-0.5 hover:border-resin/40 hover:bg-resin/10 hover:text-resin-light"
                    >
                      {e.label}
                    </button>
                  ))}
                </div>
              )}

              {/* Tolerance quick-picks */}
              {showTolerance && !busy && (
                <div className="flex flex-wrap gap-2 pl-[44px] pr-4 pt-1 animate-fade-in-up">
                  {TOLERANCES.map((t) => (
                    <button
                      key={t.value}
                      onClick={() => handleSend(t.label)}
                      className="rounded-full border border-border bg-noir/80 shadow-sm px-4 py-2 text-sm text-ink-soft transition-all hover:-translate-y-0.5 hover:border-resin/40 hover:bg-resin/10 hover:text-resin-light"
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              )}

              {/* Prescription intent quick-picks */}
              {pendingPrescription && !busy && lastText.includes("already have a prescription") && (
                <div className="flex flex-wrap gap-2 pl-[44px] pr-4 pt-1 animate-fade-in-up">
                  {(["I have a prescription", "I need a consultation"] as const).map((r) => (
                    <button
                      key={r}
                      onClick={() => handleSend(r)}
                      className="rounded-full border border-border bg-noir/80 shadow-sm px-4 py-2 text-sm text-ink-soft transition-all hover:-translate-y-0.5 hover:border-resin/40 hover:bg-resin/10 hover:text-resin-light"
                    >
                      {r}
                    </button>
                  ))}
                </div>
              )}

              {/* Ratio quick-picks */}
              {showRatio && !busy && (
                <div className="flex flex-wrap gap-2 pl-[44px] pr-4 pt-1 animate-fade-in-up">
                  {(["More CBD", "Balanced", "More THC", "You decide"] as const).map((r) => (
                    <button
                      key={r}
                      onClick={() => handleSend(r)}
                      className="rounded-full border border-border bg-noir/80 shadow-sm px-4 py-2 text-sm text-ink-soft transition-all hover:-translate-y-0.5 hover:border-resin/40 hover:bg-resin/10 hover:text-resin-light"
                    >
                      {r}
                    </button>
                  ))}
                </div>
              )}
            </>
          );
        })()}

        {busy && <ThinkingIndicator />}
        <div className="h-32 shrink-0" />
      </div>

      {/* Input bar */}
      <div className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-noir pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto max-w-4xl px-3 py-3 sm:px-6 sm:py-4">
          <div className="flex items-end gap-2">
            <div className="flex flex-1 items-end gap-1 rounded-2xl border border-border bg-noir-card px-1.5 py-1 transition-colors focus-within:border-resin">
              <label className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-xl text-ink-muted transition-colors hover:bg-noir-raised hover:text-resin">
                <input type="file" accept="image/*,.pdf" className="hidden" onChange={(e) => {
                  if (e.target.files?.[0]) handleUpload(e.target.files[0]);
                }} />
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
                placeholder="Message…"
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

      <AddressDialog
        open={addressModalOpen}
        onOpenChange={setAddressModalOpen}
        onSaved={() => {
          if (pendingPayment) {
            runPayment(pendingPayment.product, pendingPayment.brand, true);
            setPendingPayment(null);
          }
        }}
      />

      <PravaPaymentModal
        open={paymentModalOpen}
        onOpenChange={(v) => {
          setPaymentModalOpen(v);
          if (!v) setActivePurchase(null);
        }}
        purchase={activePurchase ? {
          product: { id: activePurchase.product.id, name: activePurchase.product.name, price_inr: activePurchase.product.price_inr },
          brand: { name: activePurchase.brand.name, website: activePurchase.brand.website, prescription_required: activePurchase.brand.prescription_required },
        } : null}
        cardId={savedCardId}
        onPaid={onPaid}
      />
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
    const { product, brand, txnRef, doctorRouted } = message.data as {
      product: CannabisProduct;
      brand: Brand;
      txnRef?: string;
      doctorRouted?: boolean;
    };
    return <ConfirmationCard product={product} brand={brand} txnRef={txnRef} doctorRouted={doctorRouted} />;
  }

  if (message.kind === "payment") {
    const { step, detail } = (message.data as { step: string; detail?: string }) ?? { step: message.content };
    return (
      <div className="flex items-start gap-3 animate-fade-in-up">
        <Avatar />
        <div className="w-full max-w-[88%]">
          <Card className="border-resin/20 bg-noir-card">
            <CardContent className="flex items-center gap-3 py-4">
              <Loader2 className="h-5 w-5 shrink-0 animate-spin text-resin" />
              <div>
                <p className="text-sm text-ink">{step}</p>
                {detail && <p className="text-xs text-ink-muted">{detail}</p>}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
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

function ConfirmationCard({
  product,
  brand,
  txnRef,
  doctorRouted,
}: {
  product: CannabisProduct;
  brand: Brand;
  txnRef?: string;
  doctorRouted?: boolean;
}) {
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
              {product.name} from {brand.name}.{" "}
              {doctorRouted || brand.prescription_required
                ? "Their doctor will call within 24h."
                : "Ships pan-India in 2-4 days."}
            </p>
            <div className="mt-4 grid grid-cols-3 gap-3 rounded-lg bg-noir-soft p-3 text-center">
              <div><p className="text-xs text-ink-muted">Total</p><p className="font-display font-semibold">{formatINR(product.price_inr)}</p></div>
              <div><p className="text-xs text-ink-muted">Pack</p><p className="font-display font-semibold">{product.pack_count}</p></div>
              <div><p className="text-xs text-ink-muted">Paid via</p><p className="font-display font-semibold">Prava</p></div>
            </div>
            {txnRef && (
              <p className="mt-3 text-xs text-ink-muted">Txn ref <span className="font-mono text-resin-light">{txnRef}</span></p>
            )}
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
