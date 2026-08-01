/**
 * Browser Supabase client.
 * Uses the anon key (NEXT_PUBLIC_) — protected by RLS. Safe to ship to client.
 */
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
