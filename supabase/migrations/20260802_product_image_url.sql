-- ─────────────────────────────────────────────────────────────────────────────
-- PRODUCT IMAGE URL — the real product photo captured during live research.
--
-- Seeded brands keep their curated local images at /public/products/<brand>/*.jpg.
-- Live-researched brands have no local file, so the card fell back to a Leaf icon.
-- This column stores the og:image / JSON-LD image URL scraped from the product
-- page during research, so freshly-discovered brands render their real photo.
--
-- The card resolves: product.image_url ?? `/products/${brand.id}/${name}.jpg`
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.products
  add column if not exists image_url text;
