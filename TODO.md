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

## 2. "Buy anything from any URL" generalization

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
