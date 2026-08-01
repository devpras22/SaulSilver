import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { deleteCard, listCards, IS_MOCK } from "@/lib/prava";

/**
 * Wallet cards — the saved-card references.
 *
 * GET    /api/wallet/cards        → list cards (merged from Prava's vault + our DB)
 * POST   /api/wallet/cards        → save a newly enrolled card_id
 * DELETE /api/wallet/cards?id=X   → remove a card (from Prava AND our DB)
 *
 * We store ONLY the Prava card_id + last4/brand for display. Never the PAN.
 */

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "not authenticated" }, { status: 401 });

    // Pull from Prava's vault (source of truth) and our DB.
    // Prava cards are the real list — our DB just tracks which we've synced.
    // Cards that failed mid-enrollment (no passkey) still exist in Prava but
    // may not be in our DB, so we merge by prava_card_id.
    const pravaCards = IS_MOCK ? [] : await listCards(user.id).catch(() => []);

    const { data: dbCards } = await supabase
      .from("wallet_cards")
      .select("id, prava_card_id, last4, brand, exp_month, exp_year, is_default, created_at")
      .order("created_at", { ascending: false });

    const dbByCardId = new Map((dbCards ?? []).map((c) => [c.prava_card_id, c]));

    // Merge: Prava cards first (the real list), then any DB cards not in Prava.
    const merged = pravaCards.map((pc) => {
      const db = dbByCardId.get(pc.card_id);
      return {
        id: db?.id ?? `prava_${pc.card_id}`,
        prava_card_id: pc.card_id,
        last4: pc.card_last4 ?? db?.last4 ?? null,
        brand: pc.card_brand ?? db?.brand ?? null,
        exp_month: pc.card_exp_month ?? db?.exp_month ?? null,
        exp_year: pc.card_exp_year ?? db?.exp_year ?? null,
        is_default: db?.is_default ?? false,
        // Flag cards that are in Prava but not our DB (orphaned — e.g. failed enrollment)
        orphaned: !db,
      };
    });

    // Add DB cards that Prava doesn't know about (shouldn't normally happen)
    for (const dbCard of dbCards ?? []) {
      if (!pravaCards.some((pc) => pc.card_id === dbCard.prava_card_id)) {
        merged.push({
          id: dbCard.id,
          prava_card_id: dbCard.prava_card_id,
          last4: dbCard.last4,
          brand: dbCard.brand,
          exp_month: dbCard.exp_month,
          exp_year: dbCard.exp_year,
          is_default: dbCard.is_default,
          orphaned: false,
        });
      }
    }

    return NextResponse.json({ cards: merged });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("[wallet/cards GET]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "not authenticated" }, { status: 401 });

    const { cardId, last4, brand, expMonth, expYear } = (await req.json()) as {
      cardId: string;
      last4?: string;
      brand?: string;
      expMonth?: number;
      expYear?: number;
    };

    if (!cardId) return NextResponse.json({ error: "cardId required" }, { status: 400 });

    // First card saved → default. Otherwise non-default.
    const { count } = await supabase
      .from("wallet_cards")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id);

    const { data, error } = await supabase
      .from("wallet_cards")
      .insert({
        user_id: user.id,
        prava_card_id: cardId,
        last4,
        brand,
        exp_month: expMonth,
        exp_year: expYear,
        is_default: (count ?? 0) === 0,
      })
      .select("id")
      .single();

    if (error) throw error;
    return NextResponse.json({ id: data.id });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("[wallet/cards POST]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "not authenticated" }, { status: 401 });

    const id = new URL(req.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    // Two cases:
    //   1. Orphaned card (id starts with "prava_") — exists only in Prava's
    //      vault, never synced to our DB. The card_id is the rest of the id.
    //   2. DB card (uuid) — look up prava_card_id, then delete from both.
    let pravaCardId: string | null = null;

    if (id.startsWith("prava_")) {
      pravaCardId = id.slice("prava_".length);
    } else {
      const { data: card } = await supabase
        .from("wallet_cards")
        .select("prava_card_id")
        .eq("id", id)
        .eq("user_id", user.id)
        .maybeSingle();
      pravaCardId = card?.prava_card_id ?? null;
    }

    // Delete from Prava's vault (best-effort — don't block DB cleanup on it).
    // This retires the network token so it stops showing up / failing.
    if (pravaCardId && !IS_MOCK) {
      try {
        await deleteCard(user.id, pravaCardId);
      } catch (e) {
        console.warn("[wallet/cards DELETE] Prava delete failed (continuing):", e instanceof Error ? e.message : e);
      }
    }

    // Delete from our DB if it exists there
    if (!id.startsWith("prava_")) {
      const { error } = await supabase
        .from("wallet_cards")
        .delete()
        .eq("id", id)
        .eq("user_id", user.id);
      if (error) throw error;
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("[wallet/cards DELETE]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
