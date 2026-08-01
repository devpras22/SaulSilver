import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { matchProducts } from "@/lib/sommelier";
import type { CannabisPriority, UserProfile } from "@/lib/types";

/**
 * POST /api/match
 *
 * The sommelier's recommendation engine. Takes the user's interview profile
 * and returns ranked product matches with reasons.
 *
 * Body: { profile: UserProfile, priority?: CannabisPriority }
 * Returns: { matches: ProductMatch[], total: number }
 *
 * Reads the public catalog (anon key — RLS allows public read on brands/products).
 */
export async function POST(req: NextRequest) {
  try {
    const { profile, priority } = (await req.json()) as {
      profile: UserProfile;
      priority?: CannabisPriority;
    };

    if (!profile || !profile.intent) {
      return NextResponse.json({ error: "profile.intent is required" }, { status: 400 });
    }

    const supabase = await createClient();

    // ── Pull the public catalog ──
    const [{ data: brands }, { data: products }] = await Promise.all([
      supabase.from("brands").select("*").eq("region", profile.region ?? "IN"),
      supabase.from("products").select("*").eq("in_stock", true),
    ]);

    if (!brands?.length || !products?.length) {
      return NextResponse.json({
        matches: [],
        total: 0,
        empty: true,
        message: "The catalog's empty. Be the first to add a brand — tell me one and I'll research it.",
      });
    }

    const matches = matchProducts(
      products as unknown as Parameters<typeof matchProducts>[0],
      brands as unknown as Parameters<typeof matchProducts>[1],
      profile,
      priority ?? "effect"
    );

    return NextResponse.json({
      matches: matches.slice(0, 5), // top 5
      total: matches.length,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("[/api/match]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
