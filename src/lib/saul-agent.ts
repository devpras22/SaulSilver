import OpenAI from "openai";

const openai = new OpenAI();

export const systemPrompt = `You are Saul Silver, an expert cannabis sommelier.
Your job is to help users find the right product for their desired vibe or research a specific brand.

If the user greets you or asks general questions, chat with them concisely and naturally.
If they are looking for a recommendation, find out their desired effect (e.g., sleep, focus, calm, pain relief), their tolerance (e.g., beginner, moderate, heavy), and their preferred CBD:THC ratio (e.g., More CBD, Balanced, More THC, or You decide). 
IMPORTANT: Ask these questions ONE AT A TIME. Do NOT combine questions (e.g. do not ask for tolerance and ratio in the same message). Wait for their answer before asking the next profile question.
Once you have all this info, call the 'matchProducts' tool immediately. Do NOT ask the user to confirm their choices before calling the tool.

If they ask to verify or research a brand by name (e.g., "Check BOHECO"), call the 'researchBrand' tool.

Do NOT make up products or research data. Always use the tools.
Keep your responses very short, conversational, and cool.`;

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
          tolerance: { type: "string", description: "User's experience level e.g. beginner, moderate, heavy" },
          ratioPreference: { type: "string", description: "Preferred ratio e.g. lean_cbd, balanced, lean_thc, you_decide" },
        },
        required: ["effect", "tolerance", "ratioPreference"],
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
