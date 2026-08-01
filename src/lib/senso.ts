/**
 * Senso — trust context + reputation scoring.
 *
 * Used by the research agent to validate cannabis brand legitimacy.
 * Returns a normalized score (0–1) and human-readable context.
 *
 * The Senso integration for this hackathon uses their knowledge API.
 * If SENSO_API_KEY is unset or the call fails, we return a neutral
 * default so the trust math never produces garbage. The research
 * agent blends Senso (30%) with OpenAI's verdict (70%).
 */

const SENSO_BASE = process.env.SENSO_BASE_URL ?? "https://api.senso.ai/v1/search";

interface SensoResult {
  score: number; // ALWAYS 0–1, normalized + clamped
  context: string;
}

/** Clamp any number to 0–1 range. Senso or the model might return 0–100. */
function clamp01(n: number): number {
  // If it looks like a 0–100 score, normalize it.
  if (n > 1) return Math.min(n / 100, 1);
  return Math.max(0, Math.min(1, n));
}

export async function getPharmacyTrustContext(
  entityName: string
): Promise<SensoResult> {
  const apiKey = process.env.SENSO_API_KEY;

  // No key → neutral default. Don't fabricate trust.
  if (!apiKey) {
    return {
      score: 0.5,
      context: "Senso not configured — trust derived from research findings only.",
    };
  }

  try {
    const response = await fetch(SENSO_BASE, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        query: `What is the reliability score and trust context for ${entityName}?`,
        max_results: 3,
      }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "unknown");
      console.error(`[senso] API ${response.status} for "${entityName}":`, errText.slice(0, 200));
      return {
        score: 0.5,
        context: "Senso lookup failed — trust derived from research findings only.",
      };
    }

    const data = await response.json();
    const answer: string = data.answer ?? data.response ?? "";

    // Parse "95/100" or a bare number out of the answer.
    const scoreMatch = answer.match(/(\d{1,3})\s*(?:\/\s*100)?/);
    const rawScore = scoreMatch ? parseInt(scoreMatch[1], 10) : 50;

    return {
      score: clamp01(rawScore),
      context: answer || "No detailed context available.",
    };
  } catch (error) {
    console.error(`[senso] error for "${entityName}":`, error);
    return {
      score: 0.5,
      context: "Senso unavailable — trust derived from research findings only.",
    };
  }
}
