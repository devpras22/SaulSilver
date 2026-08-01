/**
 * Simulated pharmacy call generator.
 *
 * Generates realistic call transcripts and outcomes for the agent contacting
 * each pharmacy. We are TRANSPARENT that this is a simulated contact path —
 * the agent's reasoning and recommendation engine are real, the call itself
 * is simulated because live telephony to Indian pharmacies is high-variance
 * and costs real money (not spending money on this hackathon).
 *
 * The transcript reflects a realistic conversation:
 * Agent greets → asks for items → pharmacist checks stock → quotes price + ETA
 */

import type { MedicineItem, PharmacyQuote } from "./types";

export interface CallTranscript {
  pharmacyId: string;
  pharmacyName: string;
  startedAt: string;
  durationSeconds: number;
  status: "completed" | "no-answer" | "partial";
  transcript: TranscriptLine[];
  /** Outcome summary extracted from the call */
  outcome: {
    itemsAvailable: number;
    itemsTotal: number;
    allInStock: boolean;
    quotedTotal: number;
    deliveryEtaMinutes: number;
    notes?: string;
    /** Per-item results — the SINGLE SOURCE OF TRUTH for price + stock.
     *  discover/route.ts must use these, NOT re-derive them. */
    lineItems: { itemId: string; inStock: boolean; price: number }[];
  };
}

export interface TranscriptLine {
  speaker: "agent" | "pharmacist";
  text: string;
  timestamp: string;
}

// Deterministic seed from a string
function seedFrom(s: string): number {
  let seed = 0;
  for (let i = 0; i < s.length; i++) seed = (seed * 31 + s.charCodeAt(i)) % 100000;
  return seed;
}

function pseudoRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

/** Generate a realistic call transcript + outcome for a pharmacy. */
export function simulateCall(
  pharmacyName: string,
  pharmacyId: string,
  items: MedicineItem[],
  baseDistanceKm: number
): CallTranscript {
  const seed = seedFrom(pharmacyId + items.map((i) => i.name).join(""));
  const rand = pseudoRandom(seed);
  const now = Date.now();

  // ~85% answer rate; if not answered, short call
  const answered = rand() > 0.15;
  if (!answered) {
    return {
      pharmacyId,
      pharmacyName,
      startedAt: new Date(now).toISOString(),
      durationSeconds: 18 + Math.floor(rand() * 12),
      status: "no-answer",
      transcript: [
        {
          speaker: "agent",
          text: `Hello, this is Kusushi, an AI assistant calling to check medicine availability. Could I speak with the pharmacist?`,
          timestamp: new Date(now).toISOString(),
        },
        {
          speaker: "agent",
          text: `[Ring tone... no answer after 25 seconds. Hanging up.]`,
          timestamp: new Date(now + 25000).toISOString(),
        },
      ],
      outcome: {
        itemsAvailable: 0,
        itemsTotal: items.length,
        allInStock: false,
        quotedTotal: 0,
        deliveryEtaMinutes: 0,
        notes: "No answer. Will retry later.",
        lineItems: items.map((item) => ({ itemId: item.id, inStock: false, price: 0 })),
      },
    };
  }

  // Build a realistic conversation
  const transcript: TranscriptLine[] = [];
  const t0 = now;
  let elapsed = 0;

  const addLine = (speaker: "agent" | "pharmacist", text: string, addMs: number) => {
    elapsed += addMs;
    transcript.push({
      speaker,
      text,
      timestamp: new Date(t0 + elapsed).toISOString(),
    });
  };

  addLine("agent", `Hi, this is Kusushi, an AI assistant. I'm calling to check availability of some medicines for a patient in your area. Do you have a moment?`, 3000);

  const greetings = ["Yes, tell me.", "Haan boliye, kya chahiye?", "Yes sir, what do you need?", "Sure, what medicines?"];
  addLine("pharmacist", greetings[Math.floor(rand() * greetings.length)], 2500);

  // Per-item availability
  const itemResults: { item: MedicineItem; inStock: boolean; price: number; note?: string }[] = [];
  const itemList = items.map((i) => `${i.name}${i.dosage ? ` ${i.dosage}` : ""}, ${i.quantity} units`).join("; ");
  addLine("agent", `I need: ${itemList}. Can you check if these are available?`, 3000);

  for (const item of items) {
    const inStock = rand() > 0.18; // ~82% per-item stock rate
    // Price: base on type, with tight ±15% variance so prices across pharmacies
    // are believable (not ₹191 vs ₹971 for the same medicine).
    const base = item.type === "device" ? 850 : item.type === "supplement" ? 320 : 95;
    const variance = 0.85 + rand() * 0.3; // 0.85 – 1.15
    const price = inStock ? Math.max(20, Math.round(base * item.quantity * 0.6 * variance)) : 0;

    if (inStock) {
      const confirmations = [
        `Yes, ${item.name} ${item.dosage ?? ""} is available. ₹${price} for ${item.quantity}.`,
        `Haan hai. ${item.quantity} ke liye ₹${price} lagega.`,
        `${item.name} is in stock. ₹${price}.`,
      ];
      addLine("pharmacist", confirmations[Math.floor(rand() * confirmations.length)], 3000 + Math.floor(rand() * 2000));
      itemResults.push({ item, inStock: true, price });
    } else {
      const denials = [
        `Sorry, ${item.name} is out of stock right now. Try after 2 days.`,
        `${item.name} nahi hai abhi. Alternative chahiye?`,
        `That one is not available. We can order it for tomorrow.`,
      ];
      addLine("pharmacist", denials[Math.floor(rand() * denials.length)], 3000 + Math.floor(rand() * 2000));
      itemResults.push({ item, inStock: false, price: 0 });
    }
  }

  const itemsAvailable = itemResults.filter((r) => r.inStock).length;
  const allInStock = itemsAvailable === items.length;
  const quotedTotal = itemResults.reduce((sum, r) => sum + r.price, 0);

  // Delivery ETA — closer pharmacies deliver faster
  const baseEta = Math.round(15 + baseDistanceKm * 8 + rand() * 15);

  if (itemsAvailable > 0) {
    addLine("agent", `Thank you. What's the delivery time to the patient's address, and is delivery free?`, 2500);
    const deliveryReplies = [
      `Delivery in ${baseEta} minutes, free for orders above ₹500.`,
      `${baseEta} minutes. No delivery charge in this area.`,
      `We can send it in ${baseEta} mins. ₹30 delivery, or free if above ₹499.`,
    ];
    addLine("pharmacist", deliveryReplies[Math.floor(rand() * deliveryReplies.length)], 3000);
    addLine("agent", `Got it. I'll confirm with the patient and call back if they choose your pharmacy. Thank you for your time.`, 2500);
    addLine("pharmacist", `Okay, thank you.`, 1500);
  } else {
    addLine("agent", `I understand, thank you for checking.`, 2000);
  }

  return {
    pharmacyId,
    pharmacyName,
    startedAt: new Date(t0).toISOString(),
    durationSeconds: Math.round(elapsed / 1000),
    status: allInStock ? "completed" : "partial",
    transcript,
    outcome: {
      itemsAvailable,
      itemsTotal: items.length,
      allInStock,
      quotedTotal,
      deliveryEtaMinutes: baseEta,
      notes: allInStock ? undefined : `${items.length - itemsAvailable} item(s) out of stock`,
      lineItems: itemResults.map((r) => ({ itemId: r.item.id, inStock: r.inStock, price: r.price })),
    },
  };
}

/** Convert a call outcome into a PharmacyQuote */
export function callToQuote(call: CallTranscript): Omit<PharmacyQuote, "pharmacyArea" | "distanceKm" | "confidenceScore" | "rationale"> & {
  pharmacyArea?: string;
  distanceKm?: number;
} {
  return {
    pharmacyId: call.pharmacyId,
    pharmacyName: call.pharmacyName,
    total: call.outcome.quotedTotal,
    deliveryEtaMinutes: call.outcome.deliveryEtaMinutes,
    allInStock: call.outcome.allInStock,
    items: [],
  };
}
