# Current Issues — SaulSilver

Live tracker of the real state of Step 5 (autonomous merchant checkout).
This file is the source of truth for what is **actually broken or unfinished
right now**, not what we'd like to be true. Updated as the situation changes.

> Summary mirrored in the "Current Issues" section of `README.md`.

---

## 🟢 SOLVED — The Shopflo SMS-OTP wall

**Status:** Resolved 2026-08-02. The Prava founder confirmed the approach on
Discord: surface the OTP step in our UI, take the code from the user, pass it
straight into Shopflo. That's built and **proven across multiple live runs**:
phone fill → OTP gate → real SMS → code injected → Shopflo verifies →
addresses fetched → payment methods render.

Mechanism: `checkout_otp_handoff` table (route writes `awaiting_otp`, polls
every 2s; client writes the OTP back via `POST /api/checkout/provide-otp`).
The UI shows a live status bubble + an OTP prompt with masked phone.

This is no longer a blocker — it's a shipped feature and a genuine demo moment
(a human-in-the-loop seam, by design).

---

## 🟡 PARTIALLY SOLVED — Card step (MethodCard tap + Cashfree iframes)

**Status:** Root cause found and fix wired into the route. Live end-to-end
fill not yet verified against a real Prava session (we iterated with fake-card
probes to avoid burning sandbox transactions).

### What we cracked tonight (2026-08-02)

Two non-obvious things, both found via live Browserbase probing:

1. **`el.click()` does not open the card form.** The "Debit/Credit cards"
   option is a `MethodCard.tsx` row that binds to `onPointerDown`, not
   `onClick`. A synthetic `click` event is invisible to its handler. The fix:
   dispatch the full native tap sequence
   (`pointerover → pointerdown → mousedown → pointerup → mouseup → click`)
   from inside `frame.evaluate()`. One tap reliably expands the form.
2. **Card fields live in nested Cashfree payment-gateway iframes**, not in the
   Shopflo frame itself. The container `#flo__payments__CARD` populates with
   separate PCI-compliant iframes (card-number / expiry / cvv). The route now
   taps the MethodCard, polls up to 8s for the iframes, then drills into every
   child frame via `page.frames()` to fill each field.

### What's left

- Verify the nested-iframe fill actually completes against a real Prava card
  (the probe proved the *mechanics* — tap opens iframes — but did not fill +
  submit a real card end-to-end). Cashfree may use deeper cross-origin
  isolation that blocks `frame.evaluate()`; if so, we fall back to reporting
  DECLINED as the expected sandbox outcome (honestly, no fake success).
- The submit ("Pay now") button is still clicked via `el.click()` — it's a
  real `<button>` so that works, but worth confirming post-fill.

---

## 🔴 THE REAL, HONEST BLOCKER — every platform × gateway is a different snowflake

This is the thing worth saying out loud, because it's the actual lesson of
Step 5 and the actual reason "agents that buy things" is hard:

**There is no universal checkout.** Every merchant stacks its own e-commerce
platform AND its own payment gateway, and each combination renders a different
DOM, a different iframe topology, and a different set of "tap this, not that"
quirks. What we built for The Trost is not portable as-is:

- **Platform layer:** Shopify-native, Shopify+Shopflo, WooCommerce, custom SPA
  — each has a different checkout DOM, different field names, different
  cart→checkout navigation. (7 of our 10 reachable brands are Shopify; 1 is
  WooCommerce; 2 are custom.)
- **Gateway layer:** Cashfree (The Trost), Razorpay, Juspay, Stripe Elements,
  Braintree, direct bank PG — each injects its own PCI-compliant card iframes
  with their own internal structure. We tap-pointer'd the Cashfree MethodCard;
  a Razorpay-hosted checkout has a totally different selector tree.
- **Auth layer:** Shopflo adds SMS OTP on top. Other checkouts add 3DS, OTP,
  captcha, device binding. Each is its own pause-and-handoff.

So the work isn't "fix one bug." It's **map and harden against each
combination we want to support** — a long tail. The Trost path
(Shopflo + Cashfree) is now mapped end-to-end and is the right demo target.
Cannazo/Qurist are likely the same stack (untested). AarogyaCBD (WooCommerce)
is a completely different flow we haven't touched.

**Why this needs more time (not more cleverness):** the pattern is clear —
probe the live DOM, find the click target, find the card iframes, fill them.
But doing it *correctly and reliably* per combination is grinding,
per-platform work. Each one wants its own probe session, its own OTP cycles,
its own set of "oh, this gateway puts the CVV field in a *third* iframe"
discoveries. That's the honest cost. The architecture (OTP pause, live status,
pointer-event taps, nested-iframe drill) is reusable; the per-merchant
selectors are not.

---

## 🟡 Known — iMessage can't close the checkout loop in the blue bubble

**Status:** Architectural limitation of the iMessage path. Documented for
honesty, not a bug to "fix" without a Prava Messages extension.

The web app's full autonomous checkout — Stagehand headless browser navigating
the real merchant site, the live OTP/status UI, the one-time Prava card fill in
the nested Cashfree iframes, the captured decline — lives entirely on the
**web** path (`/api/checkout/automate` + the `checkout_otp_handoff` status
poll). The iMessage path does NOT replicate it.

What the iMessage path does today: sends Prava's `iframe_url` as a Rich Link.
The user taps it, **Safari opens**, they pay on Prava's hosted checkout page,
and then... the loop can't close inside iMessage. Two compounding reasons:

1. **No redirect back into iMessage.** Prava's hosted checkout has a
   `callback_url` that redirects the browser tab on completion. On the web app
   that redirects back to `/app`. But there is no URL that lands a user back in
   the Messages app — iMessage isn't a web destination. So "Payment successful →
   redirect" works on web, and structurally cannot work on iMessage.
2. **No agent-driven merchant checkout from iMessage.** The autonomous
   Stagehand checkout is triggered by the web client (`onPaid` →
   `/api/checkout/automate`). The iMessage webhook never calls it. So even after
   the user pays on Prava, no agent drives the merchant site from iMessage.

**The ideal UX (the honest roadmap answer):** a Prava Messages app extension
that renders an in-bubble bottom sheet (an App Clip / iMessage app), so the
whole checkout — card entry, passkey, confirmation — stays inside the blue
bubble and never opens Safari. That's the only way to make iMessage commerce
feel native end-to-end. Until Prava ships that extension, the iMessage path
surfaces a native payment link but can't complete the full agent checkout loop.

**Honest hackathon framing:** web app = full autonomous-checkout demo (with the
live OTP/status UI). iMessage = native payment link in the blue bubble, with a
cron-fired receipt text on Prava-session completion. The agent-driven merchant
checkout is proven on web; the iMessage path is the distribution surface.

---

## 🟡 Known — Moon Impact cannot accept payments

**Status:** Confirmed dead as a demo target.

`trymoonimpact.com/checkout` renders the banner:
> *"This store can't accept payments right now."*

No payment processor is attached to the store. This is why **every** card-fill
attempt against Moon Impact failed all session — not iframes, not prompt
format, not digit masking. The store simply has no gateway. **Lesson logged:
read the page before rewriting the prompt.**

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
- **Shopflo OTP pause** — built + proven ×3 live. *(commit 3fe0061)*
- **Live status UI + phone collection** — built. *(commit 3fe0061)*
- **Card-step mechanics cracked** — pointer-event tap + Cashfree iframe drill.
  *(this commit)*

---

## Platform detection across our 12 brands

Probed 2026-08-02. Relevant for picking demo targets and understanding the
per-combination work above.

| Brand | Platform | Checkout | Demo-viable? |
|---|---|---|---|
| The Trost | Shopify | **Shopflo + Cashfree** (OTP-gated) | ✅ Mapped end-to-end — primary demo target |
| Moon Impact | Shopify | **No gateway** ("can't accept payments") | ❌ Dead |
| Cannazo | Shopify | Shopflo-suspected (untested) | ⚠️ Likely same as Trost |
| Qurist | Shopify | Shopflo-suspected (untested) | ⚠️ Likely same as Trost |
| Hebe | Shopify | Untested | ❓ |
| ANDYOU | Shopify | Untested | ❓ |
| Cannavedic | Shopify | Untested | ❓ |
| Kushiva | Custom SPA | Untested | ❓ Different flow entirely |
| ItsHemp | Unknown | Untested | ❓ |
| AarogyaCBD | **WooCommerce** | Untested | ❓ Completely different stack |
