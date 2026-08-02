/**
 * iMessage conversation persistence.
 *
 * Replaces the in-memory `convos` Map in /api/linq/webhook. On Vercel a
 * follow-up reply can hit a different serverless instance — a process-local
 * Map wouldn't have it, so "reply 1/2/3" silently lost state. This reads /
 * writes Supabase instead, so convo state survives across instances + restarts.
 *
 * Mirrors the checkout_otp_handoff pattern: service-role client (bypasses RLS),
 * keyed by sender phone. No client ever touches these rows.
 */
import OpenAI from "openai";
import { createServiceRoleClient } from "@/lib/supabase/server";

export interface PendingRec {
  brand: { id: string; name: string; website?: string | null };
  product: {
    id: string;
    name: string;
    price_inr: number;
    image_url?: string | null;
  };
  reasons: string[];
}

export interface ConvoState {
  phone: string;
  chatId: string;
  messages: OpenAI.Chat.ChatCompletionMessageParam[];
  pendingRecommendations?: PendingRec[];
}

type RecRow = {
  phone: string;
  chat_id: string | null;
  messages: unknown;
  pending_recs: unknown;
};

/** Load a convo by sender phone, or return a fresh empty state. */
export async function loadConvo(phone: string): Promise<ConvoState> {
  const admin = createServiceRoleClient();
  const { data, error } = await admin
    .from("imessage_convos")
    .select("phone, chat_id, messages, pending_recs")
    .eq("phone", phone)
    .maybeSingle();

  // Table missing / not yet migrated — degrade to fresh in-memory state so the
  // webhook still works (recommendations just won't persist across cold starts).
  if (error || !data) {
    if (error) console.warn("[imessage-store] load failed, using fresh state:", error.message);
    return { phone, chatId: "", messages: [] };
  }

  const row = data as RecRow;
  const pending = Array.isArray(row.pending_recs) ? (row.pending_recs as PendingRec[]) : undefined;
  return {
    phone,
    chatId: row.chat_id ?? "",
    messages: (row.messages as OpenAI.Chat.ChatCompletionMessageParam[]) ?? [],
    pendingRecommendations: pending,
  };
}

/** Upsert the full convo state. Called after every state mutation in the webhook. */
export async function saveConvo(state: ConvoState): Promise<void> {
  const admin = createServiceRoleClient();
  const { error } = await admin.from("imessage_convos").upsert(
    {
      phone: state.phone,
      chat_id: state.chatId || null,
      messages: state.messages as unknown as Record<string, unknown>,
      pending_recs: (state.pendingRecommendations ?? null) as unknown as Record<string, unknown>,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "phone" }
  );
  if (error) console.warn("[imessage-store] save failed:", error.message);
}

/** Drop the pending recommendations (keeps chat history). */
export async function clearPendingRecs(phone: string): Promise<void> {
  const admin = createServiceRoleClient();
  await admin.from("imessage_convos").upsert(
    { phone, pending_recs: null, updated_at: new Date().toISOString() },
    { onConflict: "phone" }
  );
}
