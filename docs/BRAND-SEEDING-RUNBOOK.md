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
- **Footer / About / Contact / Privacy Policy / Terms** → Instagram handle, **support email** (look hard — see below), prescription flow
- **Instagram** → follower count, engagement, post style, **and read the comments** (for Senso, step 7)

**Do NOT skip product pages.** Homepage marketing copy is useless for matching. The depth people actually compare on (composition %, warnings, onset time, key medical uses) only lives on the SKU page. Moon Impact's composition table (`Ashwagandha 11%, Vijaya 3%`, etc.) was on the product page, not the homepage.

> **Support email — find the REAL one, don't guess.** The old behavior fabricated
> `support@<domain>.com`, which bounces. There is now a `brands.support_email`
> column. Look for the actual address in: footer, Contact page, About page,
> Privacy Policy, Terms of Service, refund policy, or the order-confirmation
> flow. Common real patterns: `care@`, `hello@`, `orders@`, `support@`. If you
> genuinely cannot find one after checking all those pages, leave it null and
> note it as a red flag — do NOT fabricate one.

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
| `support_email` | text | ✅ | `"care@trymoonimpact.com"` — the REAL address found on the site (footer/contact/terms). Never fabricate `support@domain`. Prescription routing emails land here. |
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

**Use the rubric below — do not score by feel.** The benchmark bands in `research.ts`
still describe what a score *means*, but the number itself now comes from the rubric
so every brand is scored on the same checkable criteria and the scores are defensible
to a judge (and re-derivable by anyone reading the row):

| Score range | Meaning |
|---|---|
| 0.9+ | Clearly legit, with public lab tests (COA) |
| 0.6–0.9 | Probably legit but gaps (no COA, etc.) |
| 0.3–0.6 | Proceed with caution |
| <0.3 | Avoid |

#### The rubric (start at 1.0, deduct)

| Criterion | Dock if missing/weak | Notes |
|---|---|---|
| AYUSH licence **number** visible as text | **−0.10** | A claim ("fully licensed") without the number is weaker than Trost's `A-4906/2021`. A licence number baked into an image (not text) counts as missing — it can't be independently checked. |
| Public Certificate of Analysis (COA) / lab test | **−0.08** | Neutral disclosure gap in the Indian Vijaya market (most brands don't publish). Dock uniformly, but it's not a disqualifier. |
| THC/CBD mg **or** ratio disclosed | **−0.06** | Qurist publishes both (20mg+20mg, 1:1) → no dock. Trost publishes neither → full dock. Partial disclosure (ratio but not mg, or mg but not ratio) → −0.03. |
| Verifiable Instagram with real followers | **−0.04** | Need an actual follower count. If IG blocks scraping and the count can't be obtained → dock (set `instagram_followers: null` and dock). |
| Real prescription / doctor-consultation flow | **−0.05** | In-house doctor, upload-prescription checkout, or free consultation with every order. |
| Independent reviews (volume + recency) | up to **−0.05** | 100+ recent dated reviews → no dock. A few dozen → −0.02. <10 or none → −0.05. |
| Adverse-event / recurring QC reports | up to **−0.08** | Per the brand_research `red_flags`. e.g. Trost's batch-potency inconsistency + an ER report → −0.06. Clean → no dock. |

**Floor of 0.0, ceiling of 1.0.** Record the deduction breakdown in
`brand_research.findings.trust_breakdown` so the score is auditable:

```json
"trust_breakdown": {
  "start": 1.0,
  "deductions": {
    "licence_number_missing": -0.10,
    "no_coa": -0.08,
    "mg_ratio_partial": -0.03
  },
  "final": 0.79
}
```

If two brands land on the same score after the rubric, that's fine — the rubric is
the truth, not head-to-head ranking. Don't nudge to break ties.

> **History:** earlier seeds (Moon Impact, Trost, Qurist) were scored by feel and
> re-scored to this rubric on 2026-08-02. If you find a brand whose score doesn't
> match the rubric, re-run the rubric and update it — the rubric wins.

> **Trust_score now feeds a live Senso blend.** When the sommelier matches, this
> static Supabase score is blended 50/50 with a grounded Senso signal queried at
> match time (see step 7). So set the static score honestly from the structured
> research — Senso handles the dynamic reputation layer separately.

### 7. Ingest the brand into Senso (the trust context layer)

**This step is required for the Senso prize track ($7,500).** Skip it and the
sommelier falls back to the static Supabase trust_score only — no grounded
reputation signal, no citations, weaker for judges.

**What Senso is:** a knowledge base YOU feed, then query for grounded answers.
It has NO world knowledge of its own. We ingest an unstructured reputation doc
per brand; Senso indexes it; the sommelier queries it at match time to get a
grounded trust answer that breaks ties between similar gummies.

**Why it's separate from Supabase:** Supabase holds structured fields (price,
mg, licence number). Senso holds the *unstructured reputation signal* — verbatim
comments, review quotes, delivery reports — that doesn't fit cleanly in columns
but is exactly what users compare brands on.

#### 7a. Capture the deep reputation data

While browsing (step 2), ALSO collect this unstructured signal. This is the data
that makes Senso useful. Copy `scripts/seed-senso-moon-impact.ts` as the template.

| Field | Where to find it | Example |
|---|---|---|
| `instagramComments[]` | Brand's IG posts — read the comments, grab verbatim quotes | `"Half a Stellardust knocked me out — start slow."` |
| `reviewQuotes[]` | Product pages, Google reviews, Reddit | `"Delivery to Mumbai took 4 days, discreet packaging."` |
| `redFlags[]` | Honest gaps — no COA, incomplete product line, legal ambiguity | `"No public Certificate of Analysis (COA)"` |
| `licenceInfo` | Footer / About / product packaging | `"AYUSH Drug Licence No. 25D/55/96. Schedule E(1)."` |

**What to capture verbatim** (judges score on source quality + traceability):
- **Taste** — "tastes like cough syrup", "berry is the best flavor"
- **Onset/effect** — "kicked in 20 min", "half a gummy was enough", "no hangover"
- **Delivery time** — "took 4 days to Mumbai", "next-day in Bangalore"
- **Packaging** — "discreet, no branding on the box", "individually wrapped"
- **Customer support** — "doctor called within an hour", "WhatsApp reply same day"
- **Dud batches / complaints** — "last batch was weak", "price too high to repeat"

Keep them as direct quotes with attribution context (which post/review). Senso
returns these verbatim in its grounded answers, so real quotes > paraphrasing.

#### 7b. The full Senso lifecycle (every brand must complete all four stages)

This is the non-negotiable sequence. Skipping any stage means the sommelier gets
no grounded signal for that brand — it falls back to the static Supabase score.

```
  ┌─────────────┐     ┌──────────────────┐     ┌─────────────────┐     ┌──────────────────┐
  │ 1. INGEST   │ ──> │ 2. WAIT for      │ ──> │ 3. QUERY        │ ──> │ 4. BLEND at      │
  │ ingestBrand │     │    indexing      │     │ searchTrust     │     │ match time       │
  │             │     │ waitUntilIndexed │     │ (verify it      │     │ (automatic, in   │
  │ POST        │     │ (poll my-files   │     │  cites the doc) │     │  /api/match)     │
  │ /org/kb/raw │     │  until complete) │     │                 │     │                  │
  └─────────────┘     └──────────────────┘     └─────────────────┘     └──────────────────┘
```

| Stage | What happens | How long | If skipped |
|---|---|---|---|
| **1. Ingest** | Markdown doc uploaded; Senso returns `content_id` + `processing_status:"processing"` | instant | Brand invisible to Senso |
| **2. Wait** | Senso chunks + embeds async. Poll `my-files` filtered by `content_id` until `content.processing_status === "complete"` | 5–60s | Queries return empty (index not ready) |
| **3. Query** | `searchTrust("…")` returns `{answer, score, sources, chunks}` — verify `sources` includes your doc title | ~1s | No way to confirm ingest worked |
| **4. Blend** | Automatic at match time: `/api/match` calls `enrichBrandsWithSensoTrust()` → 50/50 blend → ranking shifts | n/a | (happens in the live match flow) |

**Stages 1–3 run in the seed script. Stage 4 runs automatically in the live app.**
You only write code for 1–3 (copy the template); 4 is already wired in
`src/lib/senso-trust.ts` + `src/app/api/match/route.ts`.

> ⚠️ **The WAIT stage is the easy one to miss.** Senso returns `202 Accepted`
> immediately, but the doc isn't queryable until `processing_status: "complete"`.
> If you ingest and query in the same breath without waiting, you get empty
> results and wrongly conclude Senso is broken. Always `await waitUntilIndexed()`.

#### 7c. Run the Senso seed script

```bash
cd /Users/Pras/Documents/ClaudeCode/Hacakthons/PravaHackathon/SaulSilver
npx tsx scripts/seed-senso-<brand-slug>.ts
```

The script (modeled on `seed-senso-moon-impact.ts`) performs all three seed-time stages:
1. `ingestBrand({ brandName, brandSlug, licenceInfo, products, instagramComments, reviewQuotes, redFlags })` → stage 1
2. `await waitUntilIndexed(contentId)` → stage 2 (blocks until ready)
3. `await searchTrust("…")` → stage 3 (verify the grounded answer cites the doc)

**Idempotent:** `ingestBrand()` deletes any prior doc with the same title before
ingesting, so reseeds don't duplicate. Run it as many times as you update the data.

**You must see this output before a brand counts as Senso-seeded:**
```
→ Ingested (content_id: …). Waiting for indexing…
✓ Indexed.
→ Test query: '…'
  Answer: <a grounded answer quoting your ingested review quotes>
  Sources: [ '<Brand Name> (SaulSilver Trust Doc)' ]
✓ <Brand Name> trust doc live in Senso.
```
If `Sources` is empty or the answer is "I don't have information," the ingest
failed or you didn't wait — re-run.

#### 7d. How Senso affects the ranking (so you capture the right data)

The sommelier blends trust as: `50% static Supabase trust_score + 50% Senso grounded signal`.
Effect/taste/dose/budget ranking runs first — those always dominate. Senso only
modulates the trust weight, breaking ties between otherwise-equal gummies and
demoting brands with weak grounded reputation.

So the deep data you capture directly controls whether a brand rises or falls in
the final ranking. Rich, honest reputation data = Senso can meaningfully
differentiate. Thin data = Senso returns low-confidence answers and the static
score dominates (boring for judges).

### 8. Write the Supabase seed script + run it

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

## The live 14th-brand path (the self-populating catalog)

The manual seed scripts above are for the 13 brands we seed ahead of time. But
SaulSilver is also a *self-populating* catalog: if a user names a brand that
isn't in the database yet, the agent researches it live via `researchBrand()` in
`src/lib/research.ts`, and the next person who asks gets it instantly.

**This live path runs the ENTIRE pipeline automatically** — Supabase upsert
*and* support-email extraction *and* Senso ingest. All three were wired in
commit `e1ede93`. You don't need to do anything special; calling
`researchBrand()` (or hitting `POST /api/research`) does the right thing.

### What the live path does (in order)

When a user says "what about [new brand]?" and it's not in the catalog:

1. **Gather context** — `gatherContext()` fetches the homepage + collection + product pages and extracts readable text, JSON-LD product data, prices, and mg/dosage patterns
2. **Structure via OpenAI** (`researchBrand`) → `{ brand, products, research }`, including `brand.support_email` extracted from the context with an explicit "never fabricate" instruction
3. **Senso ingest** — `researchBrand()` calls `ingestResearchIntoSenso()` which builds a `BrandTrustDoc` from the structured result and ingests it via `ingestBrand()`. Best-effort + non-blocking — a Senso failure never blocks the brand from saving to Supabase, and it does NOT `waitUntilIndexed()` so the user isn't held ~30s
4. **Upsert Supabase** (`/api/research` route) — `brands` (incl. `support_email`), `products`, `brand_research`

### Live path vs. manual seed — the depth tradeoff

The live path is **thinner than the manual seed** by design. Know the difference:

| Aspect | Live path (`researchBrand`) | Manual seed (Option A) |
|---|---|---|
| `support_email` | ✅ extracted (real, or null — never fabricated) | ✅ human-verified |
| Senso doc | ✅ ingested, but uses the model's `reviews_summary` digest only | ✅ ingested with **verbatim** IG comments + review quotes |
| Composition %, side effects | Only if present in scraped page text | Human-captured, always complete |
| Verbatim quotes | ❌ (model digests, not raw quotes) | ✅ (real quotes, attributed) |

**Implication for the 13 pre-seeded brands:** use the **manual seed path** (Option
A + Senso seed script) — the verbatim quotes and full composition are what make
Senso's grounded answers rich for judges. The live path is the safety net for
brands a judge springs on you that you didn't pre-seed; it'll work, but thinner.

### What CAN still go wrong on the live path (watch for these)

These aren't gaps — they're inherent limitations to test for:

- **No support email in context** → `support_email` is null → prescription route falls back to `support@<domain>` guess (still broken, but only as a last resort). Mitigation: the OpenAI instruction returns empty string if no real address is found, so it's null rather than fabricated.
- **Senso ingest async** → a brand researched live isn't queryable in Senso for ~30–60s after research completes. The match flow degrades gracefully to static trust meanwhile. Not a bug — the alternative is blocking the user.
- **`gatherContext` may miss pages** → if the brand's site blocks the bot UA or has unusual URL structure, context is thin → OpenAI extracts less. Worth testing on a couple of the 12 brand URLs before relying on the live path in a demo.

---

## Validation bar (done = passes all these)

**Applies to BOTH paths** — the manual seed scripts (Option A) AND the live
14th-brand path (`researchBrand`). A brand isn't "added" until every box is checked.

- [ ] `brands` row: all ✅ fields filled, `trust_score` between 0 and 1, `last_researched` set
- [ ] `brands.support_email`: the REAL address found on the site (footer/contact/terms) — never `support@<domain>` fabricated
- [ ] `products`: one row per SKU on the website (don't miss SKUs hidden in collections)
- [ ] `products.effect_tags`: every tag is from the controlled vocab (no typos, no invented tags)
- [ ] `products.price_inr`: integer in whole rupees (no decimals, no ₹ symbol)
- [ ] `products.cannabinoids`: real mg from the product page — never invented
- [ ] `brand_research.findings.red_flags`: at least one honest gap listed (no brand is perfect)
- [ ] `brand_research.sources`: real URLs you actually visited
- [ ] Run `npx tsx scripts/seed-<brand-slug>.ts` — confirms "✓ Seeded X — N products"
- [ ] **Senso ingest**: `instagramComments[]` and `reviewQuotes[]` contain ≥3 verbatim quotes each (real text, not paraphrase)
- [ ] **Senso ingest**: run `npx tsx scripts/seed-senso-<brand-slug>.ts` — confirms "✓ Indexed" + the test query returns a grounded answer citing the doc
- [ ] **Senso wait**: `waitUntilIndexed()` was awaited before any query (no querying against an unfinished index)
- [ ] **Live path only** (if testing `researchBrand`): `support_email` populated (or null — never fabricated), and a Senso doc for the brand appears in the Senso KB within ~60s of research completing

---

## The 13 brands (current state)

Source of truth for the brand list: `src/app/page.tsx` (the `BRANDS` const). Moon
Impact is fully seeded (Supabase + Senso). The other 12 need the full runbook
applied. Check off the status as each lands.

| # | Brand | URL | Supabase | Senso | Notes |
|---|---|---|---|---|---|
| 1 | Magiccann | https://magiccann.in | ☐ | ☐ | |
| 2 | Sanan Relief | https://sananrelief.com | ☐ | ☐ | |
| 3 | Polyherbs | https://www.aarogyacbd.com/brand/polyherbs | ☐ | ☐ | Sold via Aarogya CBD marketplace, not own D2C site |
| 4 | The Trost | https://thetrost.com | ☐ | ☐ | |
| 5 | MediCann | https://medicann.co.in | ☐ | ☐ | |
| 6 | Andyou | https://andyou.in | ☐ | ☐ | |
| 7 | Hebe Wellness | https://hebe-wellness.com | ☐ | ☐ | |
| 8 | Cannazo | https://cannazoindia.com | ☐ | ☐ | D2C site. (Previously mislisted as andyou.in — fixed in page.tsx.) |
| 9 | Cure By Design | https://curebydesign.in | ☐ | ☐ | |
| 10 | Cannavedic | https://cannavedic.in | ☐ | ☐ | |
| 11 | Qurist | https://qurist.in | ☐ | ☐ | |
| 12 | Kushiva | https://www.kushiva.com | ☐ | ☐ | |
| 13 | Moon Impact | https://trymoonimpact.com | ✅ | ✅ | Reference implementation — see `scripts/seed-moon-impact.ts` + `scripts/seed-senso-moon-impact.ts` |

**One known data issue to fix in `src/app/page.tsx` (not part of seeding, but flag it):**
- **Polyherbs** (row 3) is on the Aarogya CBD marketplace, not its own D2C site. The `rail` should be `marketplace` and `marketplaces` should include `["aarogyacbd"]`, not `d2c`.

### Suggested seeding order

Start with the cleanest D2C sites (own domain, likely multiple SKUs) and leave
the marketplace/ambiguous ones for last:

1. The Trost, Qurist, Cannavedic, Cure By Design — established D2C, likely rich product pages
2. Magiccann, MediCann, Hebe Wellness, Kushiva, Sanan Relief, Andyou — D2C
3. Cannazo — D2C site now confirmed (cannazoindia.com)
4. Polyherbs — marketplace rail, different scrape approach
