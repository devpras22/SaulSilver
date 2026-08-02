/**
 * The Trost seed — real data from thetrost.com (browser-scraped + user-confirmed).
 *
 * Includes the full medical detail: key uses, warnings, composition, side effects,
 * plus AYUSH licence. This is the depth people actually read to compare brands.
 *
 * Run: npx tsx scripts/seed-the-trost.ts
 * Source: thetrost.com product pages + collection pages + about (reviews)
 * Scraped: 2026-08-02
 *
 * Honest notes baked into the data:
 *  - THC/CBD mg is NOT disclosed by Trost. They publish only "% cannabis leaf
 *    extract" + total extract mg. So cannabinoids uses { total_extract_mg } only
 *    and ratio is null (never fabricated).
 *  - COA is not published. Treated as a neutral disclosure note (coa_status:
 *    "absent"), NOT a red flag — the AYUSH licence is the legit credential here.
 *    The sommelier surfaces "no COA vs has COA" as a comparison axis for users.
 */

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const BRAND_ID = "the-trost";

async function seed() {
  // ── Brand ──
  const { error: brandErr } = await supabase.from("brands").upsert(
    {
      id: BRAND_ID,
      name: "The Trost",
      website: "https://thetrost.com",
      tagline:
        "India's first legal hemp rollens. CBD oil, Vijaya leaf gummies & nutrition. Legally safe, natural wellness.",
      category: "vijaya", // product pages + IG bio say "Vijaya (Cannabis Leaf Extract)"
      region: "IN",
      rail: "d2c", // own Shopify/Hydrogen checkout; "closes live" on landing page
      legal_status: "schedule_e1_prescription", // AYUSH-licensed, in-house Rx
      prescription_required: true,
      doctor_routing:
        "Order placed → in-house doctor provides a free prescription shortly after purchase → doctor's note included for smooth security checks. Option to upload an existing prescription at checkout.",
      support_email: "info@thetrost.com", // REAL — footer "Connect" + FAQ "Email us", every page
      instagram_handle: "@thetrostofficial",
      instagram_followers: 17800, // 17.8K (verified)
      trust_score: 0.74,
      verified: true,
      last_researched: new Date().toISOString(),
      description:
        "The Trost is an Indian legal-hemp wellness brand (New Delhi) selling Vijaya/cannabis-leaf gummies, CBD oil, hemp 'rollens' (cigarettes) and hemp nutrition. AYUSH-licensed (A-4906/2021) with an in-house doctor who issues prescriptions post-purchase. Two gummy lines — Kosha (Ayurvedic, 20-count) and Mello (thinner, 16-count) — across four strength tiers (5%, 7.25%, 9.26%, 13% cannabis leaf extract).",
      packaging_notes: "Discreet packaging per customer reports; sold in single / Pack-of-2 / Pack-of-5 multipacks.",
      licences: [{ type: "AYUSH", number: "A-4906/2021" }],
    },
    { onConflict: "id" }
  );
  if (brandErr) console.error("brand upsert:", brandErr.message);

  // ── Products — replace all ──
  await supabase.from("products").delete().eq("brand_id", BRAND_ID);

  // Shared across all SKUs (brand-standard formula + warnings).
  // Trost does NOT disclose THC vs CBD — only "% cannabis leaf extract" + total mg,
  // so ratio stays null and cannabinoids uses total_extract_mg only. Never invented.
  const sharedWarnings = [
    "Avoid driving or operating machinery after use",
    "Effects take 30 min to 2 hours to appear — do not take more too soon",
    "Skip alcohol & caffeine — they can alter how the gummy affects you",
    "Too much may cause discomfort",
    "Keep out of reach of children",
    "Consult your doctor before use",
  ];
  const sharedSideEffects = [
    "drowsiness",
    "altered appetite",
    "potential tachycardia at higher doses (one ER report after a single gummy)",
    "inconsistent potency between batches (recurring user report)",
  ];

  const { error: prodErr } = await supabase.from("products").insert([
    // ── Kosha (Ayurvedic, 20-count) line ──
    {
      brand_id: BRAND_ID,
      name: "Kosha Gummies — 5% Cannabis Leaf Extract (Cola)",
      variant: "Beginner",
      cannabinoids: { total_extract_mg: 135 },
      ratio: null,
      spectrum: "full",
      effect_tags: ["focus", "relax", "social"],
      dose_level: "beginner",
      onset_minutes: 90,
      duration_hours: 6,
      flavor: "cola",
      pack_count: 20,
      price_inr: 1999,
      in_stock: true,
      product_url: "https://thetrost.com/products/cannabis-leaf-extract-kosha-gummies",
      description:
        "5% Vijaya (cannabis leaf) extract, 135mg total over 20 gummies. 'Beginner strength' — supports focus, mood stability and creativity. AYUSH-licensed. In-house doctor prescription included.",
      key_uses: "Mild daily stress, focus, mood stability. Marketed as the entry-level strength for first-time users.",
      warnings: sharedWarnings,
      composition: { "Cannabis (Vijaya) Leaf Extract": "5%", "Total extract": "135mg", "Cola flavour": "present", FOS: "present", Pectin: "present", "Citric Acid": "present" },
      side_effects: sharedSideEffects,
    },
    {
      brand_id: BRAND_ID,
      name: "Kosha Gummies — 5% Cannabis Leaf Extract (Mint)",
      variant: "Beginner",
      cannabinoids: { total_extract_mg: 135 },
      ratio: null,
      spectrum: "full",
      effect_tags: ["focus", "relax", "social"],
      dose_level: "beginner",
      onset_minutes: 90,
      duration_hours: 6,
      flavor: "mint",
      pack_count: 20,
      price_inr: 1999,
      in_stock: true,
      product_url: "https://thetrost.com/products/kosha-mriduvati-edible-cannabis-gummies-mint-flavor",
      description:
        "5% Vijaya (cannabis leaf) extract, 135mg total over 20 gummies. Mint flavour. 'Beginner strength' — supports focus, mood stability and creativity. AYUSH-licensed. In-house doctor prescription included.",
      key_uses: "Mild daily stress, focus, mood stability. Entry-level strength for first-time users.",
      warnings: sharedWarnings,
      composition: { "Cannabis (Vijaya) Leaf Extract": "5%", "Total extract": "135mg", "Mint flavour": "present", FOS: "present", Pectin: "present", "Citric Acid": "present" },
      side_effects: sharedSideEffects,
    },
    {
      brand_id: BRAND_ID,
      name: "Kosha Gummies — 7.25% Cannabis Leaf Extract (Cola)",
      variant: "Gentle",
      cannabinoids: { total_extract_mg: 197 },
      ratio: null,
      spectrum: "full",
      effect_tags: ["relax", "anxiety"],
      dose_level: "beginner",
      onset_minutes: 90,
      duration_hours: 6,
      flavor: "cola",
      pack_count: 20,
      price_inr: 2999,
      in_stock: true,
      product_url: "https://thetrost.com/products/kosha-cola-flavor-cannabis-gummies-mriduvati-195mg",
      description:
        "7.25% Vijaya (cannabis leaf) extract, 197mg total over 20 gummies. 'Gentle strength' — the bridge between beginner and transitional; supports relaxation and stress relief. AYUSH-licensed. In-house doctor prescription included.",
      key_uses: "Everyday relaxation, mild anxiety and stress relief.",
      warnings: sharedWarnings,
      composition: { "Cannabis (Vijaya) Leaf Extract": "7.25%", "Total extract": "197mg", "Cola flavour": "present", FOS: "present", Pectin: "present", "Citric Acid": "present" },
      side_effects: sharedSideEffects,
    },
    {
      brand_id: BRAND_ID,
      name: "Kosha Gummies — 9.26% Cannabis Leaf Extract (Cola)",
      variant: "Transitional",
      cannabinoids: { total_extract_mg: 250 },
      ratio: null,
      spectrum: "full",
      effect_tags: ["relax", "anxiety", "sleep"],
      dose_level: "intermediate",
      onset_minutes: 90,
      duration_hours: 6,
      flavor: "cola",
      pack_count: 20,
      price_inr: 3999,
      in_stock: true,
      product_url: "https://thetrost.com/products/kosha-cola-flavor-cannabis-gummies-mriduvati-9-26-cannabis-extract",
      description:
        "9.26% Vijaya (cannabis leaf) extract, 250mg total over 20 gummies. 'Transitional strength' — supports relaxation, anxiety & stress relief, and sleep. AYUSH-licensed. In-house doctor prescription included.",
      key_uses: "Relaxation, anxiety and stress relief, sleep support.",
      warnings: sharedWarnings,
      composition: { "Cannabis (Vijaya) Leaf Extract": "9.26%", "Total extract": "250mg", "Cola flavour": "present", FOS: "present", Pectin: "present", "Citric Acid": "present" },
      side_effects: sharedSideEffects,
    },
    {
      brand_id: BRAND_ID,
      name: "Kosha Gummies — 13% Cannabis Leaf Extract (Mriduvati, Berry Blast)",
      variant: "Mriduvati (Heavy)",
      cannabinoids: { total_extract_mg: 352 },
      ratio: null,
      spectrum: "full",
      effect_tags: ["sleep", "relax", "pain"],
      dose_level: "heavy",
      onset_minutes: 90,
      duration_hours: 6,
      flavor: "berry blast",
      pack_count: 20,
      price_inr: 5999,
      in_stock: true,
      product_url: "https://thetrost.com/products/kosha-cola-flavor-cannabis-gummies-mriduvati-13-cannabis-extract",
      description:
        "13% Vijaya (cannabis leaf) extract, 352mg total over 20 gummies. 'Mriduvati strength' — for restorative sleep and strength recovery when daily stress leaves you persistently fatigued. AYUSH-licensed. In-house doctor prescription included. ~4-5★ over 11 reviews.",
      key_uses: "Restorative sleep, stress recovery, mood stability, mild pain & inflammation. Marketed for sleep and relaxation.",
      warnings: sharedWarnings,
      composition: { "Cannabis (Vijaya) Leaf Extract": "13%", "Total extract": "352mg", "Berry Blast flavour": "4%", FOS: "present", Pectin: "present", "Citric Acid": "present" },
      side_effects: sharedSideEffects,
    },
    // ── Mello (thinner, 16-count) line ──
    {
      brand_id: BRAND_ID,
      name: "Mello Gummies — 5% Cannabis Leaf Extract (Cola)",
      variant: "Beginner",
      cannabinoids: { total_extract_mg: 135 },
      ratio: null,
      spectrum: "full",
      effect_tags: ["focus", "relax", "social"],
      dose_level: "beginner",
      onset_minutes: 90,
      duration_hours: 6,
      flavor: "cola",
      pack_count: 16,
      price_inr: 1999,
      in_stock: true,
      product_url: "https://thetrost.com/products/mello-gummies-cola-flavour-5-cannabis-leaf-extract",
      description:
        "5% Vijaya (cannabis leaf) extract, 135mg total over 16 gummies. Thinner Mello line — supports focus, mood and creativity. AYUSH-licensed. In-house doctor prescription included.",
      key_uses: "Mild daily stress, focus, mood stability. Entry-level strength.",
      warnings: sharedWarnings,
      composition: { "Cannabis (Vijaya) Leaf Extract": "5%", "Total extract": "135mg", "Cola flavour": "present", FOS: "present", Pectin: "present", "Citric Acid": "present" },
      side_effects: sharedSideEffects,
    },
    {
      brand_id: BRAND_ID,
      name: "Mello Gummies — 7.25% Cannabis Leaf Extract (Cola)",
      variant: "Gentle",
      cannabinoids: { total_extract_mg: 197 },
      ratio: null,
      spectrum: "full",
      effect_tags: ["relax", "anxiety"],
      dose_level: "beginner",
      onset_minutes: 90,
      duration_hours: 6,
      flavor: "cola",
      pack_count: 16,
      price_inr: 2999,
      in_stock: true,
      product_url: "https://thetrost.com/products/mello-gummies-cola-flavour-7-25-cannabis-leaf-extract-copy",
      description:
        "7.25% Vijaya (cannabis leaf) extract, 197mg total over 16 gummies. Thinner Mello line — supports relaxation and stress relief. AYUSH-licensed. In-house doctor prescription included.",
      key_uses: "Everyday relaxation, mild anxiety and stress relief.",
      warnings: sharedWarnings,
      composition: { "Cannabis (Vijaya) Leaf Extract": "7.25%", "Total extract": "197mg", "Cola flavour": "present", FOS: "present", Pectin: "present", "Citric Acid": "present" },
      side_effects: sharedSideEffects,
    },
    {
      brand_id: BRAND_ID,
      name: "Mello Gummies — 9.26% Cannabis Leaf Extract (Cola)",
      variant: "Transitional",
      cannabinoids: { total_extract_mg: 250 },
      ratio: null,
      spectrum: "full",
      effect_tags: ["relax", "anxiety", "sleep"],
      dose_level: "intermediate",
      onset_minutes: 90,
      duration_hours: 6,
      flavor: "cola",
      pack_count: 16,
      price_inr: 3999,
      in_stock: true,
      product_url: "https://thetrost.com/products/mello-gummies-cola-flavour-9-26-cannabis-leaf-extract",
      description:
        "9.26% Vijaya (cannabis leaf) extract, 250mg total over 16 gummies. Thinner Mello line — supports relaxation, anxiety & stress relief, and sleep. AYUSH-licensed. In-house doctor prescription included.",
      key_uses: "Relaxation, anxiety and stress relief, sleep support.",
      warnings: sharedWarnings,
      composition: { "Cannabis (Vijaya) Leaf Extract": "9.26%", "Total extract": "250mg", "Cola flavour": "present", FOS: "present", Pectin: "present", "Citric Acid": "present" },
      side_effects: sharedSideEffects,
    },
    {
      brand_id: BRAND_ID,
      name: "Mello Gummies — 13% Cannabis Leaf Extract (Cola)",
      variant: "Mriduvati (Heavy)",
      cannabinoids: { total_extract_mg: 141 },
      ratio: null,
      spectrum: "full",
      effect_tags: ["sleep", "relax", "pain"],
      dose_level: "intermediate", // Mello 13% is 141mg (smaller pack) — intermediate, not heavy
      onset_minutes: 90,
      duration_hours: 6,
      flavor: "cola",
      pack_count: 16,
      price_inr: 5999,
      in_stock: true,
      product_url: "https://thetrost.com/products/mello-gummies-cola-flavour-13-cannabis-leaf-extract",
      description:
        "13% Vijaya (cannabis leaf) extract, 141mg total over 16 gummies. Thinner Mello line at the highest concentration — supports restorative sleep and stress recovery. AYUSH-licensed. In-house doctor prescription included.",
      key_uses: "Restorative sleep, stress recovery, mood stability, mild pain & inflammation.",
      warnings: sharedWarnings,
      composition: { "Cannabis (Vijaya) Leaf Extract": "13%", "Total extract": "141mg", "Cola flavour": "present", FOS: "present", Pectin: "present", "Citric Acid": "present" },
      side_effects: sharedSideEffects,
    },
  ]);
  if (prodErr) console.error("product insert:", prodErr.message);

  // ── Research audit trail ──
  await supabase.from("brand_research").delete().eq("brand_id", BRAND_ID).eq("query", "Is The Trost legit?");
  const { error: resErr } = await supabase.from("brand_research").insert({
    brand_id: BRAND_ID,
    query: "Is The Trost legit?",
    verdict: "verified",
    findings: {
      coa_status: "absent", // not published — neutral disclosure note, not a red flag
      license:
        "AYUSH Licence No. A-4906/2021 (Ministry of AYUSH Certified, per footer + product pages). In-house doctor issues a free prescription post-purchase.",
      reviews_summary:
        "190+ dated, attributed reviews across products spanning 2022-2025. Strong recurring praise for sleep, anxiety relief and relaxation. Recurring complaints: (1) potency inconsistency between batches ('used to need half, now need 2-3'), (2) bitter/raw taste ('tastes like bhang/Chyawanprash'), (3) delivery delays, (4) price ('too expensive to sustain'). One serious adverse-event report (tachycardia -> ER after 1 gummy for period cramps).",
      red_flags: [
        "Recurring batch-potency inconsistency reports ('last batch was weak', 'effect extremely inconsistent across same doses').",
        "One adverse-event report: tachycardia -> ER after a single gummy for period cramps (K S, 16 Oct 2025).",
        "Multiple 'never received order / no refund' and 'no prescription sent after consultation' complaints.",
      ],
      summary:
        "The Trost is a legitimate, AYUSH-licensed (A-4906/2021) Indian legal-hemp brand with a real in-house-doctor prescription flow, 17.8K IG followers, 190+ reviews over 3+ years, and a verifiable New Delhi address. Stronger review base and longer track record than typical peers, but held back from a higher score by recurring batch-potency inconsistency, undisclosed THC/CBD ratios, and the 'CBD Gummies' vs 'Vijaya (Cannabis Leaf Extract)' marketing ambiguity. No public COA — a disclosure choice, not a disqualifier; the AYUSH licence is the legit credential, same as peers that also publish no COA.",
    },
    sources: [
      "https://thetrost.com",
      "https://thetrost.com/products/kosha-cola-flavor-cannabis-gummies-mriduvati-13-cannabis-extract",
      "https://thetrost.com/collections/trost-gummies",
      "https://thetrost.com/about",
      "https://thetrost.com/pages/contact-us",
      "https://www.instagram.com/thetrostofficial/",
    ],
    trust_score: 0.74,
  });
  if (resErr) console.error("research insert:", resErr.message);

  // ── Verify ──
  const { data: products } = await supabase
    .from("products")
    .select("name, price_inr, pack_count, key_uses, composition")
    .eq("brand_id", BRAND_ID);
  console.log("✓ Seeded The Trost —", products?.length, "products with full medical detail");
}

seed().catch(console.error);
