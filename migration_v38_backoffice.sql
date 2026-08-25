-- =====================================================
-- MIGRATION V38: Backoffice-rol - monteur inplannen na sale
-- (UITGEVOERD via Claude/Cowork op project zboyxwwrbtpjnlgquhzs
--  - maar vertrouw dit comment nooit blind: check pg_constraint/pg_proc)
--
-- Wens Noah (25-08-2026): een backoffice medewerker moet kunnen bellen en
-- statussen wijzigen. Zij werken de reeds gemaakte sales (status 'deal')
-- af om de monteur in te plannen. Sales die Noah inlaadt moeten FIFO
-- (first-in-first-out) op verkoopdatum nagebeld worden - niet per se op
-- import-moment, want een import kan losstaan van de echte verkoopdatum.
--
-- Ontwerp: GEEN nieuw campagnetype nodig. Backoffice werkt binnen dezelfde
-- projecten/lijsten als sales (scope = alleen toegewezen projecten, net als
-- een gewone beller, via team_members/campaign_teams - geen RLS-wijziging
-- nodig, want my_list_ids()/my_managed_list_ids() zijn al role-agnostisch).
-- Detectie is puur op profiles.role === 'backoffice' (client-side), niet op
-- de campagne. Twee nieuwe statussen: monteur_ingepland (= sale doorgezet)
-- en wil_annuleren (verplichte reden -> cancel_reason, apart Annuleringen-
-- overzicht i.p.v. een fysieke lijst-verplaatsing, conform de v17-regel
-- "een lead blijft altijd in zijn projectlijst").
-- =====================================================

BEGIN;

-- ---------- 1. Rol ----------
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (role = ANY (ARRAY['employee'::text, 'manager'::text, 'admin'::text, 'recruiter'::text, 'backoffice'::text]));

-- ---------- 2. Kolommen ----------
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS sale_date timestamptz;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS cancel_reason text;

-- ---------- 3. Statussen ----------
-- Drive-by fix: 'blacklist' werd al overal in de app gebruikt (knop, flow_settings,
-- claim_next_lead-uitsluiting) maar stond niet in deze constraint - een klik op
-- "Blacklist" zou dus altijd gefaald zijn. Meteen samen met de 2 nieuwe statussen gefixt.
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_status_check;
ALTER TABLE public.leads ADD CONSTRAINT leads_status_check
  CHECK (status = ANY (ARRAY[
    'new'::text, 'later_bellen'::text, 'mailen'::text, 'voicemail'::text,
    'terugbelafspraak'::text, 'geen_gehoor'::text, 'verkeerd_nummer'::text,
    'geen_interesse'::text, 'onjuiste_timing'::text, 'afspraak_gemaakt'::text,
    'deal'::text, 'cold'::text, 'blacklist'::text,
    'monteur_ingepland'::text, 'wil_annuleren'::text
  ]));

-- Bestaande deals krijgen een sale_date (updated_at als beste schatting)
-- zodat ze meteen een correcte FIFO-volgorde hebben in de backoffice-wachtrij.
UPDATE public.leads SET sale_date = updated_at WHERE status = 'deal' AND sale_date IS NULL;

CREATE INDEX IF NOT EXISTS idx_leads_backoffice_queue
  ON public.leads (lead_list_id, sale_date, created_at)
  WHERE deleted_at IS NULL AND status = 'deal';

-- ---------- 4. Belwachtrij van de gewone sales-flow: nieuwe eindstatussen uitsluiten ----------
-- Zonder dit zou een lead met status monteur_ingepland/wil_annuleren weer
-- als "belbaar" gezien worden door de normale verkoop-wachtrij.
CREATE OR REPLACE FUNCTION public.claim_next_lead(p_list_id uuid, p_lock_minutes integer DEFAULT 10)
 RETURNS SETOF leads
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_lead public.leads;
  v_mode text := 'fifo';
BEGIN
  IF NOT (
    public.is_admin()
    OR p_list_id = ANY (public.my_list_ids())
    OR p_list_id = ANY (public.my_managed_list_ids())
  ) THEN
    RETURN;
  END IF;

  SELECT coalesce(c.queue_mode, 'fifo') INTO v_mode
  FROM public.lead_lists ll
  LEFT JOIN public.campaigns c ON c.id = ll.campaign_id
  WHERE ll.id = p_list_id;

  SELECT * INTO v_lead
  FROM public.leads l
  WHERE l.lead_list_id = p_list_id
    AND l.deleted_at IS NULL
    AND l.status NOT IN ('deal','afspraak_gemaakt','geen_interesse','verkeerd_nummer','cold','blacklist','monteur_ingepland','wil_annuleren')
    AND (
      (l.status = 'terugbelafspraak' AND (
        (l.assigned_to = auth.uid() AND (l.next_contact_date IS NULL OR l.next_contact_date <= now()))
        OR (l.next_contact_date IS NOT NULL AND l.next_contact_date <= now() - interval '24 hours')
      ))
      OR (l.status <> 'terugbelafspraak' AND (l.next_contact_date IS NULL OR l.next_contact_date <= now()))
    )
    AND (
      l.locked_by IS NULL
      OR l.locked_by = auth.uid()
      OR l.locked_at IS NULL
      OR l.locked_at < now() - make_interval(mins => GREATEST(p_lock_minutes, 1))
    )
  ORDER BY
    (l.status = 'terugbelafspraak' AND l.assigned_to = auth.uid()) DESC,
    (l.locked_by = auth.uid()) DESC NULLS LAST,
    CASE WHEN v_mode = 'score' THEN
      (CASE l.lead_source WHEN 'referral' THEN 15 WHEN 'linkedin' THEN 10 WHEN 'cold' THEN 5 ELSE 0 END)
      + (CASE WHEN l.decision_maker THEN 20 ELSE 0 END)
      + (CASE WHEN coalesce(trim(l.contact_person), '') <> '' THEN 15 ELSE 0 END)
      + (CASE WHEN coalesce(trim(l."function"), '') <> '' THEN 5 ELSE 0 END)
      + (CASE WHEN coalesce(trim(l.email), '') <> '' THEN 5 ELSE 0 END)
    ELSE 0 END DESC,
    l.created_at ASC
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
$function$;

-- ---------- 5. Nieuwe RPC: volgende sale claimen voor backoffice (FIFO op sale_date) ----------
CREATE OR REPLACE FUNCTION public.claim_next_backoffice_lead(p_list_id uuid, p_lock_minutes integer DEFAULT 10)
RETURNS SETOF public.leads
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_lead public.leads;
BEGIN
  IF NOT (
    public.is_admin()
    OR p_list_id = ANY (public.my_list_ids())
    OR p_list_id = ANY (public.my_managed_list_ids())
  ) THEN
    RETURN;
  END IF;

  -- Alleen 'deal'-leads (al gemaakte sales) horen in de backoffice-wachtrij.
  -- FIFO op sale_date (verkoopmoment) i.p.v. created_at (import-moment) -
  -- de eerst gemaakte sale wordt als eerst nagebeld voor de monteur-afspraak.
  SELECT * INTO v_lead
  FROM public.leads l
  WHERE l.lead_list_id = p_list_id
    AND l.deleted_at IS NULL
    AND l.status = 'deal'
    AND (
      l.locked_by IS NULL
      OR l.locked_by = auth.uid()
      OR l.locked_at IS NULL
      OR l.locked_at < now() - make_interval(mins => GREATEST(p_lock_minutes, 1))
    )
  ORDER BY
    (l.locked_by = auth.uid()) DESC NULLS LAST,
    l.sale_date ASC NULLS LAST,
    l.created_at ASC
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
$function$;

GRANT EXECUTE ON FUNCTION public.claim_next_backoffice_lead(uuid, integer) TO authenticated;

-- ---------- 6. flow_settings-rijen voor de nieuwe afboekredenen ----------
INSERT INTO public.flow_settings (disposition_type, is_active, auto_assign_to, append_agent_note, description)
SELECT 'monteur_ingepland', true, 'agent', true, 'Monteur is ingepland - sale is doorgezet. Lead blijft in de projectlijst, blijft op naam van de backoffice-medewerker.'
WHERE NOT EXISTS (SELECT 1 FROM public.flow_settings WHERE disposition_type = 'monteur_ingepland');

INSERT INTO public.flow_settings (disposition_type, is_active, auto_assign_to, append_agent_note, description)
SELECT 'wil_annuleren', true, 'none', true, 'Klant wil annuleren - reden is verplicht (cancel_reason). Verschijnt in het Annuleringen-overzicht voor navraag.'
WHERE NOT EXISTS (SELECT 1 FROM public.flow_settings WHERE disposition_type = 'wil_annuleren');

COMMIT;
