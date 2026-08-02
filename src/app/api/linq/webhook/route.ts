import { NextRequest, NextResponse } from "next/server";
import { parseInbound, sendMessage, setTyping } from "@/lib/linq";
import { askSaul } from "@/lib/saul-agent";
import OpenAI from "openai";
import { createClient } from "@/lib/supabase/server";
import { enrichBrandsWithSensoTrust } from "@/lib/senso-trust";
import { matchProducts } from "@/lib/sommelier";

/**
 * POST /api/linq/webhook — Linq inbound message webhook.
 *
 * This is the iMessage SMS agent entrypoint.
 */

// Conversation state for SMS users
interface ConvoState {
  chatId: string;
  messages: OpenAI.Chat.ChatCompletionMessageParam[];
}
const convos = new Map<string, ConvoState>();

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const event = body.event_type ?? body.type ?? "message.received";

    if (event !== "message.received") {
      return NextResponse.json({ ok: true, ignored: event });
    }

    const parsed = parseInbound(body);
    if (!parsed) {
      return NextResponse.json({ ok: true, reason: "unparseable" });
    }

    const { from, text, chatId } = parsed;
    
    // FETCH OR INITIALIZE MEMORY
    const state = convos.get(from) ?? { chatId, messages: [] };

    // Update chatId just in case it changed
    if (chatId) state.chatId = chatId;
    
    // Append user message
    state.messages.push({ role: "user", content: text });
    
    // SAVE IMMEDIATELY SO WE DON'T GET THE GOLDFISH BUG
    convos.set(from, state);
    
    // Set typing indicator
    if (chatId) await setTyping(chatId, true).catch(() => {});

    const response = await askSaul(state.messages);
    const aiMessage = response.choices[0].message;
    
    state.messages.push(aiMessage);
    // SAVE THE AI MESSAGE SO IT REMEMBERS WHAT IT JUST SAID
    convos.set(from, state);
    
    if (aiMessage.tool_calls && aiMessage.tool_calls.length > 0) {
      const toolCall = aiMessage.tool_calls[0];
      
      if (toolCall.type === "function" && toolCall.function.name === "matchProducts") {
        const args = JSON.parse(toolCall.function.arguments);
        
        // EXECUTE MATCH LOCALLY INSTEAD OF SENDING A BLIND LINK
        const supabase = await createClient();
        
        // 1. Pull the catalog
        const [{ data: brands }, { data: products }] = await Promise.all([
          supabase.from("brands").select("*").eq("region", "IN"),
          supabase.from("products").select("*").eq("in_stock", true),
        ]);
        
        if (!brands?.length || !products?.length) {
          await sendMessage({
            to: from,
            chatId,
            text: "Damn, looks like the catalog is totally empty right now.",
          });
          convos.delete(from);
          return NextResponse.json({ ok: true });
        }
        
        // 2. Senso trust enrichment
        const enrichedBrands = await enrichBrandsWithSensoTrust(brands as any);
        
        // 3. Match
        const matches = matchProducts(
          products as any,
          enrichedBrands,
          { intent: "match", effect: args.effect, tolerance: args.tolerance, ratioPreference: args.ratioPreference },
          "effect"
        );
        
        const top3 = matches.slice(0, 3);
        
        if (top3.length === 0) {
          await sendMessage({
            to: from,
            chatId,
            text: "Couldn't find anything that matches that exact vibe, man. Try adjusting your preferences?",
          });
          return NextResponse.json({ ok: true });
        }
        
        // 4. Format a beautiful text list for the user
        let messageText = `Found the perfect stash for you. Here are the top ${top3.length} matches (ranked by Senso trust & effect):\n\n`;
        
        top3.forEach((match, index) => {
          messageText += `${index + 1}. 🌿 ${match.brand.name} ${match.product.name}\n`;
          messageText += `   Price: ₹${match.product.price_inr}\n`;
          messageText += `   Trust Score: ${Math.round(match.brand.trust_score * 100)}/100\n`;
          messageText += `   Why: ${match.reasons[0]}\n\n`;
        });
        
        const urlArgs = new URLSearchParams(args).toString();
        const checkoutLink = `https://saul.pras.fun/app?${urlArgs}`;
        
        messageText += `Tap here to view the full details and checkout securely with Prava: ${checkoutLink}`;
        
        await sendMessage({
          to: from,
          chatId,
          text: messageText,
        });
        
        // Clear convo so they can start fresh next time
        convos.delete(from);
      } else {
        await sendMessage({
          to: from,
          chatId,
          text: "I'm looking into that for you...",
        });
      }
    } else if (aiMessage.content) {
      await sendMessage({
        to: from,
        chatId,
        text: aiMessage.content,
      });
    }
    
    if (chatId) await setTyping(chatId, false).catch(() => {});
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[linq/webhook] error:", e);
    return NextResponse.json({ ok: true, error: "handled" });
  }
}
