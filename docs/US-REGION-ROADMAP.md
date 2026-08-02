# US / Multi-Region Support — Roadmap

> Sandbox-only today. This is the post-submission build. Use it to **talk about**
> the vision in the 3-min recording + Twitter, not to ship tonight.

## The problem

The whole Saul stack assumes India. A US user landing on the site gets nothing
useful — and worse, the product silently pretends it works (returns empty results
or researches a brand and stamps it Indian).

## Why each layer breaks for a US user (concrete, from the code)

| Layer | File:line | What it does today | Why it breaks for US |
|---|---|---|---|
| Match request | `chat-client.tsx:277` | `region: "IN"` hardcoded | US user always queries the IN catalog |
| Match query | `match/route.ts:40` | `eq("region", "IN")` | Returns 0 brands for any non-IN region |
| Browse | `chat-client.tsx:467` | `region: "IN"` | Same — empty for US |
| Research stamp | `research.ts:388,556` | `region: "IN"` on every researched brand | A US brand researched live gets mislabeled IN |
| Currency | `pay/route.ts:49` | `"INR"` hardcoded | US checkout would pass rupees to a USD merchant |
| Merchant country | `pay/route.ts:49`, `wallet/session/route.ts:35` | `"IN"` | Prava session scoped to India |
| Geo detection | — | **none** | No `x-vercel-ip-*` header is read anywhere |

## The database gap (the real wall)

`products` + `brands` tables contain **12 Indian Vijaya brands. Zero US brands.**
Even with perfect region routing, a US "best gummies near me" query hits the match
engine → `region: "US"` → **empty array** → Saul says "the catalog's thin."

## What works today (partially)

`researchBrand` is NOT region-gated — it crawls whatever URL OpenAI resolves. So if
a US user types "research Wana" or "research Kiva":
- ✅ Discovers the brand site
- ✅ Crawls + structures the catalog (price, image, product_url)
- ⚠️ Stamps it `region: "IN"` (bug above)
- ⚠️ **Scraping risk:** US cannabis sites (Wana, Kiva, Wyld, Camino) are heavily
  JS-rendered and/or behind age gates. The simple `fetch()` scraper in
  `gatherContext()` will likely get a blank or "verify your age" page, not product
  data. This is the biggest unknown — must be tested brand-by-brand before claiming
  US discovery works.

## What will NOT work even after the above

**US cannabis checkout (Step 5).** US dispensaries don't use standard Shopify-style
e-commerce. They use Dutchie / Jane / Weedmaps embeds, or are delivery-only in
legal states. The Stagehand flow fills a card form that **doesn't exist** on a
dispensary site. So:
- US cannabis buy = ❌ (different checkout rails entirely)
- US non-cannabis buy (e.g. "buy me an iPhone") = ✅ (Shopify/standard checkout —
  the existing Stagehand flow handles it once the region bug is fixed)

## Minimum viable build (when we pick this up)

Scope: ~1.5–2 hrs + scraping-reliability risk. Order:

### 1. Geo-detect (cheap, ~10 lines)
Read Vercel's free geo headers server-side in the page loader (`app/page.tsx` /
`app/app/page.tsx`):
```ts
const country = req.headers.get("x-vercel-ip-country") ?? "IN";
const city = req.headers.get("x-vercel-ip-city") ?? "";
```
Pass `region` (country code) down to the chat client as a prop, like `userEmail`
already is. Default to "IN" when no header (local dev / fallback).

### 2. Make region dynamic everywhere
Drop the `"IN"` literals in:
- `chat-client.tsx:277` (match call) + `:467` (browse) → use the detected region
- `match/route.ts:40` → keep the filter, but on the detected region
- `research.ts:388,556` → stamp the brand with the detected region, not hardcoded IN
- `pay/route.ts:49` → currency map (US → "USD", IN → "INR") + merchant country

### 3. Auto-research on empty match (the key UX fix)
When match returns empty for a US region, don't say "catalog's thin." Instead
auto-trigger `researchBrand` on a small set of known US brands as seeds:
- Wana (`wanabrands.com`)
- Kiva (`kivaconfections.com`)
- Wyld (`wyldgummies.com`)
- Camino (`kivaconfections.com/camino`)
- Camino / Heavy Haze / etc.

This makes "best gummies near me in Boston" actually return results via live
research, instead of dead-ending.

### 4. Currency + Prava country
Map region → currency + merchant country in `pay/route.ts`:
```ts
const CURRENCY = region === "US" ? "USD" : "INR";
const COUNTRY = region === "US" ? "US" : "IN";
```

### 5. Honest caveat for judges / recording
> "US discovery works for named brands via live research. Ambient 'what's near me'
> needs the geo + seed work — that's the roadmap. US cannabis checkout is gated by
> dispensary rails (Dutchie/Jane), not standard e-commerce — non-cannabis US
> checkout (Apple, etc.) works with the existing agent."

## Open risks (validate before claiming)

1. **US brand scraping** — test Wana/Kiva/Wyld against `gatherContext()` first.
   If age gates block the scraper, we need a headless-browser fetch (Stagehand) for
   research too, not just checkout. That's a bigger change.
2. **USD pricing in Prava sandbox** — confirm the sandbox accepts non-INR amounts.
   Unverified.
3. **Region in DB** — existing 12 brands are all `region: "IN"`. If we later want a
   single global catalog, consider `region: null` = "all regions" instead of per-row.

## Recording / talking points (use these)

- "Saul is cannabis-vertical-one. The same agent, pointed at any category in any
  region, is the company."
- "Today it's India + Vijaya. The roadmap is geo-aware: the agent detects where you
  are, seeds the right regional brands, and researches live when the catalog is thin."
- "US cannabis checkout is gated by dispensary rails — but the agent already closes
  on standard e-commerce, so 'buy me headphones from Apple' works the moment we flip
  the region flag."
