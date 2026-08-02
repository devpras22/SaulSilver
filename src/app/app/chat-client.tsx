"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useSwipeable } from "react-swipeable";
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
  ChevronDown,
  ChevronUp,
  Zap,
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
  const catalogLoadedRef = useRef(false);
  const brandsLoadedRef = useRef(false);
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
    if (intent === "browse" && !catalogLoadedRef.current) {
      catalogLoadedRef.current = true;
      loadCatalog();
    }
    if (intent === "verify" && !brandsLoadedRef.current) {
      brandsLoadedRef.current = true;
      loadBrands();
    }
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
      setMessages((m) => {
        if (kind === "catalog" && m.some((msg) => msg.kind === "catalog")) {
          return m;
        }
        return [
          ...m,
          {
            id: `msg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
            role: "assistant",
            content,
            kind,
            data,
            timestamp: new Date().toISOString(),
          },
        ];
      });
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

      if (data.matches && data.matches.length > 0) {
        const topMatch = data.matches[0];
        const sensoReason = topMatch.reasons.find((r: string) => r.startsWith("Senso: "));
        
        const effectStr = p.effect ? p.effect.replace("_", " ") : "that vibe";
        let verbal = `Here are the top matches for ${effectStr}. I highly recommend the ${topMatch.brand.name} ${topMatch.product.name}.`;
        
        if (sensoReason) {
          const quote = sensoReason.replace("Senso: ", "").trim();
          verbal += ` Verified users really rave about this — "${quote}"`;
        }
        
        pushAssistant(verbal, "text");
        await new Promise((r) => setTimeout(r, 800)); // let them read it briefly before the cards fan out
      } else {
        await new Promise((r) => setTimeout(r, 600));
      }

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
        pushAssistant("", "catalog", {
          matches: data.products.map((p: CannabisProduct) => ({
            product: p,
            brand: data.brands.find((b: Brand) => b.id === p.brand_id),
            score: 0.5,
            reasons: [`${p.pack_count} gummies`, formatINR(p.price_inr)],
          })),
          profile: { intent: "browse", region: "IN" },
        });
      }
    } catch {
      // ignore
    }
  };

  // ── Load brands for verify ──
  const loadBrands = async () => {
    try {
      const res = await fetch("/api/catalog");
      const data = await res.json();
      if (data.brands?.length) {
        pushAssistant("Or just tap one of the 12 brands we actively track below:", "brand_pills", { brands: data.brands });
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
      <div ref={scrollRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1 pb-10 scrollbar-hide">
        {(() => {
          const latestDashboardId = [...messages].reverse().find(m => m.kind === "dashboard")?.id;
          return messages.map((m) => (
            <MessageBubble 
              key={m.id} 
              message={m} 
              onPay={runPayment} 
              onVerify={verifyBrand} 
              isLatestDashboard={m.id === latestDashboardId} 
            />
          ));
        })()}

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
      <div className="fixed inset-x-0 bottom-0 z-50 pb-[calc(env(safe-area-inset-bottom)+16px)] sm:pb-6 pointer-events-none">
        <div className="mx-auto max-w-4xl px-3 sm:px-6 pointer-events-auto">
          <div className="flex items-end gap-2">
            <div className="flex flex-1 items-end gap-1 rounded-[28px] border border-border/50 bg-noir-card/90 backdrop-blur-xl shadow-2xl px-2 py-1.5 transition-all focus-within:border-resin focus-within:bg-noir-card">
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
  onVerify,
  isLatestDashboard = true,
}: {
  message: ChatMessage;
  onPay: (product: CannabisProduct, brand: Brand) => void;
  onVerify: (brandName: string) => void;
  isLatestDashboard?: boolean;
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

  if (message.kind === "catalog" && message.data) {
    const { matches } = message.data as { matches: ProductMatch[] };
    return <CatalogList matches={matches} onPay={onPay} />;
  }

  if (message.kind === "brand_pills" && message.data) {
    const { brands } = message.data as { brands: Brand[] };
    return (
      <div className="flex items-start gap-3 animate-fade-in-up mt-2">
        <Avatar />
        <div>
          <div className="max-w-[80%] whitespace-pre-line rounded-2xl rounded-tl-sm bg-noir-card px-4 py-2.5 text-sm text-ink shadow-sm mb-3">
            {message.content}
          </div>
          <div className="flex flex-wrap gap-2 max-w-[85%]">
            {brands.map((b) => (
              <button
                key={b.id}
                onClick={() => onVerify(b.name)}
                className="rounded-full border border-white/10 bg-black/40 backdrop-blur-md px-3 py-1.5 text-xs text-white/80 transition-colors hover:border-resin/50 hover:text-white"
              >
                {b.name}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (message.kind === "dashboard" && message.data) {
    const { brand, products, research } = message.data as {
      brand: Brand;
      products: CannabisProduct[];
      research: { verdict: string; findings: { summary: string; red_flags?: string[]; license?: string }; sources: string[] };
    };
    return (
      <BrandReport 
        brand={brand} 
        products={products} 
        research={research} 
        onPay={onPay} 
        isLatestDashboard={isLatestDashboard}
      />
    );
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

function CatalogList({
  matches,
  onPay,
}: {
  matches: ProductMatch[];
  onPay: (product: CannabisProduct, brand: Brand) => void;
}) {
  const vibeGroups = [
    { id: "sleep", label: "Deep Sleep & Insomnia", icon: "🌙", tags: ["sleep"] },
    { id: "pain", label: "Pain Relief & Body", icon: "🩹", tags: ["pain"] },
    { id: "anxiety", label: "Anxiety & Calm", icon: "🧘‍♂️", tags: ["anxiety", "relax"] },
    { id: "focus", label: "Focus & Social", icon: "⚡️", tags: ["focus", "social", "energy", "mood", "euphoria"] }
  ];

  const grouped = vibeGroups.map(vibe => ({
    ...vibe,
    products: matches.filter(m => m.product.effect_tags?.some(tag => vibe.tags.includes(tag)))
  })).filter(vibe => vibe.products.length > 0);

  const [openSection, setOpenSection] = useState<string | null>(grouped[0]?.id || null);

  return (
    <div className="space-y-4 py-2 animate-fade-in-up">
      {grouped.map(vibe => {
        const isOpen = openSection === vibe.id;
        return (
          <div key={vibe.id} className="w-full overflow-hidden rounded-lg border border-border bg-noir-card">
            <button 
              onClick={() => setOpenSection(isOpen ? null : vibe.id)}
              className="flex w-full items-center justify-between p-4 transition-colors hover:bg-resin/5"
            >
              <div className="flex items-center gap-2">
                <span className="text-xl">{vibe.icon}</span>
                <h3 className="font-medium text-ink">{vibe.label}</h3>
                <Badge variant="outline" className="ml-2 text-[10px] text-ink-muted">
                  {vibe.products.length}
                </Badge>
              </div>
              {isOpen ? <ChevronUp className="h-4 w-4 text-ink-muted" /> : <ChevronDown className="h-4 w-4 text-ink-muted" />}
            </button>
            
            {isOpen && (
              <>
                {/* DESKTOP GRID */}
                <div className="hidden sm:flex overflow-x-auto pb-4 pt-4 pl-4 pr-6 scrollbar-hide border-t border-border/30 space-x-3">
                  {vibe.products.map(m => (
                    <MenuProductCard key={m.product.id} match={m} onPay={onPay} />
                  ))}
                </div>
                {/* MOBILE ROLODEX */}
                <div className="block sm:hidden w-full px-4 pt-4 pb-2 border-t border-border/30">
                  <MobileRolodex matches={vibe.products} onPay={onPay} />
                </div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

function MenuProductCard({ 
  match, 
  onPay,
  isExpanded,
  onToggleExpand,
  className,
  expandedClassName
}: { 
  match: ProductMatch; 
  onPay: (p: CannabisProduct, b: Brand) => void;
  isExpanded?: boolean;
  onToggleExpand?: (expanded: boolean) => void;
  className?: string;
  expandedClassName?: string;
}) {
  const [internalExpanded, setInternalExpanded] = useState(false);
  const expanded = isExpanded !== undefined ? isExpanded : internalExpanded;
  const setExpanded = onToggleExpand || setInternalExpanded;
  const { product, brand } = match;

  if (expanded) {
    return (
      <div className={`shrink-0 snap-start relative z-50 shadow-2xl transition-all ${expandedClassName || className || 'w-80'}`}>
        <ProductCard match={match} rank={-1} onPay={onPay} onClose={() => setExpanded(false)} />
      </div>
    );
  }

  const cleanName = product.name
    .replace(new RegExp(`\\b${product.ratio || ""}\\b`, "gi"), "")
    .replace(/\b\d+mg\b/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/,\s*$/, "");

  return (
    <Card 
      onClick={() => setExpanded(true)}
      className={`shrink-0 snap-start cursor-pointer overflow-hidden border-white/10 bg-black/40 backdrop-blur-md transition-all hover:border-resin/40 hover:-translate-y-1 hover:shadow-xl group relative shadow-lg ${className || 'w-56 sm:w-64'}`}
    >
      <div className="h-36 sm:h-52 w-full bg-gradient-to-b from-resin/5 to-black/60 relative overflow-hidden border-b border-white/10">
        <div className="absolute inset-0 flex items-center justify-center">
          <img 
            src={`/products/${brand.id}/${product.name.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.jpg`}
            alt={product.name}
            className="h-full w-full object-cover opacity-50 mix-blend-screen transition-all duration-700 group-hover:scale-110 group-hover:opacity-70"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
              e.currentTarget.parentElement?.classList.add('opacity-10');
              const Icon = require('lucide-react').Leaf;
              e.currentTarget.parentElement!.innerHTML = '<svg class="w-12 h-12 text-resin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"/><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/></svg>';
            }}
          />
        </div>
        <div className="absolute top-2 left-2">
          <span className="rounded bg-black/60 backdrop-blur-md px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-white/80 border border-white/10">
            {brand.name}
          </span>
        </div>
      </div>
      <CardContent className="p-4 flex flex-col justify-between h-[110px] sm:h-[130px]">
        <div>
          <h4 className="mb-2 text-base font-semibold text-white line-clamp-1 drop-shadow-sm" title={product.name}>{cleanName}</h4>
          <div className="flex flex-wrap gap-1.5 text-xs text-white/70">
            {product.ratio && <span className="rounded-sm bg-white/10 px-1.5 py-0.5 border border-white/5">{product.ratio}</span>}
            {product.cannabinoids?.total_extract_mg && <span className="rounded-sm bg-white/10 px-1.5 py-0.5 border border-white/5">{product.cannabinoids.total_extract_mg}mg</span>}
          </div>
        </div>
        <div className="flex items-center justify-between mt-auto">
          <span className="text-base font-semibold text-resin drop-shadow-sm">{formatINR(product.price_inr)}</span>
          <span className="flex items-center text-xs text-white/40 group-hover:text-resin/80 transition-colors font-medium">View details →</span>
        </div>
      </CardContent>
    </Card>
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
    <div className="mt-2 animate-fade-in-up w-full">
      <div className="flex w-full items-start gap-3">
        {/* Invisible spacer to align with avatar chat bubbles */}
        <div className="w-8 shrink-0" />
        <div className="w-full max-w-full">
           <MobileRolodex matches={matches} onPay={onPay} />
        </div>
      </div>
    </div>
  );
}
function parseMarkdown(text: string) {
  return text.split('\n').map((line, i) => {
    if (line.startsWith('## ')) {
      return <h4 key={i} className="text-leaf font-semibold mt-4 mb-2 tracking-wide uppercase text-[11px]">{line.replace('## ', '')}</h4>;
    }
    if (line.startsWith('- ')) {
      const bulletText = line.replace('- ', '');
      const boldParsed = bulletText.split(/(\*\*.*?\*\*)/g).map((part, j) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return <strong key={j} className="text-white font-medium">{part.slice(2, -2)}</strong>;
        }
        return part;
      });
      return <li key={i} className="ml-4 list-disc marker:text-leaf/50 mb-1 leading-relaxed">{boldParsed}</li>;
    }
    if (line.trim() === '') {
      return <div key={i} className="h-2" />;
    }
    const pBoldParsed = line.split(/(\*\*.*?\*\*)/g).map((part, j) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={j} className="text-white font-medium">{part.slice(2, -2)}</strong>;
      }
      return part;
    });
    return <p key={i} className="mb-2 leading-relaxed">{pBoldParsed}</p>;
  });
}

function ProductCard({
  match,
  rank,
  onPay,
  onClose,
}: {
  match: ProductMatch;
  rank: number;
  onPay: (product: CannabisProduct, brand: Brand) => void;
  onClose?: () => void;
}) {
  const [tab, setTab] = useState<"overview" | "medical" | "safety">("overview");
  const [sensoExpanded, setSensoExpanded] = useState(false);
  const { product, brand, reasons, warnings } = match;
  const perGummy = Math.round(product.price_inr / product.pack_count);

  return (
    <Card className={`mb-3 overflow-hidden border ${rank === 0 ? "border-resin/40 glow-resin" : "border-white/10"} bg-black/40 backdrop-blur-xl relative transition-all`}>
      {rank === 0 && (
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-resin to-resin-light/50"></div>
      )}
      <CardContent className="p-0">
        <div 
          className={`h-56 sm:h-72 w-full bg-gradient-to-b from-resin/10 to-black/80 flex flex-col justify-end p-4 relative overflow-hidden ${onClose ? 'cursor-pointer hover:from-resin/20 transition-all' : ''}`}
          onClick={onClose}
        >
           {/* Product Image */}
           <div className="absolute inset-0 flex items-center justify-center">
              <img 
                src={`/products/${brand.id}/${product.name.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.jpg`}
                alt={product.name}
                className="h-full w-full object-cover opacity-60 mix-blend-screen transition-opacity duration-500"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                  e.currentTarget.parentElement?.classList.add('opacity-10');
                  const Icon = require('lucide-react').Leaf;
                  // If image fails, fallback to Leaf icon
                  e.currentTarget.parentElement!.innerHTML = '<svg class="w-24 h-24 text-resin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"/><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/></svg>';
                }}
              />
           </div>
           
           <div className="relative z-10 flex items-end justify-between">
             <div className="pr-2">
               <div className="flex items-center gap-2">
                 {onClose && <span className="text-white/50 mb-1">←</span>}
                 <p className="font-display text-lg font-semibold text-white drop-shadow-md leading-tight">{product.name}</p>
               </div>
               <p className="text-[10px] font-medium text-white/70 uppercase tracking-widest mt-1">{brand.name}</p>
             </div>
             <div className="text-right shrink-0">
               <p className="font-display text-xl font-semibold text-resin drop-shadow-md">{formatINR(product.price_inr)}</p>
               <p className="text-[10px] text-white/50">{formatINR(perGummy)}/gummy</p>
             </div>
           </div>
        </div>

        <div className="px-4 py-4 flex justify-center w-full border-b border-white/5 bg-black/20">
           <Button 
             className="w-fit bg-resin/10 border border-resin/40 text-resin hover:bg-resin/20 backdrop-blur-md shadow-[0_4px_20px_rgba(202,255,10,0.1)] hover:shadow-[0_0_25px_rgba(202,255,10,0.3)] transition-all active:scale-95 px-5 py-5 rounded-2xl sm:rounded-full" 
             size="sm" 
             onClick={() => onPay(product, brand)}
           >
            <Zap className="h-4 w-4 mr-2 opacity-80 fill-current" />
            <span className="font-medium tracking-wide">
              Order — {formatINR(product.price_inr)}
              {brand.prescription_required && <span className="ml-1.5 opacity-70 text-[11px] font-normal tracking-normal">(Doc Consult Included)</span>}
            </span>
          </Button>
        </div>

        <div className="flex border-b border-white/10">
          {(["overview", "medical", "safety"] as const).map(t => (
            <button 
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-2.5 text-[11px] font-medium uppercase tracking-wider transition-colors ${tab === t ? "text-resin border-b border-resin" : "text-white/50 hover:text-white/80"}`}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="p-4 h-[180px] sm:h-[260px] overflow-y-auto scrollbar-hide text-white/80 text-xs">
          {tab === "overview" && (
            <div className="space-y-3 animate-fade-in-up">
              <div className="flex flex-wrap gap-2">
                {reasons.map((r, i) => (
                  <Badge key={i} variant={rank === 0 ? "resin" : "outline"} className={rank !== 0 ? "border-white/20 text-white/80" : ""}>{r}</Badge>
                ))}
              </div>
              {product.key_uses && (
                <p className="text-white/90 leading-relaxed"><strong>Best for:</strong> {product.key_uses}</p>
              )}
              {match.sensoContext && (
                <div className="pt-3 border-t border-white/10 mt-2">
                  <button 
                    onClick={() => setSensoExpanded(!sensoExpanded)}
                    className="flex w-full items-center justify-between mb-2 group"
                  >
                    <div className="flex items-center gap-2">
                      <Shield className="h-4 w-4 text-leaf" />
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-leaf group-hover:text-leaf-light transition-colors">Senso Trust Analysis</span>
                    </div>
                    {sensoExpanded ? <ChevronUp className="h-4 w-4 text-white/40 group-hover:text-white/70" /> : <ChevronDown className="h-4 w-4 text-white/40 group-hover:text-white/70" />}
                  </button>
                  
                  {sensoExpanded && (
                    <div className="text-white/70 text-xs mt-2 bg-leaf/5 border border-leaf/10 p-3 pb-4 rounded-xl animate-fade-in-up">
                      {parseMarkdown(match.sensoContext)}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {tab === "medical" && (
            <div className="space-y-4 animate-fade-in-up">
              <div className="grid grid-cols-2 gap-3">
                {product.cannabinoids.total_extract_mg && (
                  <div className="flex items-center gap-1.5"><Beaker className="h-4 w-4 text-resin" /> {product.cannabinoids.total_extract_mg}mg/gummy</div>
                )}
                {product.ratio && (
                  <div className="flex items-center gap-1.5"><FlaskConical className="h-4 w-4 text-resin" /> {product.ratio}</div>
                )}
                {product.onset_minutes && (
                  <div className="flex items-center gap-1.5"><Clock className="h-4 w-4 text-resin" /> ~{product.onset_minutes}m onset</div>
                )}
                {product.duration_hours && (
                  <div className="flex items-center gap-1.5"><Clock className="h-4 w-4 text-resin" /> {product.duration_hours}h duration</div>
                )}
              </div>
              {product.composition && Object.keys(product.composition).length > 0 && (
                <div className="pt-3 border-t border-white/10">
                  <p className="mb-2 text-[10px] uppercase tracking-wider text-white/50">Composition</p>
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(product.composition).map(([k, v]) => (
                      <span key={k} className="rounded-md bg-white/10 px-2 py-1 leading-none">{k} <span className="text-white/50">{v}</span></span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === "safety" && (
            <div className="space-y-2.5 animate-fade-in-up">
              {warnings && warnings.length > 0 ? warnings.map((w, i) => (
                <p key={i} className="flex items-start gap-2 text-ember/90">
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  {w}
                </p>
              )) : (
                <p className="text-white/50">Standard cannabis precautions apply.</p>
              )}
              {brand.verified && (
                <div className="mt-4 flex items-center gap-2 rounded-lg bg-leaf/10 p-2 text-leaf border border-leaf/20">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  <span>Verified AYUSH license & lab tested.</span>
                </div>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function BrandReport({
  brand,
  products,
  research,
  onPay,
  isLatestDashboard = true,
}: {
  brand: Brand;
  products: CannabisProduct[];
  research: { verdict: string; findings: { summary: string; red_flags?: string[]; license?: string }; sources: string[] };
  onPay: (product: CannabisProduct, brand: Brand) => void;
  isLatestDashboard?: boolean;
}) {
  const [expanded, setExpanded] = useState(isLatestDashboard);
  const [mobileDetailsOpen, setMobileDetailsOpen] = useState(false);
  const hasRedFlags = research.findings.red_flags && research.findings.red_flags.length > 0;
  
  useEffect(() => {
    setExpanded(isLatestDashboard);
  }, [isLatestDashboard]);

  const verdictColor = research.verdict === "verified" ? "leaf" : research.verdict === "caution" ? "gold" : "ember";
  
  return (
    <div className="flex flex-col items-start gap-3 animate-fade-in-up w-full">
      <div className="flex items-start gap-3 w-full">
        <Avatar />
        <div className="w-full max-w-[88%]">
          <Card className="bg-noir-card transition-all">
            <div 
              className="flex items-center justify-between bg-noir-raised px-5 py-3 cursor-pointer select-none hover:bg-noir-raised/80 transition-colors"
              onClick={() => setExpanded(!expanded)}
            >
              <div className="flex items-center gap-2">
                <span className="font-display text-lg font-semibold text-ink">{brand.name}</span>
                {!expanded && <span className="text-xs text-ink-muted">(Tap to expand)</span>}
              </div>
              <Badge variant={verdictColor}>{research.verdict}</Badge>
            </div>
            
            {expanded && (
              <CardContent className="pt-4 animate-fade-in-up">
                {/* MOBILE TL;DR HEADER */}
                <div className="block sm:hidden mb-4">
                  <button 
                    onClick={() => setMobileDetailsOpen(!mobileDetailsOpen)}
                    className="flex w-full items-center justify-between rounded-lg bg-noir-soft px-3 py-2 text-xs font-medium text-ink-muted border border-border"
                  >
                    <span className="flex items-center gap-2">
                      {hasRedFlags 
                        ? <><AlertCircle className="h-4 w-4 text-ember"/> <span className="text-ember font-semibold">{research.findings.red_flags!.length} Red Flags</span></>
                        : <><Shield className="h-4 w-4 text-ink-soft"/> <span className="text-ink-soft font-semibold">Brand Details & License</span></>
                      }
                    </span>
                    {mobileDetailsOpen ? <ChevronUp className="h-4 w-4"/> : <ChevronDown className="h-4 w-4"/>}
                  </button>
                </div>

                {/* TEXT CONTENT (Hidden on mobile if not open) */}
                <div className={mobileDetailsOpen ? "block mb-4" : "hidden sm:block sm:mb-4"}>
                  {/* RED FLAGS FIRST */}
                  {hasRedFlags && (
                    <div className="mb-4 rounded-lg border border-ember/20 bg-ember/5 p-3">
                      <p className="mb-1.5 text-xs font-semibold text-ember uppercase tracking-wider flex items-center gap-1.5"><AlertCircle className="w-3.5 h-3.5" /> Red flags</p>
                      <ul className="space-y-1 text-xs text-ink-muted ml-1">
                        {research.findings.red_flags!.map((r, i) => (<li key={i}>• {r}</li>))}
                      </ul>
                    </div>
                  )}

                  {/* AYUSH LICENSE SECOND */}
                  {research.findings.license && (
                    <div className="mb-4 flex items-center gap-2 rounded-lg border border-leaf/20 bg-leaf/5 px-3 py-2 text-xs">
                      <Shield className="h-4 w-4 shrink-0 text-leaf-light" />
                      <span className="text-leaf-light font-medium">{research.findings.license}</span>
                    </div>
                  )}

                  {/* BRAND SUMMARY THIRD */}
                  {brand.tagline && <p className="mb-2 text-sm italic text-ink-soft">{brand.tagline}</p>}
                  <p className="text-sm text-ink">{research.findings.summary}</p>
                  
                  {/* INSTAGRAM FOURTH */}
                  {brand.instagram_followers && brand.instagram_followers > 0 && (
                    <p className="mt-3 text-xs text-ink-muted">
                      <a 
                        href={`https://instagram.com/${brand.instagram_handle?.replace('@', '')}`} 
                        target="_blank" 
                        rel="noreferrer" 
                        className="hover:text-resin transition-colors underline underline-offset-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {brand.instagram_handle}
                      </a> · {formatFollowers(brand.instagram_followers)}
                    </p>
                  )}
                </div>

                {/* DESKTOP PRODUCTS (Hidden on mobile) */}
                {products.length > 0 && (
                  <div className="hidden sm:block border-t border-white/10 pt-4">
                    <p className="mb-3 text-xs uppercase tracking-wider text-white/50">{products.length} product{products.length > 1 ? "s" : ""} from {brand.name}</p>
                    <div className="flex w-full overflow-x-auto pb-4 scrollbar-hide space-x-3">
                      {products.map((p, i) => (
                        <div key={i} className="min-w-[280px]">
                          <MenuProductCard match={{ product: p, brand, score: 1, reasons: [], warnings: [] }} onPay={onPay} />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            )}
          </Card>
        </div>
      </div>

      {/* MOBILE ROLODEX PRODUCTS (Outside the text bubble, hidden on desktop) */}
      {expanded && products.length > 0 && (
        <div className="block sm:hidden w-full pl-11 pr-4 mt-1">
          <MobileRolodex 
            matches={products.map(p => ({ product: p, brand, score: 1, reasons: [], warnings: [] }))} 
            onPay={onPay} 
          />
        </div>
      )}
    </div>
  );
}

function MobileRolodex({ matches, onPay }: { matches: ProductMatch[], onPay: any }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  const nextCard = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setExpandedIndex(null);
    setActiveIndex((prev) => (prev + 1) % matches.length);
  };
  
  const prevCard = () => {
    setExpandedIndex(null);
    setActiveIndex((prev) => (prev - 1 + matches.length) % matches.length);
  };

  const handlers = useSwipeable({
    onSwipedLeft: () => nextCard(),
    onSwipedRight: () => prevCard(),
    preventScrollOnSwipe: true,
    trackMouse: true
  });

  // If a card is expanded, the container needs to be taller.
  const containerHeight = expandedIndex !== null ? "h-[540px]" : "h-[320px]";

  return (
    <div className="w-full">
      <div className="flex justify-between items-end mb-3">
        <p className="text-xs uppercase tracking-wider text-white/50">{matches.length} product{matches.length > 1 ? "s" : ""}</p>
        {matches.length > 1 && (
          <button onClick={nextCard} className="text-[10px] text-resin font-medium bg-resin/10 px-2 py-0.5 rounded border border-resin/30 uppercase tracking-widest">
            Next {matches.length - 1} ➔
          </button>
        )}
      </div>
      <div {...handlers} className={`relative w-full transition-all duration-300 ${containerHeight}`}>
        {matches.map((m, i) => {
          let diff = i - activeIndex;
          if (diff < 0) diff += matches.length;

          if (diff > 2 && matches.length > 3) return null;

          const isTop = diff === 0;
          
          return (
            <div 
              key={i}
              onClick={isTop ? undefined : nextCard}
              className="absolute top-0 left-0 w-full transition-all duration-400 ease-[cubic-bezier(0.25,0.8,0.25,1)] origin-left"
              style={{
                 // Fan horizontally to the right: translate X
                 transform: `translateX(${diff * 20}px) scale(${1 - diff * 0.05})`,
                 zIndex: 50 - diff,
                 opacity: diff > 2 ? 0 : 1,
                 pointerEvents: isTop ? 'auto' : 'none'
              }}
            >
              <div className="shadow-[20px_0_30px_-10px_rgba(0,0,0,0.6)] rounded-xl">
                <MenuProductCard 
                  match={m} 
                  onPay={onPay} 
                  isExpanded={expandedIndex === i}
                  onToggleExpand={(exp) => setExpandedIndex(exp ? i : null)}
                  className="w-[90%]" 
                  expandedClassName="w-[100%]"
                />
              </div>
            </div>
          );
        })}
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
