-- LEADGEN v68 (2026-09-07): projectsoort 'accountmanagement' (BRIEF-leadgen 6a).
-- Teamleden van zo'n project werken als accountmanager: ze bezitten hun leads
-- (assigned_to) van eerste gesprek tot actieve klant, volgen op via een
-- pipeline-status + volgende actie, en sturen offertes vanuit de lead.
-- Leads zonder actie vallen na campaigns.am_release_days automatisch terug in
-- de pool en kunnen ook handmatig teruggezet worden; notities blijven staan.
--
-- Bevat ook een drive-by fix: 'offerte_verzonden' ontbrak in leads_status_check
-- terwijl de Edge Function offerte-send die status al wegschreef (faalde stil).

-- 1. Projectsoort + instellingen per project -----------------------------------
ALTER TABLE public.campaigns DROP CONSTRAINT IF EXISTS campaigns_type_check;
ALTER TABLE public.campaigns ADD CONSTRAINT campaigns_type_check
  CHECK (type = ANY (ARRAY['sales'::text, 'recruitment'::text, 'backoffice'::text, 'accountmanagement'::text]));

-- Na hoeveel dagen zonder actie een lead automatisch terug in de pool valt.
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS am_release_days integer NOT NULL DEFAULT 30
  CHECK (am_release_days BETWEEN 1 AND 365);
-- Productmerk waaronder verkocht wordt ('mk', 'horeca'); vult later products.code.
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS product_code text;

-- 2. Leads: eigenaarschap + pipeline ------------------------------------------
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS owner_since timestamptz;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS last_activity_at timestamptz;

ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_status_check;
ALTER TABLE public.leads ADD CONSTRAINT leads_status_check CHECK (status = ANY (ARRAY[
  'new','later_bellen','mailen','voicemail','terugbelafspraak','geen_gehoor',
  'verkeerd_nummer','geen_interesse','onjuiste_timing','afspraak_gemaakt',
  'deal','cold','blacklist','monteur_ingepland','wil_annuleren','bruto_deal',
  -- v65 (ontbrak): offerte ligt bij de klant
  'offerte_verzonden',
  -- v68 pipeline accountmanagement: nieuw -> gebeld -> offerte_verzonden -> geaccepteerd -> actief, plus afgewezen
  'gebeld','geaccepteerd','actief','afgewezen'
]::text[]));

CREATE INDEX IF NOT EXISTS idx_leads_am_owner ON public.leads (assigned_to, next_contact_date) WHERE deleted_at IS NULL;

-- 3. Helper: welke lijsten horen bij een accountmanagement-project -------------
CREATE OR REPLACE FUNCTION public.am_list_ids()
RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT COALESCE(array_agg(l.id), '{}'::uuid[])
  FROM public.lead_lists l
  JOIN public.campaigns c ON c.id = l.campaign_id
  WHERE c.type = 'accountmanagement' AND c.deleted_at IS NULL AND l.deleted_at IS NULL;
$$;
REVOKE ALL ON FUNCTION public.am_list_ids() FROM public;
GRANT EXECUTE ON FUNCTION public.am_list_ids() TO authenticated;

-- 4. RLS: in een AM-lijst ziet/bewerkt een teamlid alleen eigen + vrije leads.
--    Admin en managers van het project (my_managed_list_ids) zien alles.
DROP POLICY IF EXISTS leads_select ON public.leads;
CREATE POLICY leads_select ON public.leads FOR SELECT TO authenticated USING (
  NOT (organization_id IS DISTINCT FROM my_org_id()) AND (
    is_admin()
    OR assigned_to = auth.uid()
    OR created_by = auth.uid()
    OR lead_list_id = ANY (my_managed_list_ids())
    OR (lead_list_id = ANY (my_list_ids())
        AND (NOT (lead_list_id = ANY (am_list_ids())) OR assigned_to IS NULL))
  )
);
DROP POLICY IF EXISTS leads_update ON public.leads;
CREATE POLICY leads_update ON public.leads FOR UPDATE TO authenticated USING (
  NOT (organization_id IS DISTINCT FROM my_org_id()) AND (
    is_admin()
    OR assigned_to = auth.uid()
    OR created_by = auth.uid()
    OR lead_list_id = ANY (my_managed_list_ids())
    OR (lead_list_id = ANY (my_list_ids())
        AND (NOT (lead_list_id = ANY (am_list_ids())) OR assigned_to IS NULL))
  )
) WITH CHECK (NOT (organization_id IS DISTINCT FROM my_org_id()));

-- 5. Offertes: een accountmanager mag een offerte aanmaken voor een eigen lead,
--    ook zonder de tool 'offerte_bestelplatform' op het project.
DROP POLICY IF EXISTS offertes_insert ON public.offertes;
CREATE POLICY offertes_insert ON public.offertes FOR INSERT TO authenticated WITH CHECK (
  NOT (organization_id IS DISTINCT FROM my_org_id())
  AND user_id = auth.uid()
  AND (
    is_admin()
    OR 'offerte_bestelplatform' = ANY (my_tool_keys())
    OR (lead_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.leads l
      WHERE l.id = offertes.lead_id AND l.assigned_to = auth.uid() AND l.lead_list_id = ANY (am_list_ids())
    ))
  )
);

-- 6. RPC's ---------------------------------------------------------------------
-- Lead uit de pool pakken: wordt eigenaar (assigned_to), status blijft.
CREATE OR REPLACE FUNCTION public.am_claim_lead(p_lead_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_lead public.leads%ROWTYPE;
BEGIN
  SELECT * INTO v_lead FROM public.leads WHERE id = p_lead_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lead niet gevonden'; END IF;
  IF NOT (v_lead.lead_list_id = ANY (am_list_ids())) THEN RAISE EXCEPTION 'Geen accountmanagement-lijst'; END IF;
  IF NOT (is_admin() OR v_lead.lead_list_id = ANY (my_list_ids()) OR v_lead.lead_list_id = ANY (my_managed_list_ids())) THEN
    RAISE EXCEPTION 'Geen toegang tot deze lijst';
  END IF;
  IF v_lead.assigned_to IS NOT NULL AND v_lead.assigned_to <> auth.uid() THEN
    RAISE EXCEPTION 'Deze lead is al in behandeling bij een collega';
  END IF;
  UPDATE public.leads SET assigned_to = auth.uid(), owner_since = now(), last_activity_at = now(),
    locked_by = NULL, locked_at = NULL, call_status = 'available', updated_at = now()
  WHERE id = p_lead_id;
  RETURN jsonb_build_object('ok', true, 'lead_id', p_lead_id);
END $$;
REVOKE ALL ON FUNCTION public.am_claim_lead(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.am_claim_lead(uuid) TO authenticated;

-- Lead terugzetten in de pool (handmatig). Notities blijven; reden gaat in een
-- call_logs-regel (disposition 'teruggezet') en als regel onderaan de notities.
CREATE OR REPLACE FUNCTION public.am_release_lead(p_lead_id uuid, p_reason text DEFAULT NULL, p_auto boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_lead public.leads%ROWTYPE; v_name text; v_line text;
BEGIN
  SELECT * INTO v_lead FROM public.leads WHERE id = p_lead_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lead niet gevonden'; END IF;
  IF v_lead.assigned_to IS NULL THEN RETURN; END IF;
  IF NOT p_auto AND NOT (is_admin() OR v_lead.assigned_to = auth.uid() OR v_lead.lead_list_id = ANY (my_managed_list_ids())) THEN
    RAISE EXCEPTION 'Alleen de eigenaar, een manager of admin kan deze lead terugzetten';
  END IF;
  SELECT full_name INTO v_name FROM public.profiles WHERE id = v_lead.assigned_to;
  v_line := to_char(now() AT TIME ZONE 'Europe/Amsterdam', 'DD-MM-YYYY') || ' '
    || CASE WHEN p_auto THEN 'Automatisch teruggezet in de pool (geen actie)' ELSE 'Teruggezet in de pool' END
    || ' - was in behandeling bij ' || COALESCE(v_name, 'onbekend')
    || CASE WHEN NULLIF(btrim(COALESCE(p_reason,'')), '') IS NULL THEN '' ELSE ': ' || btrim(p_reason) END;
  UPDATE public.leads SET
    assigned_to = NULL, owner_since = NULL, locked_by = NULL, locked_at = NULL, call_status = 'available',
    notes = CASE WHEN NULLIF(btrim(COALESCE(notes,'')), '') IS NULL THEN v_line ELSE notes || E'\n' || v_line END,
    updated_at = now()
  WHERE id = p_lead_id;
  INSERT INTO public.call_logs (agent_id, organization_id, lead_id, lead_list_id, disposition, started_at, disposed_at, duration_seconds, source, notes)
  VALUES (COALESCE(auth.uid(), v_lead.assigned_to), v_lead.organization_id, v_lead.id, v_lead.lead_list_id, 'teruggezet', now(), now(), 0,
          CASE WHEN p_auto THEN 'am_auto_release' ELSE 'am_release' END, v_line);
END $$;
REVOKE ALL ON FUNCTION public.am_release_lead(uuid, text, boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.am_release_lead(uuid, text, boolean) TO authenticated;

-- Automatische terugval: leads in AM-lijsten waar am_release_days lang niets mee
-- gebeurd is (geen save, geen geplande actie in de toekomst). Eindstatussen
-- blijven bij de accountmanager (klant of afgewezen). Wordt aangeroepen bij het
-- openen van het accountmanager-scherm (geen pg_cron op dit project).
CREATE OR REPLACE FUNCTION public.am_auto_release(p_list_id uuid DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE r record; n integer := 0;
BEGIN
  FOR r IN
    SELECT l.id, c.am_release_days
    FROM public.leads l
    JOIN public.lead_lists ll ON ll.id = l.lead_list_id
    JOIN public.campaigns c ON c.id = ll.campaign_id
    WHERE c.type = 'accountmanagement' AND c.deleted_at IS NULL AND ll.deleted_at IS NULL
      AND l.deleted_at IS NULL AND l.assigned_to IS NOT NULL
      AND (p_list_id IS NULL OR l.lead_list_id = p_list_id)
      AND (is_admin() OR l.lead_list_id = ANY (my_list_ids()) OR l.lead_list_id = ANY (my_managed_list_ids()))
      AND l.status NOT IN ('geaccepteerd','actief','afgewezen','deal','bruto_deal','monteur_ingepland','blacklist','geen_interesse','verkeerd_nummer')
      AND GREATEST(COALESCE(l.last_activity_at, '-infinity'::timestamptz), COALESCE(l.owner_since, '-infinity'::timestamptz),
                   COALESCE(l.next_contact_date, '-infinity'::timestamptz), COALESCE(l.updated_at, '-infinity'::timestamptz))
          < now() - make_interval(days => c.am_release_days)
  LOOP
    PERFORM public.am_release_lead(r.id, format('%s dagen geen actie', r.am_release_days), true);
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.am_auto_release(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.am_auto_release(uuid) TO authenticated;
