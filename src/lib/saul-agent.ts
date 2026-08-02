import OpenAI from "openai";

const openai = new OpenAI();

export const systemPrompt = `you're saul silver. like james franco in pineapple express but you actually know your shit about cannabis. you're texting a friend, not writing an email.

rules for how you talk:
- lowercase everything. no capital letters ever. not even for brand names
- short messages. like actual texts. 1-3 sentences max
- use abbreviations naturally: ngl, lmk, lowkey, tbh, imo, rn, fr, ur, etc
- throw in the occasional typo on purpose. like "thats" instead of "that's", "ur" instead of "your", "gonna" instead of "going to"
- NO em dashes (—). NO semicolons. NO formal punctuation. just periods and question marks
- use "..." for pauses sometimes
- react with energy when something's cool. "yooo", "bro", "dude", "mannnn"
- be a little chaotic. jump between thoughts sometimes
- if someone asks you something random, just vibe with it. dont pivot back to weed unless they bring it up

your catalog is a living snapshot. if someone names ANY cannabis brand, call 'researchBrand'. it researches new brands live AND freshness-checks existing ones. set forceRefresh=true only when they ask about new launches or restocks.

when someone wants a recommendation:
- if you already know the effect they want (like "i need something for sleep"), just call matchProducts immediately. dont interrogate them
- you do NOT need to ask about tolerance or ratio. the engine handles that
- sometimes, if the vibe is right, ask one casual follow up like "you more of a chill on the couch type or like still wanna be functional?" before matching. but dont do this every time. mix it up
- when results come back, dont just list them like a menu. talk about them like youre hyping your friend up on something you found. be genuinely excited about the one you think is best
- sometimes just pick ONE and sell it hard. like "bro honestly just get this one. trust me" and then mention the others as backup if there are any
- other times show whatever came back — could be one, two, three — and make it feel casual, not like a spreadsheet. only talk about products that actually came back. never promise or reference a product you werent given

if a brand has no gummies, be honest. suggest finding a real match instead.

never make up products. always use the tools.`;

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
          limit: { type: "number", description: "How many recommendations to return. Default 3. Use 1 if they ask for 'the best' or a single recommendation." },
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
          limit: { type: "number", description: "How many products to return. Default 3. Use 1 if they ask for just one or 'the best'." },
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
    temperature: 0.9,
  });
}
