/**
 * Senso trust enrichment for the sommelier match.
 *
 * Bridges Senso's grounded trust signal into the brand objects the sommelier
 * scores. Kept separate from senso.ts (raw API) and sommelier.ts (pure scoring)
 * so each layer has one job.
 *
 * BLEND: 50% static Supabase trust_score + 50% Senso grounded signal.
 * - Supabase trust captures AYUSH licence, structured research (the anchor).
 * - Senso captures live reputation: verbatim reviews, delivery reliability,
 *   red flags (the dynamic signal judges score on).
 * 50/50 ensures Senso *materially* shifts the ranking (prize criterion) while
 * the structured anchor prevents a single bad Senso query from nuking a legit brand.
 *
 * Senso's relevance score (0-1) is treated as confidence-in-the-answer, not
 * trust-in-the-brand. A high-relevance match on a red-flag question should LOWER
 * trust, not raise it. So we ask a balanced question and let the grounded answer
 * (not just the score) flow into context for the agent to reason over.
 */

import type { Brand } from "./types";
import { getBrandTrustScore, isSensoConfigured } from "./senso";

const SUPABASE_WEIGHT = 0.5;
const SENSO_WEIGHT = 0.5;

/**
 * Enrich a list of brands with Senso's grounded trust signal.
 * Returns new brand objects with trust_score = blend(Supabase, Senso).
 * Falls back to static-only if Senso is unconfigured or all queries fail.
 *
 * Queries run in parallel (Promise.all) — one round-trip regardless of brand count.
 * Per-brand failures degrade gracefully to static trust (no nuke).
 */
export async function enrichBrandsWithSensoTrust(brands: Brand[]): Promise<Brand[]> {
  // Fast path: Senso not configured → return as-is, static trust stands.
  if (!isSensoConfigured() || brands.length === 0) {
    return brands;
  }

  const enriched = await Promise.all(
    brands.map(async (brand) => {
      try {
        const senso = await getBrandTrustScore(brand.name);
        // Clamp Senso score to [0,1] defensively — API should return 0-1 but don't trust it.
        const sensoScore = Math.max(0, Math.min(1, senso.score));
        const blended = brand.trust_score * SUPABASE_WEIGHT + sensoScore * SENSO_WEIGHT;

        return {
          ...brand,
          trust_score: Math.round(blended * 100) / 100, // 2dp — matches Supabase numeric precision
          // Stash the Senso context on the brand so the agent can surface it in reasons.
          // (Brand type doesn't have this field, but the match flow reads it optionally.)
          _sensoContext: senso.context,
          _sensoSources: senso.sources,
        } as Brand & { _sensoContext?: string; _sensoSources?: string[] };
      } catch (e) {
        console.warn(`[senso-trust] enrichment failed for "${brand.name}", using static trust:`, e instanceof Error ? e.message : e);
        return brand;
      }
    })
  );

  return enriched;
}

/** Extract Senso context stashed on an enriched brand (for the reason builder). */
export function getSensoContext(brand: Brand): { context?: string; sources?: string[] } {
  const enriched = brand as Brand & { _sensoContext?: string; _sensoSources?: string[] };
  return { context: enriched._sensoContext, sources: enriched._sensoSources };
}
