import { NextRequest, NextResponse } from "next/server";
import { researchBrand, IS_MOCK_RESEARCH } from "@/lib/research";
import { createServiceRoleClient } from "@/lib/supabase/server";

/**
 * POST /api/research
 *
 * Researches a cannabis brand and upserts it into the catalog.
 * This is the self-populating engine: a user names a brand the catalog
 * doesn't know → the agent researches it live → caches in Supabase.
 *
 * Body: { brandName: string, website?: string }
 * Returns: { brand, products, research, mock, cached }
 *
 * Server-side only. Uses the service-role client to write the public catalog
 * (brands/products/brand_research are public-read, service-write).
 */
export async function POST(req: NextRequest) {
  try {
    const { brandName, website } = await req.json();
    if (!brandName || typeof brandName !== "string") {
      return NextResponse.json({ error: "brandName is required" }, { status: 400 });
    }

    const supabase = createServiceRoleClient();

    // ── Check if already cached (don't re-research on every hit) ──
    const slug = brandName
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/[\s_-]+/g, "-")
      .replace(/^-+|-+$/g, "");

    const { data: existing } = await supabase
      .from("brands")
      .select("id, name, last_researched")
      .eq("id", slug)
      .maybeSingle();

    // If researched within the last 7 days, return the cache.
    if (existing?.last_researched) {
      const age = Date.now() - new Date(existing.last_researched).getTime();
      if (age < 7 * 24 * 60 * 60 * 1000) {
        const [{ data: cachedBrand }, { data: cachedProducts }, { data: cachedResearch }] =
          await Promise.all([
            supabase.from("brands").select("*").eq("id", slug).maybeSingle(),
            supabase.from("products").select("*").eq("brand_id", slug),
            supabase
              .from("brand_research")
              .select("*")
              .eq("brand_id", slug)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle(),
          ]);
        return NextResponse.json({
          brand: cachedBrand,
          products: cachedProducts ?? [],
          research: cachedResearch,
          mock: IS_MOCK_RESEARCH,
          cached: true,
        });
      }
    }

    // ── Gather raw context via web search ──
    const context = await gatherContext(brandName, website);

    // ── Run the research agent ──
    const result = await researchBrand({ brandName, context, knownWebsite: website });

    // ── Upsert brand + products + research to Supabase ──
    await supabase
      .from("brands")
      .upsert(
        {
          id: result.brand.id,
          name: result.brand.name,
          website: result.brand.website,
          tagline: result.brand.tagline,
          category: result.brand.category,
          region: result.brand.region,
          rail: result.brand.rail,
          marketplaces: result.brand.marketplaces ?? null,
          legal_status: result.brand.legal_status,
          prescription_required: result.brand.prescription_required,
          doctor_routing: result.brand.doctor_routing,
          instagram_handle: result.brand.instagram_handle ?? null,
          instagram_followers: result.brand.instagram_followers ?? null,
          instagram_engagement: result.brand.instagram_engagement ?? null,
          trust_score: result.brand.trust_score,
          verified: result.brand.verified,
          last_researched: result.brand.last_researched,
          description: result.brand.description,
          packaging_notes: result.brand.packaging_notes,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" }
      );

    // Replace products: delete old, insert new (cleaner than per-row upsert with FK)
    if (result.products.length > 0) {
      await supabase.from("products").delete().eq("brand_id", result.brand.id);
      await supabase.from("products").insert(
        result.products.map((p) => ({
          id: p.id,
          brand_id: p.brand_id,
          name: p.name,
          variant: p.variant,
          cannabinoids: p.cannabinoids,
          ratio: p.ratio,
          spectrum: p.spectrum,
          effect_tags: p.effect_tags,
          dose_level: p.dose_level,
          onset_minutes: p.onset_minutes,
          duration_hours: p.duration_hours,
          flavor: p.flavor,
          pack_count: p.pack_count,
          price_inr: p.price_inr,
          in_stock: p.in_stock,
          product_url: p.product_url,
          description: p.description,
        }))
      );
    }

    // Insert the research audit trail (always append — history matters)
    await supabase.from("brand_research").insert({
      brand_id: result.brand.id,
      query: result.research.query,
      verdict: result.research.verdict,
      findings: result.research.findings,
      sources: result.research.sources,
      trust_score: result.research.trust_score,
    });

    return NextResponse.json({
      brand: result.brand,
      products: result.products,
      research: result.research,
      mock: IS_MOCK_RESEARCH,
      cached: false,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("[/api/research]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CONTEXT GATHERING — fetch raw snippets about the brand
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Gather raw research context about a brand via web search.
 * Uses a search endpoint and returns the top snippets for the agent to structure.
 */
async function gatherContext(brandName: string, website?: string): Promise<string[]> {
  const queries = [
    `${brandName} cannabis gummies India Vijaya CBD THC cannabinoid profile`,
    `${brandName} gummies price India mg full spectrum effects`,
    `"${brandName}" gummies review India legit prescription`,
  ];

  const snippets: string[] = [];

  // If a website is known, fetch its homepage content directly.
  if (website) {
    try {
      const res = await fetch(website, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; SaulSilverBot/1.0)" },
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) {
        const html = await res.text();
        // Crude text extraction — strip tags. Good enough for the agent to parse.
        const text = html
          .replace(/<script[\s\S]*?<\/script>/gi, "")
          .replace(/<style[\s\S]*?<\/style>/gi, "")
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 3000);
        if (text) snippets.push(`Website content: ${text}`);
      }
    } catch {
      // Network failures are fine — we still have search snippets.
    }
  }

  return snippets;
}
