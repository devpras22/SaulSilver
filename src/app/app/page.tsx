import { createClient } from "@/lib/supabase/server";
import AppChat from "./chat-client";
import type { Intent } from "@/lib/types";

/**
 * Server wrapper — reads the saved delivery address from user_metadata (with a
 * fallback to the most recent order's address) and passes it to the client chat.
 * Also reads the `intent` param (?intent=match|verify|browse) from the landing
 * page CTAs so the sommelier opens with the right framing.
 *
 * The `key` on AppChat forces a FULL remount when the URL query changes.
 */
export default async function AppPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string; chat?: string; intent?: string }>;
}) {
  const params = await searchParams;
  const chatKey = params.new ? "new" : params.chat ? `chat-${params.chat}` : "default";
  const intent = (["match", "verify", "browse"].includes(params.intent ?? "")
    ? params.intent
    : "match") as Intent;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let savedAddress: string | null = null;
  if (user) {
    savedAddress = (user.user_metadata?.default_address as string | undefined) ?? null;
    if (!savedAddress) {
      const { data: recentOrder } = await supabase
        .from("orders")
        .select("address")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      savedAddress = (recentOrder as { address?: string } | null)?.address ?? null;
    }
  }

  return <AppChat key={chatKey} savedAddress={savedAddress} intent={intent} />;
}

