import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { listCards, IS_MOCK } from "@/lib/prava";

/**
 * POST /api/wallet/sync-cards
 *
 * After a successful enrollment, fetch the user's cards from Prava (listCards)
 * and upsert them into our wallet_cards table. We store ONLY the card_id +
 * display metadata (last4, brand) — never the PAN.
 *
 * This runs server-side because listCards requires the secret key.
 */
export async function POST() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "not authenticated" }, { status: 401 });

    if (IS_MOCK) {
      // No real cards in mock mode
      return NextResponse.json({ synced: 0, mock: true });
    }

    const pravaCards = await listCards(user.id);

    // Upsert each card into wallet_cards ( keyed by prava_card_id per user )
    for (const c of pravaCards) {
      // Check if we already have this card
      const { data: existing } = await supabase
        .from("wallet_cards")
        .select("id")
        .eq("user_id", user.id)
        .eq("prava_card_id", c.card_id)
        .maybeSingle();

      if (existing) {
        // Update display metadata
        await supabase
          .from("wallet_cards")
          .update({
            last4: c.card_last4,
            brand: c.card_brand,
            exp_month: c.card_exp_month,
            exp_year: c.card_exp_year,
          })
          .eq("id", existing.id);
      } else {
        // Count existing to set is_default on first card
        const { count } = await supabase
          .from("wallet_cards")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id);

        await supabase.from("wallet_cards").insert({
          user_id: user.id,
          prava_card_id: c.card_id,
          last4: c.card_last4,
          brand: c.card_brand,
          exp_month: c.card_exp_month,
          exp_year: c.card_exp_year,
          is_default: (count ?? 0) === 0,
        });
      }
    }

    return NextResponse.json({ synced: pravaCards.length });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("[wallet/sync-cards]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
