-- =====================================================
-- MIGRATION V42: Nieuwe lijst aanmaken bij verplaatsen/kopieren + geplande
-- automatische activatie van een lijst vanaf een datum
-- (UITGEVOERD via Claude/Cowork op project zboyxwwrbtpjnlgquhzs
--  - maar vertrouw dit comment nooit blind: check pg_proc)
--
-- Wens Noah (25-08-2026): leads handmatig uit een lijst halen en naar een
-- andere lijst zetten - kies je geen doellijst, dan wordt er een nieuwe
-- lijst aangemaakt. Die nieuwe lijst mag het systeem automatisch "aanzetten"
-- vanaf een aparte datum (bv. een campagne die pas over 2 weken start).
--
-- Ontwerp activatie: GEEN pg_cron (niet beschikbaar op dit project) en GEEN
-- fysieke flip van een vlag door een achtergrondtaak. In plaats daarvan een
-- live poort: lead_lists.activate_at (nullable). NULL = meteen actief,
-- net als vandaag. Een datum in de toekomst = de lijst (en zijn leads)
-- blijven onzichtbaar voor gewone bellers totdat die datum voorbij is -
-- dat wordt bij elke read afgedwongen in my_list_ids() (bellers-poort),
-- die ook lead_lists_select en leads_select RLS voedt. Managers/admins
-- gaan via my_managed_list_ids()/is_admin() en zien de lijst dus altijd,
-- zodat ze 'm alvast kunnen voorbereiden (leads erin zetten, flows
-- instellen) voordat 'ie live gaat. Blijft dus binnen de v17-regel: er
-- verandert nooit iets automatisch aan een LEAD, alleen de zichtbaarheid
-- van de LIJST wordt tijdgebaseerd bepaald.
-- =====================================================

BEGIN;

ALTER TABLE public.lead_lists
  ADD COLUMN IF NOT EXISTS activate_at timestamptz NULL;

COMMENT ON COLUMN public.lead_lists.activate_at IS
  'NULL = lijst is meteen actief. Datum in de toekomst = lijst (en leads) onzichtbaar voor bellers tot dat moment; managers/admin zien hem altijd. Wordt live getoetst in my_list_ids(), geen achtergrondtaak.';

-- my_list_ids(): bellers-poort. Zelfde 3 manieren als v23 om te kwalificeren
-- (eigenaar, direct toegewezen, of via campagne-team), nu ook getoetst op
-- de activatiedatum van de lijst zelf.
CREATE OR REPLACE FUNCTION public.my_list_ids()
RETURNS uuid[]
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT COALESCE(array_agg(id), '{}') FROM public.lead_lists
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
    );
$$;

-- move_or_copy_leads (v39) uitgebreid: p_target_list_id mag nu NULL zijn.
-- Is 'ie NULL, dan wordt eerst een nieuwe lijst aangemaakt (naam verplicht,
-- optioneel een project/campagne en een activate_at) en gaan de leads
-- daarna naar die nieuwe lijst. Return-type gewijzigd van integer naar
-- jsonb zodat de UI ook het id van de (eventueel nieuwe) doellijst terugkrijgt.
DROP FUNCTION IF EXISTS public.move_or_copy_leads(uuid[], uuid, text, boolean);

CREATE OR REPLACE FUNCTION public.move_or_copy_leads(
  p_lead_ids uuid[],
  p_target_list_id uuid DEFAULT NULL,
  p_mode text DEFAULT 'move',
  p_reset boolean DEFAULT true,
  p_new_list_name text DEFAULT NULL,
  p_new_list_campaign_id uuid DEFAULT NULL,
  p_new_list_activate_at timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_count integer := 0;
  v_target_id uuid := p_target_list_id;
  v_org uuid;
BEGIN
  IF p_mode NOT IN ('move', 'copy') THEN
    RAISE EXCEPTION 'Ongeldige modus: % (verwacht move of copy)', p_mode;
  END IF;

  IF p_lead_ids IS NULL OR array_length(p_lead_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('moved_count', 0, 'target_list_id', v_target_id);
  END IF;

  -- Geen doellijst gekozen -> nieuwe lijst aanmaken
  IF v_target_id IS NULL THEN
    IF coalesce(trim(p_new_list_name), '') = '' THEN
      RAISE EXCEPTION 'Geef een naam op voor de nieuwe lijst';
    END IF;

    IF p_new_list_campaign_id IS NULL THEN
      IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Alleen een admin mag een lijst aanmaken zonder project';
      END IF;
    ELSIF NOT (
      public.is_admin()
      OR EXISTS (
        SELECT 1 FROM public.campaign_managers cm
        WHERE cm.campaign_id = p_new_list_campaign_id AND cm.manager_id = auth.uid()
      )
    ) THEN
      RAISE EXCEPTION 'Geen rechten op dit project';
    END IF;

    SELECT organization_id INTO v_org FROM public.profiles WHERE id = auth.uid();

    INSERT INTO public.lead_lists (name, campaign_id, organization_id, created_by, activate_at)
    VALUES (trim(p_new_list_name), p_new_list_campaign_id, v_org, auth.uid(), p_new_list_activate_at)
    RETURNING id INTO v_target_id;
  ELSE
    IF NOT EXISTS (
      SELECT 1 FROM public.lead_lists ll
      WHERE ll.id = v_target_id AND ll.deleted_at IS NULL
    ) THEN
      RAISE EXCEPTION 'Doellijst bestaat niet (meer)';
    END IF;

    IF NOT (public.is_admin() OR v_target_id = ANY (public.my_managed_list_ids())) THEN
      RAISE EXCEPTION 'Geen rechten op de doellijst';
    END IF;
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
    SET lead_list_id = v_target_id,
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
      auth.uid(), v_target_id,
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

  RETURN jsonb_build_object('moved_count', v_count, 'target_list_id', v_target_id);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.move_or_copy_leads(uuid[], uuid, text, boolean, text, uuid, timestamptz) TO authenticated;

COMMIT;
