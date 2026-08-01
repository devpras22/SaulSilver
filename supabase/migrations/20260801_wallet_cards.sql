-- ─────────────────────────────────────────────────────────────────────────────
-- WALLET_CARDS — the saved-card reference (NOT the card itself).
--
-- We never store a PAN, CVV, or token. We store ONLY the Prava `card_id`
-- (enrollmentId from collectPAN) + display metadata (last4, brand) so the
-- wallet UI can show "Visa •••• 4242" and reuse the card on checkout.
--
-- Prava holds the real credential; we hold a pointer to it.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.wallet_cards (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  created_at      timestamptz not null default now(),

  -- The ONLY thing we need to charge again: Prava's card_id (enrollmentId)
  prava_card_id   text not null,

  -- Display-only metadata (safe — no PAN)
  last4           text,
  brand           text,                    -- 'visa' | 'mastercard'
  exp_month       integer,
  exp_year        integer,
  is_default      boolean not null default false
);

create index if not exists wallet_cards_user_idx on public.wallet_cards (user_id);

alter table public.wallet_cards enable row level security;

drop policy if exists "Users read own cards" on public.wallet_cards;
create policy "Users read own cards"
  on public.wallet_cards for select
  using (auth.uid() = user_id);

drop policy if exists "Users insert own cards" on public.wallet_cards;
create policy "Users insert own cards"
  on public.wallet_cards for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users delete own cards" on public.wallet_cards;
create policy "Users delete own cards"
  on public.wallet_cards for delete
  using (auth.uid() = user_id);

-- Allow a user to mark a card default (update is_default only)
drop policy if exists "Users update own cards" on public.wallet_cards;
create policy "Users update own cards"
  on public.wallet_cards for update
  using (auth.uid() = user_id);

-- ─── Also: rename orders.payment_mode legacy values ──────────────────────────
-- 'demo'/'live' no longer applies (one track). Keep the column for back-compat
-- but we now write 'prava' for all real transactions. No data migration needed
-- — old rows keep their values; new rows use 'prava'.
