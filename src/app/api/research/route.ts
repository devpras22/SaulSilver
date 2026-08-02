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
          support_email: result.brand.support_email ?? null,
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
      const { error: prodError } = await supabase.from("products").insert(
        result.products.map((p) => ({
          brand_id: p.brand_id,
          name: p.name,
          variant: p.variant ?? null,
          cannabinoids: p.cannabinoids ?? {},
          ratio: p.ratio ?? null,
          spectrum: p.spectrum ?? null,
          effect_tags: p.effect_tags,
          dose_level: p.dose_level,
          onset_minutes: p.onset_minutes ?? null,
          duration_hours: p.duration_hours ?? null,
          flavor: p.flavor ?? null,
          pack_count: p.pack_count,
          price_inr: p.price_inr,
          in_stock: p.in_stock,
          product_url: p.product_url ?? null,
          description: p.description ?? null,
        }))
      );
      if (prodError) {
        console.error("[/api/research] product insert failed:", prodError.message);
      }
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
 * Gather raw research context about a brand.
 * Crawls the homepage + likely product/collection pages and extracts readable text.
 * This is what the agent parses to extract cannabinoid mg, prices, pack counts.
 */
async function gatherContext(brandName: string, website?: string): Promise<string[]> {
  const snippets: string[] = [];
  if (!website) return snippets;

  // Pages most likely to contain product detail (Shopify/WooCommerce/most D2C).
  const candidates = [
    website,
    `${website.replace(/\/$/, "")}/collections/all`,
    `${website.replace(/\/$/, "")}/collections/gummies`,
    `${website.replace(/\/$/, "")}/products`,
    `${website.replace(/\/$/, "")}/collections`,
    `${website.replace(/\/$/, "")}/shop`,
  ];

  // Fetch homepage + first 2 collection pages that resolve.
  const fetched = await Promise.allSettled(
    candidates.slice(0, 3).map((url) => fetchPage(url))
  );

  let pagesFetched = 0;
  for (let i = 0; i < fetched.length && pagesFetched < 3; i++) {
    const r = fetched[i];
    if (r.status === "fulfilled" && r.value) {
      snippets.push(r.value);
      pagesFetched++;
    }
  }

  // If the homepage had product links, follow the first couple for real detail.
  if (snippets.length > 0) {
    const productLinks = extractProductLinks(snippets[0], website);
    const detailPages = await Promise.allSettled(
      productLinks.slice(0, 4).map((url) => fetchPage(url))
    );
    for (const r of detailPages) {
      if (r.status === "fulfilled" && r.value) {
        snippets.push(r.value);
      }
    }
  }

  return snippets;
}

/** Fetch a URL, extract readable text + structured data for the agent. */
async function fetchPage(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; SaulSilverBot/1.0)" },
      signal: AbortSignal.timeout(8000),
      redirect: "follow",
    });
    if (!res.ok) return null;
    const html = await res.text();

    // 1. Capture JSON-LD structured data BEFORE stripping scripts —
    //    Shopify/WooCommerce put clean product schemas (price, name, desc) here.
    const ldBlocks: string[] = [];
    const ldRegex = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
    let ldMatch: RegExpExecArray | null;
    while ((ldMatch = ldRegex.exec(html)) !== null) {
      const block = ldMatch[1].trim();
      if (block.includes("Product") || block.includes("price") || block.includes("Offer")) {
        ldBlocks.push(block.slice(0, 800));
      }
    }

    // 2. Capture price patterns explicitly — they get mangled by tag stripping.
    const priceMatches = html.match(/[₹$]\s?[0-9][0-9,]*\.?[0-9]{0,2}/g) ?? [];

    // 3. Capture mg/dosage patterns — "175mg", "5mg THC", "100 mg CBD".
    const mgMatches = html.match(/\b[0-9]{1,4}\s?mg\b(?:\s?(?:THC|CBD|CBN|CBG|Vijaya|cannabis))?/gi) ?? [];

    // 4. Strip to readable text.
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 2000);

    const parts: string[] = [url];
    if (ldBlocks.length > 0) parts.push(`Structured product data:\n${ldBlocks.join("\n")}`);
    if (priceMatches.length > 0) parts.push(`Prices found: ${[...new Set(priceMatches)].slice(0, 15).join(", ")}`);
    if (mgMatches.length > 0) parts.push(`Dosage/mg found: ${[...new Set(mgMatches)].slice(0, 15).join(", ")}`);
    parts.push(text);

    return parts.join("\n\n");
  } catch {
    return null;
  }
}

/** Extract likely product page links from a page's HTML. */
function extractProductLinks(html: string, baseSite: string): string[] {
  const links: string[] = [];
  const productRegex = /href="(\/(?:products|product)\/[^"'?#]+)/gi;
  let match: RegExpExecArray | null;
  while ((match = productRegex.exec(html)) !== null && links.length < 5) {
    const root = baseSite.replace(/\/$/, "");
    links.push(`${root}${match[1]}`);
  }
  return [...new Set(links)];
}

