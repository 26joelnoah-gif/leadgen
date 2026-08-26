-- =====================================================
-- MIGRATION V49: Leads handmatig verwijderen uit een leadlijst
-- (UITGEVOERD via Claude/Cowork op project zboyxwwrbtpjnlgquhzs
--  - maar vertrouw dit comment nooit blind: check pg_proc)
--
-- Wens Noah (26-08-2026): leads moeten verwijderd kunnen worden uit de
-- leadlijsten. Soft delete (deleted_at), zelfde patroon als lead_lists
-- (v8) en campaigns: de kolom leads.deleted_at bestaat al en wordt
-- overal in de queries al gefilterd (.is('deleted_at', null)), dus een
-- verwijderde lead verdwijnt meteen uit belscherm, admin- en
-- managerlijsten zonder dat er iets stuk kan gaan.
--
-- Autorisatie server-side via een RPC (zelfde reden als v39
-- move_or_copy_leads): een kale client-side .update({deleted_at})
-- zou de bestaande leads_update RLS-policy (with_check toetst alleen
-- organization_id, niet lead_list_id) kunnen misbruiken om leads
-- buiten de eigen beheerde lijsten te verwijderen. Deze RPC dwingt af
-- dat elke lead binnen my_managed_list_ids() valt (of is_admin()).
-- =====================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.delete_leads(
  p_lead_ids uuid[]
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_count integer := 0;
BEGIN
  IF p_lead_ids IS NULL OR array_length(p_lead_ids, 1) IS NULL THEN
    RETURN 0;
  END IF;

  -- Elke geselecteerde lead moet binnen bereik van de gebruiker vallen
  IF EXISTS (
    SELECT 1 FROM public.leads l
    WHERE l.id = ANY (p_lead_ids)
      AND NOT (public.is_admin() OR l.lead_list_id = ANY (public.my_managed_list_ids()))
  ) THEN
    RAISE EXCEPTION 'Geen rechten op (een van) de geselecteerde leads';
  END IF;

  UPDATE public.leads l
  SET deleted_at = now(),
      updated_at = now(),
      locked_by = NULL,
      locked_at = NULL,
      call_status = 'available'
  WHERE l.id = ANY (p_lead_ids)
    AND l.deleted_at IS NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN v_count;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.delete_leads(uuid[]) TO authenticated;

COMMIT;
