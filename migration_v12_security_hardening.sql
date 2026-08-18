-- =====================================================
-- MIGRATION V12: Security Hardening (HERSCHREVEN na review)
-- (GERUND op 2026-08-18 via Claude)
--
-- De originele v12 deed subqueries op `profiles` binnen policies op
-- `profiles` zelf -> "infinite recursion detected in policy" en zou
-- de hele app breken. De database had (via migration v10) al goede
-- org- en assignment-scoped policies voor profiles, leads en
-- lead_lists — die blijven ongemoeid.
--
-- Deze versie fixt alleen de échte gaten:
--   1. Chat (messages + channels) was leesbaar voor ALLE ingelogde users
--   2. Teams + team_members idem
--   3. Leads konden zonder naam/telefoon worden aangemaakt
--   4. Trigger-functies zonder gepind search_path
-- =====================================================

DROP POLICY IF EXISTS "messages_select" ON public.messages;
CREATE POLICY "messages_select_org" ON public.messages
  FOR SELECT USING (
    user_id IN (
      SELECT id FROM public.profiles
      WHERE organization_id IS NOT DISTINCT FROM public.my_org_id()
    )
  );

-- chat_channels heeft geen created_by; geef het een organization_id voor tenant-scoping
ALTER TABLE public.chat_channels ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id);
DROP POLICY IF EXISTS "chat_channels_select" ON public.chat_channels;
CREATE POLICY "chat_channels_select_org" ON public.chat_channels
  FOR SELECT USING (
    organization_id IS NULL -- systeem/globale kanalen
    OR organization_id IS NOT DISTINCT FROM public.my_org_id()
  );

DROP POLICY IF EXISTS "teams_select" ON public.teams;
CREATE POLICY "teams_select_org" ON public.teams
  FOR SELECT USING (
    created_by IS NULL
    OR created_by IN (
      SELECT id FROM public.profiles
      WHERE organization_id IS NOT DISTINCT FROM public.my_org_id()
    )
  );

DROP POLICY IF EXISTS "team_members_select" ON public.team_members;
CREATE POLICY "team_members_select_org" ON public.team_members
  FOR SELECT USING (
    profile_id IN (
      SELECT id FROM public.profiles
      WHERE organization_id IS NOT DISTINCT FROM public.my_org_id()
    )
  );

ALTER TABLE public.leads ALTER COLUMN name SET NOT NULL;
ALTER TABLE public.leads ALTER COLUMN phone SET NOT NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname = 'public' AND p.proname = 'log_status_change') THEN
    ALTER FUNCTION public.log_status_change() SET search_path = public;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname = 'public' AND p.proname = 'handle_new_user') THEN
    ALTER FUNCTION public.handle_new_user() SET search_path = public;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname = 'public' AND p.proname = 'handle_message_admin_flag') THEN
    ALTER FUNCTION public.handle_message_admin_flag() SET search_path = public;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname = 'public' AND p.proname = 'log_lead_status_change') THEN
    ALTER FUNCTION public.log_lead_status_change() SET search_path = public;
  END IF;
END $$;
