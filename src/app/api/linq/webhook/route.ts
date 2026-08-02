import { NextRequest, NextResponse } from "next/server";
import { parseInbound, sendMessage, setTyping, MessagePart } from "@/lib/linq";
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
  pendingRecommendations?: any[];
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
    
    // If we have pending recommendations and the user replied with a choice
    if (state.pendingRecommendations && ["1", "2", "3"].includes(text.trim())) {
      const selectedIndex = parseInt(text.trim()) - 1;
      const selected = state.pendingRecommendations[selectedIndex];
      
      if (selected) {
        if (chatId) await setTyping(chatId, true).catch(() => {});
        try {
          // 1. Create a payment via Linq
          const paymentRes = await fetch("https://api.linqapp.com/api/partner/v3/payments", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${process.env.LINQ_API_KEY}`,
              "Idempotency-Key": crypto.randomUUID(),
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              handle: from,
              amount_cents: Math.round(selected.product.price_inr * 100),
              currency: "inr",
              description: `Order: ${selected.product.name}`,
              merchant: {
                name: selected.brand.name,
                url: "https://prava.space"
              }
            })
          });
          
          let paymentUrl = "https://prava.space/checkout"; // fallback
          if (paymentRes.ok) {
            const payment = await paymentRes.json();
            paymentUrl = payment.attach_url || payment.approval_url || paymentUrl;
          }
          
          // 2. Send the Agentcard (iMessage App) part
          const parts: MessagePart[] = [{
            type: "imessage_app",
            app: {
              name: "Prava Agentcard",
              team_id: "PRAVA12345",
              bundle_id: "space.prava.Agentcard"
            },
            url: paymentUrl,
            fallback_text: "Pay with Prava",
            layout: {
              caption: "Secure Checkout",
              subcaption: `${selected.brand.name} - ${selected.product.name}`,
              image_url: selected.product.image_url || "https://images.unsplash.com/photo-1596526131083-e8c633c948d2?w=400&q=80"
            }
          }];

          await sendMessage({ to: from, chatId, parts });
          
          // Clear pending, but keep the chat history
          delete state.pendingRecommendations;
          convos.set(from, state);
          
          return NextResponse.json({ ok: true });
        } finally {
          if (chatId) await setTyping(chatId, false).catch(() => {});
        }
      }
    }

    // Append user message
    state.messages.push({ role: "user", content: text });
    
    // SAVE IMMEDIATELY SO WE DON'T GET THE GOLDFISH BUG
    convos.set(from, state);
    
    if (chatId) await setTyping(chatId, true).catch(() => {});

    try {
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
          
          // 4. Format a casual "photo dump" response for iMessage
          const parts: MessagePart[] = [];
          
          // Step 4a: Send all images first (the photo dump)
          top3.forEach((match) => {
            const imageUrl = match.product.image_url || "https://images.unsplash.com/photo-1596526131083-e8c633c948d2?w=400&q=80";
            parts.push({ type: "media", url: imageUrl });
          });
          
          // Step 4b: Send one single casual text bubble explaining the stash
          let summaryText = `Here's the stash. Found ${top3.length} solid options for you:\n\n`;
          
          top3.forEach((match, index) => {
            summaryText += `${index + 1}. ${match.brand.name} ${match.product.name} — ₹${match.product.price_inr}\n`;
            
            const sensoReason = match.reasons.find(r => r.startsWith("Senso: "));
            const primaryReason = match.reasons[0];
            if (sensoReason) {
               summaryText += `   "${sensoReason.replace("Senso: ", "").trim()}"\n\n`;
            } else {
               summaryText += `   ${primaryReason}\n\n`;
            }
          });
          
          summaryText += `Which one's calling your name? Reply with 1, 2, or 3 to securely check out with Prava.`;
          parts.push({ type: "text", value: summaryText });
          
          await sendMessage({
            to: from,
            chatId,
            parts,
          });
          
          // Keep convo so they can reply 1/2/3, and store recommendations
          state.pendingRecommendations = top3;
          convos.set(from, state);
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
      
      return NextResponse.json({ ok: true });
    } finally {
      if (chatId) await setTyping(chatId, false).catch(() => {});
    }
  } catch (e) {
    console.error("[linq/webhook] error:", e);
    return NextResponse.json({ ok: true, error: "handled" });
  }
}
