-- =====================================================
-- MIGRATION V25: call_logs-zichtbaarheid aangescherpt
-- (UITGEVOERD op 2026-08-22 via Claude/Cowork op project zboyxwwrbtpjnlgquhzs
--  - maar vertrouw dit comment nooit blind: check pg_policies)
--
-- Was: iedereen in de organisatie kon ALLE call_logs lezen.
-- Nu: admin ziet alles, een beller alleen zijn eigen gesprekken,
-- een manager alleen de gesprekken op zijn projecten
-- (my_managed_list_ids dekt campaign_managers + legacy project_managers).
-- Hiermee kan de Rapportage-pagina veilig open voor managers:
-- de data is vanzelf beperkt tot hun eigen projecten.
-- =====================================================

BEGIN;

DROP POLICY IF EXISTS call_logs_select_org ON public.call_logs;
DROP POLICY IF EXISTS call_logs_select_scoped ON public.call_logs;
CREATE POLICY call_logs_select_scoped ON public.call_logs FOR SELECT USING (
  (NOT (organization_id IS DISTINCT FROM my_org_id())) AND (
    is_admin()
    OR agent_id = auth.uid()
    OR lead_list_id = ANY (public.my_managed_list_ids())
  )
);

COMMIT;
