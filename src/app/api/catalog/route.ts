import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/catalog
 *
 * Returns the full public catalog — brands + their products.
 * Powers the "just buy it" browse door and the brand marquee on the landing.
 *
 * Public read (anon key, RLS allows it).
 */
export async function GET(_req: NextRequest) {
  try {
    const supabase = await createClient();

    const [{ data: brands }, { data: products }] = await Promise.all([
      supabase.from("brands").select("*").order("trust_score", { ascending: false }),
      supabase.from("products").select("*").order("price_inr", { ascending: true }),
    ]);

    return NextResponse.json({
      brands: brands ?? [],
      products: products ?? [],
      total_brands: brands?.length ?? 0,
      total_products: products?.length ?? 0,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("[/api/catalog]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
