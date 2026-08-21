-- =====================================================
-- MIGRATION V21: Campagnes (projecten boven lijsten) + lead-claiming
-- (GERUND op 2026-08-21 via Claude)
--
-- 1. Nieuw niveau: campaigns. Een project/campagne bevat meerdere
--    lead_lists (importbatches). Het TEAM hangt voortaan aan de
--    campagne, niet meer aan de losse lijst. Regel van Noah:
--    zonder campagne kan een team niet op een lijst bellen.
--    Bestaande actieve lijsten krijgen automatisch elk een eigen
--    campagne met hun huidige team, zodat niets stilvalt.
--
-- 2. Lead-claiming: meerdere bellers op dezelfde lijst krijgen
--    nooit dezelfde lead. claim_next_lead() kiest atomisch
--    (FOR UPDATE SKIP LOCKED) de volgende belbare lead en zet een
--    lock (locked_by/locked_at, 10 min TTL). release_lead() en
--    release_my_leads() geven locks vrij.
--
-- 3. Bugfix: de app schreef al naar leads.next_contact_date,
--    contact_attempts en lead_source, maar die kolommen bestonden
--    niet — waardoor afboekingen met terugbelmoment stilletjes
--    faalden. Kolommen toegevoegd.
-- =====================================================

-- ---------- 1. CAMPAGNES ----------
CREATE TABLE IF NOT EXISTS public.campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  assigned_team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL,
  organization_id uuid REFERENCES public.organizations(id),
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

ALTER TABLE public.lead_lists
  ADD COLUMN IF NOT EXISTS campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_lead_lists_campaign_id ON public.lead_lists(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_team ON public.campaigns(assigned_team_id);

-- Backfill: elke bestaande actieve lijst wordt een eigen campagne,
-- met hetzelfde team dat er nu aan hangt.
DO $$
DECLARE r RECORD; v_campaign_id uuid;
BEGIN
  FOR r IN
    SELECT * FROM public.lead_lists
    WHERE deleted_at IS NULL AND campaign_id IS NULL
  LOOP
    INSERT INTO public.campaigns (name, description, assigned_team_id, organization_id, created_by)
    VALUES (r.name, r.description, r.assigned_team_id, r.organization_id, r.created_by)
    RETURNING id INTO v_campaign_id;
    UPDATE public.lead_lists SET campaign_id = v_campaign_id WHERE id = r.id;
  END LOOP;
END $$;

-- RLS voor campaigns
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "campaigns_select" ON public.campaigns;
CREATE POLICY "campaigns_select" ON public.campaigns
  FOR SELECT USING (
    organization_id IS NOT DISTINCT FROM public.my_org_id()
    AND (
      public.is_admin()
      OR created_by = auth.uid()
      OR assigned_team_id = ANY (public.my_team_ids())
      OR EXISTS (
        SELECT 1 FROM public.lead_lists ll
        WHERE ll.campaign_id = campaigns.id
          AND ll.id = ANY (public.my_managed_list_ids())
      )
    )
  );

DROP POLICY IF EXISTS "campaigns_insert" ON public.campaigns;
CREATE POLICY "campaigns_insert" ON public.campaigns
  FOR INSERT WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "campaigns_update" ON public.campaigns;
CREATE POLICY "campaigns_update" ON public.campaigns
  FOR UPDATE USING (public.is_admin());

DROP POLICY IF EXISTS "campaigns_delete" ON public.campaigns;
CREATE POLICY "campaigns_delete" ON public.campaigns
  FOR DELETE USING (public.is_admin());

-- Team-route loopt voortaan via de campagne:
-- een lijst is "van mijn team" als zijn campagne aan mijn team hangt.
-- Lijst zonder campagne => geen team-route => niet belbaar voor teams.
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
            AND c.assigned_team_id = ANY (public.my_team_ids())
        );
$$;

-- lead_lists-zichtbaarheid: geen directe team-route meer; alles via my_list_ids()
DROP POLICY IF EXISTS "lead_lists_select" ON public.lead_lists;
CREATE POLICY "lead_lists_select" ON public.lead_lists
  FOR SELECT USING (
    organization_id IS NOT DISTINCT FROM public.my_org_id()
    AND (
      public.is_admin()
      OR id = ANY (public.my_list_ids())
      OR id = ANY (public.my_managed_list_ids())
    )
  );

-- ---------- 2. ONTBREKENDE KOLOMMEN (bugfix) ----------
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS next_contact_date timestamptz;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS contact_attempts integer NOT NULL DEFAULT 0;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS lead_source text;
CREATE INDEX IF NOT EXISTS idx_leads_queue ON public.leads(lead_list_id, status, next_contact_date) WHERE deleted_at IS NULL;

-- ---------- 3. LEAD-CLAIMING ----------
-- Atomisch: pak de volgende belbare lead uit de lijst en lock hem.
-- Twee bellers die tegelijk klikken krijgen door FOR UPDATE SKIP LOCKED
-- gegarandeerd verschillende leads. Locks verlopen na p_lock_minutes
-- (default 10), zodat een dichtgeklapte laptop de lead niet eeuwig
-- vasthoudt. Een beller krijgt zijn eigen al-geclaimde lead terug.
CREATE OR REPLACE FUNCTION public.claim_next_lead(p_list_id uuid, p_lock_minutes integer DEFAULT 10)
RETURNS SETOF public.leads
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_lead public.leads;
BEGIN
  -- Alleen lijsten die deze gebruiker echt mag bellen/zien
  IF NOT (
    public.is_admin()
    OR p_list_id = ANY (public.my_list_ids())
    OR p_list_id = ANY (public.my_managed_list_ids())
  ) THEN
    RETURN;
  END IF;

  SELECT * INTO v_lead
  FROM public.leads l
  WHERE l.lead_list_id = p_list_id
    AND l.deleted_at IS NULL
    AND l.status NOT IN ('deal','afspraak_gemaakt','geen_interesse','onjuiste_timing','verkeerd_nummer','cold','terugbelafspraak')
    AND (l.next_contact_date IS NULL OR l.next_contact_date <= now())
    AND (
      l.locked_by IS NULL
      OR l.locked_by = auth.uid()
      OR l.locked_at IS NULL
      OR l.locked_at < now() - make_interval(mins => GREATEST(p_lock_minutes, 1))
    )
  ORDER BY (l.locked_by = auth.uid()) DESC NULLS LAST, l.created_at ASC
  FOR UPDATE OF l SKIP LOCKED
  LIMIT 1;

  IF v_lead.id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.leads
  SET locked_by = auth.uid(), locked_at = now(), call_status = 'calling'
  WHERE id = v_lead.id
  RETURNING * INTO v_lead;

  RETURN NEXT v_lead;
END;
$$;

-- Lock vrijgeven van één lead (bij overslaan)
CREATE OR REPLACE FUNCTION public.release_lead(p_lead_id uuid)
RETURNS void
LANGUAGE sql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  UPDATE public.leads
  SET locked_by = NULL, locked_at = NULL, call_status = 'available'
  WHERE id = p_lead_id
    AND (locked_by = auth.uid() OR public.is_admin());
$$;

-- Alle eigen locks vrijgeven (bij sluiten van de belmodus)
CREATE OR REPLACE FUNCTION public.release_my_leads()
RETURNS void
LANGUAGE sql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  UPDATE public.leads
  SET locked_by = NULL, locked_at = NULL, call_status = 'available'
  WHERE locked_by = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.claim_next_lead(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.release_lead(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.release_my_leads() TO authenticated;
