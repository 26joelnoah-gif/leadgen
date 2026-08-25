-- =====================================================
-- MIGRATION V39: Leads handmatig verplaatsen/kopieren naar een andere lijst
-- (UITGEVOERD via Claude/Cowork op project zboyxwwrbtpjnlgquhzs
--  - maar vertrouw dit comment nooit blind: check pg_proc)
--
-- Wens Noah (25-08-2026): annuleringen (wil_annuleren) moeten naar een
-- andere lijst gestuurd kunnen worden, maar NIET automatisch - een
-- mens selecteert en klikt. Generieker: overal waar leads getoond
-- worden moet je meerdere leads kunnen selecteren en verplaatsen of
-- kopieren naar een andere lijst/project. Blijft dus binnen de v17-regel
-- (een lead verhuist nooit automatisch) - dit is een expliciete,
-- handmatige actie van een manager/admin.
--
-- Ontwerp: 1 RPC ipv losse client-side update/insert, om autorisatie
-- server-side af te dwingen (client-side .update({lead_list_id}) zou
-- de bestaande leads_update RLS-policy kunnen misbruiken - de
-- with_check daarvan toetst alleen organization_id, niet of de nieuwe
-- lead_list_id wel binnen bereik van de gebruiker valt. Deze RPC dicht
-- dat gat voor deze nieuwe functionaliteit, zonder de bestaande
-- leads_update-policy zelf aan te passen (risico op regressie elders).
-- =====================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.move_or_copy_leads(
  p_lead_ids uuid[],
  p_target_list_id uuid,
  p_mode text DEFAULT 'move',
  p_reset boolean DEFAULT true
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_count integer := 0;
BEGIN
  IF p_mode NOT IN ('move', 'copy') THEN
    RAISE EXCEPTION 'Ongeldige modus: % (verwacht move of copy)', p_mode;
  END IF;

  IF p_lead_ids IS NULL OR array_length(p_lead_ids, 1) IS NULL THEN
    RETURN 0;
  END IF;

  -- Doellijst moet bestaan en binnen bereik van de gebruiker vallen
  IF NOT EXISTS (
    SELECT 1 FROM public.lead_lists ll
    WHERE ll.id = p_target_list_id AND ll.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Doellijst bestaat niet (meer)';
  END IF;

  IF NOT (public.is_admin() OR p_target_list_id = ANY (public.my_managed_list_ids())) THEN
    RAISE EXCEPTION 'Geen rechten op de doellijst';
  END IF;

  -- Elke geselecteerde lead moet ook binnen bereik vallen (bron-lijst)
  IF EXISTS (
    SELECT 1 FROM public.leads l
    WHERE l.id = ANY (p_lead_ids)
      AND NOT (public.is_admin() OR l.lead_list_id = ANY (public.my_managed_list_ids()))
  ) THEN
    RAISE EXCEPTION 'Geen rechten op (een van) de geselecteerde leads';
  END IF;

  IF p_mode = 'move' THEN
    UPDATE public.leads l
    SET lead_list_id = p_target_list_id,
        updated_at = now(),
        status = CASE WHEN p_reset THEN 'new' ELSE l.status END,
        assigned_to = CASE WHEN p_reset THEN NULL ELSE l.assigned_to END,
        locked_by = NULL,
        locked_at = NULL,
        call_status = 'available',
        contact_attempts = CASE WHEN p_reset THEN 0 ELSE l.contact_attempts END,
        next_contact_date = CASE WHEN p_reset THEN NULL ELSE l.next_contact_date END,
        cancel_reason = CASE WHEN p_reset THEN NULL ELSE l.cancel_reason END,
        sale_date = CASE WHEN p_reset THEN NULL ELSE l.sale_date END
    WHERE l.id = ANY (p_lead_ids)
      AND l.deleted_at IS NULL;
    GET DIAGNOSTICS v_count = ROW_COUNT;
  ELSE
    INSERT INTO public.leads (
      name, phone, email, notes, status, assigned_to, created_by, lead_list_id,
      address, house_number, postal_code, city, contact_person, "function",
      website, decision_maker, organization_id, extra_info1, extra_info2, extra_info3,
      lead_source, contact_attempts, call_status
    )
    SELECT
      l.name, l.phone, l.email, l.notes,
      CASE WHEN p_reset THEN 'new' ELSE l.status END,
      CASE WHEN p_reset THEN NULL ELSE l.assigned_to END,
      auth.uid(), p_target_list_id,
      l.address, l.house_number, l.postal_code, l.city, l.contact_person, l."function",
      l.website, l.decision_maker, l.organization_id, l.extra_info1, l.extra_info2, l.extra_info3,
      l.lead_source,
      CASE WHEN p_reset THEN 0 ELSE l.contact_attempts END,
      'available'
    FROM public.leads l
    WHERE l.id = ANY (p_lead_ids)
      AND l.deleted_at IS NULL;
    GET DIAGNOSTICS v_count = ROW_COUNT;
  END IF;

  RETURN v_count;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.move_or_copy_leads(uuid[], uuid, text, boolean) TO authenticated;

COMMIT;
