/**
 * Seed Senso KB with Moon Impact's trust doc.
 *
 * This is the Senso-side companion to scripts/seed-moon-impact.ts (which seeds
 * Supabase). Senso gets the UNSTRUCTURED reputation signal — the verbatim
 * comments, review quotes, delivery reports, red flags — that Supabase can't
 * hold cleanly. The sommelier then queries Senso per candidate brand during
 * matching to get a grounded trust answer.
 *
 * Run: npx tsx scripts/seed-senso-moon-impact.ts
 *
 * Deep data (IG comments, review quotes) is PLACEHOLDER for now — replace with
 * real scraped content before judging. The structured facts (AYUSH licence,
 * composition, products) are real and pulled from the Moon Impact seed.
 */

import { config } from "dotenv";
config({ path: ".env.local" });
import { ingestBrand, waitUntilIndexed, searchTrust, isSensoConfigured } from "../src/lib/senso";

async function seed() {
  if (!isSensoConfigured()) {
    console.error("✗ SENSO_API_KEY not set in .env.local.");
    process.exit(1);
  }

  console.log("→ Ingesting Moon Impact trust doc into Senso…");
  const contentId = await ingestBrand({
    brandName: "Moon Impact",
    brandSlug: "moon-impact",
    website: "https://trymoonimpact.com",
    summary:
      "Moon Impact is a precision-driven system for Vijaya-based therapeutics. Pharmaceutical-grade nano-infusion for faster onset (15-30 min vs 60-90 min standard). Schedule E(1) medicine requiring prescription.",
    licenceInfo:
      "Ministry of AYUSH Drug Licence No. 25D/55/96. Schedule E(1) medicine. Prescription required — routed via in-house doctor consultation before shipping.",
    products: [
      {
        name: "Stellardust Nano-Infused Gummies",
        cannabinoids: "350mg Vijaya extract, full-spectrum 4:1 THC:CBD",
        priceInr: 3300,
        flavor: "dark berry",
        keyUses:
          "Chronic pain, disturbed sleep, chemotherapy-induced nausea & vomiting, muscle spasticity, neurological conditions.",
      },
      {
        name: "Mission Brief Nano-Infused Gummies",
        cannabinoids: "150mg Vijaya extract, full-spectrum 4:1 THC",
        priceInr: 2650,
        flavor: "citrus",
        keyUses: "Balanced daytime — chronic pain, mood, focus.",
      },
    ],
    // TODO: replace with real scraped comments/reviews before judging.
    instagramComments: [
      "Tastes way better than other Vijaya gummies I've tried.",
      "Half a Stellardust knocked me out — start slow.",
      "Mission Brief is my daytime go-to, no couch lock.",
      "Pricey but the nano onset is real, hits in 20 min.",
      "Packaging looks premium, individually wrapped.",
    ],
    reviewQuotes: [
      "4.55 stars over 40 verified reviews on Stellardust.",
      "Delivery to Mumbai took 4 days, discreet packaging.",
      "Doctor called within an hour of ordering for the prescription.",
      "Strong effect at half a gummy. Price is the main complaint — too costly to make it regular purchase.",
      "Customer support replied on WhatsApp same day.",
    ],
    redFlags: [
      "No public Certificate of Analysis (COA) — common in Indian Vijaya market.",
      "DRIFT and GROUND CONTROL listed as 'Coming soon' — product line incomplete.",
      "Price point ($40+/pack) limits repeat purchases per user reports.",
    ],
  });

  console.log(`→ Ingested (content_id: ${contentId}). Waiting for indexing…`);
  await waitUntilIndexed(contentId);
  console.log("✓ Indexed.");

  // ── Verify: query Senso and confirm the grounded answer cites our doc ──
  console.log("\n→ Test query: 'Does Moon Impact deliver on time and taste good?'");
  const result = await searchTrust("Does Moon Impact deliver on time and taste good?");
  console.log("  Answer:", result.answer);
  console.log("  Score:", result.score.toFixed(3));
  console.log("  Sources:", result.sources);

  console.log("\n✓ Moon Impact trust doc live in Senso.");
}

seed().catch((e) => {
  console.error("✗ Failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
