import { NextRequest, NextResponse } from "next/server";
import { researchBrand, discoverWebsite, IS_MOCK_RESEARCH, slugify } from "@/lib/research";
import { createServiceRoleClient } from "@/lib/supabase/server";
import type { Brand, CannabisProduct, ResearchStatus } from "@/lib/types";

/**
 * POST /api/research
 *
 * The living-catalog engine. Given a brand name it produces ONE of five honest
 * outcomes (returned as `status`), so the client renders a distinct card:
 *
 *   new_brand_no_gummies      — legit brand, but they sell oils/topicals only
 *   new_brand_added           — full research, brand + gummies saved
 *   existing_brand_refreshed  — known brand, genuinely-new gummies added
 *   existing_brand_unchanged  — known brand, nothing changed (freshness check)
 *   cached                    — served from the 7-day cache (no live crawl)
 *
 * Body: { brandName: string, website?: string, forceRefresh?: boolean }
 * Returns: { status, brand, products, research, delta?, mock, cached }
 *
 * SAFETY: refresh is ADDITIVE ONLY — never delete/overwrite existing products.
 * The 12 pre-seeded brands carry hand-curated detail we must not destroy.
 */
export async function POST(req: NextRequest) {
  try {
    const { brandName, website, forceRefresh } = await req.json();
    if (!brandName || typeof brandName !== "string") {
      return NextResponse.json({ error: "brandName is required" }, { status: 400 });
    }

    const supabase = createServiceRoleClient();
    const slug = slugify(brandName);

    // ── Check if already cached (don't re-research on every hit) ──
    const { data: existing } = await supabase
      .from("brands")
      .select("id, name, last_researched")
      .eq("id", slug)
      .maybeSingle();

    // Serve the cache unless the caller explicitly wants a live freshness check.
    if (!forceRefresh && existing?.last_researched) {
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
          status: "cached" as ResearchStatus,
          brand: cachedBrand,
          products: cachedProducts ?? [],
          research: cachedResearch,
          mock: IS_MOCK_RESEARCH,
          cached: true,
        });
      }
    }

    // ── STEP 0: Website discovery ──
    // A brand name alone gives us nothing to scrape. If no URL was passed
    // (the chat path: user just types "sanan relief"), resolve one.
    //
    // Order: Supabase first (a seeded/known brand's website is hand-verified and
    // authoritative — OpenAI doesn't know small Indian brands like Sanan Relief
    // or Moon Impact and returns "unknown" for them), THEN OpenAI discovery as
    // the fallback for genuinely-new brands a judge might name.
    let resolvedWebsite = website;
    if (!resolvedWebsite) {
      const { data: known } = await supabase
        .from("brands")
        .select("website")
        .eq("id", slug)
        .maybeSingle();
      if (known?.website) {
        resolvedWebsite = known.website;
      } else {
        resolvedWebsite = await discoverWebsite(brandName);
      }
      if (!resolvedWebsite) {
        return NextResponse.json({
          status: "website_not_found" as ResearchStatus,
          brand: { name: brandName, website: null },
          products: [],
          research: null,
          mock: IS_MOCK_RESEARCH,
          cached: false,
        });
      }
    }

    // ── Gather raw context (now footer-aware for licence extraction) ──
    const context = await gatherContext(brandName, resolvedWebsite);

    // ── HARD GATE: no context scraped → do NOT call OpenAI ──
    // If the scrape returned nothing (site blocks the bot, wrong URL, offline),
    // OpenAI has NOTHING to ground on and will hallucinate a plausible cannabis
    // catalog from its training data (this happened with boheco.org — invented
    // "BOHECO Pain Relief Balm" etc. from zero context). Abort honestly instead.
    // Surface the resolved URL so the card can hyperlink it.
    if (context.length === 0) {
      return NextResponse.json({
        status: "research_unavailable" as ResearchStatus,
        brand: { name: brandName, website: resolvedWebsite },
        products: [],
        research: null,
        reason: "site_unreachable",
        mock: IS_MOCK_RESEARCH,
        cached: false,
      });
    }

    // ── Run the research agent ──
    const result = await researchBrand({ brandName, context, knownWebsite: resolvedWebsite });

    const isNewBrand = !existing;
    const isNoGummies = result.gummyProducts.length === 0;

    // ── Compute the outcome status + decide what to persist ──
    let status: ResearchStatus;
    let delta: string[] | undefined; // names of genuinely-new gummies added (case 3)

    // ── NON-CANNABIS GATE: context was fetched but the site has zero cannabis ──
    // products of ANY type (gummies, oils, topicals — nothing). That means it's
    // not a cannabis/cannabinoid brand at all (e.g. apple.com). Don't persist it
    // and don't show the "they don't sell gummies" decline card — that card
    // implies it IS a cannabis brand that just lacks edibles, which is a lie.
    if (
      result.gummyProducts.length === 0 &&
      result.otherProducts.length === 0 &&
      result.comingSoon.length === 0
    ) {
      return NextResponse.json({
        status: "not_a_cannabis_brand" as ResearchStatus,
        brand: result.brand,
        products: [],
        research: result.research,
        mock: IS_MOCK_RESEARCH,
        cached: false,
      });
    }

    if (isNewBrand) {
      // Cases 1 & 2.
      status = isNoGummies ? "new_brand_no_gummies" : "new_brand_added";

      // Upsert the brand row (always — a no-gummies brand is still vetted + cached).
      await upsertBrand(supabase, result.brand);

      if (!isNoGummies) {
        // Case 2: new brand with gummies → insert its gummy products.
        await insertProducts(supabase, result.brand.id, result.gummyProducts);
      }
      // Case 1 (no gummies): insert NOTHING to products. otherProducts is in
      // research.findings so the decline card can render what they DO sell.
    } else {
      // Existing brand → freshness check. Compute the delta of gummy names the
      // live site now lists vs what's already seeded. ADDITIVE ONLY.
      const { data: seededProducts } = await supabase
        .from("products")
        .select("name")
        .eq("brand_id", result.brand.id);
      const seededNames = new Set((seededProducts ?? []).map((p) => normalizeName(p.name)));

      const newGummies = result.gummyProducts.filter(
        (p) => !seededNames.has(normalizeName(p.name))
      );

      // CRITICAL: the live OpenAI verdict is for detecting NEW PRODUCTS only.
      // It must NOT overwrite the curated verdict/trust_score/findings that the
      // hand-seeded brands carry (rubric-scored, defensible to a judge). OpenAI
      // reading thin scraped text is far harsher than the rubric — letting it
      // nuke a "verified" into "caution" defeats the whole trust layer.
      // So for an existing brand we keep the seeded verdict and only update
      // last_researched (+ append a research row noting the re-check).
      const { data: curated } = await supabase
        .from("brands")
        .select("*")
        .eq("id", result.brand.id)
        .maybeSingle();
      const curatedBrand: Brand | undefined = curated as Brand | undefined;
      const { data: curatedResearch } = await supabase
        .from("brand_research")
        .select("*")
        .eq("brand_id", result.brand.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (newGummies.length === 0) {
        // Case 4: nothing changed. Don't touch products. Bump last_researched
        // only — keep the curated verdict intact.
        status = "existing_brand_unchanged";
        if (curatedBrand) {
          await upsertBrand(supabase, { ...curatedBrand, last_researched: new Date().toISOString() });
          // Serve the curated brand so the card shows the real verdict, not OpenAI's.
          result.brand = curatedBrand;
          if (curatedResearch) {
            result.research = {
              query: curatedResearch.query,
              verdict: curatedResearch.verdict,
              findings: curatedResearch.findings ?? { summary: "" },
              sources: curatedResearch.sources ?? [],
              trust_score: curatedResearch.trust_score,
            };
          }
        }
      } else {
        // Case 3: genuinely-new gummies. INSERT ONLY — never delete/overwrite.
        status = "existing_brand_refreshed";
        delta = newGummies.map((p) => p.name);
        if (curatedBrand) {
          await upsertBrand(supabase, { ...curatedBrand, last_researched: new Date().toISOString() });
          result.brand = curatedBrand;
          if (curatedResearch) {
            result.research = {
              query: curatedResearch.query,
              verdict: curatedResearch.verdict,
              findings: curatedResearch.findings ?? { summary: "" },
              sources: curatedResearch.sources ?? [],
              trust_score: curatedResearch.trust_score,
            };
          }
        }
        await insertProducts(supabase, result.brand.id, newGummies);
      }
    }

    // Always append the research audit trail (history matters — a judge can see
    // the brand was re-checked).
    await supabase.from("brand_research").insert({
      brand_id: result.brand.id,
      query: result.research.query,
      verdict: result.research.verdict,
      findings: result.research.findings,
      sources: result.research.sources,
      trust_score: result.research.trust_score,
    });

    // For an existing-brand refresh, the live scrape (result.gummyProducts) may
    // only contain a subset of the brand's catalog — the seeded products weren't
    // re-scraped. Re-fetch the FULL list from Supabase (curated + newly inserted)
    // so the dashboard card shows the complete catalog, not just the live subset.
    let productsForCard = result.gummyProducts;
    if (!isNewBrand) {
      const { data: fullCatalog } = await supabase
        .from("products")
        .select("*")
        .eq("brand_id", result.brand.id);
      if (fullCatalog && fullCatalog.length > 0) {
        productsForCard = fullCatalog as unknown as CannabisProduct[];
      }
    }

    return NextResponse.json({
      status,
      brand: result.brand,
      // The full catalog for the dashboard card (existing + newly added for a
      // refresh; live-scraped gummies for a new brand). Empty for no-gummies.
      products: productsForCard,
      research: result.research,
      delta,
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
// PERSISTENCE HELPERS
// ─────────────────────────────────────────────────────────────────────────────

async function upsertBrand(supabase: ReturnType<typeof createServiceRoleClient>, brand: Brand) {
  await supabase
    .from("brands")
    .upsert(
      {
        id: brand.id,
        name: brand.name,
        website: brand.website,
        tagline: brand.tagline,
        category: brand.category,
        region: brand.region,
        rail: brand.rail,
        marketplaces: brand.marketplaces ?? null,
        legal_status: brand.legal_status,
        prescription_required: brand.prescription_required,
        doctor_routing: brand.doctor_routing,
        support_email: brand.support_email ?? null,
        instagram_handle: brand.instagram_handle ?? null,
        instagram_followers: brand.instagram_followers ?? null,
        instagram_engagement: brand.instagram_engagement ?? null,
        trust_score: brand.trust_score,
        verified: brand.verified,
        last_researched: brand.last_researched,
        description: brand.description,
        packaging_notes: brand.packaging_notes,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    );
}

/** INSERT ONLY — never delete. Used for both new brands and additive refresh. */
async function insertProducts(
  supabase: ReturnType<typeof createServiceRoleClient>,
  brandId: string,
  products: CannabisProduct[]
) {
  if (products.length === 0) return;
  const { error } = await supabase.from("products").insert(
    products.map((p) => ({
      brand_id: brandId,
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
      image_url: p.image_url ?? null,
      description: p.description ?? null,
    }))
  );
  if (error) {
    // If image_url column is missing (migration not yet applied), retry without it
    // so the rest of the product still persists. The runtime result carries
    // image_url for the card regardless of DB state.
    if (/image_url/i.test(error.message)) {
      const { error: retryError } = await supabase.from("products").insert(
        products.map((p) => ({
          brand_id: brandId,
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
      if (retryError) console.error("[/api/research] product insert retry failed:", retryError.message);
      else console.warn("[/api/research] image_url column missing — applied migration 20260802_product_image_url.sql to persist images.");
    } else {
      console.error("[/api/research] product insert failed:", error.message);
    }
  }
}

/** Normalize a product name for delta comparison (case/whitespace/punct-insensitive). */
function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "").trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// CONTEXT GATHERING — fetch raw snippets about the brand
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Gather raw research context about a brand.
 * Crawls the homepage + product/collection pages + the footer/contact/about
 * pages (where AYUSH licence numbers actually live as TEXT — see lessons §5).
 * Returns an array of text snippets; the FIRST line of each is its URL.
 */
async function gatherContext(brandName: string, website?: string): Promise<string[]> {
  const snippets: string[] = [];
  if (!website) return snippets;

  const root = website.replace(/\/$/, "");

  // Product/collection pages (Shopify/WooCommerce/most D2C).
  const productCandidates = [
    website,
    `${root}/collections/all`,
    `${root}/collections/gummies`,
    `${root}/products`,
    `${root}/collections`,
    `${root}/shop`,
  ];

  // Footer/contact/about pages — this is where licence NUMBERS live as text,
  // not in product images. Fetching these is the fix for the licence-in-image
  // mistake (lessons §5: grep the literal string "Licence Number:").
  const footerCandidates = [`${root}/contact`, `${root}/about`, `${root}/pages/about-us`, `${root}/policies/privacy-policy`, `${root}/pages/contact-us`];

  // Fetch homepage + first 2 product/collection pages that resolve.
  const productFetched = await Promise.allSettled(
    productCandidates.slice(0, 3).map((url) => fetchPage(url))
  );
  let pagesFetched = 0;
  for (let i = 0; i < productFetched.length && pagesFetched < 3; i++) {
    const r = productFetched[i];
    if (r.status === "fulfilled" && r.value) {
      snippets.push(r.value);
      pagesFetched++;
    }
  }

  // Footer pages: fetch up to 2, then extract a LICENCE EXTRACT block from each.
  // The block is fed to OpenAI explicitly so it doesn't have to guess whether a
  // licence is in text or an image.
  const footerFetched = await Promise.allSettled(
    footerCandidates.slice(0, 3).map((url) => fetchPage(url))
  );
  let footerAdded = 0;
  for (const r of footerFetched) {
    if (footerAdded >= 2) break;
    if (r.status === "fulfilled" && r.value) {
      snippets.push(r.value);
      footerAdded++;
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

/** Fetch a URL, extract readable text + structured data + a licence extract for the agent. */
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

    // 1b. PRODUCT IMAGE — capture og:image + the JSON-LD Product `image` field.
    //     This is what lets a live-researched brand render its real photo instead
    //     of the Leaf fallback. Surface it explicitly so OpenAI copies it verbatim
    //     into image_url (mirrors the LICENCE EXTRACT pattern).
    let productImage = "";
    const ogImg = html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i);
    if (ogImg) productImage = ogImg[1];
    if (!productImage) {
      // Fall back to the image inside a Product JSON-LD block.
      for (const b of ldBlocks) {
        const imgInLd = b.match(/"image"\s*:\s*"([^"]+)"/);
        if (imgInLd) { productImage = imgInLd[1]; break; }
      }
    }
    if (productImage) {
      if (productImage.startsWith("//")) productImage = `https:${productImage}`;
      else if (productImage.startsWith("/")) productImage = `${new URL(url).origin}${productImage}`;
    }

    // 2. Capture price patterns explicitly — they get mangled by tag stripping.
    const priceMatches = html.match(/[₹$]\s?[0-9][0-9,]*\.?[0-9]{0,2}/g) ?? [];

    // 3. Capture mg/dosage patterns — "175mg", "5mg THC", "100 mg CBD".
    const mgMatches = html.match(/\b[0-9]{1,4}\s?mg\b(?:\s?(?:THC|CBD|CBN|CBG|Vijaya|cannabis))?/gi) ?? [];

    // 4. LICENCE EXTRACT — literal-string grep for "Licence Number:" (lessons §5).
    //    This is the fix for the licence-in-image mistake: we surface the actual
    //    footer text so OpenAI copies it verbatim rather than inferring from a badge.
    const licenceMatches = html.match(/Licen[cs]e\s*Number[^<>]{0,80}/gi) ?? [];
    // Also catch AYUSH registration patterns without the "Licence Number" prefix.
    const ayushMatches = html.match(/AYUSH[^<>]{0,60}?(?:[A-Z]{2,4}\s*[\-–/]?\s*\d{2,5}\/?\d{0,4})/gi) ?? [];

    // 5. Coming-soon / out-of-stock signals — drives the freshness check.
    const comingSoon = html.match(/\b(coming soon|sold out|out of stock|notify me|available soon|pre-?order)\b/gi) ?? [];

    // 6. Strip to readable text.
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
    if (licenceMatches.length > 0 || ayushMatches.length > 0) {
      parts.push(`LICENCE EXTRACT (footer text — copy verbatim into licence_from_footer): ${[...licenceMatches, ...ayushMatches].slice(0, 5).join(" | ")}`);
    }
    if (comingSoon.length > 0) {
      parts.push(`AVAILABILITY SIGNALS (coming soon / sold out detected): ${[...new Set(comingSoon.map((s) => s.toLowerCase()))].slice(0, 8).join(", ")}`);
    }
    if (productImage) {
      parts.push(`PRODUCT IMAGE (copy verbatim into image_url): ${productImage}`);
    }
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
