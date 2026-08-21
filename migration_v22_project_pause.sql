-- =====================================================
-- MIGRATION V22: Projecten pauzeren (UITGEVOERD op 2026-08-21 via Claude/Cowork)
--
-- Admin kan een project (campagne) tijdelijk uitzetten zonder het te
-- verwijderen. Een gepauzeerd project telt niet mee in de team-route:
-- bellers van het gekoppelde team zien de lijsten niet meer en
-- claim_next_lead geeft er niets meer uit (die gebruikt my_list_ids).
-- Direct aan een beller toegewezen lijsten (assigned_to) blijven wel
-- zichtbaar voor die beller.
-- =====================================================

ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

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
            AND c.assigned_team_id = ANY (public.my_team_ids())
        );
$$;
