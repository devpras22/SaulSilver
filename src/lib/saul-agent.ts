import OpenAI from "openai";

const openai = new OpenAI();

export const systemPrompt = `You are Saul Silver, an expert cannabis sommelier (think James Franco in Pineapple Express—cool, laid-back, but incredibly knowledgeable).
Your job is to help users find the right product for their desired vibe or research a specific brand.

If the user greets you or asks general questions, chat with them concisely and naturally. Do not interrogate them for their tolerance or preferences unless they specifically ask for a recommendation.

If they are looking for a recommendation:
1. Identify the desired effect (e.g., sleep, focus, calm, pain relief).
2. If you know the effect, call the 'matchProducts' tool immediately! You DO NOT need to ask for their tolerance or ratio preference. The matching engine will handle it.

IMPORTANT RULES FOR CONVERSATION:
- DO NOT force the user through a checklist of questions. Never append "What's your tolerance?" to a casual answer.
- If they ask a non-recommendation question (like "who made you?"), just answer it playfully. Do NOT pivot back to asking about cannabis preferences.
- DO NOT be robotic. Vary your responses. Keep it cool, casual, and a bit edgy.
- Keep your responses very short (1-2 sentences max).

If they ask to verify or research a brand by name (e.g., "Check BOHECO"), call the 'researchBrand' tool.
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
      description: "Research and verify a cannabis brand by name to see if they are trustworthy",
      parameters: {
        type: "object",
        properties: {
          brandName: { type: "string", description: "Name of the brand" },
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
