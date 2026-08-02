-- OTP handoff for Shopflo-gated checkouts.
--
-- Shopflo (the checkout used by Trost and most Indian Shopify stores in our
-- set) sends a real SMS OTP before any card form appears. The autonomous
-- checkout route can't receive SMS — so it pauses, writes a row here saying
-- "I'm waiting on an OTP for this purchase," and polls until the user types
-- the code into the chat UI, which writes it back via /api/checkout/provide-otp.
--
-- One row per purchase_id. The route owns INSERT + status updates; the client
-- owns the OTP-value UPDATE.
create table if not exists public.checkout_otp_handoff (
  purchase_id   text primary key,
  phone_masked  text,                      -- '+91 •••• •9999' — shown to the user
  status        text not null default 'awaiting_otp',  -- awaiting_otp | provided | consumed | expired
  otp_value     text,                      -- the 4-digit code the user typed
  created_at    timestamptz not null default now(),
  provided_at   timestamptz
);

-- ── Live status columns (added 2026-08-02) ──
-- The route updates `step` + `status_message` as it advances through the
-- checkout. The client polls and renders a single updating status bubble.
alter table public.checkout_otp_handoff
  add column if not exists step text,
  add column if not exists status_message text;

-- 3-minute TTL on awaiting rows — matches the route's poll budget.
alter table public.checkout_otp_handoff enable row level security;

-- Authenticated users can read/UPDATE their own handoff rows. The route
-- (service role) bypasses RLS to INSERT + set status=consumed.
create policy "Users manage their own OTP handoff"
  on public.checkout_otp_handoff
  for all
  to authenticated
  using (true)
  with check (true);
