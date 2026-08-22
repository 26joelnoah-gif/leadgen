-- =====================================================
-- LEADGEN v31 — medewerker-lifecycle + organisatie-fundament
-- UITGEVOERD op Supabase (zboyxwwrbtpjnlgquhzs) op 22-08-2026 via MCP.
-- 1) profiles.is_active (inactief = niet inloggen, uit alle lijsten)
-- 2) DELETE-policy op profiles (fix: verwijderen deed stilletjes niets,
--    waardoor "verwijderde" medewerkers na verversen terugkwamen)
-- 3) call_logs.agent_id -> ON DELETE SET NULL (historie blijft bij verwijderen)
-- 4) xp_leaderboard filtert inactieven
-- 5) profiles-RLS: eigenaar van een organisatie ziet/beheert ook de leden
--    van orgs die hij owned (platform-model: Noah owned de klant-orgs)
-- LET OP: het echte login-account (auth.users) kan alleen via het
-- Supabase-dashboard verwijderd worden; de app verwijdert het profiel,
-- waarmee de persoon uit de app verdwijnt en nergens meer bij kan.
-- =====================================================

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION public.my_owned_org_ids()
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$ SELECT id FROM public.organizations WHERE owner_id = auth.uid(); $$;

DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
CREATE POLICY "profiles_select" ON public.profiles
  FOR SELECT USING (
    NOT (organization_id IS DISTINCT FROM public.my_org_id())
    OR organization_id IN (SELECT public.my_owned_org_ids())
  );

DROP POLICY IF EXISTS "profiles_update" ON public.profiles;
CREATE POLICY "profiles_update" ON public.profiles
  FOR UPDATE USING (
    id = auth.uid()
    OR (public.is_admin() AND (
      NOT (organization_id IS DISTINCT FROM public.my_org_id())
      OR organization_id IN (SELECT public.my_owned_org_ids())
    ))
  ) WITH CHECK (
    id = auth.uid()
    OR (public.is_admin() AND (
      NOT (organization_id IS DISTINCT FROM public.my_org_id())
      OR organization_id IN (SELECT public.my_owned_org_ids())
    ))
  );

DROP POLICY IF EXISTS "profiles_delete_admin" ON public.profiles;
CREATE POLICY "profiles_delete_admin" ON public.profiles
  FOR DELETE USING (
    public.is_admin()
    AND id <> auth.uid()
    AND (
      NOT (organization_id IS DISTINCT FROM public.my_org_id())
      OR organization_id IN (SELECT public.my_owned_org_ids())
    )
  );

DROP POLICY IF EXISTS "organizations_insert" ON public.organizations;
CREATE POLICY "organizations_insert" ON public.organizations
  FOR INSERT WITH CHECK (owner_id = auth.uid() AND public.is_admin());

ALTER TABLE public.call_logs ALTER COLUMN agent_id DROP NOT NULL;
ALTER TABLE public.call_logs DROP CONSTRAINT call_logs_agent_id_fkey;
ALTER TABLE public.call_logs ADD CONSTRAINT call_logs_agent_id_fkey
  FOREIGN KEY (agent_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.xp_leaderboard()
RETURNS TABLE(agent_id uuid, full_name text, xp bigint)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT cl.agent_id, p.full_name,
         COALESCE(SUM(public.xp_for(cl.disposition, l.lead_source, l.decision_maker)), 0)::bigint AS xp
  FROM public.call_logs cl
  JOIN public.profiles p ON p.id = cl.agent_id
  LEFT JOIN public.leads l ON l.id = cl.lead_id
  WHERE p.organization_id IS NOT DISTINCT FROM public.my_org_id()
    AND p.role = 'employee'
    AND COALESCE(p.is_active, true)
  GROUP BY cl.agent_id, p.full_name
  ORDER BY xp DESC;
$$;
