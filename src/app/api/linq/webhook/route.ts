import { NextRequest, NextResponse } from "next/server";
import { parseInbound, sendMessage, setTyping } from "@/lib/linq";
import { agent } from "@/lib/agent";
import { generateQuotes, pickBest } from "@/lib/pharmacy-data";

/**
 * POST /api/linq/webhook — Linq inbound message webhook.
 *
 * The iMessage agent flow:
 *   caregiver texts Kusushi → agent extracts meds → finds pharmacies →
 *   replies with recommendation → (payment handled in a follow-up)
 *
 * This is the "message-native agent" that qualifies for the Linq track.
 * Conversation state is tracked per-phone-number in memory (hackathon-scale).
 */

// ── Per-user conversation state (in-memory; fine for demo) ──
interface ConvoState {
  stage: "new" | "awaiting_address" | "awaiting_priority" | "discovered";
  items: import("@/lib/types").MedicineItem[];
  address?: string;
  priority?: import("@/lib/types").Priority;
  chatId?: string;
}
const convos = new Map<string, ConvoState>();

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const event = body.event_type ?? body.type ?? "message.received";

    // Only handle inbound messages; ack everything else
    if (event !== "message.received") {
      return NextResponse.json({ ok: true, ignored: event });
    }

    const parsed = parseInbound(body);
    if (!parsed) {
      return NextResponse.json({ ok: true, reason: "unparseable" });
    }

    const { from, text, chatId } = parsed;
    const state = convos.get(from) ?? { stage: "new", items: [] };

    // ── Stage: new conversation ──
    if (state.stage === "new") {
      // Send typing indicator while agent thinks
      if (chatId) await setTyping(chatId, true).catch(() => {});

      const extraction = await agent.extract(text);
      if (!extraction.items.length) {
        await sendMessage({
          to: from,
          chatId,
          text: "Hey, I'm Kusushi. Tell me what medicine you need — e.g. 'Metformin 500mg, 30 tablets' — or what you're treating.",
        });
        return NextResponse.json({ ok: true });
      }

      state.items = extraction.items;
      state.stage = "awaiting_address";
      state.chatId = chatId;
      convos.set(from, state);
      if (chatId) await setTyping(chatId, false).catch(() => {});

      const list = extraction.items
        .map((i) => `• ${i.name}${i.dosage ? ` ${i.dosage}` : ""} × ${i.quantity}`)
        .join("\n");
      await sendMessage({
        to: from,
        chatId,
        text: `Got it. I've found ${extraction.items.length} item${extraction.items.length > 1 ? "s" : ""}:\n${list}\n\nWhat's the delivery address?`,
      });
      return NextResponse.json({ ok: true });
    }

    // ── Stage: awaiting address ──
    if (state.stage === "awaiting_address") {
      state.address = text;
      state.stage = "awaiting_priority";
      convos.set(from, state);
      await sendMessage({
        to: from,
        chatId,
        text: "Got the address. What matters most — reply with: cheapest, fastest, closest, or reliable?",
      });
      return NextResponse.json({ ok: true });
    }

    // ── Stage: awaiting priority → discover ──
    if (state.stage === "awaiting_priority") {
      const p = text.toLowerCase();
      const priority =
        p.includes("cheap") ? "cheapest" :
        p.includes("fast") ? "fastest" :
        p.includes("close") ? "closest" :
        p.includes("reliab") ? "confidence" : "cheapest";
      state.priority = priority;

      if (chatId) await setTyping(chatId, true).catch(() => {});

      const quotes = await generateQuotes(state.items);
      const { best, explanation } = pickBest(quotes, priority);
      state.stage = "discovered";
      convos.set(from, state);
      if (chatId) await setTyping(chatId, false).catch(() => {});

      const fmt = (n: number) => `₹${n.toLocaleString("en-IN")}`;
      await sendMessage({
        to: from,
        chatId,
        text: `${explanation}\n\n${best.pharmacyName} — ${fmt(best.total)}\nDelivery: ${best.deliveryEtaMinutes} min\n${best.allInStock ? "✅ All items in stock" : "⚠️ Partial stock"}\n\nReply "yes" to approve and pay via Prava, or "change" to see other options.`,
      });
      return NextResponse.json({ ok: true });
    }

    // ── Stage: discovered → approval ──
    if (state.stage === "discovered") {
      const t = text.toLowerCase();
      if (t.startsWith("yes") || t.startsWith("y") || t.includes("approve")) {
        // Fetch the stored best quote
        const quotes = await generateQuotes(state.items);
        const { best } = pickBest(quotes, state.priority ?? "cheapest");
        await sendMessage({
          to: from,
          chatId,
          text: `Creating a secure Prava payment session... In the web app, you'd approve with a passkey and I'd complete the checkout. (Demo: open saul.pras.fun/app for the full payment flow.)`,
        });
        convos.delete(from);
        return NextResponse.json({ ok: true });
      }
      if (t.includes("change") || t.includes("other")) {
        const quotes = await generateQuotes(state.items);
        const alts = quotes
          .slice(0, 3)
          .map((q) => `• ${q.pharmacyName} — ₹${q.total.toLocaleString("en-IN")}, ${q.deliveryEtaMinutes} min`)
          .join("\n");
        await sendMessage({
          to: from,
          chatId,
          text: `Here are your options:\n${alts}\n\nWhich one? Reply with the name.`,
        });
        return NextResponse.json({ ok: true });
      }
    }

    // Fallback
    await sendMessage({
      to: from,
      chatId,
      text: "Sorry, I didn't catch that. Want me to start over? Tell me what medicine you need.",
    });
    convos.delete(from);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[linq/webhook] error:", e);
    // Always 200 so Linq doesn't retry bomb us
    return NextResponse.json({ ok: true, error: "handled" });
  }
}
