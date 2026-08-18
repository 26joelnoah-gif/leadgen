-- =====================================================
-- MIGRATION V14: Call tracking (GERUND op 2026-08-18 via Claude)
-- Fundament voor telemetrie, targets en uitbetaling:
-- één rij per behandelde lead in de belmodus.
-- =====================================================

CREATE TABLE IF NOT EXISTS public.call_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id),
  agent_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  lead_list_id uuid REFERENCES public.lead_lists(id) ON DELETE SET NULL,
  disposition text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  disposed_at timestamptz NOT NULL DEFAULT now(),
  duration_seconds integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_call_logs_agent_time ON public.call_logs (agent_id, disposed_at DESC);
CREATE INDEX IF NOT EXISTS idx_call_logs_org_time ON public.call_logs (organization_id, disposed_at DESC);

ALTER TABLE public.call_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "call_logs_insert_self" ON public.call_logs
  FOR INSERT WITH CHECK (agent_id = auth.uid());

CREATE POLICY "call_logs_select_org" ON public.call_logs
  FOR SELECT USING (organization_id IS NOT DISTINCT FROM public.my_org_id());

-- Realtime voor de live feed
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.call_logs;
EXCEPTION WHEN duplicate_object THEN NULL;
WHEN undefined_object THEN NULL;
END $$;

-- Dagstatistieken per beller (security_invoker: RLS van call_logs geldt)
CREATE OR REPLACE VIEW public.agent_daily_stats
WITH (security_invoker = true) AS
SELECT
  agent_id,
  organization_id,
  (disposed_at AT TIME ZONE 'Europe/Amsterdam')::date AS dag,
  count(*) AS calls,
  round(avg(duration_seconds))::int AS gem_duur_seconden,
  count(*) FILTER (WHERE disposition = 'afspraak_gemaakt') AS afspraken,
  count(*) FILTER (WHERE disposition = 'deal') AS deals,
  count(*) FILTER (WHERE disposition = 'terugbelafspraak') AS terugbel,
  count(*) FILTER (WHERE disposition = 'geen_gehoor') AS geen_gehoor
FROM public.call_logs
GROUP BY 1, 2, 3;
