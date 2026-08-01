/**
 * SaulSilver brand research agent.
 *
 * The self-populating catalog engine. Given a brand name:
 *   1. Gathers raw context (web search results + Senso trust data)
 *   2. Asks OpenAI to structure it into a Brand + its Products
 *   3. Asks OpenAI for a research verdict (verified / caution / avoid)
 *   4. Upserts everything to Supabase (brands, products, brand_research)
 *
 * The catalog grows itself. A judge drops a 14th brand → SaulSilver
 * researches it live → next person who asks gets it instantly.
 *
 * Runs server-side only (service-role client bypasses RLS for catalog writes).
 */

import OpenAI from "openai";
import type { Brand, BrandResearch, CannabisProduct } from "./types";
import { getPharmacyTrustContext } from "./senso";

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

export const IS_MOCK_RESEARCH = !openai;

// ─────────────────────────────────────────────────────────────────────────────
// STRUCTURE SCHEMAS — what we ask OpenAI to return
// ─────────────────────────────────────────────────────────────────────────────

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
    instagram_handle: { type: "string", description: "@handle, or empty if none found" },
    instagram_followers: { type: "integer", description: "Follower count if discoverable, 0 if unknown" },
    description: { type: "string", description: "2-3 sentence brand overview" },
    packaging_notes: { type: "string", description: "Notes on packaging quality / aesthetic, if any" },
    products: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          variant: { type: "string", description: "Sleep / Relax / Focus / Uplift / etc" },
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
          ratio: { type: "string", description: "e.g. '4:1', '1:1', 'CBD-dominant'" },
          spectrum: { type: "string", enum: ["full", "broad", "isolate"] },
          effect_tags: {
            type: "array",
            items: { type: "string", enum: ["sleep", "anxiety", "pain", "focus", "euphoria", "social", "relax", "couch_lock", "munchies", "creativity"] },
          },
          dose_level: { type: "string", enum: ["beginner", "intermediate", "heavy"] },
          onset_minutes: { type: "integer" },
          duration_hours: { type: "integer" },
          flavor: { type: "string" },
          pack_count: { type: "integer" },
          price_inr: { type: "integer" },
          product_url: { type: "string" },
          description: { type: "string" },
        },
        required: ["name", "effect_tags", "dose_level", "pack_count", "price_inr"],
      },
    },
  },
  required: ["name", "category", "rail", "legal_status", "prescription_required", "products"],
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
// RESEARCH FUNCTION
// ─────────────────────────────────────────────────────────────────────────────

export interface ResearchResult {
  brand: Brand;
  products: CannabisProduct[];
  research: Omit<BrandResearch, "id" | "brand_id" | "created_at">;
  sources: string[];
}

export interface ResearchInput {
  brandName: string;
  /** Raw context strings the caller gathered (web search snippets, etc.) */
  context: string[];
  /** Optional: the website URL if already known (skip discovery) */
  knownWebsite?: string;
}

/**
 * Research a brand: structure raw context → Brand + Products + Verdict.
 * Server-side only. Caller handles the Supabase upsert.
 */
export async function researchBrand(input: ResearchInput): Promise<ResearchResult> {
  if (!openai) {
    return researchMock(input);
  }

  const contextBlock = input.context.map((c, i) => `[${i + 1}] ${c}`).join("\n\n");
  const knownSite = input.knownWebsite ? `\nKnown website: ${input.knownWebsite}` : "";

  // ── Step 1: Structure the brand + products ──
  const structureCompletion = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: `You are SaulSilver's research agent. You investigate cannabis gummy brands and structure them into a clean catalog.

Given raw research context (web snippets, social posts, reviews), extract a structured brand profile with all its gummy products. Be precise about cannabinoid mg, ratios, and prices. If a field isn't in the context, omit it — never invent numbers.

For the India market: "Vijaya" = legal medical cannabis leaf extract, sold under Schedule E(1) with a prescription. Most brands route prescriptions through an in-house doctor on a 5-minute call.

Region defaults to "IN" unless the context clearly indicates otherwise.`,
      },
      {
        role: "user",
        content: `Brand to research: ${input.brandName}${knownSite}\n\nRaw context:\n${contextBlock}\n\nExtract the brand profile and all gummy products. Call the function.`,
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

  // ── Step 3: Senso trust signal (additional context) ──
  const senso = await getPharmacyTrustContext(structureArgs.name ?? input.brandName).catch(() => ({
    score: 0.5,
    context: "Senso unavailable",
  }));

  // ── Assemble the result ──
  const slug = slugify(structureArgs.name ?? input.brandName);
  const aiTrust = typeof verdictArgs.trust_score === "number" ? verdictArgs.trust_score : 0.5;
  const blendedTrust = aiTrust * 0.7 + senso.score * 0.3;

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
    instagram_handle: structureArgs.instagram_handle || undefined,
    instagram_followers: structureArgs.instagram_followers || undefined,
    trust_score: blendedTrust,
    verified: blendedTrust >= 0.5,
    last_researched: new Date().toISOString(),
    description: structureArgs.description,
    packaging_notes: structureArgs.packaging_notes,
  };

  const products: CannabisProduct[] = (structureArgs.products ?? []).map(
    (p: Record<string, unknown>, i: number) => ({
      // DB generates the real uuid on insert; this client-side id is just for
      // the return payload. The insert omits `id` so gen_random_uuid() fires.
      id: `${slug}-p${i}`,
      brand_id: slug,
      name: p.name as string,
      variant: p.variant as string | undefined,
      cannabinoids: (p.cannabinoids as CannabisProduct["cannabinoids"]) ?? {},
      ratio: p.ratio as string | undefined,
      spectrum: p.spectrum as CannabisProduct["spectrum"] | undefined,
      effect_tags: (p.effect_tags as CannabisProduct["effect_tags"]) ?? [],
      dose_level: p.dose_level as CannabisProduct["dose_level"],
      onset_minutes: p.onset_minutes as number | undefined,
      duration_hours: p.duration_hours as number | undefined,
      flavor: p.flavor as string | undefined,
      pack_count: p.pack_count as number,
      price_inr: p.price_inr as number,
      in_stock: true,
      product_url: p.product_url as string | undefined,
      description: p.description as string | undefined,
    })
  );

  const research = {
    query: `Is ${brand.name} legit?`,
    verdict: verdictArgs.verdict ?? "unverified",
    findings: {
      coa_status: verdictArgs.coa_status,
      license: verdictArgs.license,
      reviews_summary: verdictArgs.reviews_summary,
      red_flags: verdictArgs.red_flags ?? [],
      summary: verdictArgs.summary ?? "No summary available.",
    },
    sources: input.context.length > 0 ? [`Research via ${input.context.length} sources`] : [],
    trust_score: blendedTrust,
  };

  return { brand, products, research, sources: research.sources };
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

  const products: CannabisProduct[] = [
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

  const research = {
    query: `Is ${input.brandName} legit?`,
    verdict: "unverified" as const,
    findings: {
      summary: "Mock research. Add OPENAI_API_KEY to extract real findings.",
    },
    sources: [],
    trust_score: 0.5,
  };

  return { brand, products, research, sources: [] };
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
