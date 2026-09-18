-- ============================================================================
-- v82 (2026-09-18): mailrapportage voor managers, warme leads, auto-verrijking
-- ----------------------------------------------------------------------------
-- 1. Managers mogen de mails (mailservice_logs) van hun eigen projecten lezen,
--    zodat het tabblad "Mails" op /admin/reports voor hen ook werkt. Tot nu
--    zag alleen admin alles en een beller alleen zijn eigen mails.
-- 2. campaigns.auto_enrich: na een import in dit project draait de gratis
--    website-scan (Edge Function enrich-lead) automatisch voor leads met een
--    website maar zonder e-mail of contactpersoon. Aangezet voor MarketingKiezer.
-- 3. enrichment_logs: ook een beller die mag verrijken (auto_enrich of het
--    recht "Leads beheren") mag zijn eigen verrijk-regels loggen.
-- ============================================================================

-- 1. Managers: campagnes waar ik manager van ben (security definer, zodat de
--    policy niet zelf weer door RLS op campaign_managers heen moet).
CREATE OR REPLACE FUNCTION public.my_managed_campaign_ids()
RETURNS uuid[]
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT COALESCE(array_agg(DISTINCT campaign_id), '{}')
  FROM public.campaign_managers
  WHERE manager_id = auth.uid();
$$;
REVOKE ALL ON FUNCTION public.my_managed_campaign_ids() FROM public;
GRANT EXECUTE ON FUNCTION public.my_managed_campaign_ids() TO authenticated;

DROP POLICY IF EXISTS mailservice_logs_select ON public.mailservice_logs;
CREATE POLICY mailservice_logs_select ON public.mailservice_logs
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR agent_id = auth.uid()
    OR campaign_id = ANY (public.my_managed_campaign_ids())
  );

CREATE INDEX IF NOT EXISTS mailservice_logs_campaign_time
  ON public.mailservice_logs (campaign_id, created_at DESC);

-- 2. Auto-verrijking per project
ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS auto_enrich boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.campaigns.auto_enrich IS
  'v82: na een import automatisch de gratis website-scan draaien (enrich-lead) voor leads met website maar zonder e-mail/contactpersoon.';

UPDATE public.campaigns SET auto_enrich = true WHERE board_view_enabled = true AND deleted_at IS NULL;

-- 3. Verrijk-log: iedereen die actief is mag zijn eigen regels schrijven; de
--    Edge Function bepaalt wie mag verrijken (admin, "Leads beheren", of
--    auto_enrich op het project).
DROP POLICY IF EXISTS "enrichment_logs_insert" ON public.enrichment_logs;
CREATE POLICY "enrichment_logs_insert" ON public.enrichment_logs
  FOR INSERT WITH CHECK (
    requested_by = auth.uid()
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_active IS DISTINCT FROM false)
  );
