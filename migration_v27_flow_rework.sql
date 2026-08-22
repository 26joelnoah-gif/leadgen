-- =====================================================
-- MIGRATION V27: afboek-flows herzien
-- (UITGEVOERD op 2026-08-22 via Claude/Cowork op project zboyxwwrbtpjnlgquhzs
--  - maar vertrouw dit comment nooit blind: check pg_proc/pg_policies)
--
-- Wachtrij-regels:
--  - definitief uit de wachtrij: deal, afspraak_gemaakt, geen_interesse,
--    verkeerd_nummer, cold en (nieuw) blacklist
--  - onjuiste_timing komt terug zodra de instelbare cooldown verstreken is
--    (flow_settings.cooldown_days, standaard 30 dagen)
--  - terugbelafspraak is PRIVE voor de beller (assigned_to); wordt hij
--    24 uur na het terugbelmoment niet nagekomen, dan is de lead openbaar
--    claimbaar voor het hele team
--  - eigen verlopen TBA's krijgen voorrang in de wachtrij
-- App-kant (useLeads v27): geen gehoor max 2 pogingen daarna cold;
-- later bellen komt na 1 dag terug; voicemail is geen afboekreden meer.
-- =====================================================

BEGIN;

ALTER TABLE public.flow_settings ADD COLUMN IF NOT EXISTS cooldown_days integer;

INSERT INTO public.flow_settings (disposition_type, is_active, cooldown_days, description)
SELECT 'onjuiste_timing', true, 30, 'Cooldown: na dit aantal dagen komt de lead terug in de belwachtrij'
WHERE NOT EXISTS (SELECT 1 FROM public.flow_settings WHERE disposition_type = 'onjuiste_timing');

UPDATE public.flow_settings SET cooldown_days = COALESCE(cooldown_days, 30)
WHERE disposition_type = 'onjuiste_timing';

INSERT INTO public.flow_settings (disposition_type, is_active, auto_assign_to, append_agent_note, description)
SELECT 'blacklist', true, 'none', false, 'Dit nummer mag niet meer benaderd worden binnen het project'
WHERE NOT EXISTS (SELECT 1 FROM public.flow_settings WHERE disposition_type = 'blacklist');

CREATE OR REPLACE FUNCTION public.claim_next_lead(p_list_id uuid, p_lock_minutes integer DEFAULT 10)
RETURNS SETOF leads
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

  SELECT * INTO v_lead
  FROM public.leads l
  WHERE l.lead_list_id = p_list_id
    AND l.deleted_at IS NULL
    AND l.status NOT IN ('deal','afspraak_gemaakt','geen_interesse','verkeerd_nummer','cold','blacklist')
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

COMMIT;
