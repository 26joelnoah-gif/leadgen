-- =====================================================
-- LEADGEN v15 — meerdere bellers per lijst + veilige lead-uitgifte
-- =====================================================
-- Twee dingen:
--
-- 1. Een lijst kon aan één persoon (assigned_to) of één team
--    (assigned_team_id) hangen. Meerdere losse bellers op dezelfde lijst
--    kon dus niet. Een koppeltabel maakt het many-to-many: een lijst kan
--    meerdere bellers hebben, en een beller meerdere lijsten.
--
-- 2. WorkInterface pakte de volgende lead op index uit lokale state.
--    Twee bellers op dezelfde lijst kregen daardoor allebei dezelfde
--    lead en belden hetzelfde bedrijf. De claim_next_lead functie deelt
--    leads uit met FOR UPDATE SKIP LOCKED: het standaardpatroon voor een
--    werkwachtrij, waarbij twee gelijktijdige aanvragen gegarandeerd
--    verschillende rijen krijgen.
-- =====================================================

-- -----------------------------------------------------
-- 1. KOPPELTABEL LIJST <-> BELLER
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.lead_list_assignees (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_list_id UUID NOT NULL REFERENCES public.lead_lists(id) ON DELETE CASCADE,
  profile_id   UUID NOT NULL REFERENCES public.profiles(id)   ON DELETE CASCADE,
  assigned_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  assigned_by  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  UNIQUE (lead_list_id, profile_id)
);

CREATE INDEX IF NOT EXISTS lead_list_assignees_profile_idx
  ON public.lead_list_assignees (profile_id);
CREATE INDEX IF NOT EXISTS lead_list_assignees_list_idx
  ON public.lead_list_assignees (lead_list_id);

-- Bestaande toewijzingen overnemen, zodat niemand zijn lijsten kwijtraakt.
INSERT INTO public.lead_list_assignees (lead_list_id, profile_id)
SELECT id, assigned_to
FROM public.lead_lists
WHERE assigned_to IS NOT NULL
ON CONFLICT (lead_list_id, profile_id) DO NOTHING;

ALTER TABLE public.lead_list_assignees ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lead_list_assignees_select ON public.lead_list_assignees;
DROP POLICY IF EXISTS lead_list_assignees_write  ON public.lead_list_assignees;

-- Bellers moeten kunnen zien wie er nog meer op hun lijst zit.
CREATE POLICY lead_list_assignees_select ON public.lead_list_assignees
  FOR SELECT TO authenticated USING (true);

CREATE POLICY lead_list_assignees_write ON public.lead_list_assignees
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- -----------------------------------------------------
-- 2. ZICHTBAARHEID UITBREIDEN
-- -----------------------------------------------------
-- my_list_ids() kende alleen created_by, assigned_to en team. De
-- koppeltabel komt erbij, anders ziet een toegewezen beller de leads
-- van zijn eigen lijst niet.
CREATE OR REPLACE FUNCTION public.my_list_ids()
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(array_agg(DISTINCT id), '{}')
  FROM (
    SELECT id FROM public.lead_lists
     WHERE created_by = auth.uid()
        OR assigned_to = auth.uid()
        OR assigned_team_id = ANY (public.my_team_ids())
    UNION
    SELECT lead_list_id FROM public.lead_list_assignees
     WHERE profile_id = auth.uid()
  ) AS mine(id);
$$;

REVOKE EXECUTE ON FUNCTION public.my_list_ids() FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.my_list_ids() TO authenticated;

-- lead_lists-policy moet de koppeltabel ook meenemen.
DROP POLICY IF EXISTS lead_lists_select ON public.lead_lists;
CREATE POLICY lead_lists_select ON public.lead_lists
  FOR SELECT TO authenticated
  USING (
    organization_id IS NOT DISTINCT FROM public.my_org_id()
    AND (
      public.is_admin()
      OR created_by = auth.uid()
      OR assigned_to = auth.uid()
      OR assigned_team_id = ANY (public.my_team_ids())
      OR id = ANY (public.my_list_ids())
    )
  );

-- -----------------------------------------------------
-- 3. LEADS VEILIG UITDELEN
-- -----------------------------------------------------
-- Geeft de volgende vrije lead uit een lijst en zet die meteen op slot.
-- SKIP LOCKED slaat rijen over die een andere beller op dat moment al
-- aan het claimen is, dus twee gelijktijdige aanroepen krijgen nooit
-- dezelfde lead.
CREATE OR REPLACE FUNCTION public.claim_next_lead(
  p_list_id      UUID,
  p_lock_minutes INT DEFAULT 5
)
RETURNS public.leads
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_lead public.leads;
  v_uid  UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Niet ingelogd';
  END IF;

  UPDATE public.leads l
     SET locked_by   = v_uid,
         locked_at   = NOW(),
         call_status = 'calling',
         updated_at  = NOW()
   WHERE l.id = (
     SELECT c.id
       FROM public.leads c
      WHERE c.lead_list_id = p_list_id
        AND c.deleted_at IS NULL
        AND c.status NOT IN ('deal','afspraak_gemaakt','geen_interesse','verkeerd_nummer','cold')
        AND (
              c.locked_by IS NULL
           OR c.locked_by = v_uid
           OR c.locked_at < NOW() - make_interval(mins => p_lock_minutes)
        )
        AND (c.next_contact_date IS NULL OR c.next_contact_date <= NOW())
      ORDER BY
        CASE WHEN c.locked_by = v_uid THEN 0 ELSE 1 END,
        c.next_contact_date NULLS LAST,
        c.created_at
      FOR UPDATE SKIP LOCKED
      LIMIT 1
   )
  RETURNING l.* INTO v_lead;

  RETURN v_lead;  -- NULL betekent: niets meer te bellen in deze lijst
END $$;

REVOKE EXECUTE ON FUNCTION public.claim_next_lead(UUID, INT) FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.claim_next_lead(UUID, INT) TO authenticated;

-- Slot vrijgeven wanneer een beller stopt zonder af te boeken.
CREATE OR REPLACE FUNCTION public.release_lead(p_lead_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE v_count INT;
BEGIN
  UPDATE public.leads
     SET locked_by = NULL, locked_at = NULL, call_status = 'available'
   WHERE id = p_lead_id AND locked_by = auth.uid();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count > 0;
END $$;

REVOKE EXECUTE ON FUNCTION public.release_lead(UUID) FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.release_lead(UUID) TO authenticated;

-- Vastgelopen sloten opruimen: als een beller zijn tabblad sluit blijft
-- een lead anders 'calling' staan.
CREATE INDEX IF NOT EXISTS leads_queue_idx
  ON public.leads (lead_list_id, locked_at)
  WHERE deleted_at IS NULL;
