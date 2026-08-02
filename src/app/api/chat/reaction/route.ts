import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI();

/**
 * POST /api/chat/reaction
 *
 * Saul's voice layer for the research cards. Given a research outcome
 * (status + brand + research), Saul writes ONE funny, in-character line
 * reacting to it. The card renders this as its header; the deterministic
 * structure (hyperlinks, chips, product lists) renders underneath.
 *
 * Why a separate endpoint (not the tool-call flow): tool execution happens
 * client-side in verifyBrand, so the main /api/chat never sees the result.
 * This lets us get Saul's personality onto the card without rewiring the
 * orchestration — one focused call, one sentence back.
 *
 * Body: { status, brandName, website?, detail? }
 * Returns: { quip: string }
 */
export async function POST(req: NextRequest) {
  try {
    const { status, brandName, website, detail } = (await req.json()) as {
      status: string;
      brandName: string;
      website?: string;
      detail?: string; // e.g. what a no-gummy brand DOES sell
    };

    const situation = describeSituation(status, brandName, website, detail);

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are Saul Silver, a cannabis sommelier (James Franco in Pineapple Express — laid-back, sharp, genuinely knowledgeable, a little stoned, funny without trying too hard).

Write ONE single sentence reacting to the situation below. It will appear as the headline of a card in the chat.

Voice rules:
- Sound like a real person, not a chatbot. Dry wit > jokes-with-a-setup.
- Be specific to the brand/situation. No generic filler.
- Max ~18 words. One sentence. No follow-up questions.
- Don't repeat the brand name if you don't need to.
- No emojis, no quotation marks, no "Hey" openers.

Output ONLY the sentence. Nothing else.`,
        },
        { role: "user", content: situation },
      ],
      temperature: 0.9,
      max_tokens: 60,
    });

    const quip = completion.choices[0]?.message?.content?.trim().replace(/^["']|["']$/g, "") ?? "";
    return NextResponse.json({ quip });
  } catch (error) {
    console.error("[/api/chat/reaction]", error);
    // Fail soft — caller falls back to a hardcoded line. Never block the card.
    return NextResponse.json({ quip: "" });
  }
}

/** Turn the structured outcome into a one-line situation Saul reacts to. */
function describeSituation(status: string, brandName: string, website?: string, detail?: string): string {
  const siteBit = website ? ` (site checked: ${website})` : "";
  switch (status) {
    case "not_a_cannabis_brand":
      return `The user asked about "${brandName}"${siteBit}. I read the whole site — it's not a cannabis brand at all. No Vijaya, no CBD, no edibles. Just a totally unrelated company.`;
    case "research_unavailable":
      return `The user asked about "${brandName}"${siteBit}. I tried to scrape the site but couldn't get any pages to load — blocked, offline, or wrong URL.`;
    case "website_not_found":
      return `The user asked about "${brandName}". I couldn't even figure out what their website is — too generic or unknown.`;
    case "new_brand_no_gummies":
      return `The user asked about "${brandName}". It's a legit cannabis brand, but they don't make gummies at all. They sell: ${detail ?? "oils and topicals only"}.`;
    case "existing_brand_unchanged":
      return `The user asked about "${brandName}". I re-checked the site — nothing new, catalog's still current.`;
    default:
      return `The user asked about "${brandName}".`;
  }
}
