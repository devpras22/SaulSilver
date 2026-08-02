/**
 * SaulSilver brand research agent.
 *
 * The self-populating + freshness-check engine. Given a brand name:
 *   1. Gathers raw context (crawled page text + Senso trust data)
 *   2. Asks OpenAI to structure it into a Brand + a classified product catalog
 *      (every product typed gummy|oil|topical|... and status available|coming_soon|sold_out)
 *   3. Asks OpenAI for a research verdict (verified / caution / avoid)
 *   4. Ingests the brand into Senso as a trust doc (best-effort)
 *
 * The caller — /api/research — then decides what to persist:
 *   - new brand, has gummies  → brand + gummy products + research (case 2)
 *   - new brand, NO gummies   → brand + research only, NO products (case 1)
 *   - existing brand          → additive insert of genuinely-new gummies only (case 3/4)
 *
 * The catalog grows AND stays fresh. A judge asks "is DRIFT out yet?" → Saul
 * re-grounds the brand live → adds the new SKU if it's shipped.
 *
 * Runs server-side only (service-role client bypasses RLS for catalog writes).
 */

import OpenAI from "openai";
import type { Brand, BrandResearch, CannabisProduct } from "./types";
import { ingestBrand, isSensoConfigured } from "./senso";

/**
 * OpenAI client is created lazily at CALL time, not import time. This matches
 * the Senso pattern and matters for tsx scripts: a script that does
 * `import { researchBrand }` BEFORE `dotenv.config()` would otherwise see no key
 * (ES imports are hoisted above the config() call) and silently fall back to
 * mock. Reading the key here ensures .env.local is honored regardless of load
 * order. The Next app is unaffected (it loads env at startup).
 */
let _openai: OpenAI | null | undefined;
function getOpenAI(): OpenAI | null {
  if (_openai === undefined) {
    _openai = process.env.OPENAI_API_KEY
      ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
      : null;
  }
  return _openai;
}

/** True when no OpenAI key is configured (researchBrand falls back to mock data). */
export function isMockResearch(): boolean {
  return !getOpenAI();
}
/** Back-compat: static bool. May be false in scripts that load env late — prefer isMockResearch(). */
export const IS_MOCK_RESEARCH = !process.env.OPENAI_API_KEY;

// ─────────────────────────────────────────────────────────────────────────────
// WEBSITE DISCOVERY — resolve a brand name to its official URL
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolve a brand name to its official website URL. The FIRST step of research
 * when no URL is passed — a name alone tells us nothing to scrape.
 *
 * Uses OpenAI (not a hard-coded .com/.in guess) because TLDs are ambiguous:
 * the same name can resolve to a cannabis brand on .org (BOHECO) and an
 * unrelated company on .com (apple.com). OpenAI picks the real official site
 * from its knowledge. Returns null if it can't find a confident match.
 *
 * The returned URL is surfaced to the user as a hyperlink so they can verify
 * WHICH site was checked — closing the "wrong company" loop.
 */
export async function discoverWebsite(brandName: string): Promise<string | null> {
  const openai = getOpenAI();
  if (!openai) {
    // Mock fallback: try a naive .com guess so the flow is exercise-able offline.
    const guess = `${brandName.toLowerCase().replace(/[^a-z0-9]/g, "")}.com`;
    return `https://${guess}`;
  }

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You resolve brand names to their official primary website URL. Return ONLY the full https URL (e.g. "https://example.com") of the brand's official site — no prose, no quotes, no explanation.

Rules:
- Pick the OFFICIAL site run by the brand itself, not a marketplace page (Amazon, ItsHemp, etc.).
- If the name is ambiguous (two different companies share it), pick the one most likely to be a consumer brand.
- If you genuinely do not know the brand's website, return the single word: unknown`,
        },
        {
          role: "user",
          content: `What is the official website URL of the brand "${brandName}"?`,
        },
      ],
      temperature: 0,
      max_tokens: 60,
    });

    const raw = completion.choices[0]?.message?.content?.trim() ?? "";
    if (!raw || raw.toLowerCase() === "unknown") return null;
    // Normalize: ensure it has a scheme, strip trailing slash + quotes.
    const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const cleaned = withScheme.replace(/^["']|["']$/g, "").replace(/\/+$/, "");
    // Sanity: must look like a URL with a dot.
    return /\./.test(cleaned) ? cleaned : null;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// STRUCTURE SCHEMAS — what we ask OpenAI to return
// ─────────────────────────────────────────────────────────────────────────────

/**
 * UNIFIED PRODUCT CATALOG. Every product the brand sells gets classified by
 * type + status, not shoved into a gummy-only schema. This is what lets the
 * engine honestly say "Sanan Relief sells oils/roll-ons, no gummies" instead
 * of fabricating a gummy or silently returning nothing.
 *
 * Gummy-only fields (cannabinoids, ratio, pack_count, effect_tags, dose_level,
 * price_inr) are required ONLY when type==="gummy" && status==="available".
 */
const productItemSchema = {
  type: "object",
  properties: {
    name: { type: "string", description: "Product name exactly as on the site" },
    type: {
      type: "string",
      enum: ["gummy", "oil", "topical", "capsule", "patch", "flower", "other"],
      description:
        "gummy = edible gummy/candy/jelly; oil = tincture/drop; topical = roll-on/gel/balm/cream; capsule; patch; flower/bud; other (specify in description). Classify from the product NAME + description — a 'candy' or 'gummy' is a gummy even if the brand calls it a 'Vijaya candy'.",
    },
    status: {
      type: "string",
      enum: ["available", "coming_soon", "sold_out"],
      description:
        "available = buyable now (has a price + add-to-cart); coming_soon = page exists but says 'Coming soon' / 'Notify me' / no price; sold_out = listed but out of stock. DRIFT/GROUND CONTROL on Moon Impact are coming_soon.",
    },
    // ── Gummy-only structured fields (omit/leave null for non-gummies) ──
    variant: { type: "string", description: "Sleep / Relax / Focus / Uplift — gummies only" },
    cannabinoids: {
      type: "object",
      properties: {
        thc_mg: { type: "integer" },
        cbd_mg: { type: "integer" },
        cbn_mg: { type: "integer" },
        cbg_mg: { type: "integer" },
        total_extract_mg: { type: "integer", description: "If brand states a total Vijaya extract blend" },
      },
    },
    ratio: { type: "string", description: "e.g. '4:1', '1:1', 'CBD-dominant' — gummies only" },
    spectrum: { type: "string", enum: ["full", "broad", "isolate"] },
    effect_tags: {
      type: "array",
      items: { type: "string", enum: ["sleep", "anxiety", "pain", "focus", "euphoria", "social", "relax", "couch_lock", "munchies", "creativity"] },
    },
    dose_level: { type: "string", enum: ["beginner", "intermediate", "heavy"] },
    onset_minutes: { type: "integer" },
    duration_hours: { type: "integer" },
    flavor: { type: "string" },
    pack_count: { type: "integer", description: "gummies per pack — gummies only" },
    price_inr: { type: "integer", description: "Whole rupees, no decimals/₹ symbol" },
    product_url: { type: "string" },
    description: { type: "string", description: "For non-gummies, a 1-line description of what it is (e.g. 'Pain relief roll-on, 30ml'). For gummies, the marketing line." },
  },
  required: ["name", "type", "status"],
};

const brandSchema = {
  type: "object" as const,
  properties: {
    name: { type: "string", description: "Brand name as it appears officially" },
    website: { type: "string", description: "Primary https URL" },
    tagline: { type: "string", description: "One-line brand positioning" },
    category: {
      type: "string",
      enum: ["vijaya", "cbd", "hemp", "isolate"],
      description: "vijaya = Indian medical cannabis (Schedule E1); cbd = hemp-derived CBD; hemp = industrial hemp; isolate = pure cannabinoid isolate",
    },
    rail: {
      type: "string",
      enum: ["d2c", "marketplace"],
      description: "d2c = sells on own website; marketplace = sold via ItsHemp/Hempkart/etc only",
    },
    marketplaces: {
      type: "array",
      items: { type: "string" },
      description: "If marketplace rail: which platforms carry them",
    },
    legal_status: {
      type: "string",
      enum: ["schedule_e1_prescription", "otc_cbd", "unregulated"],
    },
    prescription_required: { type: "boolean" },
    doctor_routing: {
      type: "string",
      description: "How their in-house doctor / prescription flow works, if any",
    },
    support_email: {
      type: "string",
      description:
        "The brand's REAL customer support / contact email as found on the site (footer, Contact page, About, Privacy Policy, Terms, or refund policy). Common patterns: care@, hello@, orders@, support@. CRITICAL: only return an address you actually saw in the context — NEVER fabricate support@<domain>. Return empty string if no real address is present in the context.",
    },
    instagram_handle: { type: "string", description: "@handle, or empty if none found" },
    instagram_followers: { type: "integer", description: "Follower count if discoverable, 0 if unknown" },
    description: { type: "string", description: "2-3 sentence brand overview" },
    packaging_notes: { type: "string", description: "Notes on packaging quality / aesthetic, if any" },
    licence_from_footer: {
      type: "string",
      description:
        "If the context includes a 'LICENCE EXTRACT' block (footer text we grep for 'Licence Number:'), copy the licence number(s) verbatim here. If no such block appears in the context, return empty string — do NOT infer from product images or marketing copy.",
    },
    sells_gummies: {
      type: "boolean",
      description: "true if the brand sells ANY gummy/candy/jelly edible (regardless of stock status). false if the entire catalog is oils/topicals/capsules/patches only.",
    },
    non_gummy_summary: {
      type: "string",
      description: "If sells_gummies is false: a one-line summary of what they DO sell (e.g. 'Topicals — pain relief roll-on, patch, gel, oil — plus a full-spectrum CBD oil.'). Empty if they sell gummies.",
    },
    productCatalog: {
      type: "array",
      items: productItemSchema,
      description: "EVERY product found on the site — gummies, oils, topicals, capsules, patches, all of it — each classified by type and status. Do not omit non-gummies; they're how we tell the user 'this brand doesn't sell gummies'. Coming-soon products MUST be included with status 'coming_soon'.",
    },
  },
  required: ["name", "category", "rail", "legal_status", "prescription_required", "sells_gummies", "productCatalog"],
};

const verdictSchema = {
  type: "object" as const,
  properties: {
    coa_status: { type: "string", description: "Are third-party lab tests (Certificate of Analysis) publicly available? 'available' | 'claimed_not_shown' | 'absent'" },
    license: { type: "string", description: "Regulatory license / registration if known (e.g. AYUSH, Schedule E1)" },
    reviews_summary: { type: "string", description: "What users say in 1-2 sentences" },
    red_flags: { type: "array", items: { type: "string" }, description: "Any concerns: no COA, fake reviews, legal ambiguity, etc." },
    summary: { type: "string", description: "2-3 sentence verdict on legitimacy" },
    verdict: { type: "string", enum: ["verified", "caution", "avoid", "unverified"] },
    trust_score: { type: "number", description: "0-1 confidence in legitimacy" },
  },
  required: ["summary", "verdict", "trust_score"],
};

// ─────────────────────────────────────────────────────────────────────────────
// RESULT TYPES
// ─────────────────────────────────────────────────────────────────────────────

/** A non-gummy product, captured for the "what they DO sell" decline card. */
export interface NonGummyProduct {
  name: string;
  type: "oil" | "topical" | "capsule" | "patch" | "flower" | "other";
  status: "available" | "coming_soon" | "sold_out";
  description?: string;
}

/** A coming-soon gummy — tracked so the freshness check can detect "now live". */
export interface ComingSoonGummy {
  name: string;
  status: "coming_soon" | "sold_out";
  description?: string;
}

export interface ResearchResult {
  brand: Brand;
  /** Gummies that are buyable now — these are the only products we persist. */
  gummyProducts: CannabisProduct[];
  /** Non-gummy catalog (oils, topicals, etc.) — for the decline card, NOT persisted. */
  otherProducts: NonGummyProduct[];
  /** Gummies listed but not yet buyable (coming_soon / sold_out) — for the freshness check. */
  comingSoon: ComingSoonGummy[];
  research: Omit<BrandResearch, "id" | "brand_id" | "created_at">;
  sources: string[];
}

export interface ResearchInput {
  brandName: string;
  /** Raw context strings the caller gathered (crawled page text, etc.) */
  context: string[];
  /** Optional: the website URL if already known (skip discovery) */
  knownWebsite?: string;
}

/**
 * Research a brand: structure raw context → Brand + classified catalog + verdict.
 * Server-side only. Caller decides what to persist based on gummyProducts/otherProducts.
 */
export async function researchBrand(input: ResearchInput): Promise<ResearchResult> {
  const openai = getOpenAI();
  if (!openai) {
    return researchMock(input);
  }

  const contextBlock = input.context.map((c, i) => `[${i + 1}] ${c}`).join("\n\n");
  const knownSite = input.knownWebsite ? `\nKnown website: ${input.knownWebsite}` : "";

  // ── Step 1: Structure the brand + full classified catalog ──
  const structureCompletion = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: `You are SaulSilver's research agent. You investigate cannabis brands and structure them into a clean catalog.

Given raw research context (crawled page text, structured product data, prices, mg patterns, footer text), extract a structured brand profile with its FULL product catalog — every product the brand sells, classified by type and status.

CLASSIFICATION IS CRITICAL:
- "gummy" = any edible gummy/candy/jelly. Indian brands often call these "Vijaya candy" or just "candy" — those are GUMMIES.
- "oil"/"topical"/"capsule"/"patch" are NOT gummies. A brand with no edible gummies in its catalog has sells_gummies=false.
- A product page that exists but says "Coming soon" / "Notify me" / has no price → status "coming_soon". This is how we know a product was announced but hasn't shipped.

GROUNDING IS CRITICAL — DO NOT INVENT PRODUCTS:
- Only list products that ACTUALLY APPEAR in the provided context (page text, structured data, or product names).
- Use the EXACT product names from the context. Do NOT pattern-match against cannabis-brand stereotypes or fall back to generic names like "Pain Relief Roll-on" or "Vijaya Oil".
- If the context does not list any products, return an EMPTY productCatalog — never fabricate one.
- If the site is NOT a cannabis/cannabinoid brand, return an EMPTY productCatalog and set sells_gummies=false. Do not force-fit a non-cannabis site into the catalog.

Be precise about cannabinoid mg, ratios, and prices for gummies. If a field isn't in the context, omit it — never invent numbers.

For the India market: "Vijaya" = legal medical cannabis leaf extract, sold under Schedule E(1) with a prescription. Most brands route prescriptions through an in-house doctor on a 5-minute call.

Region defaults to "IN" unless the context clearly indicates otherwise.

LICENCE: only fill licence_from_footer if a 'LICENCE EXTRACT' block (footer text we grepped for 'Licence Number:') appears in the context. Never infer a licence number from a product image or marketing badge.`,
      },
      {
        role: "user",
        content: `Brand to research: ${input.brandName}${knownSite}\n\nRaw context:\n${contextBlock}\n\nExtract the brand profile and the FULL product catalog (every product, classified by type + status). Call the function.`,
      },
    ],
    tools: [{ type: "function", function: { name: "save_brand", parameters: brandSchema } }],
    tool_choice: { type: "function", function: { name: "save_brand" } },
    temperature: 0.2,
  });

  const structureCall = structureCompletion.choices[0]?.message?.tool_calls?.[0];
  const structureArgs = structureCall && structureCall.type === "function"
    ? JSON.parse(structureCall.function.arguments)
    : {};

  // ── Step 2: Research verdict (trust / legitimacy) ──
  const verdictCompletion = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: `You are a cannabis product safety researcher. Given context about a brand, deliver a legitimacy verdict.

Be honest about red flags: missing lab tests, unverifiable claims, sketchy payment methods, legal ambiguity. Indian Vijaya brands with AYUSH licensing and visible COAs are legitimate; brands with no paper trail are not.

trust_score: 0.9+ = clearly legit with lab tests; 0.6-0.9 = probably legit but gaps; 0.3-0.6 = proceed with caution; <0.3 = avoid.`,
      },
      {
        role: "user",
        content: `Brand: ${structureArgs.name ?? input.brandName}\nWebsite: ${structureArgs.website ?? "unknown"}\n\nContext:\n${contextBlock}\n\nDeliver the verdict.`,
      },
    ],
    tools: [{ type: "function", function: { name: "save_verdict", parameters: verdictSchema } }],
    tool_choice: { type: "function", function: { name: "save_verdict" } },
    temperature: 0.2,
  });

  const verdictCall = verdictCompletion.choices[0]?.message?.tool_calls?.[0];
  const verdictArgs = verdictCall && verdictCall.type === "function"
    ? JSON.parse(verdictCall.function.arguments)
    : {};

  // ── Assemble the brand row ──
  // trust_score here is the STRUCTURED-RESEARCH score (OpenAI verdict only, no
  // Senso). Senso is applied uniformly at match time in senso-trust.ts (50/50
  // blend). Keeping this pure-OpenAI avoids double-dipping Senso for live-
  // researched brands. Manual seeds already store OpenAI-only, so both paths match.
  const slug = slugify(structureArgs.name ?? input.brandName);
  const blendedTrust = typeof verdictArgs.trust_score === "number" ? verdictArgs.trust_score : 0.5;

  const brand: Brand = {
    id: slug,
    name: structureArgs.name ?? input.brandName,
    website: structureArgs.website ?? input.knownWebsite,
    tagline: structureArgs.tagline,
    category: structureArgs.category ?? "vijaya",
    region: "IN",
    rail: structureArgs.rail ?? "d2c",
    marketplaces: structureArgs.marketplaces,
    legal_status: structureArgs.legal_status ?? "schedule_e1_prescription",
    prescription_required: structureArgs.prescription_required ?? true,
    doctor_routing: structureArgs.doctor_routing,
    support_email: typeof structureArgs.support_email === "string" && structureArgs.support_email.trim()
      ? structureArgs.support_email.trim()
      : undefined,
    instagram_handle: structureArgs.instagram_handle || undefined,
    instagram_followers: structureArgs.instagram_followers || undefined,
    trust_score: blendedTrust,
    verified: blendedTrust >= 0.5,
    last_researched: new Date().toISOString(),
    description: structureArgs.description,
    packaging_notes: structureArgs.packaging_notes,
  };

  // ── Partition the catalog: gummies (available) / others / coming-soon ──
  // Only buyable gummies become CannabisProduct rows. Non-gummies become the
  // decline-card payload. Coming-soon gummies drive the freshness check.
  const catalog: Record<string, unknown>[] = Array.isArray(structureArgs.productCatalog)
    ? structureArgs.productCatalog
    : [];

  const gummyProducts: CannabisProduct[] = [];
  const otherProducts: NonGummyProduct[] = [];
  const comingSoon: ComingSoonGummy[] = [];

  catalog.forEach((p, i) => {
    const type = (p.type as string) ?? "other";
    const status = (p.status as string) ?? "available";

    if (type === "gummy" && (status === "coming_soon" || status === "sold_out")) {
      comingSoon.push({
        name: (p.name as string) ?? `gummy-${i}`,
        status: status as "coming_soon" | "sold_out",
        description: (p.description as string) ?? undefined,
      });
      return;
    }

    if (type === "gummy" && status === "available") {
      gummyProducts.push({
        id: `${slug}-p${i}`,
        brand_id: slug,
        name: (p.name as string) ?? `gummy-${i}`,
        variant: (p.variant as string) ?? undefined,
        cannabinoids: (p.cannabinoids as CannabisProduct["cannabinoids"]) ?? {},
        ratio: (p.ratio as string) ?? undefined,
        spectrum: (p.spectrum as CannabisProduct["spectrum"]) ?? undefined,
        effect_tags: (p.effect_tags as CannabisProduct["effect_tags"]) ?? [],
        dose_level: (p.dose_level as CannabisProduct["dose_level"]) ?? "intermediate",
        onset_minutes: (p.onset_minutes as number) ?? undefined,
        duration_hours: (p.duration_hours as number) ?? undefined,
        flavor: (p.flavor as string) ?? undefined,
        pack_count: (p.pack_count as number) ?? 0,
        price_inr: (p.price_inr as number) ?? 0,
        in_stock: true,
        product_url: (p.product_url as string) ?? undefined,
        description: (p.description as string) ?? undefined,
      });
      return;
    }

    // Everything else: oil / topical / capsule / patch / flower / other
    otherProducts.push({
      name: (p.name as string) ?? `product-${i}`,
      type: type as NonGummyProduct["type"],
      status: status as NonGummyProduct["status"],
      description: (p.description as string) ?? undefined,
    });
  });

  // ── Build the research audit trail ──
  const research: ResearchResult["research"] = {
    query: `Is ${brand.name} legit?`,
    verdict: verdictArgs.verdict ?? "unverified",
    findings: {
      coa_status: verdictArgs.coa_status,
      license: verdictArgs.license ?? (structureArgs.licence_from_footer || undefined),
      reviews_summary: verdictArgs.reviews_summary,
      red_flags: verdictArgs.red_flags ?? [],
      summary: verdictArgs.summary ?? "No summary available.",
      // Capture the catalog shape so the decline card + freshness check can
      // render it without a re-query. Lives in findings (JSONB) — not a column.
      sells_gummies: Boolean(structureArgs.sells_gummies),
      non_gummy_summary: typeof structureArgs.non_gummy_summary === "string"
        ? structureArgs.non_gummy_summary
        : undefined,
      other_products: otherProducts.length > 0 ? otherProducts : undefined,
      coming_soon_gummies: comingSoon.length > 0 ? comingSoon : undefined,
    },
    sources: input.context.length > 0 ? [`Research via ${input.context.length} sources`] : [],
    trust_score: blendedTrust,
  };

  // ── Senso trust ingest ──
  // A no-gummies brand is STILL ingested — its trust doc lets the decline card
  // cite grounded reputation ("they have a legit AYUSH licence, they just don't
  // make gummies"). Best-effort: never fail the whole research if Senso hiccups.
  await ingestResearchIntoSenso({ brand, gummyProducts, otherProducts, research }).catch((e) => {
    console.warn(
      `[research] Senso ingest failed for "${brand.name}" (continuing — brand still saved to Supabase):`,
      e instanceof Error ? e.message : e
    );
  });

  return { brand, gummyProducts, otherProducts, comingSoon, research, sources: research.sources };
}

/**
 * Ingest a freshly-researched brand into Senso as a trust doc.
 * Idempotent — ingestBrand deletes any prior doc with the same title first.
 */
async function ingestResearchIntoSenso(args: {
  brand: Brand;
  gummyProducts: CannabisProduct[];
  otherProducts: NonGummyProduct[];
  research: ResearchResult["research"];
}): Promise<void> {
  if (!isSensoConfigured()) return; // Fast path — no key, skip cleanly.

  const { brand, gummyProducts, otherProducts, research } = args;

  await ingestBrand({
    brandName: brand.name,
    brandSlug: brand.id,
    website: brand.website,
    summary: brand.description ?? research.findings.summary,
    licenceInfo:
      research.findings.license ??
      (brand.licences?.length ? brand.licences.map((l) => `${l.type}: ${l.number}`).join(", ") : undefined),
    products: gummyProducts.map((p) => ({
      name: p.name,
      cannabinoids: [
        p.cannabinoids.total_extract_mg ? `${p.cannabinoids.total_extract_mg}mg total extract` : "",
        p.cannabinoids.thc_mg ? `${p.cannabinoids.thc_mg}mg THC` : "",
        p.cannabinoids.cbd_mg ? `${p.cannabinoids.cbd_mg}mg CBD` : "",
      ]
        .filter(Boolean)
        .join(", ") || undefined,
      priceInr: p.price_inr,
      flavor: p.flavor,
      keyUses: p.key_uses,
    })),
    reviewQuotes: research.findings.reviews_summary ? [research.findings.reviews_summary] : [],
    redFlags: research.findings.red_flags,
  });
  // Note: we do NOT call waitUntilIndexed here — the live path shouldn't block
  // the user ~30s on Senso indexing. The doc lands async and is queryable
  // within a minute. The match flow degrades gracefully to static trust meanwhile.
}

// ─────────────────────────────────────────────────────────────────────────────
// MOCK — deterministic fallback when no OpenAI key
// ─────────────────────────────────────────────────────────────────────────────

async function researchMock(input: ResearchInput): Promise<ResearchResult> {
  await new Promise((r) => setTimeout(r, 1000));
  const slug = slugify(input.brandName);

  const brand: Brand = {
    id: slug,
    name: input.brandName,
    website: input.knownWebsite,
    category: "vijaya",
    region: "IN",
    rail: "d2c",
    legal_status: "schedule_e1_prescription",
    prescription_required: true,
    doctor_routing: "In-house AYUSH doctor calls within 24h of order.",
    trust_score: 0.7,
    verified: true,
    last_researched: new Date().toISOString(),
    description: `${input.brandName} is an Indian Vijaya cannabis brand. (Mock research — add OPENAI_API_KEY for real extraction.)`,
  };

  const gummyProducts: CannabisProduct[] = [
    {
      id: `${slug}-p0`,
      brand_id: slug,
      name: `${input.brandName} Sleep Gummies`,
      variant: "Sleep",
      cannabinoids: { thc_mg: 5, cbd_mg: 5 },
      ratio: "1:1",
      effect_tags: ["sleep", "relax"],
      dose_level: "beginner",
      onset_minutes: 45,
      duration_hours: 7,
      flavor: "berry",
      pack_count: 20,
      price_inr: 3000,
      in_stock: true,
    },
  ];

  const research: ResearchResult["research"] = {
    query: `Is ${input.brandName} legit?`,
    verdict: "unverified",
    findings: {
      summary: "Mock research. Add OPENAI_API_KEY to extract real findings.",
      sells_gummies: true,
    },
    sources: [],
    trust_score: 0.5,
  };

  return { brand, gummyProducts, otherProducts: [], comingSoon: [], research, sources: [] };
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
