-- =====================================================
-- MIGRATION V18: Extra info-velden op leads
-- (GERUND op 2026-08-21 via Claude — al toegepast op Supabase)
-- Vangnet voor import: kolommen die niet herkend worden
-- komen in extra_info1/2/3 terecht en zijn zichtbaar
-- in de belmodus (rechterkant).
-- =====================================================
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS extra_info1 TEXT;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS extra_info2 TEXT;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS extra_info3 TEXT;
