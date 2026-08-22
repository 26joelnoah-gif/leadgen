-- =====================================================
-- LEADGEN v32 — verbruikslog voor (AI-)verrijkingen
-- UITGEVOERD op Supabase (zboyxwwrbtpjnlgquhzs) op 22-08-2026 via MCP.
-- Elke verrijking wordt gelogd: wie, welke lead, welke bron,
-- welke velden zijn toegevoegd. Fundament voor het latere
-- credits-/doorbelast-model per organisatie.
-- Hoort bij Edge Function: supabase/functions/enrich-lead/index.ts
-- =====================================================

CREATE TABLE IF NOT EXISTS public.enrichment_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  requested_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  source TEXT NOT NULL DEFAULT 'perplexity',
  status TEXT NOT NULL DEFAULT 'ok',           -- ok | no_data | error
  fields_added JSONB NOT NULL DEFAULT '{}'::jsonb,
  detail TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_enrichment_logs_org ON public.enrichment_logs(organization_id, created_at);
CREATE INDEX IF NOT EXISTS idx_enrichment_logs_lead ON public.enrichment_logs(lead_id);

ALTER TABLE public.enrichment_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "enrichment_logs_select" ON public.enrichment_logs
  FOR SELECT USING (
    (NOT (organization_id IS DISTINCT FROM public.my_org_id())
     OR organization_id IN (SELECT public.my_owned_org_ids()))
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','manager'))
  );

CREATE POLICY "enrichment_logs_insert" ON public.enrichment_logs
  FOR INSERT WITH CHECK (
    requested_by = auth.uid()
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','manager'))
  );
