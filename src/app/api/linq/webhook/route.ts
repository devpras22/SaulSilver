import { NextRequest, NextResponse } from "next/server";
import { parseInbound, sendMessage, setTyping } from "@/lib/linq";
import { askSaul } from "@/lib/saul-agent";
import OpenAI from "openai";

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
    const state = convos.get(from) ?? { chatId, messages: [] };

    // Update chatId just in case
    if (chatId) state.chatId = chatId;
    
    // Append user message
    state.messages.push({ role: "user", content: text });
    
    // Set typing indicator
    if (chatId) await setTyping(chatId, true).catch(() => {});

    const response = await askSaul(state.messages);
    const aiMessage = response.choices[0].message;
    
    state.messages.push(aiMessage);
    
    if (aiMessage.tool_calls && aiMessage.tool_calls.length > 0) {
      const toolCall = aiMessage.tool_calls[0];
      
      if (toolCall.type === "function" && toolCall.function.name === "matchProducts") {
        const args = JSON.parse(toolCall.function.arguments);
        
        // Instead of processing everything here, we tell the user to check out their matches
        // and send a deep link to our app where Prava handles the rest.
        // We could also run matchProducts locally here and send an image card, but a deep link
        // provides the beautiful glassmorphism UI the user wants.
        const urlArgs = new URLSearchParams(args).toString();
        const checkoutLink = `https://saul.pras.fun/app?${urlArgs}`;
        
        await sendMessage({
          to: from,
          chatId,
          text: `I've found the perfect matches based on Senso trust data. Tap here to view them and checkout securely with Prava: ${checkoutLink}`,
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
      convos.set(from, state);
    }
    
    if (chatId) await setTyping(chatId, false).catch(() => {});
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[linq/webhook] error:", e);
    return NextResponse.json({ ok: true, error: "handled" });
  }
}
