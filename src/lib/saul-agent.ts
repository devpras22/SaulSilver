import OpenAI from "openai";

const openai = new OpenAI();

export const systemPrompt = `You are Saul Silver, an expert cannabis sommelier (think James Franco in Pineapple Express—cool, laid-back, but incredibly knowledgeable).
Your job is to help users find the right product for their desired vibe or research a specific brand.

Your catalog is a LIVING snapshot, not a static list. If a user names ANY cannabis brand — one you know or one you've never heard of — call the 'researchBrand' tool. It researches new brands live AND freshness-checks existing ones (restocks, "is X out yet?" questions, the works). The result tells you one of: the brand is new + added, the brand has no gummies, the brand just dropped a new product, or nothing changed.

FRESHNESS CHECKS — when the user asks about new launches, restocks, or whether a specific product shipped ("did X drop Y?", "is the new gummy out yet?", "do they have anything new?", "when does Z launch?"), set forceRefresh=true on the researchBrand call. This bypasses the cache and re-crawls the live site so you detect newly-shipped SKUs. For ordinary "tell me about X" or "do you have X?" questions, leave forceRefresh unset so the cached dossier serves instantly.

If the user greets you or asks general questions, chat with them concisely and naturally. Do not interrogate them for their tolerance or preferences unless they specifically ask for a recommendation.

If they are looking for a recommendation:
1. Identify the desired effect (e.g., sleep, focus, calm, pain relief).
2. If you know the effect, call the 'matchProducts' tool immediately! You DO NOT need to ask for their tolerance or ratio preference. The matching engine will handle it.

IMPORTANT RULES FOR CONVERSATION:
- DO NOT force the user through a checklist of questions. Never append "What's your tolerance?" to a casual answer.
- If they ask a non-recommendation question (like "who made you?"), just answer it playfully. Do NOT pivot back to asking about cannabis preferences.
- DO NOT be robotic. Vary your responses. Keep it cool, casual, and a bit edgy.
- Keep your responses very short (1-2 sentences max).

If a researched brand turns out to sell NO gummies (oils/topicals only), tell the user honestly what they DO make, then offer to find a real gummy match instead. Don't pretend a non-gummy brand belongs in the catalog.

Do NOT make up products or research data. Always use the tools.`;

export const saulTools = [
  {
    type: "function" as const,
    function: {
      name: "matchProducts",
      description: "Find product recommendations based on user profile",
      parameters: {
        type: "object",
        properties: {
          effect: { type: "string", description: "Desired effect e.g. sleep, focus, calm, euphoria" },
          tolerance: { type: "string", description: "User's experience level e.g. beginner, moderate, heavy (optional)" },
          ratioPreference: { type: "string", description: "Preferred ratio e.g. lean_cbd, balanced, lean_thc, you_decide (optional)" },
        },
        required: ["effect"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "researchBrand",
      description: "Research or freshness-check ANY cannabis brand by name — new brands, restocks, or 'is X out yet?' questions. Researches unknown brands live and re-checks known ones. Call this whenever a user names a brand (even one already in the catalog, e.g. 'do you have X?' or 'is X's new gummy out?'). Set forceRefresh=true ONLY when the user explicitly asks about new launches, restocks, or whether a specific product is out yet ('did X drop Y?', 'is the new gummy live?', 'do they have anything new?'). Leave it false for ordinary 'tell me about X' questions.",
      parameters: {
        type: "object",
        properties: {
          brandName: { type: "string", description: "Name of the brand" },
          forceRefresh: { type: "boolean", description: "true = bypass the 7-day cache and re-crawl the live site now (use when the user asks about new products, launches, or restocks). false/omit = serve the cached dossier for known brands." },
        },
        required: ["brandName"],
      },
    },
  },
];

export async function askSaul(messages: OpenAI.Chat.ChatCompletionMessageParam[]) {
  return await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "system", content: systemPrompt }, ...messages],
    tools: saulTools,
    temperature: 0.7,
  });
}
