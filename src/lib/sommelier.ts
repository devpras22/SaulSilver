/**
 * SaulSilver sommelier matching engine.
 *
 * The differentiator. Takes a user's intent (what effect they're chasing,
 * their tolerance, ratio preference, budget) and ranks the catalog with
 * human-readable reasons.
 *
 * Not a single LLM call for the match — that's unreliable. The LLM handles
 * the *interview* (understanding natural language); this is deterministic
 * scoring logic that's explainable and reproducible. Reliability over magic.
 */

import type {
  Brand,
  CannabisPriority,
  CannabisProduct,
  Effect,
  ProductMatch,
  Tolerance,
  UserProfile,
} from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// TOLERANCE → DOSE COMPATIBILITY
// First-timers should never be matched to a "heavy" product. This is safety,
// not just preference — it's the "I'm not giving you 50mg on your first time"
// moment that makes the sommelier trustworthy.
// ─────────────────────────────────────────────────────────────────────────────

function doseCompatibility(
  product: CannabisProduct,
  tolerance?: Tolerance
): { score: number; warning?: string } {
  if (!tolerance) return { score: 1 };

  const heavy = product.dose_level === "heavy";
  const intermediate = product.dose_level === "intermediate";

  if (tolerance === "first_time" && heavy) {
    return {
      score: 0.1,
      warning: `This is a heavy dose. For your first time, I'd start lighter — this one could be overwhelming.`,
    };
  }
  if (tolerance === "first_time" && intermediate) {
    return { score: 0.5, warning: `Intermediate dose — manageable, but go slow (half a gummy).` };
  }
  if (tolerance === "occasional" && heavy) {
    return { score: 0.6 }; // fine, no warning
  }
  if (tolerance === "seasoned") {
    return { score: 1 }; // they know what they're doing
  }
  return { score: 0.8 };
}

// ─────────────────────────────────────────────────────────────────────────────
// EFFECT MATCHING
// How well a product's effect_tags align with what the user wants.
// ─────────────────────────────────────────────────────────────────────────────

function effectScore(product: CannabisProduct, desiredEffect?: Effect): number {
  if (!desiredEffect) return 0.5; // neutral if no effect specified
  if (product.effect_tags.includes(desiredEffect)) return 1;
  // Sympathetic effects — relax pairs with sleep, anxiety pairs with relax, etc.
  const synergies: Record<Effect, Effect[]> = {
    sleep: ["relax", "pain"],
    anxiety: ["relax", "sleep"],
    pain: ["sleep", "relax"],
    focus: ["creativity"],
    euphoria: ["social", "creativity"],
    social: ["euphoria", "creativity"],
    relax: ["sleep", "anxiety"],
    couch_lock: ["sleep", "relax"],
    munchies: ["euphoria", "social"],
    creativity: ["focus", "euphoria"],
  };
  const friends = synergies[desiredEffect] ?? [];
  const matches = friends.filter((f) => product.effect_tags.includes(f));
  if (matches.length > 0) return 0.7;
  return 0.2;
}

// ─────────────────────────────────────────────────────────────────────────────
// RATIO PREFERENCE
// ─────────────────────────────────────────────────────────────────────────────

function ratioScore(product: CannabisProduct, preference?: UserProfile["ratioPreference"]): number {
  if (!preference || preference === "you_decide") return 0.5;

  const totalThc = product.cannabinoids.thc_mg ?? 0;
  const totalCbd = product.cannabinoids.cbd_mg ?? 0;

  if (preference === "cbd" && totalCbd > totalThc) return 1;
  if (preference === "thc" && totalThc > totalCbd) return 1;
  if (preference === "balanced" && Math.abs(totalThc - totalCbd) <= totalThc * 0.3) return 1;
  return 0.3;
}

// ─────────────────────────────────────────────────────────────────────────────
// BUDGET FILTER
// ─────────────────────────────────────────────────────────────────────────────

function budgetScore(product: CannabisProduct, budgetMax?: number): number {
  if (!budgetMax) return 1;
  if (product.price_inr <= budgetMax) return 1;
  // Slightly over budget — penalize but don't exclude
  const overage = (product.price_inr - budgetMax) / budgetMax;
  if (overage < 0.15) return 0.6;
  return 0.1;
}

// ─────────────────────────────────────────────────────────────────────────────
// THE MATCH FUNCTION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Rank all products against the user's profile.
 * Returns sorted matches with reasons + warnings.
 */
export function matchProducts(
  products: CannabisProduct[],
  brands: Brand[],
  profile: UserProfile,
  priority: CannabisPriority = "effect"
): ProductMatch[] {
  const brandMap = new Map(brands.map((b) => [b.id, b]));

  const scored = products
    .filter((p) => p.in_stock)
    .map((product) => {
      const brand = brandMap.get(product.brand_id);
      if (!brand) return null;

      const effect = effectScore(product, profile.effect);
      const dose = doseCompatibility(product, profile.tolerance);
      const ratio = ratioScore(product, profile.ratioPreference);
      const budget = budgetScore(product, profile.budgetMax);
      const trust = brand.trust_score;

      // Weighted blend — effect is the headline, dose is a hard gate
      const matchScore =
        effect * 0.35 +
        dose.score * 0.25 +
        ratio * 0.15 +
        budget * 0.1 +
        trust * 0.15;

      return { product, brand, score: matchScore, dose, effect, ratio, budget, trust };
    })
    .filter((m): m is NonNullable<typeof m> => m !== null);

  // ── Re-rank by the user's chosen priority ──
  scored.sort((a, b) => {
    switch (priority) {
      case "cheapest":
        return a.product.price_inr - b.product.price_inr;
      case "confidence":
        return b.trust - a.trust;
      case "fastest":
        return (a.product.onset_minutes ?? 60) - (b.product.onset_minutes ?? 60);
      case "effect":
      default:
        return b.score - a.score;
    }
  });

  return scored.map((m) => ({
    product: m.product,
    brand: m.brand,
    score: m.score,
    reasons: buildReasons(m, profile),
    warnings: m.dose.warning ? [m.dose.warning] : undefined,
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// REASON BUILDER — the "why" behind each match
// ─────────────────────────────────────────────────────────────────────────────

function buildReasons(
  m: {
    product: CannabisProduct;
    brand: Brand;
    score: number;
    effect: number;
    ratio: number;
    budget: number;
    trust: number;
  },
  profile: UserProfile
): string[] {
  const reasons: string[] = [];
  const { product, brand } = m;

  // Effect
  if (profile.effect && m.effect === 1) {
    reasons.push(`Matched for ${profile.effect.replace("_", " ")}`);
  } else if (profile.effect && m.effect >= 0.7) {
    reasons.push(`Good fit for ${profile.effect.replace("_", " ")}`);
  }

  // Ratio
  if (product.ratio) {
    reasons.push(`${product.ratio} THC:CBD ratio`);
  }

  // Dose level
  reasons.push(`${product.dose_level} dose`);

  // Onset / duration
  if (product.onset_minutes && product.onset_minutes <= 30) {
    reasons.push(`Fast onset (~${product.onset_minutes}min)`);
  }
  if (product.duration_hours) {
    reasons.push(`${product.duration_hours}h duration`);
  }

  // Brand trust + social proof
  if (m.trust >= 0.8) {
    reasons.push(`${Math.round(m.trust * 100)}% trust score`);
  }
  if (brand.instagram_followers && brand.instagram_followers > 10000) {
    reasons.push(`${formatFollowers(brand.instagram_followers)} on Instagram`);
  }
  if (brand.packaging_notes) {
    reasons.push(brand.packaging_notes);
  }

  // Price per gummy
  const perGummy = Math.round(product.price_inr / product.pack_count);
  reasons.push(`₹${perGummy}/gummy`);

  return reasons;
}

function formatFollowers(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M followers`;
  if (n >= 1000) return `${(n / 1000).toFixed(0)}K followers`;
  return `${n} followers`;
}

// ─────────────────────────────────────────────────────────────────────────────
// THE INTERVIEW STATE MACHINE
// What the sommelier asks next, based on what it already knows.
// ─────────────────────────────────────────────────────────────────────────────

export type Question =
  | { field: "effect"; prompt: string }
  | { field: "tolerance"; prompt: string }
  | { field: "ratioPreference"; prompt: string }
  | { field: "budgetMax"; prompt: string }
  | { field: "region"; prompt: string }
  | { field: "done"; prompt: string };

/**
 * Given the current profile, what should the sommelier ask next?
 * Returns the first missing critical field, or "done" if ready to match.
 */
export function nextQuestion(profile: UserProfile): Question {
  if (!profile.effect) {
    return {
      field: "effect",
      prompt: "What are you chasing? Sleep, calm, focus, euphoria, pain relief — what's the vibe?",
    };
  }
  if (!profile.tolerance) {
    return {
      field: "tolerance",
      prompt: "How experienced are you? First time, occasional, or seasoned?",
    };
  }
  if (!profile.ratioPreference) {
    return {
      field: "ratioPreference",
      prompt: "Lean THC, lean CBD, balanced, or you decide?",
    };
  }
  return { field: "done", prompt: "Got enough. Let me find your match." };
}
