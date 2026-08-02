# Lessons

Hard-won corrections from the SaulSilver brand-seeding work. Read BEFORE scoring a new brand.

---

## §1. Trust scores must come from the rubric, not feel (2026-08-02)

**Mistake:** I scored the first three brands (Moon Impact, Trost, Qurist) by
"feel" within the runbook's 0.6–0.9 band. The result was indefensible: Hebe
Wellness — with NO licence number and an unverifiable IG — was about to get the
SAME 0.70 as Qurist, which publishes mg/gummy + a 1:1 ratio. Same number,
materially different evidence. The user caught it: "Are you randomly deciding
these numbers?"

**Root cause:** The runbook said "there's no formula in code, you set it based
on the research," which I treated as license to judge. But "set it based on
research" ≠ "pick a number that feels right" — it means the number must be
*derivable* from documented criteria.

**Fix:** Wrote an explicit deduction rubric into `docs/BRAND-SEEDING-RUNBOOK.md`
step 6 (start 1.0; −0.10 missing licence number, −0.08 no COA, −0.06/−0.03
mg-or-ratio, −0.04 unverified IG, −0.05 no Rx flow, up to −0.05 thin reviews,
up to −0.08 adverse/QC). Every brand's score is now recorded in
`brand_research.findings.trust_breakdown` so it's auditable and re-derivable.

**Re-scored:** Trost 0.74→**0.80**, Qurist 0.70→**0.82** (Qurist rose because
its strong mg+ratio disclosure was being penalised before). Moon Impact (0.72)
to be re-scored in its end-of-batch modified-seed pass.

**Rule going forward:** If a brand's `trust_score` doesn't match its
`trust_breakdown` deductions, the breakdown wins. Never hand-set a score
without recording the deductions. If two brands tie, that's correct — don't nudge.

---

## §2. Licence "number in an image" counts as missing (2026-08-02)

Hebe Wellness shows an AYUSH licence as a PNG (`Ayush_Lic._1.png`) and states
"Licensed Under Ministry of Ayush" in text — but the actual licence NUMBER is
inside the image, not text-parseable. Per the rubric this is a −0.10 dock
(same as Qurist's "claim but no number"), because the credential can't be
independently checked without OCR. Do NOT treat an image-of-a-licence as
equivalent to a text licence number. OCR is an option if a judge needs it, but
flag the gap honestly first.

---

## §3. Don't infer cannabinoid ratios that aren't disclosed (2026-08-02)

Trost publishes only "% cannabis leaf extract" + total mg — never a THC:CBD
ratio or mg split. Correctly set `ratio: null` and `cannabinoids: { total_extract_mg }`.
Do NOT back-calculate a ratio from extract % or invent cbd_mg/thc_mg. The
sommelier surfaces "ratio unknown" to the user; fabricating one would make the
match output a lie. Qurist (publishes 20mg+20mg, 1:1) is the contrast — when
it IS disclosed, capture it exactly.

---

## §4. IG follower counts: set null, don't guess (2026-08-02)

Instagram blocks scraping and search often returns no follower count (Hebe).
Set `instagram_followers: null` and take the −0.04 rubric dock. Never guess a
number to fill the field — that's exactly the "fabricate" failure the runbook
warns about for emails, and it applies to follower counts too.

---

## §7. Search `"<brand>" instagram` before declaring IG unverifiable (2026-08-02)

**Mistake (repeated):** On Cannavedic I declared Instagram not discoverable, then
the user gave me the handle. On Polyherbs I did the SAME thing — declared it
"no Polyherbs-specific Instagram" — and the user again gave me the real handle
(`@poly_herbs`). Twice in a row, same failure.

**Root cause:** I only looked at the *footer/social links* of the scraped site.
Marketplace brands (Polyherbs) and brands whose footer I couldn't fully parse
have IG accounts that don't appear in their site chrome — but a simple web search
finds them.

**Rule going forward:** Before setting `instagram_handle: null`, run a web search
for `"<brand name>" instagram` AND check the brand's own/about page text. Only
declare it unverifiable if BOTH come back empty. The footer-link check alone is
insufficient. Record the actual handle + follower count, even if tiny — a
10-follower IG that reads like a reseller account (Polyherbs) is *more* useful
signal than null, because it tells the user the brand presence is weak/inauthentic.

---

## §6. Verify a brand sells GUMMIES before researching — not all "brands" do (2026-08-02)

**Mistake avoided:** Sanan Relief (`sananrelief.com`) was on the 13-brand list,
but its entire catalog is TOPICALS — Pain Relief Roll-on, Patch, Gel, Oil, plus a
Full Spectrum CBD Oil. **Zero gummies, zero edibles.** Caught it on the shop page
before seeding.

**Rule going forward:** Before committing to a full Phase 1, do a 30-second gate
check: grep the homepage/shop page for `gummy|gummies|candy|edible|jelly`. If
zero matches AND the product list is all oils/topicals/capsules/patches, the
brand does NOT belong in a gummy sommelier's catalog. Stop and ask the user
whether to (a) skip it [recommended], (b) seed the ingestible oil only, or
(c) seed brand+research with 0 products for the trust-check path. Do NOT
autopilot-seed non-gummies — it pollutes effect/dose/flavor matching.

**Also noted:** Sanan Relief's AYUSH licence `25D/55/96` is the SAME number as
Moon Impact's. This signals a shared white-label manufacturer — common in the
Indian Vijaya market where multiple brands are produced under one AYUSH-licensed
manufacturer's drug licence. Not a problem per se, but worth knowing: the licence
authenticates the *manufacturer*, not a unique formulation.

---

## §5. ALWAYS grep the literal string "Licence Number:" — don't infer from images (2026-08-02)

**Mistake:** On Cannavedic I saw an `ayush-1_1.webp` badge image and assumed the
licence number was baked into an image (per §2), so I nearly scored it −0.10
like Hebe. The user caught it: the actual licence numbers ("MP 26/PHM/DL/3587"
and "OR – 374 / Ayur") are published as **TEXT** in the footer, in a
`<strong>Licence Number: ...</strong>` block. That's a −0.10 swing I almost got
wrong — Cannavedic's correct score is 0.90 (top of the table), not 0.80.

**Root cause:** I grepped for `ayush` and `licen[cs]e` near numbers, but the
licence sat in a product-tag block whose structure my regex didn't match, and
the badge image primed me to assume image-only.

**Rule going forward:** Before concluding a licence number is missing, run:
`grep -oiE 'Licence Number[^<>]{0,60}' <all cached page html>` — the literal
string. Do this on the homepage AND at least one product page (Cannavedic had
it on both). Only declare it missing if that literal-string search is empty
across all pages. A badge image (ayush-*.webp/png) is NOT evidence that the
number is image-only — it's just a logo.

---

## §8. Don't bypass the integration you already built — and don't blame the vendor for a call you never made (2026-08-03)

**Mistake:** The iMessage webhook (`/api/linq/webhook`) called the **Linq
Payments API** (`api.linqapp.com/.../payments`) when the user replied "1/2/3",
reading guessed fields (`attach_url` / `approval_url`). It **never called
Prava**. The web app, meanwhile, worked because `/api/pay` → `createSession()`
in `src/lib/prava.ts` returns a real `iframe_url`. The iMessage path bypassed
the integration we'd already proved out — then told the user *"prava sandbox is
being weird,"* blaming Prava for a call Prava never received.

**Root cause:** Two failure modes stacked. (1) The §7 anti-pattern again —
guessing an API's response shape instead of checking it. (2) Two separate
integrations to the same capability (the Linq path vs the Prava path) with no
shared core, so it was easy to "fix" one path while the other rotted. The web
client and the iMessage webhook had drifted apart.

**Fix:** the webhook now calls `createSession()` directly — the same function
the web app uses — and sends the returned `session.iframe_url` as an iMessage
Rich Link. One integration, one code path.

**Rule going forward:** when two surfaces (web + SMS, or web + mobile) do the
same job, they MUST call the same core function. If you find yourself writing a
parallel implementation — reaching for a different vendor API in one branch
while the other uses the SDK — STOP. That divergence is the bug. Pull the
shared core out and call it from both. And never blame a vendor for a call you
never made; grep for the actual fetch URL before the message goes out.

---

## §9. In-memory `Map` state is invisible state — it lies under serverless load (2026-08-03)

**Mistake:** The webhook kept `pendingRecommendations` in a process-local
`Map<string, ConvoState>`. Locally it worked perfectly. On Vercel, a follow-up
reply ("1") hit a different serverless instance that didn't have the Map — so
the selection branch silently did nothing and "1" fell through to the LLM.

**Root cause:** `Map` state is invisible. It compiles, it passes typecheck, it
works in dev, and it fails only under the specific condition (cross-instance
dispatch) that dev never reproduces. The same trap as any module-level mutable
singletons on serverless.

**Fix:** persisted convo state to a `imessage_convos` Supabase table (mirrors
the `checkout_otp_handoff` pattern — service-role client bypasses RLS, keyed by
sender phone). The webhook now `loadConvo()` at the top and `saveConvo()` after
every mutation.

**Rule going forward:** on Vercel/serverless, ANY per-user state that must
survive across requests belongs in the database, not in a `Map`/module/global.
If you see `const x = new Map()` at module scope in a route handler, treat it
as a bug waiting for the first cold instance. The only acceptable in-process
state is per-request local variables.

---

## §10. `report-status` APPROVED is a commitment — never auto-APPROVE a session you didn't witness complete (2026-08-03)

**Mistake (caught before shipping):** When wiring the iMessage completion
cron, the tempting default was "poll payment-result, if completed report
APPROVED." That would have re-introduced the exact bug logged in the 2026-08-03
CHANGELOG entry: *"Reporting a one-time mandate charge as APPROVED consumes
the mandate."* Sandbox one-time cards are DECLINED by the merchant; reporting
APPROVED would falsely seal the transaction and re-create the
dashboard-shows-Success-while-actually-DECLINED contradiction.

**Root cause:** "completed" in `payment-result` means "the card was collected
and the transaction ran" — NOT "the merchant approved the charge." Conflating
the two is the same misread that cost a full debugging session on 2026-08-03.

**Rule going forward:** `report-status` reflects what the MERCHANT decided, not
what Prava's session lifecycle reached. Default to DECLINED for sandbox unless
you have affirmative evidence the charge succeeded (a real authorization code
from a real gateway). When in doubt, report the honest sandbox outcome and log
it plainly — never APPROVE to make a demo "look better."

---

## §11. Don't hand-pick what the LLM sees — serialize the full record (2026-08-03)

**Mistake:** The iMessage webhook fed Saul a hand-picked summary string per
product — `name (₹price): truncated description`. So whenever a user asked
about ANYTHING other than name/price ("strongest?", "Ashwagandha?",
"what do reviews say?", "side effects?", "licensed?"), Saul answered blind.
The structured fields we capture during research (cannabinoids, composition,
reviews_summary, red_flags, side_effects, warnings, key_uses, trust_breakdown)
were sitting in the DB — 50/52 products have composition populated, every
brand has a research row with reviews — but none of it reached the LLM.

**My first fix attempt was wrong too:** I built a narrow `potency.ts` helper
for the "strongest" case. The user (correctly) called this out: "then how many
helpers are we gonna create?" A helper per question type is unmaintainable
sprawl — Ashwagandha would need an ingredient helper, reviews a sentiment
helper, etc.

**Root cause:** I was treating each user question as a new feature instead of
recognizing the pattern — the LLM needs the *full structured record* in
context, then it answers any question from it. The summary string was a
lossy bottleneck.

**Fix:** ONE serializer (`src/lib/product-brief.ts` → `productBrief()`) that
dumps every populated field of the product + brand + research into a compact
block (strength, ingredients, effects, timing, price, trust, reviews/research,
safety). Whatever the user asks about, the answer is already in Saul's context.

**Rule going forward:** when an LLM is answering questions about a structured
record, hand it the WHOLE record (serialized), not a summary of the fields you
*think* it'll need. A summary you pick today is blind to the question someone
asks tomorrow. The full record is forward-compatible with any question for free.
The only exception is hard token limits — and even then, prefer trimming verbose
fields over dropping whole categories, because you can't predict which category
the next question needs.
