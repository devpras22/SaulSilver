/**
 * iMessage Prava session ledger.
 *
 * When the webhook creates a Prava session and sends the iframe_url to iMessage,
 * it records a row here. The cron poller (/api/linq/cron) walks rows in
 * status='awaiting', calls Prava payment-result, reports the outcome, and sends
 * the user a confirmation text. iMessage has no client-side completion callback
 * (the user checks out in a browser sheet), so this is how we close the loop.
 */
import { createServiceRoleClient } from "@/lib/supabase/server";

export interface ImessionRecord {
  sessionId: string;
  phone: string;
  chatId: string;
  productName: string;
  brandName: string;
  amountInr: number;
}

/** Insert a fresh awaiting row. Best-effort — webhook must not fail on a DB hiccup. */
export async function recordImessageSession(input: ImessionRecord): Promise<void> {
  const admin = createServiceRoleClient();
  const { error } = await admin.from("imessage_sessions").upsert(
    {
      session_id: input.sessionId,
      phone: input.phone,
      chat_id: input.chatId || null,
      product_name: input.productName,
      brand_name: input.brandName,
      amount_inr: input.amountInr,
      status: "awaiting",
      txn_ref_id: null,
      reported_status: null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "session_id" }
  );
  if (error) console.warn("[imessage-sessions] insert failed:", error.message);
}

export interface OpenSession {
  session_id: string;
  phone: string;
  chat_id: string | null;
  product_name: string | null;
  brand_name: string | null;
  amount_inr: number | null;
  created_at: string;
}

/** All sessions still awaiting an out-of-band checkout result. */
export async function listOpenSessions(): Promise<OpenSession[]> {
  const admin = createServiceRoleClient();
  const { data, error } = await admin
    .from("imessage_sessions")
    .select("session_id, phone, chat_id, product_name, brand_name, amount_inr, created_at")
    .eq("status", "awaiting")
    .order("created_at", { ascending: true });

  if (error) {
    console.warn("[imessage-sessions] list open failed:", error.message);
    return [];
  }
  return (data ?? []) as OpenSession[];
}

/** Mark a session terminal — record what we told Prava. */
export async function markReported(
  sessionId: string,
  txnRefId: string,
  reportedStatus: "APPROVED" | "DECLINED"
): Promise<void> {
  const admin = createServiceRoleClient();
  const { error } = await admin
    .from("imessage_sessions")
    .update({
      status: "reported",
      txn_ref_id: txnRefId,
      reported_status: reportedStatus,
      updated_at: new Date().toISOString(),
    })
    .eq("session_id", sessionId);
  if (error) console.warn("[imessage-sessions] markReported failed:", error.message);
}

/** Give up on a session that never reached a terminal state (TTL expiry). */
export async function markAbandoned(sessionId: string): Promise<void> {
  const admin = createServiceRoleClient();
  const { error } = await admin
    .from("imessage_sessions")
    .update({ status: "abandoned", updated_at: new Date().toISOString() })
    .eq("session_id", sessionId);
  if (error) console.warn("[imessage-sessions] markAbandoned failed:", error.message);
}
