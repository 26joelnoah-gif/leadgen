-- =====================================================
-- LEADGEN v12 — RLS REPARATIE & HARDENING
-- =====================================================
-- Waarom deze migratie:
--   1. public.profiles had RLS UIT terwijl er policies op stonden -> iedereen
--      met de anon key kon alle profielen lezen EN aanpassen (incl. role).
--   2. public.leads had een policy "leads_all" (ALL / USING true / role public)
--      -> die overrulede alle andere policies. Leads waren publiek leesbaar
--      en aanpasbaar zonder in te loggen.
--   3. teams, team_members en flow_settings hadden RLS AAN met NUL policies
--      -> de app kon ze niet lezen. Daardoor werkten teamzichtbaarheid en
--      het hele automated-flow systeem niet.
--   4. Overal stapels dubbele, tegenstrijdige policies op rol "public"
--      (= inclusief anon) in plaats van "authenticated".
--
-- Deze migratie gooit de policy-rommel weg en zet er één coherente set voor terug.
-- =====================================================

BEGIN;

-- -----------------------------------------------------
-- 1. HELPER FUNCTIES
-- -----------------------------------------------------
-- SECURITY DEFINER zodat ze door RLS heen kunnen kijken zonder oneindige
-- recursie (profiles-policy die profiles bevraagt).

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.my_org_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT organization_id FROM public.profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.my_team_ids()
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(array_agg(team_id), '{}')
  FROM public.team_members WHERE profile_id = auth.uid();
$$;

-- Lijsten die ik mag zien: eigen, aan mij toegewezen, of van mijn team.
CREATE OR REPLACE FUNCTION public.my_list_ids()
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(array_agg(id), '{}')
  FROM public.lead_lists
  WHERE created_by = auth.uid()
     OR assigned_to = auth.uid()
     OR assigned_team_id = ANY (public.my_team_ids());
$$;

-- Alleen ingelogde gebruikers mogen deze helpers aanroepen.
REVOKE EXECUTE ON FUNCTION public.is_admin()     FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.my_org_id()    FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.my_team_ids()  FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.my_list_ids()  FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.is_admin()     TO authenticated;
GRANT  EXECUTE ON FUNCTION public.my_org_id()    TO authenticated;
GRANT  EXECUTE ON FUNCTION public.my_team_ids()  TO authenticated;
GRANT  EXECUTE ON FUNCTION public.my_list_ids()  TO authenticated;

-- -----------------------------------------------------
-- 2. ALLE BESTAANDE POLICIES WEG (schone lei)
-- -----------------------------------------------------
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('profiles','leads','lead_lists','lead_list_items',
                        'activities','teams','team_members','flow_settings',
                        'messages','chat_channels','organizations')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I',
                   r.policyname, r.schemaname, r.tablename);
  END LOOP;
END $$;

-- -----------------------------------------------------
-- 3. RLS AAN OP ALLE TABELLEN
-- -----------------------------------------------------
ALTER TABLE public.profiles        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_lists      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_list_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activities      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teams           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flow_settings   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_channels   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations   ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------
-- 4. PROFILES
-- -----------------------------------------------------
-- Collega's moeten elkaars naam kunnen zien (leaderboard, toewijzen).
CREATE POLICY profiles_select ON public.profiles
  FOR SELECT TO authenticated
  USING (organization_id IS NOT DISTINCT FROM public.my_org_id());

CREATE POLICY profiles_insert_self ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());

CREATE POLICY profiles_update ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid() OR public.is_admin())
  WITH CHECK (id = auth.uid() OR public.is_admin());

-- Voorkom dat een gebruiker zichzelf admin maakt of naar een andere
-- organisatie springt. Alleen een admin mag role/organization_id wijzigen.
CREATE OR REPLACE FUNCTION public.guard_profile_privileges()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW; -- service_role / trigger / SQL editor: ongemoeid laten
  END IF;
  IF (NEW.role IS DISTINCT FROM OLD.role
      OR NEW.organization_id IS DISTINCT FROM OLD.organization_id)
     AND NOT public.is_admin() THEN
    -- eigen org koppelen mag alleen als je er nog geen had (onboarding)
    IF NOT (NEW.role = OLD.role AND OLD.organization_id IS NULL) THEN
      RAISE EXCEPTION 'Geen rechten om role of organization_id te wijzigen';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS profiles_guard_privileges ON public.profiles;
CREATE TRIGGER profiles_guard_privileges
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_privileges();

-- -----------------------------------------------------
-- 5. LEADS
-- -----------------------------------------------------
-- Zichtbaar als: admin, of aan mij toegewezen, of in een lijst van mij/mijn team.
-- Altijd binnen de eigen organisatie (nu overal NULL -> werkt, en isoleert
-- automatisch zodra organizations in gebruik worden genomen).
CREATE POLICY leads_select ON public.leads
  FOR SELECT TO authenticated
  USING (
    organization_id IS NOT DISTINCT FROM public.my_org_id()
    AND (
      public.is_admin()
      OR assigned_to = auth.uid()
      OR created_by  = auth.uid()
      OR lead_list_id = ANY (public.my_list_ids())
    )
  );

CREATE POLICY leads_insert ON public.leads
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id IS NOT DISTINCT FROM public.my_org_id()
    AND (created_by = auth.uid() OR public.is_admin())
  );

CREATE POLICY leads_update ON public.leads
  FOR UPDATE TO authenticated
  USING (
    organization_id IS NOT DISTINCT FROM public.my_org_id()
    AND (
      public.is_admin()
      OR assigned_to = auth.uid()
      OR created_by  = auth.uid()
      OR lead_list_id = ANY (public.my_list_ids())
    )
  )
  WITH CHECK (organization_id IS NOT DISTINCT FROM public.my_org_id());

CREATE POLICY leads_delete ON public.leads
  FOR DELETE TO authenticated
  USING (public.is_admin()
         AND organization_id IS NOT DISTINCT FROM public.my_org_id());

-- -----------------------------------------------------
-- 6. LEAD_LISTS
-- -----------------------------------------------------
CREATE POLICY lead_lists_select ON public.lead_lists
  FOR SELECT TO authenticated
  USING (
    organization_id IS NOT DISTINCT FROM public.my_org_id()
    AND (
      public.is_admin()
      OR created_by = auth.uid()
      OR assigned_to = auth.uid()
      OR assigned_team_id = ANY (public.my_team_ids())
    )
  );

-- Bellers maken via automated flows nieuwe lijsten aan.
CREATE POLICY lead_lists_insert ON public.lead_lists
  FOR INSERT TO authenticated
  WITH CHECK (organization_id IS NOT DISTINCT FROM public.my_org_id());

CREATE POLICY lead_lists_update ON public.lead_lists
  FOR UPDATE TO authenticated
  USING (
    organization_id IS NOT DISTINCT FROM public.my_org_id()
    AND (public.is_admin() OR created_by = auth.uid() OR assigned_to = auth.uid())
  );

CREATE POLICY lead_lists_delete ON public.lead_lists
  FOR DELETE TO authenticated
  USING (public.is_admin());

-- -----------------------------------------------------
-- 7. LEAD_LIST_ITEMS
-- -----------------------------------------------------
CREATE POLICY lead_list_items_select ON public.lead_list_items
  FOR SELECT TO authenticated
  USING (lead_list_id = ANY (public.my_list_ids()) OR public.is_admin());

CREATE POLICY lead_list_items_write ON public.lead_list_items
  FOR ALL TO authenticated
  USING (lead_list_id = ANY (public.my_list_ids()) OR public.is_admin())
  WITH CHECK (lead_list_id = ANY (public.my_list_ids()) OR public.is_admin());

-- -----------------------------------------------------
-- 8. ACTIVITIES
-- -----------------------------------------------------
CREATE POLICY activities_select ON public.activities
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

CREATE POLICY activities_insert ON public.activities
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- -----------------------------------------------------
-- 9. TEAMS & TEAM_MEMBERS  (hadden NUL policies -> app zag niets)
-- -----------------------------------------------------
CREATE POLICY teams_select ON public.teams
  FOR SELECT TO authenticated USING (true);

CREATE POLICY teams_write ON public.teams
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY team_members_select ON public.team_members
  FOR SELECT TO authenticated USING (true);

CREATE POLICY team_members_write ON public.team_members
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- -----------------------------------------------------
-- 10. FLOW_SETTINGS  (had NUL policies -> flows werkten nooit)
-- -----------------------------------------------------
CREATE POLICY flow_settings_select ON public.flow_settings
  FOR SELECT TO authenticated USING (true);

CREATE POLICY flow_settings_write ON public.flow_settings
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- -----------------------------------------------------
-- 11. CHAT
-- -----------------------------------------------------
CREATE POLICY chat_channels_select ON public.chat_channels
  FOR SELECT TO authenticated USING (true);

CREATE POLICY chat_channels_insert ON public.chat_channels
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());

CREATE POLICY messages_select ON public.messages
  FOR SELECT TO authenticated USING (true);

CREATE POLICY messages_insert ON public.messages
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- -----------------------------------------------------
-- 12. ORGANIZATIONS
-- -----------------------------------------------------
CREATE POLICY organizations_select ON public.organizations
  FOR SELECT TO authenticated
  USING (id = public.my_org_id() OR owner_id = auth.uid());

-- Je mag alleen een organisatie aanmaken met jezelf als eigenaar.
CREATE POLICY organizations_insert ON public.organizations
  FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY organizations_update ON public.organizations
  FOR UPDATE TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

COMMIT;
