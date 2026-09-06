-- v62 (06-09-2026): gedeelde leadlijst + planning-toegang per project
--
-- 1. campaigns.planning_can_view_leads: per project kan admin aanzetten dat
--    planning-accounts (rol 'planning', v52) die via hun team aan het project
--    hangen de leads WEL mogen zien en verwerken. Default false, dus de
--    v52-afsluiting blijft voor alle andere projecten intact.
-- 2. my_list_ids(): voor planning niet meer altijd '{}', maar de lijsten van
--    actieve projecten met die vlag waar zijn team aan hangt. Alle RLS die
--    hierop leunt (leads/lead_lists) volgt automatisch.
-- 3. campaigns_select: zelfde route toegevoegd (my_team_ids() blijft '{}'
--    voor planning, dus die bestaande clausule vangt dit niet).
-- 4. RPC claim_lead(p_lead_id): een SPECIFIEKE lead atomisch vergrendelen
--    (lock 10 min) - basis van de nieuwe Leadlijst-pagina waar iedereen in
--    het project alle leads ziet en zelf kiest. Lead is in behandeling bij
--    een collega -> geen rij terug.
-- 5. RPC lead_lock_names(p_list_id): wie heeft welke lead nu in behandeling
--    (security definer, zodat de naam ook zichtbaar is zonder profiles-RLS).

ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS planning_can_view_leads boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.my_list_ids()
 RETURNS uuid[]
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT CASE WHEN public.is_planning() THEN
    COALESCE((
      SELECT array_agg(ll.id) FROM public.lead_lists ll
      WHERE (ll.activate_at IS NULL OR ll.activate_at <= now())
        AND ll.deleted_at IS NULL
        AND ll.campaign_id IN (
          SELECT c.id FROM public.campaigns c
          WHERE c.deleted_at IS NULL
            AND c.is_active
            AND c.planning_can_view_leads
            AND EXISTS (
              SELECT 1 FROM public.campaign_teams ct
              JOIN public.team_members tm ON tm.team_id = ct.team_id
              WHERE ct.campaign_id = c.id AND tm.profile_id = auth.uid()
            )
        )
    ), '{}')
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

DROP POLICY IF EXISTS campaigns_select ON public.campaigns;
CREATE POLICY campaigns_select ON public.campaigns FOR SELECT USING (
  (NOT (organization_id IS DISTINCT FROM my_org_id()))
  AND (
    is_admin()
    OR created_by = auth.uid()
    OR EXISTS (SELECT 1 FROM campaign_teams ct WHERE ct.campaign_id = campaigns.id AND ct.team_id = ANY (my_team_ids()))
    OR EXISTS (SELECT 1 FROM campaign_managers cm WHERE cm.campaign_id = campaigns.id AND cm.manager_id = auth.uid())
    OR EXISTS (SELECT 1 FROM lead_lists ll WHERE ll.campaign_id = campaigns.id AND ll.id = ANY (my_managed_list_ids()))
    OR EXISTS (SELECT 1 FROM lead_lists ll WHERE ll.campaign_id = campaigns.id AND ll.id = ANY (my_list_ids()))
    OR can_view_schedules()
  )
);

CREATE OR REPLACE FUNCTION public.claim_lead(p_lead_id uuid, p_lock_minutes integer DEFAULT 10)
 RETURNS SETOF public.leads
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_lead public.leads;
BEGIN
  SELECT * INTO v_lead
  FROM public.leads l
  WHERE l.id = p_lead_id
    AND l.deleted_at IS NULL
    AND (
      public.is_admin()
      OR l.assigned_to = auth.uid()
      OR l.lead_list_id = ANY (public.my_list_ids())
      OR l.lead_list_id = ANY (public.my_managed_list_ids())
    )
    AND (
      l.locked_by IS NULL
      OR l.locked_by = auth.uid()
      OR l.locked_at IS NULL
      OR l.locked_at < now() - make_interval(mins => GREATEST(p_lock_minutes, 1))
    )
  FOR UPDATE OF l SKIP LOCKED;

  IF v_lead.id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.leads
  SET locked_by = auth.uid(), locked_at = now(), call_status = 'calling'
  WHERE id = v_lead.id
  RETURNING * INTO v_lead;

  RETURN NEXT v_lead;
END;
$function$;

CREATE OR REPLACE FUNCTION public.lead_lock_names(p_list_id uuid, p_lock_minutes integer DEFAULT 10)
 RETURNS TABLE (lead_id uuid, locked_by uuid, locked_at timestamptz, full_name text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT l.id, l.locked_by, l.locked_at, p.full_name
  FROM public.leads l
  JOIN public.profiles p ON p.id = l.locked_by
  WHERE l.lead_list_id = p_list_id
    AND l.deleted_at IS NULL
    AND l.locked_by IS NOT NULL
    AND l.locked_at IS NOT NULL
    AND l.locked_at >= now() - make_interval(mins => GREATEST(p_lock_minutes, 1))
    AND (
      public.is_admin()
      OR p_list_id = ANY (public.my_list_ids())
      OR p_list_id = ANY (public.my_managed_list_ids())
    );
$function$;

REVOKE ALL ON FUNCTION public.claim_lead(uuid, integer) FROM public;
GRANT EXECUTE ON FUNCTION public.claim_lead(uuid, integer) TO authenticated;
REVOKE ALL ON FUNCTION public.lead_lock_names(uuid, integer) FROM public;
GRANT EXECUTE ON FUNCTION public.lead_lock_names(uuid, integer) TO authenticated;
