-- ─────────────────────────────────────────────────────────────────────────────
-- KUSUSHI SCHEMA
-- Run this in Supabase → SQL Editor → New query → Run
-- ─────────────────────────────────────────────────────────────────────────────
--
-- One table: orders. Each row = one procurement completed in the app.
-- RLS is on. A user can only read/write their own orders.

create extension if not exists "pgcrypto";

-- ── Table ──
create table if not exists public.orders (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  user_email      text,
  created_at      timestamptz not null default now(),

  -- What they ordered
  items           jsonb not null,          -- MedicineItem[]
  address         text not null,
  geo             jsonb,                   -- { formatted, lat, lng }
  priority        text not null,           -- 'cheapest' | 'fastest' | 'closest' | 'confidence'

  -- What the agent picked
  chosen_pharmacy text not null,
  total           numeric(10, 2) not null,
  delivery_eta    integer,                 -- minutes

  -- Payment trail
  prava_session_id text,
  prava_txn_ref    text,
  payment_mode     text,                   -- 'demo' | 'live'
  status           text not null default 'completed',  -- completed | declined | failed

  -- Full recommendation + calls for the order-history detail view
  recommendation  jsonb,
  calls           jsonb
);

-- Index for the order-history query (a user's orders, newest first)
create index if not exists orders_user_created_idx
  on public.orders (user_id, created_at desc);

-- ── Row Level Security ──
alter table public.orders enable row level security;

-- Users can only see their own orders
create policy "Users read own orders"
  on public.orders for select
  using (auth.uid() = user_id);

-- Users can only insert orders for themselves
create policy "Users insert own orders"
  on public.orders for insert
  with check (auth.uid() = user_id);

-- Users can update their own orders (e.g. status change after payment settles)
create policy "Users update own orders"
  on public.orders for update
  using (auth.uid() = user_id);

-- No delete policy → users can't delete (admin only via service role)

-- ─────────────────────────────────────────────────────────────────────────────
-- CHATS TABLE — saved conversation history (one row per conversation)
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.chats (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  title       text not null,            -- derived from the first user message
  messages    jsonb not null,           -- the full ChatMessage[] stream
  items       jsonb,                    -- MedicineItem[] snapshot
  address     text,
  geo         jsonb,
  priority    text,
  stage       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists chats_user_updated_idx
  on public.chats (user_id, updated_at desc);

alter table public.chats enable row level security;

drop policy if exists "Users read own chats" on public.chats;
create policy "Users read own chats"
  on public.chats for select
  using (auth.uid() = user_id);

drop policy if exists "Users insert own chats" on public.chats;
create policy "Users insert own chats"
  on public.chats for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users update own chats" on public.chats;
create policy "Users update own chats"
  on public.chats for update
  using (auth.uid() = user_id);

-- Users CAN delete their own chats (unlike orders, which are immutable records)
drop policy if exists "Users delete own chats" on public.chats;
create policy "Users delete own chats"
  on public.chats for delete
  using (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- DONE. The app will use the anon key (RLS-protected) for reads/writes from the
-- browser, and the service_role key only in server routes where RLS would block
-- legitimate operations (none needed right now — RLS covers everything).
-- ─────────────────────────────────────────────────────────────────────────────
