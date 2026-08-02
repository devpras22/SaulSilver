-- iMessage conversation state — replaces the in-memory `convos` Map.
--
-- The Linq webhook (`/api/linq/webhook`) previously stored per-user convo state
-- (chat history + pendingRecommendations) in a process-local Map. On Vercel,
-- a follow-up reply can hit a different serverless instance that doesn't have
-- that Map, so the selection branch ("reply 1/2/3") silently did nothing.
--
-- This table mirrors the checkout_otp_handoff pattern: server-owned writes via
-- the service-role client (bypasses RLS), keyed by the sender's E.164 number.
create table if not exists public.imessage_convos (
  phone            text primary key,          -- E.164 sender, e.g. +13105551234
  chat_id          text,                      -- Linq chat id (for replies / typing)
  messages         jsonb not null default '[]'::jsonb,  -- OpenAI message history
  pending_recs     jsonb,                     -- pendingRecommendations[] or null
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- One row per iMessage Prava session that's awaiting an out-of-band checkout.
-- The cron poller walks rows in status='awaiting' and calls Prava
-- payment-result → report-status, then sends the user a confirmation text.
create table if not exists public.imessage_sessions (
  session_id       text primary key,          -- Prava session_id
  phone            text not null,             -- E.164 sender (for the confirmation text)
  chat_id          text,                      -- Linq chat id
  product_name     text,
  brand_name       text,
  amount_inr       numeric(10, 2),
  status           text not null default 'awaiting',  -- awaiting | reported | abandoned
  txn_ref_id       text,                      -- captured from payment-result once completed
  reported_status  text,                      -- APPROVED | DECLINED (what we told Prava)
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists imessage_sessions_status_idx
  on public.imessage_sessions (status)
  where status = 'awaiting';

alter table public.imessage_convos      enable row level security;
alter table public.imessage_sessions    enable row level security;

-- Server-only (service role bypasses RLS). No client ever reads these.
