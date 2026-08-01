import { createClient } from "@/lib/supabase/server";
import AppChat from "./chat-client";

/**
 * Server wrapper — reads the saved delivery address from user_metadata (with a
 * fallback to the most recent order's address) and passes it to the client chat
 * so the agent can decide whether to ask for an address or use the one on file.
 *
 * The `key` on AppChat forces a FULL remount when the URL query changes
 * (e.g. /app → /app?new=1). This guarantees "New chat" wipes all live state —
 * no reliance on effects re-firing or searchParams reference changes.
 */
export default async function AppPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string; chat?: string }>;
}) {
  const params = await searchParams;
  // Compose a key from the query so any of these triggers a clean remount:
  //   ?new=1  → fresh chat
  //   ?chat=X → load historical chat X
  const chatKey = params.new ? "new" : params.chat ? `chat-${params.chat}` : "default";

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

  return <AppChat key={chatKey} savedAddress={savedAddress} />;
}
