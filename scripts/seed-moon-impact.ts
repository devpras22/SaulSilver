/**
 * Moon Impact seed — real data scraped via browser from trymoonimpact.com.
 *
 * This is verified, hand-confirmed data (not the thin auto-scraper output).
 * Run: npx tsx scripts/seed-moon-impact.ts
 *
 * Source: trymoonimpact.com product pages + Instagram @trymoonimpact
 * Scraped: 2026-08-01
 */

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const BRAND_ID = "moon-impact";

async function seed() {
  // ── Brand ──
  const { error: brandErr } = await supabase.from("brands").upsert(
    {
      id: BRAND_ID,
      name: "Moon Impact",
      website: "https://trymoonimpact.com",
      tagline: "Precision Vijaya therapeutics. Nano-infused. Engineered differently.",
      category: "vijaya",
      region: "IN",
      rail: "d2c",
      legal_status: "schedule_e1_prescription",
      prescription_required: true,
      doctor_routing:
        "Place order → doctor team calls for consultation → prescription issued if suitable → shipped after approval. Option to upload existing prescription at checkout.",
      instagram_handle: "@trymoonimpact",
      instagram_followers: 7110,
      trust_score: 0.72,
      verified: true,
      last_researched: new Date().toISOString(),
      description:
        "Moon Impact is a precision-driven system for Vijaya-based therapeutics. Closed set of formulations, each engineered for a specific therapeutic function. Pharmaceutical-grade nano-infusion for faster onset (15-30 min vs 60-90 min standard) and superior absorption. Ministry of AYUSH Drug Licence No. 25D/55/96.",
      packaging_notes: "Premium metallic pouches, individually wrapped gummies",
    },
    { onConflict: "id" }
  );
  if (brandErr) console.error("brand upsert:", brandErr.message);

  // ── Products — replace all ──
  await supabase.from("products").delete().eq("brand_id", BRAND_ID);

  const { error: prodErr } = await supabase.from("products").insert([
    {
      brand_id: BRAND_ID,
      name: "Stellardust Nano-Infused Gummies",
      variant: "Heavy",
      cannabinoids: { total_extract_mg: 350 },
      ratio: "4:1 THC:CBD",
      spectrum: "full",
      effect_tags: ["relax", "sleep", "couch_lock", "euphoria"],
      dose_level: "heavy",
      onset_minutes: 20,
      duration_hours: 7,
      flavor: "dark berry",
      pack_count: 10,
      price_inr: 3300,
      in_stock: true,
      product_url: "https://trymoonimpact.com/products/stellardust",
      description:
        "350mg Vijaya extract per gummy. Full-spectrum 4:1 THC:CBD. Nano-infused for 15-30 min onset. Designed for users familiar with Vijaya and advised a higher-strength formulation. 4.55★ over 40 reviews.",
    },
    {
      brand_id: BRAND_ID,
      name: "Mission Brief Nano-Infused Gummies",
      variant: "Balanced daytime",
      cannabinoids: { total_extract_mg: 150 },
      ratio: "4:1 THC",
      spectrum: "full",
      effect_tags: ["focus", "relax", "social", "creativity"],
      dose_level: "intermediate",
      onset_minutes: 20,
      duration_hours: 6,
      flavor: "citrus",
      pack_count: 15,
      price_inr: 2650,
      in_stock: true,
      product_url: "https://trymoonimpact.com/products/missionbrief",
      description:
        "150mg Vijaya extract per gummy. Full-spectrum 4:1 THC. Nano-infused for 15-30 min onset. Balanced daytime formula — measured, modern, easier to approach than higher-strength formulations. Pack of 15.",
    },
  ]);
  if (prodErr) console.error("product insert:", prodErr.message);

  // ── Research audit trail ──
  const { error: resErr } = await supabase.from("brand_research").insert({
    brand_id: BRAND_ID,
    query: "Is Moon Impact legit?",
    verdict: "verified",
    findings: {
      coa_status: "claimed_not_shown",
      license: "Ministry of AYUSH Drug Licence No. 25D/55/96. Schedule E(1) medicine.",
      reviews_summary: "4.55 stars over 40 verified reviews on Stellardust. Users report strong effects at half a gummy. Price is the main complaint.",
      red_flags: ["No public Certificate of Analysis (COA)", "DRIFT and GROUND CONTROL listed as 'Coming soon' — product line incomplete"],
      summary:
        "Moon Impact is a legitimate Schedule E(1) Vijaya brand with an AYUSH drug licence. Nano-infusion is a genuine formulation differentiator (faster onset). Prescription flow is real — in-house doctor consultation before shipping. The main gap is no publicly visible COA, which is common in the Indian Vijaya market but not ideal.",
    },
    sources: [
      "https://trymoonimpact.com/products/stellardust",
      "https://trymoonimpact.com/products/missionbrief",
      "https://trymoonimpact.com/collections/all",
      "https://www.instagram.com/trymoonimpact/",
    ],
    trust_score: 0.72,
  });
  if (resErr) console.error("research insert:", resErr.message);

  // ── Verify ──
  const { data: brands } = await supabase.from("brands").select("name, trust_score, instagram_followers").eq("id", BRAND_ID);
  const { data: products } = await supabase.from("products").select("name, price_inr, pack_count").eq("brand_id", BRAND_ID);
  console.log("✓ Seeded:", brands, products);
}

seed().catch(console.error);
