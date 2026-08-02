# TODO — SaulSilver backlog

Lower-priority features scoped for AFTER the core hackathon flow is confirmed live.
Do NOT start these until Step 5 is verified through the live chat UI.

---

## 0a. Native Prava Checkout Widget (iMessage Agentcard)

**Status:** Vision — requires Prava to ship an iMessage app extension.

**The dream:** When a user picks a product, instead of sending a link that opens
Safari/webview, we send a Linq `imessage_app` part that renders a **native checkout
widget directly inside the iMessage bubble**. The user taps the card, a sheet slides
up *within Messages*, they approve with Face ID, and the card updates in place from
"Pending" → "Confirmed". They never leave the chat.

**Why we can't do it yet:**
- The `imessage_app` part requires a **real, shipping Messages app extension** on
  the recipient's device — identified by `team_id` + `bundle_id`.
- Prava doesn't have an iMessage app extension (yet).
- Without one, the card falls back to plain text / broken "cannot connect" sheet.

**What we do instead (today):** Send a `link` part with the Prava `attach_url`.
This renders as a Rich Link Preview card in iMessage. Tapping opens Prava's hosted
checkout in an in-app browser sheet. Not as seamless, but it works.

**How to build it (when Prava ships an extension):**
1. Get Prava's `team_id` and `bundle_id` for their Messages extension.
2. Replace the `link` part in the webhook with an `imessage_app` part:
   ```json
   {
     "type": "imessage_app",
     "app": { "name": "Prava", "team_id": "XXXXXXXXXX", "bundle_id": "space.prava.MessagesExtension" },
     "url": "<payment_session_url>",
     "fallback_text": "Pay with Prava",
     "layout": {
       "caption": "Secure Checkout",
       "subcaption": "Product name — ₹price",
       "image_url": "<product_image>"
     }
   }
   ```
3. Use the Update App Card API (`POST /messages/{messageId}/update`) to update
   the card in place when payment status changes (pending → authorized → succeeded).
4. This is the killer UX that makes iMessage commerce feel native.

**Value for judges:** Even documenting this vision shows we understand the platform
deeply. The fact that we've already built the Linq + Prava integration and just need
Prava's extension to close the loop is a strong signal.

---

## 0b. iMessage Product Gallery / Carousel

**Status:** Vision — requires a custom iMessage app extension.

**The dream:** Instead of sending 3 separate image messages (the "photo dump"),
send a single interactive carousel card where the user swipes through products
horizontally — like how Apple Pay or some food delivery apps show options inside
Messages.

**Why we can't do it yet:**
- Linq has no native "gallery" message type. Multiple `media` parts just render
  as separate attachments.
- A swipeable carousel requires an `imessage_app` part backed by our OWN Messages
  extension that renders the carousel UI from a URL.
- Building a Messages extension requires an iOS app + Xcode project.

**What we do instead (today):** Send multiple `media` parts (photo dump) + one
`text` part with Saul's recommendation text. Each image is a separate bubble.

**How to build it (post-hackathon):**
1. Build a minimal iOS app with a Messages extension.
2. The extension reads a URL param (e.g. `?products=id1,id2,id3`) and renders a
   horizontal carousel with product images, names, and prices.
3. Tapping a product sends a reply message that our webhook picks up.
4. Ship to App Store (or TestFlight for demo).

---

## 1. Agent inbox reader (the "C" of the agent-email feature)

**Status:** A+B done (agent sends email, uses its inbox address at checkout). C (reading
inbound mail) is NOT built.

**What we have:** `saulsilver@agentmail.to` — an AgentMail inbox that DOES receive mail
(order confirmations, tracking numbers, brand replies land there). Outbound send is wired
in `src/lib/agentmail.ts` (`sendMail`, `sendPrescriptionRoutingEmail`).

**What's missing:** No inbound read. `agentmail.ts` has no `listMessages` / `pollInbox` /
inbound webhook. Nobody reads what lands in the inbox.

**How to build it (when time permits):**

### Option A — Cron poll (simpler, recommended for v1)
1. Check the AgentMail API docs for the list-messages endpoint. The send endpoint is
   `POST /v0/inboxes/{INBOX_ID}/messages/send`, so the inbound counterpart is almost
   certainly `GET /v0/inboxes/{INBOX_ID}/messages` (verify against their docs first).
2. Add `listInboxMessages()` to `src/lib/agentmail.ts` — returns recent messages with
   sender, subject, body, timestamp.
3. Add a Vercel Cron route `src/app/api/agentmail/poll/route.ts` that runs every ~5 min,
   lists new messages since the last-seen timestamp, and for each:
   - Parse for tracking numbers / order status / shipping updates.
   - Match to an order via the `txn_ref_id` or order ID in the subject/body.
   - Push a chat message into the relevant conversation: "Your Moon Impact order just
     shipped — tracking #XXXX. It's on the way."
4. Store `last_polled_at` (a single row in a settings table, or env/var).

### Option B — Inbound webhook (real-time, cleaner)
1. Register an AgentMail webhook for `message.received` events pointing at
   `POST /api/agentmail/webhook/route.ts`.
2. Same parsing + chat-push logic as Option A, but event-driven (no polling).
3. Verify the webhook signature if AgentMail signs payloads.

**Prerequisite before building:** Read the AgentMail API docs to confirm the
list-messages endpoint shape. Do NOT assume — verify first (lessons §7 pattern:
don't guess an API, check it).

**Risk:** If the API shape is wrong, this could eat 1-2 hours. Only start it if we
have clear buffer before the deadline.

---

## 2. Saul personality — Giphy weed/420 reactions (for the marketing video)

**Status:** Nice-to-have for personality + post-submission marketing (Twitter/demo
video). Not core to the hackathon flow.

**Idea:** Saul should be able to drop relevant GIFs into the conversation — stoner
movie references, 420 culture, Pineapple Express vibes, Seth Rogen reactions, etc.
It makes him feel alive and gives the demo video shareable personality moments.

**Note — coordinate with Antigravity:** They are working on Giphy search via Linq
(iMessage native). So this may already be in flight on the Linq/SMS side. Before
building, check what Antigravity shipped so we don't duplicate. If they've got
Giphy in the iMessage path, the web-chat equivalent is the gap to fill.

**How to build (if needed for web chat):**
1. Add a `sendGif` tool to `saul-agent.ts` — Saul calls it when a moment fits
   (user gets a match → celebration GIF; user asks a stoner-culture question →
   relevant reaction).
2. Use the Giphy API (`api.giphy.com/v1/gifs/search`) — free tier, search by
   keyword ("weed", "420", "pineapple express", "seth rogen laugh", etc.).
3. Render the GIF inline in the chat as an assistant message (new `kind: "gif"`).
4. Keep it tasteful and sparse — a GIF every 5-10 messages, not every reply,
   or it gets annoying fast.

**Value:** Demo video personality + Twitter shareability. Judges remember
personality. But it's polish, not a winner on its own — ship the core flow first.

---

## 3. "Buy anything from any URL" generalization

**Status:** Deferred — not for this hackathon.

The `checkout/automate` route is already merchant-agnostic (URL + card + email +
address). To unlock "buy me an iPhone from apple.com":
- Add a `buyFromUrl` agent tool alongside `matchProducts` / `researchBrand`.
- Saul accepts a URL → creates a Prava session against that host → reuses the same
  Stagehand checkout pipeline.

Nice to have. Ship the cannabis flow first.

---

## 4. Freshness check from chat — ✅ DONE (this session)
Previously `forceRefresh` was never sent from chat, so "did X's new gummies launch?"
always hit the 7-day cache. Fixed: the `researchBrand` tool now has a `forceRefresh`
param the LLM sets when the user asks about restocks / new products / launches.

---

## 5. US / multi-region support (geo-detect + non-IN catalogs)

**Status:** Deferred — sandbox-only for now; real build is post-submission. The
3-min submission recording / Twitter is the place to TALK about this, not ship it.

**Why it matters:** US eyeballs on the hackathon can't use the product — it's
hardcoded to India. The vision ("spawn any category expert") implies this should
work anywhere. Talking about the roadmap strengthens the Localhost startup pitch.

**One-line summary of the gap:** the whole stack assumes India — no geo-detection,
region hardcoded to "IN" at every layer, and the DB has 0 US brands. Live research
*can* crawl a named US brand, but ambient "what's good near me in Boston" returns
empty, and US dispensary checkouts (Dutchie/Jane) won't close via the Stagehand
Shopify flow. Full scope, risks, and the minimum viable build live in
**`docs/US-REGION-ROADMAP.md`**.

---

## Renumbering note
Sections renumbered: the old "buy anything" was also #3, now #3 here; the
freshness-done item is #4; US support is #5.
