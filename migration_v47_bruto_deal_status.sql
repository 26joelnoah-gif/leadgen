-- =====================================================
-- MIGRATION V47: bruto_deal-status voor backoffice (monteur inplannen)
-- (Wens Noah 26-08-2026: sales die nog nagebeld moeten worden voor het
-- inplannen van de monteur mogen niet op 'deal' staan - 'deal' is in de
-- gewone verkoop-wachtrij een eindstatus en dus niet belbaar. Nieuwe status
-- 'bruto_deal' = de sale is gemaakt maar de monteur moet nog worden
-- ingepland. Telt net als 'deal' mee in Payouts/Earnings/Dashboard/
-- rapportage/XP (Noah: "als deal tellen"). Alleen voor backoffice-
-- projecten; recruitment blijft 'deal' gebruiken (=aangenomen), dat is
-- een andere betekenis van dezelfde status-key en blijft ongemoeid.
-- Toegang: ongewijzigd - alleen rol 'backoffice' claimt/belt deze
-- wachtrij (claim_next_backoffice_lead), net als vandaag met 'deal'.
-- UITGEVOERD op 2026-08-26 via Claude/Cowork op project zboyxwwrbtpjnlgquhzs
-- - maar vertrouw dit comment nooit blind: check information_schema/pg_proc.
-- =====================================================

BEGIN;

-- ---------- 1. Status toevoegen aan de CHECK-constraint ----------
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_status_check;
ALTER TABLE public.leads ADD CONSTRAINT leads_status_check
  CHECK (status = ANY (ARRAY[
    'new'::text, 'later_bellen'::text, 'mailen'::text, 'voicemail'::text,
    'terugbelafspraak'::text, 'geen_gehoor'::text, 'verkeerd_nummer'::text,
    'geen_interesse'::text, 'onjuiste_timing'::text, 'afspraak_gemaakt'::text,
    'deal'::text, 'cold'::text, 'blacklist'::text,
    'monteur_ingepland'::text, 'wil_annuleren'::text, 'bruto_deal'::text
  ]));

-- ---------- 2. Bestaande backoffice-deals migreren ----------
-- Alleen leads in projecten van het type 'backoffice' (niet recruitment's
-- 'deal' = aangenomen, en niet oude soft-deleted rijen zonder lijst).
UPDATE public.leads l
SET status = 'bruto_deal'
WHERE l.status = 'deal'
  AND l.lead_list_id IN (
    SELECT ll.id FROM public.lead_lists ll
    JOIN public.campaigns c ON c.id = ll.campaign_id
    WHERE c.type = 'backoffice'
  );

-- ---------- 3. Backoffice-wachtrij (index + claim-functie) op bruto_deal ----------
DROP INDEX IF EXISTS idx_leads_backoffice_queue;
CREATE INDEX IF NOT EXISTS idx_leads_backoffice_queue
  ON public.leads (lead_list_id, sale_date, created_at)
  WHERE deleted_at IS NULL AND status = 'bruto_deal';

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

  -- Alleen 'bruto_deal'-leads (al gemaakte sales, monteur nog niet
  -- ingepland) horen in de backoffice-wachtrij. FIFO op sale_date.
  SELECT * INTO v_lead
  FROM public.leads l
  WHERE l.lead_list_id = p_list_id
    AND l.deleted_at IS NULL
    AND l.status = 'bruto_deal'
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

-- ---------- 4. Gewone verkoop-wachtrij: bruto_deal ook uitsluiten ----------
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
    AND l.status NOT IN ('deal','afspraak_gemaakt','geen_interesse','verkeerd_nummer','cold','blacklist','monteur_ingepland','wil_annuleren','bruto_deal')
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

-- ---------- 5. XP: bruto_deal geeft dezelfde bonus als deal ----------
CREATE OR REPLACE FUNCTION public.xp_for(p_disposition text, p_lead_source text, p_decision_maker boolean)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT CASE
    WHEN p_disposition IN ('geen_gehoor','voicemail','mailbox','verkeerd_nummer') THEN 0
    ELSE
      (CASE
        WHEN COALESCE(p_decision_maker, false) THEN 10
        WHEN p_lead_source IN ('referral','linkedin') THEN 3
        ELSE 1
      END)
      + (CASE p_disposition
          WHEN 'terugbelafspraak' THEN 5
          WHEN 'afspraak_gemaakt' THEN 15
          WHEN 'deal' THEN 25
          WHEN 'bruto_deal' THEN 25
          ELSE 0
        END)
  END;
$function$;

-- ---------- 6. flow_settings-rij voor de nieuwe afboekreden ----------
INSERT INTO public.flow_settings (disposition_type, is_active, auto_assign_to, append_agent_note, description)
SELECT 'bruto_deal', true, 'agent', true, 'Sale is gemaakt, monteur moet nog worden ingepland. Telt al mee als deal (Payouts/Dashboard/rapportage). Lead blijft in de projectlijst, blijft op naam van de beller totdat de monteur is ingepland.'
WHERE NOT EXISTS (SELECT 1 FROM public.flow_settings WHERE disposition_type = 'bruto_deal');

COMMIT;
