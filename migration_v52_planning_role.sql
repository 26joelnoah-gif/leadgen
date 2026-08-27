-- =====================================================
-- MIGRATION V52: rol 'planning' (alleen rooster doorgeven) - GERUND op 2026-08-27 via Claude
-- Een planning-account logt in, ziet uitsluitend /roosters en kan zijn eigen
-- beschikbaarheid indienen. Het account mag aan een team (en dus aan een
-- project) gekoppeld worden zodat het in het teamoverzicht per project
-- meedraait, maar mag daardoor NOOIT leads/lijsten/campagnes/chat zien.
-- Dat wordt hier op DB-niveau dichtgezet, niet alleen in de UI.
-- =====================================================

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (role = ANY (ARRAY['employee'::text, 'manager'::text, 'admin'::text, 'recruiter'::text, 'backoffice'::text, 'planning'::text]));

CREATE OR REPLACE FUNCTION public.is_planning()
  RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
AS $function$ SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'planning'); $function$;

-- Team-scope: een planning-account zit wel in een team (voor het rooster),
-- maar krijgt daar geen enkele leesrechten uit. Dit sluit in een klap
-- campaigns_select, lead_lists_select, lead_list_items en leads_select.
CREATE OR REPLACE FUNCTION public.my_team_ids()
  RETURNS uuid[]
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT CASE WHEN public.is_planning() THEN '{}'::uuid[]
    ELSE COALESCE((SELECT array_agg(team_id) FROM public.team_members WHERE profile_id = auth.uid()), '{}')
  END;
$function$;

CREATE OR REPLACE FUNCTION public.my_list_ids()
  RETURNS uuid[]
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT CASE WHEN public.is_planning() THEN '{}'::uuid[]
    ELSE COALESCE((
      SELECT array_agg(id) FROM public.lead_lists
      WHERE (activate_at IS NULL OR activate_at <= now())
        AND (
          created_by = auth.uid()
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
              )
        )
    ), '{}')
  END;
$function$;

-- Chat is voor planning-accounts volledig dicht (open kanalen waren anders
-- leesbaar voor iedereen binnen de organisatie).
CREATE OR REPLACE FUNCTION public.can_access_chat_channel(p_channel_id uuid)
  RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT NOT public.is_planning() AND (
    p_channel_id IS NULL
    OR NOT EXISTS (SELECT 1 FROM public.chat_channels c WHERE c.id = p_channel_id AND c.restricted)
    OR public.can_manage_chat_channel(p_channel_id)
    OR EXISTS (
      SELECT 1 FROM public.chat_channel_members m
      WHERE m.channel_id = p_channel_id AND m.user_id = auth.uid()
    )
  );
$function$;
