/**
 * Product + brand serialization for the agent (Saul).
 *
 * WHY THIS EXISTS (the architecture decision):
 * The webhook used to hand Saul a hand-picked summary string — name + price +
 * a truncated description. So whenever a user asked about ANYTHING other than
 * name/price ("strongest?", "Ashwagandha?", "what do reviews say?", "side
 * effects?", "is it licensed?"), Saul had no data in context and answered from
 * vibes. Building a helper per question type (potency, ingredients, reviews…)
 * is unmaintainable sprawl.
 *
 * Instead: ONE serializer that dumps the FULL product + brand + research record
 * into a compact, agent-readable block. Whatever the user asks about, the answer
 * is already in Saul's context — because all the structured fields we captured
 * during research are right there. No new helper when a new question type shows up.
 *
 * Token-conscious: only includes fields that are actually populated, and keeps
 * each line tight. A full product brief is ~80-150 tokens.
 */

import type { CannabisProduct, Brand, BrandResearch } from "./types";

/** The single number we rank "strongest" by: mg of active cannabinoid per gummy. */
export function potencyPerGummy(p: CannabisProduct): number {
  const c = p.cannabinoids ?? {};
  if (typeof c.thc_mg === "number" && c.thc_mg > 0) {
    return c.thc_mg / Math.max(p.pack_count, 1);
  }
  if (typeof c.total_extract_mg === "number" && c.total_extract_mg > 0) {
    return c.total_extract_mg / Math.max(p.pack_count, 1);
  }
  return 0;
}

/**
 * The complete product brief — every populated field, one block.
 * This is what goes into Saul's tool-result so he can answer ANY product
 * question (strength, ingredients, effects, reviews, side effects) from data.
 */
export function productBrief(
  product: CannabisProduct,
  brand: Pick<Brand, "name" | "trust_score" | "instagram_followers">,
  research?: Pick<BrandResearch, "findings"> | null
): string {
  const lines: string[] = [];
  const c = product.cannabinoids ?? {};

  // ── Strength (the "strongest" / "most THC" answer) ──
  const strengthParts: string[] = [];
  if (typeof c.thc_mg === "number" && c.thc_mg > 0) {
    strengthParts.push(`${c.thc_mg}mg THC`);
    if (typeof c.cbd_mg === "number" && c.cbd_mg > 0) strengthParts.push(`${c.cbd_mg}mg CBD`);
  } else if (typeof c.total_extract_mg === "number" && c.total_extract_mg > 0) {
    strengthParts.push(`${c.total_extract_mg}mg total extract`);
  }
  if (strengthParts.length) {
    const perGummy = potencyPerGummy(product);
    lines.push(`strength: ${strengthParts.join(" + ")}${perGummy > 0 ? ` (${perGummy.toFixed(1)}mg/gummy)` : ""}${product.dose_level ? `, ${product.dose_level} dose` : ""}${product.ratio ? `, ${product.ratio} ratio` : ""}`);
  } else if (product.dose_level) {
    lines.push(`strength: ${product.dose_level} dose`);
  }

  // ── Ingredients / composition (the "Ashwagandha?" answer) ──
  if (product.composition && Object.keys(product.composition).length > 0) {
    const comp = Object.entries(product.composition)
      .map(([k, v]) => `${k}${v && v !== "present" ? `: ${v}` : ""}`)
      .join(", ");
    lines.push(`ingredients: ${comp}`);
  }

  // ── Effects (the "for sleep?" answer) ──
  const effectBits: string[] = [];
  if (product.effect_tags?.length) effectBits.push(product.effect_tags.join(", "));
  if (product.variant) effectBits.push(`${product.variant} variant`);
  if (product.key_uses) effectBits.push(product.key_uses);
  if (effectBits.length) lines.push(`effects/uses: ${effectBits.join(" | ")}`);

  // ── Timing (the "how fast?" answer) ──
  const timingBits: string[] = [];
  if (product.onset_minutes) timingBits.push(`onset ~${product.onset_minutes}min`);
  if (product.duration_hours) timingBits.push(`lasts ~${product.duration_hours}h`);
  if (timingBits.length) lines.push(`timing: ${timingBits.join(", ")}`);

  // ── Price ──
  const perGummyPrice = product.pack_count > 0 ? Math.round(product.price_inr / product.pack_count) : null;
  lines.push(`price: ₹${product.price_inr}${perGummyPrice ? ` (₹${perGummyPrice}/gummy, ${product.pack_count} pack)` : ""}`);

  // ── Flavor ──
  if (product.flavor) lines.push(`flavor: ${product.flavor}`);

  // ── Brand trust (the "is this legit?" answer) ──
  const brandBits: string[] = [];
  if (typeof brand.trust_score === "number") brandBits.push(`${Math.round(brand.trust_score * 100)}% trust`);
  if (brand.instagram_followers && brand.instagram_followers > 0) brandBits.push(`${formatFollowers(brand.instagram_followers)} IG`);
  if (brandBits.length) lines.push(`brand: ${brand.name} — ${brandBits.join(", ")}`);

  // ── Reviews / sentiment (the "what do people say?" answer) ──
  const f = research?.findings as Record<string, unknown> | undefined;
  if (f) {
    const reviewBits: string[] = [];
    if (typeof f.reviews_summary === "string" && f.reviews_summary.trim()) {
      reviewBits.push(f.reviews_summary.trim());
    }
    if (Array.isArray(f.red_flags) && f.red_flags.length > 0) {
      reviewBits.push(`red flags: ${(f.red_flags as string[]).join("; ")}`);
    }
    if (typeof f.license === "string" && f.license.trim()) {
      reviewBits.push(`licence: ${f.license}`);
    }
    if (reviewBits.length) lines.push(`reviews/research: ${reviewBits.join(" | ")}`);
  }

  // ── Warnings / side effects (the "is it safe?" answer) ──
  const safetyBits: string[] = [];
  if (Array.isArray(product.warnings) && product.warnings.length > 0) {
    safetyBits.push(...product.warnings.slice(0, 3));
  }
  if (Array.isArray(product.side_effects) && product.side_effects.length > 0) {
    safetyBits.push(`side effects: ${product.side_effects.slice(0, 3).join(", ")}`);
  }
  if (safetyBits.length) lines.push(`safety: ${safetyBits.join(" | ")}`);

  return lines.join("\n  ");
}

/** Sort by strength, strongest first — deterministic "strongest" answer. */
export function sortByPotency<T extends { product: CannabisProduct }>(items: T[]): T[] {
  return [...items].sort((a, b) => potencyPerGummy(b.product) - potencyPerGummy(a.product));
}

function formatFollowers(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(0)}K`;
  return `${n}`;
}
