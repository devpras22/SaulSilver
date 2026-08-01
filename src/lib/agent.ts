/**
 * Kusushi agent orchestrator.
 *
 * Uses OpenAI function calling to understand the user's natural-language
 * medicine request and extract structured items. Falls back to a deterministic
 * parser when OPENAI_API_KEY is absent so the app works end-to-end in mock mode.
 *
 * One collapsed agent per the architecture decision: instead of 8 micro-agents,
 * we use a single Intake→Understanding step here, and the discovery/recommendation
 * logic lives in pharmacy-data.ts. Reliability over architecture.
 */

import OpenAI from "openai";
import type { MedicineItem } from "./types";

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

export const IS_MOCK_AGENT = !openai;

const SYSTEM_PROMPT = `You are Kusushi (薬師 — a traditional Japanese word for healer). You get people their medicine.

Your primary job: understand what the person needs and turn it into a clean list. You're precise about dosage and quantity, but you sound like a calm, capable human — not a call center.

You understand requests like:
- "Metformin 500mg, 30 tablets"
- "I need a vitamin D3 supplement and some paracetamol"
- "My mother's blood pressure medicine — Telmisartan 40, 2 strips of 10"
- "insulin glargine pen, 3ml, 5 pens"

When the user is requesting medicine or health items, call the extract_medicine_request function with the structured items. Classify each item as one of: prescription, otc, supplement, device, personal_care.

If the request is ambiguous about quantity, default to a reasonable amount (e.g. 1 strip of 10 tablets) and note your assumption.
If the user mentions multiple items, extract all of them.

BUT — not every message is a medicine request. If the user is just chatting, asking a question ("what model are you?", "how do you work?", "hi"), making small talk, or asking something unrelated — DO NOT call the function. Just reply in plain text, in character, briefly. Only call extract_medicine_request when the user is actually asking for medicine or health items.

Voice: warm, short, no filler. You're helping someone who may be stressed about health — so be reassuring, but never corporate. No exclamation marks. No "I'd be happy to help." Just do the thing.`;

const extractFunction = {
  type: "function" as const,
  function: {
    name: "extract_medicine_request",
    description: "Extract structured medicine/health items from a user's natural-language request",
    parameters: {
      type: "object",
      properties: {
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string", description: "Medicine or product name, generic if possible" },
              dosage: { type: "string", description: "e.g. '500mg', '40mg', '3ml'" },
              quantity: { type: "number", description: "Number of units (tablets, strips, pens, etc.)" },
              type: {
                type: "string",
                enum: ["prescription", "otc", "supplement", "device", "personal_care"],
              },
              notes: { type: "string", description: "Any assumptions or clarifications" },
            },
            required: ["name", "quantity", "type"],
          },
        },
        reply: {
          type: "string",
          description: "A warm, concise acknowledgment to show the user. Confirm what you understood.",
        },
        mentionedAddress: {
          type: "string",
          description:
            "If the user mentioned a delivery address or location in their message (e.g. 'to Andheri West', 'deliver to Indiranagar Bangalore', 'send it home to Powai'), extract it here as a clean address string. If NO address or location was mentioned, return null.",
        },
      },
      required: ["items", "reply"],
    },
  },
};

export interface AgentExtraction {
  items: MedicineItem[];
  reply: string;
  /** True when the model replied in conversation rather than extracting items.
   *  The client should show the reply but NOT advance to the address stage. */
  conversation?: boolean;
  /** The address/location the user mentioned in their message, if any.
   *  Null when the user didn't mention one (so we can use the saved address). */
  mentionedAddress?: string | null;
}

/** Real OpenAI-backed extraction. */
async function extractReal(userMessage: string): Promise<AgentExtraction> {
  const completion = await openai!.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userMessage },
    ],
    tools: [extractFunction],
    tool_choice: "auto", // let the model decide: extract OR reply in text
    temperature: 0.3,
  });

  const msg = completion.choices[0]?.message;
  const call = msg?.tool_calls?.[0];

  // No tool call = the model chose to just talk. Treat as conversation, no items.
  if (!call || call.type !== "function") {
    return {
      items: [],
      reply: msg?.content?.trim() ?? "I'm here to help you get medicine. What do you need?",
      conversation: true,
    };
  }

  const args = JSON.parse(call.function.arguments);
  const items: MedicineItem[] = (args.items ?? []).map(
    (i: Record<string, unknown>, idx: number) => ({
      id: `item_${Date.now().toString(36)}_${idx}`,
      name: i.name as string,
      dosage: i.dosage as string | undefined,
      quantity: i.quantity as number,
      type: i.type as MedicineItem["type"],
      notes: i.notes as string | undefined,
    })
  );

  // The model called the function but found no items — treat as conversation.
  if (items.length === 0) {
    return {
      items: [],
      reply: args.reply ?? "I didn't catch a medicine in that. What do you need?",
      conversation: true,
    };
  }

  return {
    items,
    reply: args.reply ?? "Got it. Let me find the best pharmacy for you.",
    mentionedAddress: args.mentionedAddress ?? null,
  };
}

/** Deterministic mock extraction for common demo phrases. */
async function extractMock(userMessage: string): Promise<AgentExtraction> {
  await new Promise((r) => setTimeout(r, 800)); // simulate latency

  // Naive but covers the demo scripts we'll use
  const items: MedicineItem[] = [];
  const msg = userMessage.toLowerCase();
  const id = () => `item_${Date.now().toString(36)}_${items.length}`;

  const known: { match: RegExp; name: string; dosage?: string; type: MedicineItem["type"] }[] = [
    { match: /metformin/, name: "Metformin", dosage: "500mg", type: "prescription" },
    { match: /telmisartan/, name: "Telmisartan", dosage: "40mg", type: "prescription" },
    { match: /paracetamol|crocin|dolo/, name: "Paracetamol", dosage: "500mg", type: "otc" },
    { match: /azithromycin/, name: "Azithromycin", dosage: "500mg", type: "prescription" },
    { match: /insulin|glargine/, name: "Insulin Glargine", dosage: "3ml", type: "prescription" },
    { match: /vitamin\s*d|d3|calcirol/, name: "Vitamin D3", dosage: "60,000 IU", type: "supplement" },
    { match: /omega|fish\s*oil/, name: "Omega-3 Fish Oil", type: "supplement" },
    { match: /multivitamin/, name: "Multivitamin", type: "supplement" },
    { match: /thermometer/, name: "Digital Thermometer", type: "device" },
    { match: /bp\s*monitor|blood\s*pressure\s*monitor/, name: "BP Monitor", type: "device" },
    { match: /gauze|bandage|first\s*aid/, name: "First Aid Kit", type: "personal_care" },
    { match: /sanitizer/, name: "Hand Sanitizer", type: "personal_care" },
  ];

  for (const k of known) {
    if (k.match.test(msg)) {
      // Try to find a quantity nearby
      const qMatch = msg.match(/(\d+)\s*(?:tablets?|tabs?|strips?|pens?|pieces?|units?|x)?/g);
      let qty = 10;
      if (qMatch) {
        const nums = qMatch.map((s) => parseInt(s)).filter((n) => n > 0 && n < 500);
        if (nums.length > items.length) qty = nums[items.length] ?? 10;
      }
      items.push({ id: id(), name: k.name, dosage: k.dosage, quantity: qty, type: k.type });
    }
  }

  if (items.length === 0) {
    // No known medicine matched — don't fabricate an item. Return a
    // conversation reply so the client stays in intake instead of forcing the
    // user into the address flow.
    return {
      items: [],
      reply:
        "I didn't recognize a medicine in that. Tell me what you need — e.g. 'Metformin 500mg, 30 tablets' — or upload a prescription.",
      conversation: true,
    };
  }

  // Detect a mentioned address/location — common phrasings + known Indian areas.
  let mentionedAddress: string | null = null;
  const addressMatch =
    userMessage.match(/(?:to|deliver(?:ed)? to|send (?:it )?(?:to|home to)|at|in)\s+([A-Z][A-Za-z\s,'-]{3,40}?)(?:[.,]|$)/)
    || userMessage.match(/\b(Andheri|Bandra|Powai|Indiranagar|Koramangala|Juhu|Worli|Dadar|Goregaon|Borivali|Thane|Navi Mumbai|Whitefield|HSR Layout|Marathahalli|Sector\s*\d+)\b/i);
  if (addressMatch) {
    mentionedAddress = (addressMatch[1] ?? addressMatch[0]).trim();
  }

  const reply = mentionedAddress
    ? `Got it — ${items.length} item${items.length > 1 ? "s" : ""}: ${items
        .map((i) => `${i.name}${i.dosage ? ` ${i.dosage}` : ""} (${i.quantity})`)
        .join(", ")}.`
    : `Got it — I've parsed ${items.length} item${items.length > 1 ? "s" : ""}: ${items
        .map((i) => `${i.name}${i.dosage ? ` ${i.dosage}` : ""} (${i.quantity})`)
        .join(", ")}. What's the delivery address?`;

  return { items, reply, mentionedAddress };
}

export const agent = {
  extract: openai ? extractReal : extractMock,
};
