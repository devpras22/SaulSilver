# Brand Seeding Runbook

> **Goal:** Take a cannabis gummy brand from a website URL → 3 fully-populated Supabase rows (`brands` + `products` + `brand_research`).
>
> This is exactly the process that produced the **Moon Impact** seed (`scripts/seed-moon-impact.ts`). Follow it verbatim for the other 12 brands.
>
> **Reference files in this repo:**
> - Schema: `supabase/schema.sql`
> - Canonical seed (the gold example): `scripts/seed-moon-impact.ts`
> - Agent's automated version: `src/lib/research.ts`
> - TypeScript types: `src/lib/types.ts`

---

## The 3 tables you're writing to

| Table | What it is | 1 row per | Public read? |
|---|---|---|---|
| `brands` | The cannabis company | brand | ✅ yes |
| `products` | The SKUs (gummies) | product variant | ✅ yes |
| `brand_research` | The "is it legit?" audit trail | research query | ✅ yes |

Writes are **server-side only** (service-role key bypasses RLS). A browser client cannot mutate these tables.

---

## The process (7 steps)

### 1. Find the brand

Start from the brand's website URL (e.g. `https://trymoonimpact.com`).

### 2. Browse the site manually

This is the non-negotiable part. Open the site in a browser and click through:
- **Homepage** → tagline, brand positioning, AYUSH/legal claims
- **/products or /collections/all** → every gummy SKU they sell
- **Each product page** → name, cannabinoid mg, ratio, pack count, price, composition, warnings, key uses, side effects, reviews
- **Footer / About / Contact** → Instagram handle, support email, prescription flow
- **Instagram** → follower count, engagement, post style

**Do NOT skip product pages.** Homepage marketing copy is useless for matching. The depth people actually compare on (composition %, warnings, onset time, key medical uses) only lives on the SKU page. Moon Impact's composition table (`Ashwagandha 11%, Vijaya 3%`, etc.) was on the product page, not the homepage.

### 3. Capture the brand-level fields

Every field below has an example value from Moon Impact. Match this exactly.

| Field | Type | Required | Example (Moon Impact) |
|---|---|---|---|
| `id` | text (slug) | ✅ | `"moon-impact"` — lowercase, hyphenated |
| `name` | text | ✅ | `"Moon Impact"` |
| `website` | text | ✅ | `"https://trymoonimpact.com"` |
| `tagline` | text | | `"Precision Vijaya therapeutics. Nano-infused. Engineered differently."` |
| `category` | enum | ✅ | `"vijaya"` (others: `cbd`, `hemp`, `isolate`) |
| `region` | text | ✅ | `"IN"` (or `US-CA`, `global`) |
| `rail` | enum | ✅ | `"d2c"` (sells on own site) or `"marketplace"` (only on ItsHemp/Hempkart) |
| `marketplaces` | text[] | | `null` for d2c; `["itshemp","hempkart"]` for marketplace |
| `legal_status` | enum | ✅ | `"schedule_e1_prescription"` (others: `otc_cbd`, `unregulated`) |
| `prescription_required` | boolean | ✅ | `true` for Vijaya; `false` for CBD isolate |
| `doctor_routing` | text | | `"Place order → doctor team calls for consultation → prescription issued if suitable → shipped after approval. Option to upload existing prescription at checkout."` |
| `licences` | jsonb | | `[{ "type": "AYUSH", "number": "25D/55/96" }]` |
| `instagram_handle` | text | | `"@trymoonimpact"` |
| `instagram_followers` | integer | | `7110` |
| `instagram_engagement` | numeric | | `null` (if not discoverable) |
| `trust_score` | numeric (0–1) | ✅ | `0.72` — see step 6 for how to derive |
| `verified` | boolean | ✅ | `true` if researched + legit |
| `last_researched` | timestamptz | ✅ | `new Date().toISOString()` |
| `description` | text | | 2–3 sentence brand overview |
| `packaging_notes` | text | | `"Premium metallic pouches, individually wrapped gummies"` |

### 4. Capture a `products` row for EVERY gummy SKU

Most brands have 1–4 products. Moon Impact had 2. **Insert one row per SKU.**

| Field | Type | Required | Example (Stellardust) |
|---|---|---|---|
| `brand_id` | text | ✅ | `"moon-impact"` (FK to brands.id) |
| `name` | text | ✅ | `"Stellardust Nano-Infused Gummies"` |
| `variant` | text | | `"Heavy"` (or `Sleep`/`Relax`/`Focus`/`Uplift`/`Balanced daytime`) |
| `cannabinoids` | jsonb | ✅ | `{ "total_extract_mg": 350 }` — or `{ "thc_mg": 100, "cbd_mg": 100 }` |
| `ratio` | text | | `"4:1 THC:CBD"` (or `1:1`, `CBD-dominant`) |
| `spectrum` | enum | | `"full"` (or `broad`, `isolate`) |
| `effect_tags` | text[] | ✅ | `["relax","sleep","couch_lock","euphoria"]` — pick from the controlled vocab below |
| `dose_level` | enum | ✅ | `"heavy"` (or `beginner`, `intermediate`) |
| `onset_minutes` | integer | | `20` (nano-infused brands claim 15–30; standard is 60–90) |
| `duration_hours` | integer | | `7` |
| `flavor` | text | | `"dark berry"` |
| `pack_count` | integer | ✅ | `10` |
| `price_inr` | integer | ✅ | `3300` (whole rupees) |
| `in_stock` | boolean | ✅ | `true` |
| `product_url` | text | | `"https://trymoonimpact.com/products/stellardust"` |
| `description` | text | | full sentence — include the star rating if shown ("4.55★ over 40 reviews") |
| `key_uses` | text | | `"Used under medical supervision for chronic pain, disturbed sleep, CINV, muscle spasticity..."` |
| `warnings` | text[] | | `["Not recommended for pregnant...","Do not operate vehicles..."]` |
| `composition` | jsonb | | `{ "Ashwagandha": "11%", "Vijaya": "3%", ... }` |
| `side_effects` | text[] | | `["drowsiness","altered appetite","mild dizziness"]` |

> **Shared detail across a brand's SKUs:** Moon Impact's Stellardust and Mission Brief share the same composition/warnings/side_effects (brand-standard formula). Factor these into `const shared*` variables rather than copy-pasting — see `seed-moon-impact.ts` lines 54–80.

#### Controlled vocabularies (do not invent new values)

**`effect_tags`** — pick from this set only:
```
sleep, anxiety, pain, focus, euphoria, social, relax, couch_lock, munchies, creativity
```

**`dose_level`** — `beginner` (≤5mg THC) | `intermediate` (~5–25mg) | `heavy` (25mg+)

**`category`** — `vijaya` (Indian medical cannabis) | `cbd` | `hemp` | `isolate`

**`spectrum`** — `full` | `broad` | `isolate`

### 5. Write the `brand_research` audit trail

This is the "show your work" layer — what makes "is this legit?" believable to a judge. One row per brand (delete old rows for the same query first, as the seed does).

| Field | Type | Required | Example |
|---|---|---|---|
| `brand_id` | text | ✅ | `"moon-impact"` |
| `query` | text | ✅ | `"Is Moon Impact legit?"` |
| `verdict` | enum | ✅ | `"verified"` (others: `caution`, `avoid`, `unverified`) |
| `findings` | jsonb | ✅ | see below |
| `sources` | text[] | ✅ | the actual URLs you cited (product pages, IG, etc.) |
| `trust_score` | numeric | ✅ | `0.72` — same logic as the brand row |

**`findings` shape:**
```json
{
  "coa_status": "claimed_not_shown",   // available | claimed_not_shown | absent
  "license": "Ministry of AYUSH Drug Licence No. 25D/55/96. Schedule E(1) medicine.",
  "reviews_summary": "4.55 stars over 40 verified reviews...",
  "red_flags": [
    "No public Certificate of Analysis (COA)",
    "DRIFT and GROUND CONTROL listed as 'Coming soon' — product line incomplete"
  ],
  "summary": "Moon Impact is a legitimate Schedule E(1) Vijaya brand with an AYUSH drug licence..."
}
```

Be honest about red flags. A brand with no COA is still `verified` if it has an AYUSH licence — but the missing COA goes in `red_flags`. This honesty is what makes the trust score credible.

### 6. Derive the `trust_score` (0–1)

There's no formula in code — you set it based on the research. The benchmarks in `research.ts`:

| Score range | Meaning |
|---|---|
| 0.9+ | Clearly legit, with public lab tests (COA) |
| 0.6–0.9 | Probably legit but gaps (no COA, etc.) — Moon Impact sits here (0.72) |
| 0.3–0.6 | Proceed with caution |
| <0.3 | Avoid |

Heuristics that push the score up: AYUSH licence visible, public COA, real prescription flow, verifiable Instagram with real followers, independent reviews. Heuristics that pull it down: no licence, no COA, sketchy payment methods, unverifiable claims.

### 7. Write the seed script + run it

Two options.

**Option A — Manual seed script (the Moon Impact way, recommended for full detail):**

Copy `scripts/seed-moon-impact.ts` → `scripts/seed-<brand-slug>.ts`. Replace the data. Run:

```bash
cd /Users/Pras/Documents/ClaudeCode/Hacakthons/PravaHackathon/SaulSilver
npx tsx scripts/seed-<brand-slug>.ts
```

Requires `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`.

The script structure is:
1. `brands.upsert({ ... }, { onConflict: "id" })` — upsert brand row
2. `products.delete().eq("brand_id", BRAND_ID)` — wipe old products for this brand
3. `products.insert([ ... ])` — insert fresh product rows
4. `brand_research.delete().eq("brand_id", ...).eq("query", ...)` — wipe old research
5. `brand_research.insert({ ... })` — insert the audit trail
6. Select-back to verify the row count

**Option B — Agent research function (faster, less detail):**

Call `researchBrand({ brandName, context, knownWebsite })` from `src/lib/research.ts`. Gathers context, asks OpenAI to structure it, returns `{ brand, products, research }`. You then upsert to Supabase. This is the self-populating path but it skips the deepest medical detail (composition %, side effects) unless that's in the context you feed it.

---

## Validation bar (done = passes all these)

- [ ] `brands` row: all ✅ fields filled, `trust_score` between 0 and 1, `last_researched` set
- [ ] `products`: one row per SKU on the website (don't miss SKUs hidden in collections)
- [ ] `products.effect_tags`: every tag is from the controlled vocab (no typos, no invented tags)
- [ ] `products.price_inr`: integer in whole rupees (no decimals, no ₹ symbol)
- [ ] `products.cannabinoids`: real mg from the product page — never invented
- [ ] `brand_research.findings.red_flags`: at least one honest gap listed (no brand is perfect)
- [ ] `brand_research.sources`: real URLs you actually visited
- [ ] Run `npx tsx scripts/seed-<brand-slug>.ts` — confirms "✓ Seeded X — N products"

---

## The 13 brands (current state)

Only Moon Impact is fully seeded. The remaining 12 need this runbook applied.

<!-- TODO: paste the list of 12 remaining brand URLs here when known. -->
