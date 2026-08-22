-- =====================================================
-- MIGRATION V23: meerdere teams en managers per project
-- (UITGEVOERD op 2026-08-22 via Claude/Cowork op project zboyxwwrbtpjnlgquhzs
--  - maar vertrouw dit comment nooit blind: check information_schema)
--
-- Een project (campagne) kon maar één team hebben (campaigns.assigned_team_id)
-- en managers hingen per lijst aan project_managers. Nu:
--   - campaign_teams:    N teams per campagne
--   - campaign_managers: N managers per campagne (dekt ook lijsten die
--                        later binnen het project worden aangemaakt)
-- assigned_team_id is gebackfilled naar campaign_teams en daarna leeggemaakt;
-- de kolom blijft bestaan maar wordt nergens meer gelezen.
-- project_managers blijft als legacy bestaan (my_managed_list_ids uniont beide).
-- =====================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.campaign_teams (
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (campaign_id, team_id)
);

CREATE TABLE IF NOT EXISTS public.campaign_managers (
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  manager_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (campaign_id, manager_id)
);

ALTER TABLE public.campaign_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_managers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS campaign_teams_select ON public.campaign_teams;
CREATE POLICY campaign_teams_select ON public.campaign_teams
  FOR SELECT USING (team_id IN (SELECT id FROM public.teams));

DROP POLICY IF EXISTS campaign_teams_write ON public.campaign_teams;
CREATE POLICY campaign_teams_write ON public.campaign_teams
  FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS campaign_managers_select ON public.campaign_managers;
CREATE POLICY campaign_managers_select ON public.campaign_managers
  FOR SELECT USING (manager_id IN (SELECT id FROM public.profiles));

DROP POLICY IF EXISTS campaign_managers_write ON public.campaign_managers;
CREATE POLICY campaign_managers_write ON public.campaign_managers
  FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

-- Backfill vanuit het oude één-team-veld en de lijst-koppelingen
INSERT INTO public.campaign_teams (campaign_id, team_id)
SELECT id, assigned_team_id FROM public.campaigns WHERE assigned_team_id IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO public.campaign_managers (campaign_id, manager_id)
SELECT DISTINCT ll.campaign_id, pm.manager_id
FROM public.project_managers pm
JOIN public.lead_lists ll ON ll.id = pm.lead_list_id
WHERE ll.campaign_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- Oude kolom leegmaken zodat er maar één waarheid is
UPDATE public.campaigns SET assigned_team_id = NULL WHERE assigned_team_id IS NOT NULL;

-- Team-routing: bellen mag op lijsten van elke actieve campagne
-- waar één van je teams aan gekoppeld is (v22-pauze blijft gelden)
CREATE OR REPLACE FUNCTION public.my_list_ids()
RETURNS uuid[]
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT COALESCE(array_agg(id), '{}') FROM public.lead_lists
  WHERE created_by = auth.uid()
     OR assigned_to = auth.uid()
     OR campaign_id IN (
          SELECT c.id FROM public.campaigns c
          WHERE c.deleted_at IS NULL
            AND c.is_active
            AND EXISTS (
              SELECT 1 FROM public.campaign_teams ct
              WHERE ct.campaign_id = c.id
                AND ct.team_id = ANY (public.my_team_ids())
            )
        );
$$;

-- Manager ziet alle lijsten van zijn campagnes (nieuw) + losse lijst-koppelingen (legacy)
CREATE OR REPLACE FUNCTION public.my_managed_list_ids()
RETURNS uuid[]
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT COALESCE(array_agg(DISTINCT s.id), '{}') FROM (
    SELECT lead_list_id AS id FROM public.project_managers WHERE manager_id = auth.uid()
    UNION
    SELECT ll.id FROM public.lead_lists ll
    JOIN public.campaign_managers cm ON cm.campaign_id = ll.campaign_id
    WHERE cm.manager_id = auth.uid()
  ) s;
$$;

-- Campagne-zichtbaarheid: teams via campaign_teams, managers via campaign_managers
DROP POLICY IF EXISTS campaigns_select ON public.campaigns;
CREATE POLICY campaigns_select ON public.campaigns FOR SELECT USING (
  (NOT (organization_id IS DISTINCT FROM my_org_id())) AND (
    is_admin()
    OR created_by = auth.uid()
    OR EXISTS (SELECT 1 FROM public.campaign_teams ct
               WHERE ct.campaign_id = campaigns.id AND ct.team_id = ANY (my_team_ids()))
    OR EXISTS (SELECT 1 FROM public.campaign_managers cm
               WHERE cm.campaign_id = campaigns.id AND cm.manager_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.lead_lists ll
               WHERE ll.campaign_id = campaigns.id AND ll.id = ANY (my_managed_list_ids()))
  )
);

COMMIT;
