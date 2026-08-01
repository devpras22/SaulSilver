-- ─────────────────────────────────────────────────────────────────────────────
-- SAULSILVER SCHEMA — the cannabis sommelier
-- Run this in Supabase → SQL Editor → New query → Run
--
-- Structure:
--   Per-user (RLS):      orders, chats           [carried over from Kusushi]
--   Public catalog:      brands, products        [shared menu — no RLS on reads]
--   Audit trail:         brand_research          [show-your-work trust layer]
--
-- The catalog is PUBLIC-READ (everyone sees the same menu) but only the
-- service_role / agent can write to it (so a compromised client can't poison
-- the menu). Reads are open; writes are server-side only.
-- ─────────────────────────────────────────────────────────────────────────────

create extension if not exists "pgcrypto";

-- ═════════════════════════════════════════════════════════════════════════════
-- ORDERS (carried over — one row per completed cannabis procurement)
-- ═════════════════════════════════════════════════════════════════════════════

create table if not exists public.orders (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  user_email      text,
  created_at      timestamptz not null default now(),

  -- What they ordered
  items           jsonb not null,          -- CannabisProduct[] (was MedicineItem[])
  address         text not null,
  geo             jsonb,                   -- { formatted, lat, lng }
  priority        text not null,           -- 'effect' | 'cheapest' | 'fastest' | 'confidence'

  -- What the agent picked
  chosen_brand    text,                    -- brand slug
  chosen_product  text,                    -- product id
  total           numeric(10, 2) not null,
  delivery_eta    integer,                 -- minutes

  -- Prescription trail (NEW — the India-differentiator)
  prescription_url text,                   -- uploaded Rx (storage URL) — null if routed via in-house doctor
  prescription_mode text,                  -- 'uploaded' | 'doctor_call' | 'not_required'
  doctor_email_sent boolean default false, -- did the agent email the brand's doctor/support?

  -- Payment trail
  prava_session_id text,
  prava_txn_ref    text,
  payment_mode     text,                   -- 'demo' | 'live'
  status           text not null default 'completed',  -- completed | declined | failed

  -- Full recommendation + research for the order-history detail view
  recommendation  jsonb,
  research        jsonb
);

create index if not exists orders_user_created_idx
  on public.orders (user_id, created_at desc);

alter table public.orders enable row level security;

drop policy if exists "Users read own orders" on public.orders;
create policy "Users read own orders"
  on public.orders for select
  using (auth.uid() = user_id);

drop policy if exists "Users insert own orders" on public.orders;
create policy "Users insert own orders"
  on public.orders for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users update own orders" on public.orders;
create policy "Users update own orders"
  on public.orders for update
  using (auth.uid() = user_id);

-- No delete → orders are immutable records (admin only via service role)

-- ═════════════════════════════════════════════════════════════════════════════
-- CHATS (carried over — saved conversation history)
-- ═════════════════════════════════════════════════════════════════════════════

create table if not exists public.chats (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  title       text not null,
  messages    jsonb not null,
  items       jsonb,                    -- CannabisProduct[] snapshot
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

drop policy if exists "Users delete own chats" on public.chats;
create policy "Users delete own chats"
  on public.chats for delete
  using (auth.uid() = user_id);

-- ═════════════════════════════════════════════════════════════════════════════
-- BRANDS — the cannabis companies (PUBLIC READ, server-write only)
-- ═════════════════════════════════════════════════════════════════════════════

create table if not exists public.brands (
  id              text primary key,         -- slug: 'moon-impact'
  name            text not null,            -- 'Moon Impact'
  website         text,                     -- 'https://trymoonimpact.com'
  tagline         text,                     -- 'Precision Vijaya therapeutics'

  -- Classification
  category        text not null,            -- 'vijaya' | 'cbd' | 'hemp' | 'isolate'
  region          text not null default 'IN', -- 'IN' | 'US-CA' | 'global'
  rail            text not null,            -- 'd2c' | 'marketplace' — Prava relevance
  marketplaces    text[],                   -- null for d2c; ['itshemp','hempkart'] for marketplace

  -- Legal / prescription (the India differentiator)
  legal_status    text not null,            -- 'schedule_e1_prescription' | 'otc_cbd' | 'unregulated'
  prescription_required boolean not null default true,
  doctor_routing  text,                     -- how the in-house doctor flow works (free text)
  licences        jsonb,                    -- [{type:"AYUSH",number:"25D/55/96"},...] structured claims

  -- Social proof (tie-breaker between near-identical gummies)
  instagram_handle text,                    -- '@trymoonimpact'
  instagram_followers integer,              -- raw count
  instagram_engagement numeric,             -- engagement rate 0-1 (if available)

  -- Trust (driven by brand_research + Senso)
  trust_score     numeric not null default 0.5,  -- 0-1
  verified        boolean not null default false, -- agent has researched + confirmed
  last_researched timestamptz,              -- null = never researched

  -- Metadata
  description     text,
  packaging_notes text,                     -- 'premium metallic pouches' etc.
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists brands_category_idx on public.brands (category);
create index if not exists brands_region_idx on public.brands (region);
create index if not exists brands_trust_idx on public.brands (trust_score desc);

-- PUBLIC READ — anyone (even anon) can browse the menu.
-- Writes are server-side only (service_role bypasses RLS).
alter table public.brands enable row level security;

drop policy if exists "Public read brands" on public.brands;
create policy "Public read brands"
  on public.brands for select
  using (true);
-- No insert/update/delete policy → only service_role can mutate.

-- ═════════════════════════════════════════════════════════════════════════════
-- PRODUCTS — the SKUs (the sommelier's menu)
-- ═════════════════════════════════════════════════════════════════════════════

create table if not exists public.products (
  id              uuid primary key default gen_random_uuid(),
  brand_id        text not null references public.brands (id) on delete cascade,
  name            text not null,            -- 'Stellardust Nano-Infused Gummies'
  variant         text,                     -- 'Sleep' | 'Relax' | 'Focus' | 'Uplift'

  -- Cannabinoid profile (jsonb because combos vary: some list CBN+CBG, some just THC:CBD)
  cannabinoids    jsonb not null,           -- {"thc_mg": 100, "cbd_mg": 100, "cbn_mg": 250, "cbg_mg": 250}
  ratio           text,                     -- '1:1' | '4:1' | 'CBD-dominant'
  spectrum        text,                     -- 'full' | 'broad' | 'isolate'

  -- Effect — what the sommelier matches on
  effect_tags     text[] not null,          -- ['sleep','deep_rest','no_hangover']
  dose_level      text not null,            -- 'beginner' | 'intermediate' | 'heavy'

  -- Experience profile
  onset_minutes   integer,                  -- ~30 (nano-infused = faster)
  duration_hours  integer,                  -- 6-8
  flavor          text,                     -- 'berry' | 'mango' | 'citrus'

  -- Commerce
  pack_count      integer not null,         -- 20
  price_inr       integer not null,         -- 3300
  in_stock        boolean not null default true,

  -- The detail people actually read to compare brands
  key_uses        text,                     -- 'chronic pain, disturbed sleep, CINV, muscle spasticity...'
  warnings        text[],                   -- ['Not for pregnant/breastfeeding','Don't operate machinery',...]
  composition     jsonb,                    -- {"Ashwagandha":"11%","Vijaya":"3%",...}
  side_effects    text[],                   -- ['drowsiness','altered appetite','mild dizziness']

  -- Source of truth for the agent's research
  product_url     text,                     -- deep link to the SKU page

  description     text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists products_brand_idx on public.products (brand_id);
create index if not exists products_effect_idx on public.products using gin (effect_tags);
create index if not exists products_variant_idx on public.products (variant);

-- PUBLIC READ
alter table public.products enable row level security;

drop policy if exists "Public read products" on public.products;
create policy "Public read products"
  on public.products for select
  using (true);

-- ═════════════════════════════════════════════════════════════════════════════
-- BRAND_RESEARCH — the audit trail (show-your-work trust layer)
-- When the agent researches a brand, it logs WHAT it found and WHERE.
-- This is what makes "is this brand legit?" believable to a judge.
-- ═════════════════════════════════════════════════════════════════════════════

create table if not exists public.brand_research (
  id              uuid primary key default gen_random_uuid(),
  brand_id        text not null references public.brands (id) on delete cascade,

  query           text not null,            -- 'Is Moon Impact legit?'
  verdict         text not null,            -- 'verified' | 'caution' | 'avoid' | 'unverified'

  -- Structured findings — the agent's work
  findings        jsonb not null,           -- { coa_status, license, reviews_summary, red_flags, summary }
  sources         text[] not null,          -- the URLs the agent cited

  -- Trust snapshot at research time
  trust_score     numeric not null,         -- 0-1

  created_at      timestamptz not null default now()
);

create index if not exists brand_research_brand_idx
  on public.brand_research (brand_id, created_at desc);

-- PUBLIC READ — anyone can see why a brand was rated the way it was.
alter table public.brand_research enable row level security;

drop policy if exists "Public read brand_research" on public.brand_research;
create policy "Public read brand_research"
  on public.brand_research for select
  using (true);

-- ═════════════════════════════════════════════════════════════════════════════
-- DONE.
--
-- Read paths:
--   anon key   → browse brands, products, research (public catalog)
--   anon key   → read/write own orders + chats (RLS)
--
-- Write paths (server-side, service_role — bypasses RLS):
--   agent research   → upsert brands + products, insert brand_research
--   order completion → insert orders
-- ═════════════════════════════════════════════════════════════════════════════
