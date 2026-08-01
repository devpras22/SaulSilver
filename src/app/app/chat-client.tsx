"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Send,
  Upload,
  MapPin,
  Loader2,
  CheckCircle2,
  Shield,
  Clock,
  IndianRupee,
  Sparkles,
  ArrowRight,
  Stethoscope,
  Package,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import type {
  ChatMessage,
  MedicineItem,
  PharmacyQuote,
  Priority,
  Recommendation,
} from "@/lib/types";
import { PRIORITIES } from "@/lib/types";
import { formatINR } from "@/lib/utils";
import { AgentDashboard } from "@/components/agent-dashboard";
import {
  LocationVerifiedCard,
  type GeoData,
} from "@/components/location-verified";
import type { CallTranscript } from "@/lib/call-simulator";
import { usePaymentMode } from "@/lib/payment-mode";

type Stage =
  | "intake"
  | "understanding"
  | "awaiting_address"
  | "awaiting_address_choice"
  | "recommending_priority"
  | "discovering"
  | "recommending"
  | "paying"
  | "completed";

export default function AppChat({ savedAddress }: { savedAddress: string | null }) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      kind: "text",
      content:
        "I'm Kusushi. Tell me what you need, or upload a prescription — I'll find it, price it, and bring it to you.",
      timestamp: new Date().toISOString(),
    },
  ]);
  const [input, setInput] = useState("");
  const [stage, setStage] = useState<Stage>("intake");
  const [items, setItems] = useState<MedicineItem[]>([]);
  const [address, setAddress] = useState("");
  const [priority, setPriority] = useState<Priority>("cheapest");
  const [recommendation, setRecommendation] = useState<Recommendation | null>(null);
  const [geoData, setGeoData] = useState<GeoData | null>(null);
  const [lastCalls, setLastCalls] = useState<CallTranscript[]>([]);
  const [busy, setBusy] = useState(false);
  // Demo/Live + guest lock now live in a shared context (PaymentModeProvider
  // in the layout) so the header WalletButton and this page stay in sync.
  const { demoMode } = usePaymentMode();
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const searchParams = useSearchParams();

  // ── Persist conversation to localStorage so refresh doesn't nuke it ──
  // Bump the version suffix whenever the message schema changes to invalidate
  // stale saved sessions that were written by an older code version.
  const STORAGE_KEY = "kusushi:session:v2";

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  // ── Restore / start-new / load-historical on mount ──
  useEffect(() => {
    const isNew = searchParams.get("new") === "1";
    const loadChatId = searchParams.get("chat");

    // ── Archive any pending session to Supabase before resetting ──
    // Reads the stashed session, including activeChatId, so it UPDATES the
    // existing row instead of inserting a duplicate.
    const archivePending = async () => {
      try {
        const pending = localStorage.getItem("kusushi:session:pending-archive");
        if (!pending) return;
        localStorage.removeItem("kusushi:session:pending-archive");
        const s = JSON.parse(pending) as {
          messages?: ChatMessage[];
          items?: MedicineItem[];
          address?: string;
          priority?: Priority;
          stage?: Stage;
          geoData?: GeoData | null;
          activeChatId?: string | null;
        };
        if (!s.messages?.length || s.messages.length <= 1) return;
        await fetch("/api/chats/save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: s.activeChatId ?? undefined,
            messages: s.messages,
            items: s.items,
            address: s.address,
            geo: s.geoData,
            priority: s.priority,
            stage: s.stage,
          }),
        }).catch(() => {});
      } catch {
        // ignore
      }
    };

    // ── Load a historical chat by id ──
    const loadHistorical = async (id: string) => {
      try {
        const res = await fetch(`/api/chats/${id}`, { method: "GET" });
        if (!res.ok) return;
        const s = (await res.json()) as {
          messages: ChatMessage[];
          items?: MedicineItem[];
          address?: string;
          priority?: Priority;
          stage?: Stage;
          geo?: { formatted: string; lat: number; lng: number };
        };
        if (s.messages?.length) {
          setMessages(s.messages);
          setItems(s.items ?? []);
          setAddress(s.address ?? "");
          setPriority(s.priority ?? "cheapest");
          setStage((s.stage as Stage) ?? "intake");
          setGeoData((s.geo as GeoData) ?? null);
          setActiveChatId(id);
          localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
        }
      } catch {
        // ignore — fall through to normal restore
      }
    };

    // ── Restore from localStorage (the existing path) ──
    const restoreLocal = () => {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (!saved) return;
        const s = JSON.parse(saved) as {
          messages: ChatMessage[];
          items: MedicineItem[];
          address: string;
          priority: Priority;
          stage: Stage;
          geoData: GeoData | null;
          activeChatId?: string | null;
        };
        if (s.messages?.length) {
          const hasPriorityPicker = s.messages.some((m: ChatMessage) => m.kind === "priority");
          const healedMessages =
            s.stage === "recommending_priority" && !hasPriorityPicker
              ? [
                  ...s.messages.filter((m: ChatMessage) => m.kind !== "text" || !m.content.includes("What matters most")),
                  {
                    id: `msg_priority_${Date.now().toString(36)}`,
                    role: "assistant" as const,
                    content: "",
                    kind: "priority" as const,
                    data: { active: true },
                    timestamp: new Date().toISOString(),
                  },
                ]
              : s.messages;
          setMessages(healedMessages);
          setItems(s.items ?? []);
          setAddress(s.address ?? "");
          setPriority(s.priority ?? "cheapest");
          setStage(s.stage ?? "intake");
          setGeoData(s.geoData ?? null);
          setActiveChatId(s.activeChatId ?? null);
        }
      } catch {
        // corrupt JSON — ignore, start fresh
      }
    };

    if (isNew) {
      // Start a brand-new chat: archive the old one, clear local, reset state.
      // We MUST reset React state here (not just localStorage) because when the
      // user is already on /app, changing the query to ?new=1 re-runs this effect
      // without remounting — so the live conversation state is still in memory.
      archivePending();
      localStorage.removeItem(STORAGE_KEY);
      setMessages([
        {
          id: "welcome",
          role: "assistant",
          kind: "text",
          content: "I'm Kusushi. Tell me what you need, or upload a prescription — I'll find it, price it, and bring it to you.",
          timestamp: new Date().toISOString(),
        },
      ]);
      setItems([]);
      setAddress("");
      setPriority("cheapest");
      setStage("intake");
      setGeoData(null);
      setRecommendation(null);
      setActiveChatId(null);
      return;
    }

    if (loadChatId) {
      loadHistorical(loadChatId);
      return;
    }

    restoreLocal();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // ── Autosave to localStorage whenever any session slice changes ──
  // Includes activeChatId so the archive path can UPDATE the existing Supabase
  // row instead of inserting a duplicate.
  useEffect(() => {
    // Don't persist the initial welcome-only state — that's the empty case
    if (messages.length <= 1 && stage === "intake") return;
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ messages, items, address, priority, stage, geoData, activeChatId })
      );
    } catch {
      // quota exceeded — ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, items, address, priority, stage, geoData, activeChatId]);

  // ── Debounced save to Supabase (chats history) ──
  // Fires 1.5s after the last change so rapid typing/stage transitions don't
  // spam the API. Skips the welcome-only state. Captures activeChatId on first
  // save so subsequent saves update the same row.
  useEffect(() => {
    if (messages.length <= 1 && stage === "intake") return;
    const t = setTimeout(() => {
      fetch("/api/chats/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: activeChatId,
          messages,
          items,
          address,
          geo: geoData,
          priority,
          stage,
        }),
      })
        .then((r) => r.json())
        .then((data: { id?: string }) => {
          if (data.id && data.id !== activeChatId) setActiveChatId(data.id);
        })
        .catch(() => {});
    }, 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, items, address, priority, stage, geoData, activeChatId]);

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

  // ── Stage: handle user input ──
  const handleSend = async () => {
    if (!input.trim() || busy) return;
    const userText = input.trim();
    setInput("");
    // Reset textarea height after sending
    const ta = document.querySelector("textarea");
    if (ta) ta.style.height = "auto";
    setMessages((m) => [
      ...m,
      {
        id: `user_${Date.now().toString(36)}`,
        role: "user",
        content: userText,
        kind: "text",
        timestamp: new Date().toISOString(),
      },
    ]);

    if (stage === "intake") {
      await runExtraction(userText);
    } else if (stage === "awaiting_address") {
      setAddress(userText);
      await verifyLocation(userText);
    } else if (stage === "recommending_priority") {
      // Input is disabled here, but if they hit Enter on an empty-ish input,
      // nudge them toward the picker instead of dead-ending.
      pushAssistant("Pick a priority above and tap “Find pharmacies” — or change it anytime.");
    } else if (stage === "recommending") {
      const lower = userText.toLowerCase();
      if (lower.includes("go ahead") || lower.includes("yes") || lower.includes("approve")) {
        if (recommendation?.bestQuote) {
          runPayment(recommendation.bestQuote);
        }
      } else {
        pushAssistant("Reply 'go ahead' to place the order, or tell me if you want something else.");
      }
    } else {
      pushAssistant("Just a moment — I'm working on your request.");
    }
  };

  // ── Geocode the address immediately and show proof (map + canonical address) ──
  const verifyLocation = async (rawAddress: string) => {
    setBusy(true);
    pushAssistant("Verifying your address on the map…", "thinking");
    try {
      const res = await fetch("/api/geocode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: rawAddress }),
      });
      const geo = (await res.json()) as GeoData;
      if ((geo as { error?: string }).error) throw new Error((geo as { error?: string }).error);

      setMessages((m) => m.filter((msg) => msg.kind !== "thinking"));
      setGeoData(geo);
      // Show the proof: real map + canonical address Google resolved
      pushAssistant("", "geo", geo);
      // Interactive priority picker renders inline in the chat stream
      pushAssistant("", "priority", { active: true });
      setStage("recommending_priority");
    } catch (e) {
      setMessages((m) => m.filter((msg) => msg.kind !== "thinking"));
      pushAssistant(
        `I couldn't pin down “${rawAddress}” on the map: ${e instanceof Error ? e.message : "unknown error"}. Could you rephrase the address?`,
        "text"
      );
    } finally {
      setBusy(false);
    }
  };

  // ── Address choice handlers (one-time delivery vs update saved address) ──
  const useOneTimeAddress = async (mentioned: string) => {
    pushAssistant(`Got it — one-time delivery to ${mentioned}.`, "text");
    setAddress(mentioned);
    await verifyLocation(mentioned);
  };

  const updateSavedAddress = async (mentioned: string) => {
    setBusy(true);
    pushAssistant(`Updating your saved address to ${mentioned}…`, "status");
    try {
      // Verify on map first — same geocode step the editor uses.
      const res = await fetch("/api/geocode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: mentioned }),
      });
      const geo = (await res.json()) as GeoData;
      if ((geo as { error?: string }).error) throw new Error((geo as { error?: string }).error);

      // Save the resolved canonical address to the profile.
      await fetch("/api/profile/address", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: geo.formatted }),
      });

      setMessages((m) => m.filter((msg) => msg.kind !== "status"));
      pushAssistant(`Saved. Your delivery address is now ${geo.formatted}.`, "text");
      setAddress(geo.formatted);
      setGeoData(geo);
      pushAssistant("", "geo", geo);
      pushAssistant("", "priority", { active: true });
      setStage("recommending_priority");
    } catch (e) {
      setMessages((m) => m.filter((msg) => msg.kind !== "status"));
      pushAssistant(
        `Couldn't verify that address: ${e instanceof Error ? e.message : "unknown error"}. Try again?`,
        "text"
      );
      setStage("awaiting_address");
    } finally {
      setBusy(false);
    }
  };

  // ── Extraction ──
  const runExtraction = async (message: string) => {
    setBusy(true);
    setStage("understanding");
    pushAssistant("Let me understand what you need…", "thinking");
    try {
      const res = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      // Remove the thinking message
      setMessages((m) => m.filter((msg) => msg.kind !== "thinking"));

      // Conversation reply (not a medicine request) — answer but stay in intake
      if (data.conversation || !data.items?.length) {
        pushAssistant(data.reply, "text");
        setStage("intake");
      } else {
        setItems(data.items);
        pushAssistant(data.reply, "text", { items: data.items });

        const mentioned = data.mentionedAddress as string | null;

        if (mentioned && savedAddress) {
          // User specified an address, but we already have one on file.
          // Ask: is this a one-time delivery, or should we update the saved address?
          setStage("awaiting_address_choice");
          pushAssistant(
            `I have **${savedAddress}** saved as your delivery address. Is **${mentioned}** a one-time delivery, or should I update your saved address?`,
            "address_choice",
            { mentionedAddress: mentioned, savedAddress }
          );
        } else if (savedAddress) {
          // No address mentioned — silently use the saved one and proceed.
          pushAssistant(`Sending it to your saved address: ${savedAddress}.`, "text");
          setAddress(savedAddress);
          await verifyLocation(savedAddress);
        } else {
          // No saved address at all — ask for one.
          setStage("awaiting_address");
        }
      }
    } catch (e) {
      setMessages((m) => m.filter((msg) => msg.kind !== "thinking"));
      pushAssistant(
        `I had trouble parsing that: ${e instanceof Error ? e.message : "unknown error"}. Could you rephrase?`,
        "text"
      );
      setStage("intake");
    } finally {
      setBusy(false);
    }
  };

  // ── OCR upload ──
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    pushAssistant("Reading your prescription…", "thinking");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/ocr", { method: "POST", body: fd });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      setItems(data.items);
      setMessages((m) => m.filter((msg) => msg.kind !== "thinking"));
      const list = data.items
        .map((i: MedicineItem) => `• ${i.name}${i.dosage ? ` ${i.dosage}` : ""} × ${i.quantity}`)
        .join("\n");

      if (savedAddress) {
        // Prescription upload — no address mentioned. Use the saved one silently.
        pushAssistant(
          `I've read your prescription and found ${data.items.length} item${data.items.length > 1 ? "s" : ""}:\n\n${list}\n\nSending it to your saved address: ${savedAddress}.`,
          "text",
          { items: data.items }
        );
        setAddress(savedAddress);
        await verifyLocation(savedAddress);
      } else {
        pushAssistant(
          `I've read your prescription and found ${data.items.length} item${data.items.length > 1 ? "s" : ""}:\n\n${list}\n\nWhat's the delivery address?`,
          "text",
          { items: data.items }
        );
        setStage("awaiting_address");
      }
    } catch (e) {
      setMessages((m) => m.filter((msg) => msg.kind !== "thinking"));
      pushAssistant(`Couldn't read the prescription: ${e instanceof Error ? e.message : "unknown error"}. Try typing instead?`, "text");
    } finally {
      setBusy(false);
    }
  };

  // ── Discovery + recommendation ──
  const runDiscovery = async () => {
    if (!address) return;
    setBusy(true);
    setStage("discovering");

    pushAssistant("On it. Checking pharmacies near you…", "text");

    try {
      const res = await fetch("/api/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items, priority, address }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      setRecommendation({ ...data, bestQuote: data.best });
      setLastCalls(data.calls ?? []);
      setGeoData(data.geo ?? null);

      const best = data.best;
      if (!best) throw new Error("No pharmacies found nearby.");

      // Delay to simulate agent typing/working sequentially
      await new Promise((r) => setTimeout(r, 1500));

      // Push the recommendation as a proper card (renders the Approve & pay button),
      // not a plain text bubble. The RecommendationCard reads bestQuote +
      // alternatives + explanation from the Recommendation object.
      pushAssistant("", "recommendation", {
        bestQuote: best,
        alternatives: data.alternatives ?? [],
        chosenPriority: priority,
        explanation: data.explanation,
      });
      setStage("recommending");
    } catch (e) {
      pushAssistant(`Discovery failed: ${e instanceof Error ? e.message : "unknown error"}.`, "text");
      setStage("awaiting_address");
    } finally {
      setBusy(false);
    }
  };

  // ── Persist a completed order to Supabase (fire-and-forget; never block UX) ──
  const saveOrder = (
    quote: PharmacyQuote,
    extras: { pravaSessionId?: string; pravaTxnRef?: string; status: "completed" | "declined" | "failed" }
  ) => {
    fetch("/api/orders/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items,
        address,
        geo: geoData,
        priority,
        quote,
        recommendation: recommendation ?? undefined,
        calls: lastCalls,
        pravaSessionId: extras.pravaSessionId,
        pravaTxnRef: extras.pravaTxnRef,
        paymentMode: demoMode ? "demo" : "live",
        status: extras.status,
      }),
    }).catch((e) => console.error("[saveOrder]", e));
  };

  // ── Payment ──
  const runPayment = async (quote: PharmacyQuote) => {
    setBusy(true);
    setStage("paying");
    pushAssistant(
      `Creating a secure Prava payment session for ${formatINR(quote.total)} with ${quote.pharmacyName}…`,
      "status"
    );
    try {
      const res = await fetch("/api/pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items,
          total: quote.total,
          merchantName: quote.pharmacyName,
          merchantUrl: quote.merchantUrl ?? "https://kusushi.pras.fun",
          userEmail: "demo@kusushi.app",
          demo: demoMode,
        }),
      });
      const session = await res.json();
      if (session.error) throw new Error(session.error);

      const isMock = session.mock;

      if (isMock) {
        // ── Mock path: simulate the full lifecycle instantly ──
        let result = null;
        for (let i = 0; i < 10; i++) {
          await new Promise((r) => setTimeout(r, 500));
          const pollRes = await fetch("/api/pay/poll", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sessionId: session.sessionId }),
          });
          result = await pollRes.json();
          if (result.status === "awaiting_result") break;
        }
        await fetch("/api/pay/report", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: session.sessionId,
            txnRefId: result?.txnRefId,
            status: "APPROVED",
            amountPaid: quote.total.toFixed(2),
          }),
        });
        pushAssistant(
          `Order placed. Arriving in ${quote.deliveryEtaMinutes} minutes.`,
          "text",
          { quote, session }
        );
        saveOrder(quote, { pravaSessionId: session.sessionId, pravaTxnRef: result?.txnRefId, status: "completed" });
        setStage("completed");
      } else {
        // ── Real path: show the Prava iframe for card entry + passkey ──
        pushAssistant(
          `Session created. Please complete the secure checkout below — enter the test card and approve with your passkey. I'll wait.`,
          "payment",
          { iframeUrl: session.iframeUrl, sessionId: session.sessionId, quote }
        );
      }
    } catch (e) {
      pushAssistant(
        `Payment failed: ${e instanceof Error ? e.message : "unknown error"}. You can try again.`,
        "text"
      );
      setStage("recommending");
    } finally {
      setBusy(false);
    }
  };

  // ── Poll + complete after user interacts with the iframe ──
  // Critical: every exit path must close the loop in Prava so the session is
  // never left dangling as `pending`. report-status closes sessions that issued
  // a txn_ref_id; revoke closes sessions that never did (user abandoned the
  // passkey step, or the poll timed out before approval).
  const completeRealPayment = async (sessionId: string, quote: PharmacyQuote) => {
    setBusy(true);
    pushAssistant("Checking payment result…", "status");

    let result: { status?: string; txnRefId?: string; credentials?: { token?: string }; error?: { message?: string } } | null = null;
    let timedOut = false;

    try {
      for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, 1500));
        const pollRes = await fetch("/api/pay/poll", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId }),
        });
        result = await pollRes.json();
        if (result?.status === "awaiting_result" || result?.status === "failed") break;
      }

      if (!result || (result.status !== "awaiting_result" && result.status !== "failed")) {
        timedOut = true;
      }
    } catch (e) {
      // Network/poll failure — we still must close the session below.
      console.error("[completeRealPayment] poll failed", e);
      timedOut = true;
    }

    // ── Close the loop in Prava no matter what happened ──
    try {
      if (result?.status === "awaiting_result" && result.txnRefId) {
        // Card was issued → agent checks out → report the outcome.
        pushAssistant(
          `Passkey approved. Virtual card issued. I'm checking out at ${quote.pharmacyName} using the one-time Visa credential…`,
          "status"
        );
        await new Promise((r) => setTimeout(r, 2500));

        await fetch("/api/pay/report", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId,
            txnRefId: result.txnRefId,
            status: "DECLINED", // sandbox decline is expected (test card at real merchant)
            amountPaid: quote.total.toFixed(2),
          }),
        });

        pushAssistant(
          `Full Prava lifecycle completed: session created → passkey approved → virtual card issued (••••${result.credentials?.token?.slice(-4) ?? "••••"}) → checkout attempted at ${quote.pharmacyName}. The test card declined at the real merchant — expected in sandbox. Production keys would complete the purchase.`,
          "confirmation",
          { quote, session: { sessionId }, sandboxDecline: true }
        );
        saveOrder(quote, { pravaSessionId: sessionId, pravaTxnRef: result.txnRefId, status: "declined" });
        setStage("completed");
      } else if (result?.status === "failed" && result.txnRefId) {
        // Failed but a txn_ref_id exists → report DECLINED to close it.
        await fetch("/api/pay/report", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId, txnRefId: result.txnRefId, status: "DECLINED" }),
        });
        pushAssistant(
          `Payment failed at the passkey step${result.error?.message ? `: ${result.error.message}` : ""}. I've reported DECLINED to Prava so the session closes cleanly — it won't sit pending.`,
          "text"
        );
        setStage("recommending");
      } else {
        // No txn_ref_id yet (timed out / pending / no terminal state). The card
        // was never issued, so report-status isn't available. Revoke instead.
        await fetch("/api/pay/revoke", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId }),
        });
        pushAssistant(
          timedOut
            ? `The passkey approval timed out after 45s. I've revoked the Prava session so it closes cleanly — it won't sit pending. You can try again.`
            : `Payment couldn't complete. I've revoked the Prava session so it closes cleanly — it won't sit pending. You can try again.`,
          "text"
        );
        setStage("recommending");
      }
    } catch (e) {
      // If even the close-loop call fails, surface it loudly — never silently orphan.
      console.error("[completeRealPayment] close-loop failed", e);
      pushAssistant(
        `Payment failed AND I couldn't close the Prava session: ${e instanceof Error ? e.message : "unknown error"}. The session may remain pending on the Prava dashboard — please report it.`,
        "text"
      );
      setStage("recommending");
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    localStorage.removeItem(STORAGE_KEY);
    setActiveChatId(null);
    setMessages([
      {
        id: "welcome2",
        role: "assistant",
        kind: "text",
        content: "Ready for the next request. What do you need?",
        timestamp: new Date().toISOString(),
      },
    ]);
    setItems([]);
    setAddress("");
    setRecommendation(null);
    setGeoData(null);
    setLastCalls([]);
    setStage("intake");
  };

  return (
    <div className="flex h-[calc(100vh-57px)] flex-col overflow-hidden">
      {/* Compact priority indicator — only after priority is locked in (non-interactive) */}
      {(stage === "discovering" || stage === "recommending" || stage === "paying" || stage === "completed") && (
        <div className="flex shrink-0 items-center gap-2 px-1 pb-3 pt-1 animate-fade-in">
          <span className="text-xs text-ink-muted">Optimizing for</span>
          <span className="rounded-full border border-matcha/30 bg-matcha/5 px-2.5 py-0.5 text-xs font-medium text-matcha">
            {PRIORITIES.find((p) => p.value === priority)?.label}
          </span>
        </div>
      )}

      {/* Chat scroll area — scrolls independently, never hidden behind input/header */}
      <div ref={scrollRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
        {messages.map((m) => (
          <MessageBubble
            key={m.id}
            message={m}
            items={items}
            onPay={runPayment}
            onComplete={completeRealPayment}
            priority={priority}
            onPriorityChange={setPriority}
            onFindPharmacies={runDiscovery}
            onOneTimeAddress={useOneTimeAddress}
            onUpdateAddress={updateSavedAddress}
          />
        ))}
        {/* One-click demo prompts — shown only in the empty intake state */}
        {stage === "intake" && items.length === 0 && messages.length <= 1 && !busy && (
          <div className="flex flex-wrap gap-2 pt-1">
            {[
              "Metformin 500mg and a Vitamin D3 supplement, cheapest, to Andheri West",
              "Crocin 500mg and Cetiril 10mg, fastest delivery, to Indiranagar Bangalore",
              "I need Azithromycin 250mg, 1 strip",
            ].map((demoText) => (
              <button
                key={demoText}
                onClick={() => {
                  // Show the prompt as a user bubble, then extract — same as typing it.
                  setMessages((m) => [
                    ...m,
                    {
                      id: `msg_${Date.now()}`,
                      role: "user",
                      content: demoText,
                      timestamp: new Date().toISOString(),
                      kind: "text",
                    },
                  ]);
                  runExtraction(demoText);
                }}
                className="rounded-full border border-border bg-noir-card px-3.5 py-1.5 text-xs text-ink-soft shadow-sm transition-colors hover:border-matcha/40 hover:bg-matcha/5 hover:text-matcha"
              >
                {demoText}
              </button>
            ))}
          </div>
        )}
        {busy && <ThinkingIndicator />}
        {stage === "completed" && !busy && (
          <div className="flex justify-center pt-2">
            <Button variant="secondary" size="sm" onClick={reset}>
              <RefreshCw className="h-4 w-4" /> Start a new request
            </Button>
          </div>
        )}
        {/* Bottom spacer so last message never hides behind fixed input bar */}
        <div className="h-32 shrink-0" />
      </div>

      {/* Input bar — anchored to viewport bottom, never scrolls.
          Single unified input: upload button merged INSIDE the textarea frame
          (left), send button inside (right). No detached floating button. */}
      <div className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-cream/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md">
        <div className="mx-auto max-w-4xl px-3 py-3 sm:px-6 sm:py-4">
          {items.length > 0 && stage !== "intake" && (
            <div className="mb-2.5 flex flex-wrap gap-2">
              {items.map((item) => (
                <Badge key={item.id} variant="matcha">
                  <Package className="h-3 w-3" />
                  {item.name} {item.dosage} × {item.quantity}
                </Badge>
              ))}
            </div>
          )}
          <div className="flex items-end gap-2">
            {/* Unified input: textarea + upload (inside) + send (inside) */}
            <div className="flex flex-1 items-end gap-1 rounded-2xl border border-border bg-noir-card px-1.5 py-1 transition-colors focus-within:border-matcha">
              <label className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-xl text-ink-muted transition-colors hover:bg-cream-dark hover:text-matcha">
                <input type="file" accept="image/*" className="hidden" onChange={handleUpload} />
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
                placeholder={
                  stage === "intake"
                    ? "Type what you need…"
                    : stage === "awaiting_address"
                    ? "Enter delivery address…"
                    : "Message…"
                }
                // text-base (16px) — iOS Safari zooms on focus if < 16px.
                className="max-h-36 flex-1 resize-none bg-transparent px-1 py-2.5 text-base leading-snug outline-none placeholder:text-ink-muted/60"
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || busy}
                aria-label="Send"
                className="mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-matcha text-cream transition-colors hover:bg-matcha-dark disabled:opacity-40"
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

function Avatar() {
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-matcha/10 text-matcha">
      <Stethoscope className="h-4 w-4" />
    </div>
  );
}

/** Interactive priority picker — renders inline in the chat stream. */
function PriorityPicker({
  priority,
  onPriorityChange,
  onFindPharmacies,
}: {
  priority: Priority;
  onPriorityChange: (p: Priority) => void;
  onFindPharmacies: () => void;
}) {
  return (
    <div className="flex items-start gap-3 animate-fade-in-up">
      <Avatar />
      <div className="w-full max-w-[88%]">
        <p className="mb-2 text-sm text-ink-soft">
          What matters most for this order?
        </p>
        <div className="flex flex-wrap gap-2">
          {PRIORITIES.map((p) => (
            <button
              key={p.value}
              onClick={() => onPriorityChange(p.value)}
              className={`rounded-full border px-4 py-2 text-sm font-medium transition-all ${
                priority === p.value
                  ? "border-matcha bg-matcha text-cream"
                  : "border-border bg-noir-card text-ink-soft hover:border-matcha/40"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <Button size="sm" className="mt-3" onClick={onFindPharmacies}>
          <Sparkles className="h-4 w-4" /> Find pharmacies
        </Button>
      </div>
    </div>
  );
}

function MessageBubble({
  message,
  items,
  onPay,
  onComplete,
  priority,
  onPriorityChange,
  onFindPharmacies,
  onOneTimeAddress,
  onUpdateAddress,
}: {
  message: ChatMessage;
  items: MedicineItem[];
  onPay: (q: PharmacyQuote) => void;
  onComplete: (sessionId: string, quote: PharmacyQuote) => void;
  priority: Priority;
  onPriorityChange: (p: Priority) => void;
  onFindPharmacies: () => void;
  onOneTimeAddress: (mentioned: string) => void;
  onUpdateAddress: (mentioned: string) => void;
}) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end animate-fade-in-up">
        <div className="max-w-[80%] whitespace-pre-line rounded-2xl rounded-tr-sm bg-matcha px-4 py-2.5 text-sm text-cream">
          {message.content}
        </div>
      </div>
    );
  }

  // Special render for recommendation
  if (message.kind === "recommendation" && message.data) {
    const rec = message.data as Recommendation;
    return <RecommendationCard rec={rec} items={items} onPay={onPay} />;
  }

  // Dashboard — live agent activity feed
  if (message.kind === "dashboard" && message.data) {
    const dashData = message.data as import("@/components/agent-dashboard").DashboardData & {
      bestQuote?: PharmacyQuote & { call?: import("@/lib/call-simulator").CallTranscript; rating?: number };
    };
    return (
      <div className="flex items-start gap-3 animate-fade-in-up">
        <Avatar />
        <div className="w-full max-w-[88%]">
          <AgentDashboard
            data={dashData}
            bestQuote={dashData.bestQuote ?? null}
            onApprove={() => dashData.bestQuote && onPay(dashData.bestQuote)}
          />
        </div>
      </div>
    );
  }

  // Location proof — map + canonical address
  if (message.kind === "geo" && message.data) {
    return <LocationVerifiedCard geo={message.data as GeoData} />;
  }

  // Address choice — one-time delivery vs update saved address
  if (message.kind === "address_choice" && message.data) {
    const { mentionedAddress, savedAddress } = message.data as {
      mentionedAddress: string;
      savedAddress: string;
    };
    return (
      <div className="flex items-start gap-3 animate-fade-in-up">
        <Avatar />
        <div className="w-full max-w-[88%] rounded-2xl rounded-tl-sm border border-border bg-noir-card p-4 shadow-sm">
          <p className="text-sm text-ink">
            I have <span className="font-medium">{savedAddress}</span> saved as your delivery address.
            Is <span className="font-medium">{mentionedAddress}</span> a one-time delivery, or should I update your saved address?
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              onClick={() => onOneTimeAddress(mentionedAddress)}
              className="rounded-lg border border-border bg-noir-card px-3.5 py-2 text-xs font-medium text-ink-soft transition-colors hover:bg-cream-dark"
            >
              One-time delivery
            </button>
            <button
              onClick={() => onUpdateAddress(mentionedAddress)}
              className="rounded-lg bg-matcha px-3.5 py-2 text-xs font-medium text-cream transition-colors hover:bg-matcha-dark"
            >
              Update saved address
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Inline priority picker — renders in the chat stream where the user is looking
  if (message.kind === "priority") {
    return (
      <PriorityPicker
        priority={priority}
        onPriorityChange={onPriorityChange}
        onFindPharmacies={onFindPharmacies}
      />
    );
  }

  // Confirmation
  if (message.kind === "confirmation") {
    const data = message.data as { quote: PharmacyQuote; sandboxDecline?: boolean };
    return <ConfirmationCard quote={data.quote} sandboxDecline={data.sandboxDecline} />;
  }

  // Payment — Prava iframe for real checkout
  if (message.kind === "payment") {
    const data = message.data as { iframeUrl: string; sessionId: string; quote: PharmacyQuote };
    return (
      <PaymentCard
        iframeUrl={data.iframeUrl}
        sessionId={data.sessionId}
        quote={data.quote}
        onComplete={(sid, q) => onComplete(sid, q)}
      />
    );
  }

  return (
    <div className="flex items-start gap-3 animate-fade-in-up">
      <Avatar />
      <div className="max-w-[80%] whitespace-pre-line rounded-2xl rounded-tl-sm bg-noir-card px-4 py-2.5 text-sm text-ink shadow-sm">
        {message.kind === "status" && <Shield className="mb-1 h-4 w-4 text-matcha" />}
        {message.content}
      </div>
    </div>
  );
}

function RecommendationCard({
  rec,
  items,
  onPay,
}: {
  rec: Recommendation;
  items: MedicineItem[];
  onPay: (q: PharmacyQuote) => void;
}) {
  // The recommended best is shown in the top card slot. Alternatives are the
  // OTHER quotes — best is NOT duplicated in the list below.
  const [selectedId, setSelectedId] = useState(rec.bestQuote.pharmacyId);
  const selected = [rec.bestQuote, ...rec.alternatives].find(
    (q) => q.pharmacyId === selectedId
  ) ?? rec.bestQuote;

  const itemName = (itemId: string): string => {
    const match = items.find((i) => i.id === itemId);
    if (match) return `${match.name}${match.dosage ? ` ${match.dosage}` : ""}`;
    return "Item";
  };

  // Find which items are out of stock on the selected pharmacy.
  const outOfStock = selected.items.filter((it) => !it.inStock);

  return (
    <div className="flex items-start gap-3 animate-fade-in-up">
      <Avatar />
      <div className="w-full max-w-[85%] space-y-3">
        <p className="text-sm text-ink-soft">{rec.explanation}</p>
        <Card className="overflow-hidden border-matcha/30 shadow-md">
          <div className="bg-matcha/5 px-5 py-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wide text-matcha">
                {selected.pharmacyId === rec.bestQuote.pharmacyId ? "Recommended" : "Selected"}
              </span>
              <Badge variant="matcha">
                {selected.pharmacyId === rec.bestQuote.pharmacyId ? "Best match" : "Your pick"}
              </Badge>
            </div>
          </div>
          <CardContent className="pt-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-display text-xl font-semibold">{selected.pharmacyName}</p>
                <p className="text-sm text-ink-muted">
                  <MapPin className="mr-1 inline h-3 w-3" />
                  {selected.pharmacyArea} · {selected.distanceKm.toFixed(1)} km away
                </p>
              </div>
              <p className="font-display text-2xl font-semibold text-matcha">
                {formatINR(selected.total)}
              </p>
            </div>

            <div className="mt-4 flex flex-wrap gap-4 text-sm">
              <span className="flex items-center gap-1.5 text-ink-soft">
                <Clock className="h-4 w-4 text-matcha" />
                {selected.deliveryEtaMinutes} min delivery
              </span>
              <span className="flex items-center gap-1.5 text-ink-soft">
                <CheckCircle2 className={`h-4 w-4 ${selected.allInStock ? "text-matcha" : "text-vermillion"}`} />
                {selected.allInStock ? "All items in stock" : `${outOfStock.length} item(s) out of stock`}
              </span>
              <span className="flex items-center gap-1.5 text-ink-soft">
                <Shield className="h-4 w-4 text-matcha" />
                {Math.round(selected.confidenceScore * 100)}% confidence
              </span>
            </div>

            {/* Item breakdown — shows real medicine names, not raw IDs */}
            <div className="mt-4 space-y-1.5 border-t border-border pt-3">
              {selected.items.map((it, idx) => (
                <div key={idx} className="flex justify-between text-sm">
                  <span className="text-ink-soft">{itemName(it.itemId)}</span>
                  <span className={it.inStock ? "text-ink" : "text-vermillion"}>
                    {it.inStock ? formatINR(it.price) : "Out of stock"}
                  </span>
                </div>
              ))}
            </div>

            {/* Out-of-stock warning — blocks approve */}
            {outOfStock.length > 0 && (
              <div className="mt-3 rounded-lg border border-vermillion/30 bg-vermillion/5 p-3 text-xs text-vermillion">
                {selected.pharmacyName} is out of {outOfStock.map((it) => itemName(it.itemId)).join(", ")}.
                Pick a pharmacy with full stock, or split the order.
              </div>
            )}

            {rec.alternatives.length > 0 && (
              <div className="mt-4 border-t border-border pt-3">
                <p className="mb-2 text-xs text-ink-muted">
                  Other options — tap to switch
                </p>
                <div className="space-y-1.5">
                  {/* The selected pharmacy is NOT shown here again — it's in the top slot.
                      Only the non-selected alternatives appear. */}
                  {[rec.bestQuote, ...rec.alternatives]
                    .filter((q) => q.pharmacyId !== selectedId)
                    .map((q) => {
                      const isBest = q.pharmacyId === rec.bestQuote.pharmacyId;
                      return (
                        <button
                          key={q.pharmacyId}
                          onClick={() => setSelectedId(q.pharmacyId)}
                          className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-sm transition-colors ${
                            "border-transparent hover:bg-cream-dark/40 text-ink-soft"
                          }`}
                        >
                          <span className="flex items-center gap-2">
                            {q.pharmacyName} · {q.deliveryEtaMinutes} min
                            {!q.allInStock && (
                              <span className="text-[10px] text-vermillion">partial stock</span>
                            )}
                            {isBest && (
                              <span className="text-[10px] text-matcha">recommended</span>
                            )}
                          </span>
                          <span className="text-ink-muted">
                            {formatINR(q.total)}
                          </span>
                        </button>
                      );
                    })}
                </div>
              </div>
            )}

            {outOfStock.length > 0 ? (
              <Button className="mt-5 w-full" disabled>
                <Shield className="h-4 w-4" />
                Select a pharmacy with full stock to continue
              </Button>
            ) : (
              <Button className="mt-5 w-full" onClick={() => onPay(selected)}>
                <Shield className="h-4 w-4" />
                Approve &amp; pay {formatINR(selected.total)} via Prava
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function PaymentCard({
  iframeUrl,
  sessionId,
  quote,
  onComplete,
}: {
  iframeUrl: string;
  sessionId: string;
  quote: PharmacyQuote;
  onComplete: (sessionId: string, quote: PharmacyQuote) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  return (
    <div className="flex items-start gap-3 animate-fade-in-up">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-matcha/10 text-matcha">
        <Shield className="h-5 w-5" />
      </div>
      <div className="w-full max-w-[88%]">
        <Card className="border-matcha/30">
          <div className="bg-matcha/5 px-5 py-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wide text-matcha">
                Secure checkout · Prava
              </span>
              <Badge variant="matcha">Sandbox</Badge>
            </div>
          </div>
          <CardContent className="pt-4">
            <div className="mb-3 flex items-center justify-between text-sm">
              <span className="text-ink-soft">{quote.pharmacyName}</span>
              <span className="font-display text-lg font-semibold text-matcha">
                {formatINR(quote.total)}
              </span>
            </div>
            <p className="mb-3 text-xs text-ink-muted">
              Enter your test card details and approve with your passkey. This is Prava&apos;s hosted secure surface. The test card is shared separately — use it here to complete the sandbox checkout.
            </p>
            {expanded && (
              <iframe
                src={iframeUrl}
                className="h-[420px] w-full rounded-lg border border-border"
                title="Prava secure checkout"
              />
            )}
            <Button
              className="mt-3 w-full"
              onClick={() => onComplete(sessionId, quote)}
            >
              <CheckCircle2 className="h-4 w-4" />
              I&apos;ve completed the checkout
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ConfirmationCard({ quote, sandboxDecline }: { quote: PharmacyQuote; sandboxDecline?: boolean }) {
  return (
    <div className="flex items-start gap-3 animate-fade-in-up">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-matcha text-cream">
        <CheckCircle2 className="h-5 w-5" />
      </div>
      <div className="w-full max-w-[85%]">
        <Card className={sandboxDecline ? "border-gold/40" : "border-matcha/30"}>
          <CardContent className="pt-5">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-matcha" />
              <p className="font-display text-lg font-semibold">
                {sandboxDecline ? "End-to-end flow completed" : "Order placed"}
              </p>
            </div>
            <p className="mt-2 text-sm text-ink-soft">
              {sandboxDecline
                ? "The full Prava transaction lifecycle executed against a real merchant. The test card declined at checkout — expected in sandbox. Production keys would complete the purchase."
                : `${quote.pharmacyName} confirmed your order. Arriving in ~${quote.deliveryEtaMinutes} minutes.`}
            </p>
            <div className="mt-4 grid grid-cols-3 gap-3 rounded-lg bg-cream-dark/50 p-3 text-center">
              <div>
                <p className="text-xs text-ink-muted">Total</p>
                <p className="font-display font-semibold">{formatINR(quote.total)}</p>
              </div>
              <div>
                <p className="text-xs text-ink-muted">ETA</p>
                <p className="font-display font-semibold">{quote.deliveryEtaMinutes}m</p>
              </div>
              <div>
                <p className="text-xs text-ink-muted">Paid via</p>
                <p className="font-display font-semibold">Prava</p>
              </div>
            </div>
            {sandboxDecline && (
              <div className="mt-3 flex items-start gap-2 rounded-lg border border-gold/30 bg-gold/5 p-3 text-xs text-ink-soft">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
                <span>
                  This is a valid sandbox outcome per the Prava team: reaching the checkout flow validates the integration. Real transactions require production access.
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
