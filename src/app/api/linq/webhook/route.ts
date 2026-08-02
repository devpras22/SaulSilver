import { NextRequest, NextResponse } from "next/server";
import { parseInbound, sendMessage, setTyping, MessagePart } from "@/lib/linq";
import { askSaul } from "@/lib/saul-agent";
import OpenAI from "openai";
import { createClient } from "@/lib/supabase/server";
import { enrichBrandsWithSensoTrust } from "@/lib/senso-trust";
import { matchProducts } from "@/lib/sommelier";
import { productImage } from "@/lib/utils";

/**
 * POST /api/linq/webhook — Linq inbound message webhook.
 *
 * This is the iMessage SMS agent entrypoint.
 *
 * IMPORTANT: On Vercel serverless, the runtime can kill the function
 * the instant a Response is returned. So we MUST await setTyping(false)
 * BEFORE every return — never in a finally block.
 */

// Conversation state for SMS users
interface ConvoState {
  chatId: string;
  messages: OpenAI.Chat.ChatCompletionMessageParam[];
  pendingRecommendations?: any[];
}
const convos = new Map<string, ConvoState>();

/** Helper: clear typing indicator, swallowing errors. */
async function stopTyping(chatId: string | undefined) {
  if (chatId) await setTyping(chatId, false).catch(() => {});
}

export async function POST(req: NextRequest) {
  let activeChatId: string | undefined;
  try {
    const origin = req.nextUrl.origin;
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
    activeChatId = chatId;
    
    // FETCH OR INITIALIZE MEMORY
    const state = convos.get(from) ?? { chatId, messages: [] };

    // Update chatId just in case it changed
    if (chatId) state.chatId = chatId;
    
    // ── SELECTION BRANCH: user replied 1/2/3 to pick a recommendation ──
    if (state.pendingRecommendations && ["1", "2", "3"].includes(text.trim())) {
      const selectedIndex = parseInt(text.trim()) - 1;
      const selected = state.pendingRecommendations[selectedIndex];
      
      if (selected) {
        if (chatId) await setTyping(chatId, true).catch(() => {});

        // 1. Create a payment via Linq Agentcard API
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
              url: selected.brand.website || "https://prava.space"
            }
          })
        });
        
        let paymentUrl = "";
        let paymentWorked = false;
        if (paymentRes.ok) {
          const payment = await paymentRes.json();
          paymentUrl = payment.attach_url || payment.approval_url || "";
          paymentWorked = !!paymentUrl;
        }
        
        if (paymentWorked && paymentUrl) {
          // Send a rich link preview — tappable card that opens Prava checkout in-app
          await sendMessage({
            to: from,
            chatId,
            parts: [{ type: "link", url: paymentUrl }],
          });
          
          // Follow up with a casual text
          await sendMessage({
            to: from,
            chatId,
            text: `thats ur secure checkout for the ${selected.product.name} 🔒 tap it and prava handles the rest. ur card info never touches us`,
          });
        } else {
          // Payment API didn't work — send a text explanation
          await sendMessage({
            to: from,
            chatId,
            text: `yo so the payment link didnt generate rn... prava sandbox is being weird. but the product is ${selected.product.name} by ${selected.brand.name} for ₹${selected.product.price_inr}. you can grab it from their site directly or try again in a bit`,
          });
        }
        
        // Clear pending, but keep the chat history
        delete state.pendingRecommendations;
        convos.set(from, state);
        
        await stopTyping(chatId);
        return NextResponse.json({ ok: true });
      }
    }

    // ── MAIN BRANCH: regular message → ask Saul ──
    
    // Append user message
    state.messages.push({ role: "user", content: text });
    
    // SAVE IMMEDIATELY SO WE DON'T GET THE GOLDFISH BUG
    convos.set(from, state);
    
    if (chatId) await setTyping(chatId, true).catch(() => {});

    const response = await askSaul(state.messages);
    const aiMessage = response.choices[0].message;
    
    state.messages.push(aiMessage);
    convos.set(from, state);
    
    if (aiMessage.tool_calls && aiMessage.tool_calls.length > 0) {
      const toolCall = aiMessage.tool_calls[0];
      
      if (toolCall.type === "function" && toolCall.function.name === "matchProducts") {
        const args = JSON.parse(toolCall.function.arguments);
        const limit = args.limit || 3;
        
        // EXECUTE MATCH LOCALLY
        const supabase = await createClient();
        
        const [{ data: brands }, { data: products }] = await Promise.all([
          supabase.from("brands").select("*").eq("region", "IN"),
          supabase.from("products").select("*").eq("in_stock", true),
        ]);
        
        if (!brands?.length || !products?.length) {
          await sendMessage({
            to: from,
            chatId,
            text: "damn the catalog is totally empty rn. thats not supposed to happen lol",
          });
          convos.delete(from);
          await stopTyping(chatId);
          return NextResponse.json({ ok: true });
        }
        
        const enrichedBrands = await enrichBrandsWithSensoTrust(brands as any);
        
        const matches = matchProducts(
          products as any,
          enrichedBrands,
          { intent: "match", effect: args.effect, tolerance: args.tolerance, ratioPreference: args.ratioPreference },
          "effect"
        );
        
        const topResults = matches.slice(0, limit);
        
        if (topResults.length === 0) {
          await sendMessage({
            to: from,
            chatId,
            text: "couldnt find anything that matches that vibe tbh. try a different effect maybe?",
          });
          await stopTyping(chatId);
          return NextResponse.json({ ok: true });
        }
        
        // ── Feed results back to Saul so HE writes the recommendation text ──
        const productSummary = topResults.map((match, i) => {
          const sensoReason = match.reasons.find((r: string) => r.startsWith("Senso: "));
          return `${i + 1}. ${match.brand.name} - ${match.product.name} — ₹${match.product.price_inr}${sensoReason ? ` (${sensoReason.replace("Senso: ", "")})` : ""}`;
        }).join("\n");
        
        const optionsText = topResults.length === 1 ? "1" : Array.from({ length: topResults.length }, (_, i) => i + 1).join(" or ");
        
        // Add the tool result to conversation so Saul can respond naturally
        state.messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: `Found ${topResults.length} matches:\n${productSummary}\n\nTell the user about these. End by saying they can reply ${optionsText} to checkout with prava. Keep it casual.`,
        });
        
        // Get Saul's natural response
        const followUp = await askSaul(state.messages);
        const saulResponse = followUp.choices[0].message;
        state.messages.push(saulResponse);
        convos.set(from, state);
        
        const saulText = saulResponse.content || `found ${topResults.length} options for you. reply ${optionsText} to cop one`;
        
        // Send images as photo dump
        const parts: MessagePart[] = [];
        topResults.forEach((match) => {
          const imgPath = productImage(match.brand.id, match.product.name, match.product.image_url);
          const absoluteImgUrl = imgPath.startsWith("http") ? imgPath : `${origin}${imgPath}`;
          parts.push({ type: "media", url: absoluteImgUrl });
        });
        
        // Add Saul's text as the last part
        parts.push({ type: "text", value: saulText });
        
        await sendMessage({
          to: from,
          chatId,
          parts,
        });
        
        // Store recommendations for selection
        state.pendingRecommendations = topResults;
        convos.set(from, state);
        
        await stopTyping(chatId);
        return NextResponse.json({ ok: true });
      } else if (toolCall.type === "function" && toolCall.function.name === "researchBrand") {
        const args = JSON.parse(toolCall.function.arguments);
        const limit = args.limit || 3;
        
        await sendMessage({
          to: from,
          chatId,
          text: `gimme a sec, looking up ${args.brandName}...`,
        });
        
        // Execute research via our internal API endpoint
        const res = await fetch(`${origin}/api/research`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            brandName: args.brandName,
            forceRefresh: args.forceRefresh,
          }),
        });
        
        const data = await res.json();
        
        let content = `Research result for ${args.brandName}:\nStatus: ${data.status}\n`;
        let topResults: any[] = [];
        
        if (data.products && data.products.length > 0) {
          topResults = data.products.slice(0, limit).map((p: any) => ({
            brand: data.brand,
            product: p,
            reasons: ["Brand lookup"]
          }));
          
          content += `Found ${data.products.length} products. Highlights:\n`;
          topResults.forEach((match, i) => {
            content += `${i + 1}. ${match.product.name} (₹${match.product.price_inr || 'TBD'}): ${match.product.description ? match.product.description.substring(0, 100) + '...' : match.product.type}\n`;
          });
        } else {
          content += "No gummies/products found.\n";
        }
        
        if (data.research?.summary) {
          content += `Summary: ${data.research.summary}\n`;
        }
        
        const optionsText = topResults.length === 1 ? "1" : Array.from({ length: topResults.length }, (_, i) => i + 1).join(" or ");
        const followUpInstruction = topResults.length > 0 
          ? `\n\nTell the user what you found and give some details on the products. End by saying they can reply ${optionsText} to checkout with prava. Keep it casual.`
          : "\n\nTell the user what you found in your own words. Keep it casual.";
          
        state.messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: content + followUpInstruction,
        });
        
        // Get Saul's natural response
        const followUp = await askSaul(state.messages);
        const saulResponse = followUp.choices[0].message;
        state.messages.push(saulResponse);
        
        if (topResults.length > 0) {
          // Send images as photo dump
          const parts: MessagePart[] = [];
          topResults.forEach((match) => {
            const imgPath = productImage(match.brand.id, match.product.name, match.product.image_url);
            const absoluteImgUrl = imgPath.startsWith("http") ? imgPath : `${origin}${imgPath}`;
            parts.push({ type: "media", url: absoluteImgUrl });
          });
          
          // Add Saul's text as the last part
          parts.push({ type: "text", value: saulResponse.content || `found some options. reply ${optionsText} to cop one` });
          
          await sendMessage({ to: from, chatId, parts });
          
          // Store recommendations for selection
          state.pendingRecommendations = topResults;
        } else if (saulResponse.content) {
          await sendMessage({ to: from, chatId, text: saulResponse.content });
        }
        
        convos.set(from, state);
        
        await stopTyping(chatId);
        return NextResponse.json({ ok: true });
      } else {
        await sendMessage({
          to: from,
          chatId,
          text: "my bad, my brain short-circuited.",
        });
      }
    } else if (aiMessage.content) {
      await sendMessage({
        to: from,
        chatId,
        text: aiMessage.content,
      });
    }
    
    await stopTyping(chatId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[linq/webhook] error:", e);
    // Explicitly clear typing if something crashes
    if (activeChatId) {
      await stopTyping(activeChatId);
    }
    return NextResponse.json({ ok: true, error: "handled" });
  }
}
