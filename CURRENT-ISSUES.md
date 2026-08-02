# Current Issues — SaulSilver

Live tracker of the real blockers on Step 5 (autonomous merchant checkout).
This file is the source of truth for what is **actually broken right now**, not
what we'd like to be true. Updated as the situation changes.

> Also surfaced as a "Current Issues" section in `README.md`.

---

## 🔴 BLOCKER — The Shopflo SMS-OTP wall (Step 5)

**Status:** Unresolved. This is the gating blocker for a live end-to-end demo.

### What we proved tonight (2026-08-02)

We mapped the **actual** checkout flow on The Trost (and the pattern holds for
the other Indian Shopify stores in our set). The discovery, end to end:

1. **The Trost does not use Shopify's native checkout.** "Buy Now" opens a
   cart drawer containing two cross-origin iframes from `checkout.shopflo.co`
   — `#flo-checkout` and `#flo-cart-iframe`. **Shopflo is the real checkout.**
2. Shopflo boots as a JS SPA inside those iframes. We can reach its DOM via
   Playwright `frame.evaluate()` (confirmed working — phone field, coupon
   field, country picker all dumped successfully).
3. The Shopflo flow is **gated behind SMS OTP** before any payment form
   appears:
   - Fill `#flo__auth__phoneInput` → click **"Proceed"**
   - Shopflo sends a **real SMS OTP** to that number
   - Four OTP inputs appear: `#flo__auth__otpInputField1..4`
   - **Only after OTP is verified** does Shopflo fetch saved addresses and
     reveal the payment-methods step (where the card form lives).

### Why this is a hard wall (not a code problem)

- **No card form exists in the DOM until OTP is verified.** No amount of
  Stagehand / Playwright / prompt engineering reaches it. We confirmed zero
  card inputs are present at the phone-auth step.
- The OTP goes to a **real phone number** via real SMS. There is no documented
  Shopflo sandbox/test OTP (unlike Prava's `456789` device-binding code).
- Our Linq number (`+212…`) is **non-Indian** — Shopflo prefixes `+91` and
  Indian gateways typically reject/don't deliver to foreign numbers. Even if
  it delivered, Linq requires an inbound "hello world" opt-in first.
- This is **not specific to The Trost.** Shopflo is the dominant Indian
  Shopify checkout app; Cannazo, Qurist, and likely the rest of our set use
  the same gate. AarogyaCBD is WooCommerce (untested, different flow).

### What this means for Prava's Browser Harness too

Prava's docs describe their Browser Harness as driving "the real Shopify
checkout." Shopflo **replaces** Shopify checkout with an OTP-gated SPA in a
cross-origin iframe. So even if the harness were exposed as a callable API
(it currently isn't — CLI/`prava shop checkout` only), it would hit the same
SMS-OTP wall on these merchants. **Discord question posted to the founder.**

---

## Candidate paths forward (ranked, not yet started)

1. **Real Indian phone in the demo loop.** Pause the agent at the OTP step,
   surface "OTP sent to +91… — enter it" in the chat UI, type it live.
   Strongest demo; requires a real Indian number + a manual step on stage.
2. **Find a non-Shopflo merchant.** Probe the 12 brands for one running
   Shopify-native checkout (no Shopflo). If one exists, the original
   Stagehand card-fill approach may work there. AarogyaCBD (WooCommerce) is
   the other untested candidate.
3. **Honest "where autonomy breaks" framing.** Demo discover → Prava session
   → card issuance live, then show the agent reaching Shopflo's OTP gate and
   frame it as the exact seam agentic-commerce infrastructure must close.

---

## 🟡 Known — Moon Impact cannot accept payments

**Status:** Confirmed dead as a demo target.

`trymoonimpact.com/checkout` renders the banner:
> *"This store can't accept payments right now."*

No payment processor is attached to the store. This is why **every** card-fill
attempt against Moon Impact failed all session — not iframes, not prompt
format, not digit masking. The store simply has no gateway. We spent multiple
Browserbase cycles rewriting the Stagehand prompt before checking the page
text. **Lesson logged: read the page before rewriting the prompt.**

---

## 🟢 Resolved this session

- **Fabricated "Test card declined" success message** — killed. The UI was
  rendering a hardcoded fallback string whenever `merchantError` was empty,
  dressing up total automation failures as wins. Now reports honestly based
  on real `isDeclined` + `merchantError`. *(commit ff314ee)*
- **Silent `reportStatus` failures** — `prava.ts:reportStatus` was
  fire-and-forget with no `res.ok` check, wrapped in `.catch(()=>{})`. We
  reported DECLINED but the Prava dashboard showed Success/Completed — the
  report never landed. Now checks `res.ok`, logs the full response, throws
  on non-2xx, returns a typed `ReportStatusResult`. *(commit ff314ee)*
- **UI now surfaces real Prava confirmation** — route returns
  `reportConfirmed` + `visaConfirmation`; UI warns when DECLINED didn't land
  instead of always claiming success. *(commit ff314ee)*

---

## Platform detection across our 12 brands

Probed 2026-08-02. Relevant for picking a demo target that avoids Shopflo.

| Brand | Platform | Checkout | Demo-viable? |
|---|---|---|---|
| The Trost | Shopify | **Shopflo** (OTP-gated) | ⚠️ Blocked by OTP |
| Moon Impact | Shopify | **No gateway** ("can't accept payments") | ❌ Dead |
| Cannazo | Shopify | Shopflo-suspected (untested) | ⚠️ Likely blocked |
| Qurist | Shopify | Shopflo-suspected (untested) | ⚠️ Likely blocked |
| Hebe | Shopify | Untested | ❓ |
| ANDYOU | Shopify | Untested | ❓ |
| Cannavedic | Shopify | Untested | ❓ |
| Kushiva | Custom SPA | Untested | ❓ |
| ItsHemp | Unknown | Untested | ❓ |
| AarogyaCBD | **WooCommerce** | Untested | ❓ Best non-Shopify candidate |
