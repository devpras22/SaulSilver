import { NextRequest, NextResponse } from "next/server";
import { parseInbound, sendMessage, setTyping, MessagePart } from "@/lib/linq";
import { askSaul } from "@/lib/saul-agent";
import { createClient } from "@/lib/supabase/server";
import { enrichBrandsWithSensoTrust } from "@/lib/senso-trust";
import { matchProducts } from "@/lib/sommelier";
import { productImage } from "@/lib/utils";
import { productBrief, sortByPotency } from "@/lib/product-brief";
import { createSession } from "@/lib/prava";
import { loadConvo, saveConvo, claimMessageId, type ConvoState } from "@/lib/imessage-store";
import { recordImessageSession } from "@/lib/imessage-sessions";

/**
 * The agent owns the mailbox — order confirmations + tracking route back to
 * Saul's AgentMail inbox, same narrative as the web flow (see chat-client.tsx).
 * iMessage users have no email of their own, so we use this for `userEmail`.
 * Prava keys saved cards on the userId below, not on this email.
 */
const AGENT_INBOX_EMAIL = "saulsilver@agentmail.to";

/**
 * POST /api/linq/webhook — Linq inbound message webhook.
 *
 * This is the iMessage SMS agent entrypoint.
 *
 * IMPORTANT: On Vercel serverless, the runtime can kill the function
 * the instant a Response is returned. So we MUST await setTyping(false)
 * BEFORE every return — never in a finally block.
 *
 * Convo state is persisted in the `imessage_convos` Supabase table (NOT an
 * in-memory Map) — a follow-up reply can hit a different instance, and a
 * process-local Map would silently lose pendingRecommendations. Every state
 * mutation is followed by saveConvo().
 */

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

    const { from, text, chatId, messageId } = parsed;
    activeChatId = chatId;

    // ── ATOMIC IDEMPOTENCY CLAIM (the actual triple-send fix) ──
    // Root cause: this webhook does 10-20s of work (Supabase round-trips +
    // 2 OpenAI calls + Senso + image fetches + sendMessage) before returning
    // 200. Linq's webhook timeout is 10s, so it RETRIES while the first
    // invocation is still running — each retry sent a fresh response → the
    // user got 3 identical image+text bubbles. The OLD racy read-then-write
    // guard (load → compare → save) let all concurrent retries through because
    // they all read the stale state before any of them wrote.
    //
    // This claim is a single Postgres RPC (claim_imessage_message_id) that
    // does a compare-and-set under a row lock. Only ONE concurrent caller wins;
    // the rest get false and bail instantly. Race-proof.
    const won = await claimMessageId(from, messageId);
    if (!won) {
      console.log(`[linq/webhook] duplicate ${messageId} lost the race — skipping`);
      return NextResponse.json({ ok: true, deduplicated: true });
    }

    // FETCH OR INITIALIZE PERSISTENT STATE (Supabase, not in-memory).
    const state: ConvoState = await loadConvo(from);

    // Update chatId just in case it changed
    if (chatId) state.chatId = chatId;
    
    // ── SELECTION BRANCH: user replied 1/2/3 to pick a recommendation ──
    if (state.pendingRecommendations && /^\d+$/.test(text.trim())) {
      const selectedIndex = parseInt(text.trim()) - 1;
      const count = state.pendingRecommendations.length;

      // Out of range: tell them how many we actually sent. DON'T fall through
      // to the LLM with "3" (that would ask Saul about gummies for "3").
      if (selectedIndex < 0 || selectedIndex >= count) {
        const valid = count === 1 ? "1" : Array.from({ length: count }, (_, i) => i + 1).join(" or ");
        await sendMessage({
          to: from,
          chatId,
          text: `i only sent you ${count} option${count === 1 ? "" : "s"} lol. reply ${valid}`,
        });
        await stopTyping(chatId);
        return NextResponse.json({ ok: true });
      }

      const selected = state.pendingRecommendations[selectedIndex];
      if (chatId) await setTyping(chatId, true).catch(() => {});

      // Create a real Prava session — same code path the web app uses
      // (/api/pay → createSession). Returns iframe_url = Prava's hosted
      // checkout, which we send as an iMessage Rich Link. The OLD code here
      // called the Linq Payments API instead and never touched Prava — that's
      // why the checkout link never came through.
      //
      // userId is phone-derived so Prava recognizes a returning iMessage user
      // and surfaces their saved card next time (same role Supabase user.id
      // plays on web). merchantUrl pins the real destination merchant so the
      // virtual card is genuinely scoped to the checkout target (Step 5 req).
      let session;
      try {
        session = await createSession({
          userId: `imessage_${from}`,
          userEmail: AGENT_INBOX_EMAIL,
          totalAmount: selected.product.price_inr.toFixed(2),
          currency: "INR",
          description: `Order: ${selected.product.name}`,
          merchantName: selected.brand.name,
          merchantUrl: selected.brand.website || origin,
          merchantCountryIso2: "IN",
          productDescription: `${selected.product.name} — ${selected.brand.name}`,
        });
      } catch (e) {
        const reason = e instanceof Error ? e.message : "unknown error";
        console.error("[linq/webhook] prava createSession failed:", reason);
        await sendMessage({
          to: from,
          chatId,
          text: `yo the checkout link didnt generate rn — prava said: ${reason}. the product is ${selected.product.name} by ${selected.brand.name} for ₹${selected.product.price_inr}. try again in a bit`,
        });
        delete state.pendingRecommendations;
        await saveConvo(state);
        await stopTyping(chatId);
        return NextResponse.json({ ok: true });
      }

      // Send the Prava hosted checkout as a Rich Link preview card.
      // NOTE: Linq link parts take the URL in `value`, NOT `url` (media parts
      // use `url`). Using `url` here → 1005 "link part must have a non-empty
      // value" and the link never sends. Confirmed against the Linq docs.
      await sendMessage({
        to: from,
        chatId,
        parts: [{ type: "link", value: session.iframe_url }],
      });

      // Record the session so the cron poller can watch payment-result and
      // report the outcome to Prava (iMessage has no client-side completion
      // callback — checkout happens out-of-band in the browser sheet).
      await recordImessageSession({
        sessionId: session.session_id,
        phone: from,
        chatId: chatId ?? state.chatId,
        productName: selected.product.name,
        brandName: selected.brand.name,
        amountInr: selected.product.price_inr,
      }).catch((e) =>
        console.warn("[linq/webhook] recordImessageSession failed:", e instanceof Error ? e.message : e)
      );

      // Follow up with a casual text.
      await sendMessage({
        to: from,
        chatId,
        text: `thats ur secure checkout for the ${selected.product.name} 🔒 tap it and prava handles the rest. ur card info never touches us`,
      });

      // Clear pending, but keep the chat history.
      delete state.pendingRecommendations;
      await saveConvo(state);

      await stopTyping(chatId);
      return NextResponse.json({ ok: true });
    }

    // ── MAIN BRANCH: regular message → ask Saul ──
    
    // Append user message
    state.messages.push({ role: "user", content: text });

    // SAVE IMMEDIATELY SO WE DON'T GET THE GOLDFISH BUG
    await saveConvo(state);

    if (chatId) await setTyping(chatId, true).catch(() => {});

    const response = await askSaul(state.messages);
    const aiMessage = response.choices[0].message;

    state.messages.push(aiMessage);
    await saveConvo(state);
    
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
          await saveConvo({ ...state, pendingRecommendations: undefined });
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

        // ── Potency override ──
        // matchProducts ranks by effect/trust/budget — it has no concept of
        // "strongest." When the user asks for most THC / strongest / highest mg,
        // re-sort the candidates by potency-per-gummy BEFORE slicing to `limit`.
        // Without this, "strongest gummy" returns whatever ranked #1 on effect.
        const wantsPotency = /\b(strong|strongest|most thc|highest|potent|heaviest|kick|hard(?:est) hitt)\b/i.test(text);
        const rankedForUser = wantsPotency ? sortByPotency(matches) : matches;
        const topResults = rankedForUser.slice(0, limit);

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
        // Each product gets its FULL brief (strength, ingredients, effects,
        // reviews, safety, trust) — so Saul can answer ANY follow-up question
        // (strongest? Ashwagandha? reviews? side effects?) from the data,
        // instead of going blind on name+price only.
        const productSummary = topResults.map((match, i) => {
          const sensoReason = match.reasons.find((r: string) => r.startsWith("Senso: "));
          const brief = productBrief(match.product, match.brand);
          return `${i + 1}. ${match.brand.name} - ${match.product.name}\n  ${brief}${sensoReason ? `\n  senso: ${sensoReason.replace("Senso: ", "")}` : ""}`;
        }).join("\n\n");
        
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
        await saveConvo(state);

        const saulText = saulResponse.content || `found ${topResults.length} options for you. reply ${optionsText} to cop one`;

        // IMAGE FIRST, then text — how a friend sends a rec. Two separate
        // sendMessage calls because Linq splits a multi-part blob into separate
        // bubbles anyway; sending them explicitly keeps the order predictable.
        const images: MessagePart[] = topResults.map((match) => {
          const imgPath = productImage(match.brand.id, match.product.name, match.product.image_url);
          const absoluteImgUrl = imgPath.startsWith("http") ? imgPath : `${origin}${imgPath}`;
          return { type: "media", url: absoluteImgUrl };
        });
        if (images.length > 0) {
          await sendMessage({ to: from, chatId, parts: images });
        }

        // Then Saul's text reply.
        await sendMessage({ to: from, chatId, text: saulText });
        
        // Store recommendations for selection
        state.pendingRecommendations = topResults;
        await saveConvo(state);

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
          // ── Potency-aware ordering ──
          // researchBrand returns products in scrape order. When the user asks
          // for "strongest" / "most THC," sort by mg/gummy FIRST so the top N
          // are genuinely the strongest. Previously we sliced in scrape order,
          // which is why "strongest from the trost" returned a 5% beginner
          // gummy instead of the 13% heavy one.
          const wantsPotency =
            /\b(strong|strongest|most thc|highest|potent|heaviest|kick|hard(?:est) hitt)\b/i.test(text);
          const ordered = wantsPotency
            ? sortByPotency(data.products.map((p: any) => ({ product: p }))).map((x) => x.product)
            : data.products;

          topResults = ordered.slice(0, limit).map((p: any) => ({
            brand: data.brand,
            product: p,
            reasons: ["Brand lookup"]
          }));

          content += `Found ${data.products.length} products${wantsPotency ? " (sorted strongest first)" : ""}. Full details:\n`;
          // Full brief per product — strength, ingredients, effects, reviews,
          // safety, trust. This is what lets Saul answer "strongest?",
          // "Ashwagandha?", "what do reviews say?" all from the same data.
          topResults.forEach((match, i) => {
            const brief = productBrief(match.product, data.brand, data.research);
            content += `${i + 1}. ${match.product.name}\n  ${brief}\n`;
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
          // IMAGE FIRST, then text — see matchProducts branch for rationale.
          const images: MessagePart[] = topResults.map((match) => {
            const imgPath = productImage(match.brand.id, match.product.name, match.product.image_url);
            const absoluteImgUrl = imgPath.startsWith("http") ? imgPath : `${origin}${imgPath}`;
            return { type: "media", url: absoluteImgUrl };
          });
          if (images.length > 0) {
            await sendMessage({ to: from, chatId, parts: images });
          }
          await sendMessage({ to: from, chatId, text: saulResponse.content || `found some options. reply ${optionsText} to cop one` });
          
          // Store recommendations for selection
          state.pendingRecommendations = topResults;
        } else if (saulResponse.content) {
          await sendMessage({ to: from, chatId, text: saulResponse.content });
        }

        await saveConvo(state);

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
