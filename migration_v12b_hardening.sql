-- =====================================================
-- LEADGEN v12b — functie- en view-hardening
-- Toegepast na migration_v12_rls_repair.sql
-- =====================================================

-- Vaste search_path (voorkomt search_path hijacking)
ALTER FUNCTION public.handle_new_user()    SET search_path = public, pg_temp;
ALTER FUNCTION public.handle_lead_flow()   SET search_path = public, pg_temp;
ALTER FUNCTION public.update_updated_at()  SET search_path = public, pg_temp;
ALTER FUNCTION public.can_access_lead(uuid, uuid) SET search_path = public, pg_temp;

-- Deze view draaide met de rechten van de maker en omzeilde daarmee RLS
ALTER VIEW public.vw_leads_with_teams SET (security_invoker = on);

-- Trigger-functies horen niet via /rest/v1/rpc aanroepbaar te zijn
REVOKE EXECUTE ON FUNCTION public.handle_new_user()   FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.handle_lead_flow()  FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.update_updated_at() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.guard_profile_privileges() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.can_access_lead(uuid, uuid) FROM anon, authenticated, public;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
             WHERE n.nspname = 'public' AND p.proname = 'rls_auto_enable') THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM anon, authenticated, public';
  END IF;
END $$;

-- LET OP: is_admin(), my_org_id(), my_team_ids() en my_list_ids() HOUDEN bewust
-- EXECUTE voor authenticated. RLS-policies draaien met de rechten van de
-- aanroeper, dus zonder die grant werkt geen enkele policy meer.
