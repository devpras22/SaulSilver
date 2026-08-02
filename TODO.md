# TODO — SaulSilver backlog

Lower-priority features scoped for AFTER the core hackathon flow is confirmed live.
Do NOT start these until Step 5 is verified through the live chat UI.

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
- Saul accepts any URL → creates a Prava session against that host → reuses the same
  Stagehand checkout pipeline.

Nice to have. Ship the cannabis flow first.

---

## 3. Freshness check from chat — ✅ DONE (this session)
Previously `forceRefresh` was never sent from chat, so "did X's new gummies launch?"
always hit the 7-day cache. Fixed: the `researchBrand` tool now has a `forceRefresh`
param the LLM sets when the user asks about restocks / new products / launches.
