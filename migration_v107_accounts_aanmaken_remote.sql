-- ============================================================================
-- MIGRATION V107 (2026-09-28)
--
-- 1. RECHT "ACCOUNTS AANMAKEN" PER MEDEWERKER (profiles.can_create_users)
--    Tot nu toe kon alleen een admin (Admin > Team) of een manager (Mijn
--    Projecten) een account aanmaken. Noah wil dat per persoon kunnen
--    aanzetten, ongeacht de rol. Het aanmaken zelf gebeurt net als altijd via
--    auth.signUp met een tijdelijke client; daarna zet de nieuwe RPC
--    public.nieuw_account_afronden() de rol en de organisatie. Dat kan niet
--    via profiles_update, want die policy laat alleen admin andermans profiel
--    aanpassen - vandaar een SECURITY DEFINER-functie met eigen controle.
--
-- 2. AFBOEKREDEN "WIL REMOTE WERKEN" VOOR RECRUITMENT (status remote_thuis)
--    Sollicitanten die vanuit huis willen werken krijgen een eigen status,
--    zodat ze uit de belwachtrij gaan en op het sollicitantenbord in een
--    eigen kolom "Remote" staan.
-- ============================================================================

-- ---------- 1. Recht om accounts aan te maken ----------

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS can_create_users boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.can_create_users IS
  'v107: deze medewerker mag zelf accounts aanmaken (beller/backoffice/accountmanager), ook zonder adminrol.';

-- Rondt een NET aangemaakt account af: rol + organisatie van de maker.
-- Beveiliging:
--   * alleen admin, manager of iemand met can_create_users mag dit;
--   * een niet-admin mag alleen de "veilige" rollen uitdelen (geen admin/manager);
--   * het doelaccount moet vers zijn (< 15 min) en nog op de standaardrol
--     'employee' staan, zodat je hiermee nooit een bestaand account kaapt.
CREATE OR REPLACE FUNCTION public.nieuw_account_afronden(p_user uuid, p_role text DEFAULT 'employee')
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_maker    public.profiles;
  v_rol      text := coalesce(nullif(trim(p_role), ''), 'employee');
  v_is_admin boolean;
BEGIN
  SELECT * INTO v_maker FROM public.profiles WHERE id = auth.uid();
  IF v_maker.id IS NULL THEN
    RAISE EXCEPTION 'Niet ingelogd';
  END IF;
  IF v_maker.is_active IS false OR v_maker.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Dit account is niet actief';
  END IF;

  v_is_admin := (v_maker.role = 'admin');

  IF NOT (v_is_admin OR v_maker.role = 'manager' OR coalesce(v_maker.can_create_users, false)) THEN
    RAISE EXCEPTION 'Je hebt geen recht om accounts aan te maken';
  END IF;

  IF NOT v_is_admin AND v_rol NOT IN ('employee', 'backoffice', 'accountmanager') THEN
    RAISE EXCEPTION 'Je mag alleen een beller, backoffice- of accountmanager-account aanmaken';
  END IF;

  UPDATE public.profiles
     SET role            = v_rol,
         organization_id = v_maker.organization_id
   WHERE id = p_user
     AND role = 'employee'
     AND created_at > now() - interval '15 minutes';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Dit account kan niet meer worden bijgewerkt (niet nieuw genoeg of al ingesteld)';
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.nieuw_account_afronden(uuid, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.nieuw_account_afronden(uuid, text) TO authenticated;

-- ---------- 2. Status 'remote_thuis' ----------

-- Lijst = de huidige live constraint (v78) + de nieuwe status.
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_status_check;
ALTER TABLE public.leads ADD CONSTRAINT leads_status_check CHECK (status = ANY (ARRAY[
  'new','later_bellen','mailen','voicemail','terugbelafspraak','geen_gehoor',
  'verkeerd_nummer','geen_interesse','onjuiste_timing','afspraak_gemaakt','deal',
  'cold','blacklist','monteur_ingepland','wil_annuleren','bruto_deal',
  'offerte_verzonden','gebeld','geaccepteerd','actief','afgewezen',
  'mail_verstuurd','mail_gepland','remote_thuis'
]::text[]));

-- claim_next_lead: identiek aan v98, alleen 'remote_thuis' erbij in de lijst
-- met statussen die niet meer in de wachtrij horen.
CREATE OR REPLACE FUNCTION public.claim_next_lead(p_list_id uuid, p_lock_minutes integer DEFAULT 10)
 RETURNS SETOF leads
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_lead public.leads;
  v_mode text := 'fifo';
  v_board boolean := false;
  v_doelgroep text;
  v_rvmodus text;
BEGIN
  IF NOT (
    public.is_admin()
    OR p_list_id = ANY (public.my_list_ids())
    OR p_list_id = ANY (public.my_managed_list_ids())
  ) THEN
    RETURN;
  END IF;

  SELECT coalesce(c.queue_mode, 'fifo'), coalesce(c.board_view_enabled, false), c.doelgroep, c.rechtsvorm_modus
    INTO v_mode, v_board, v_doelgroep, v_rvmodus
  FROM public.lead_lists ll
  LEFT JOIN public.campaigns c ON c.id = ll.campaign_id
  WHERE ll.id = p_list_id;

  SELECT * INTO v_lead
  FROM public.leads l
  WHERE l.lead_list_id = p_list_id
    AND l.deleted_at IS NULL
    AND l.status NOT IN ('deal','afspraak_gemaakt','geen_interesse','verkeerd_nummer','cold','blacklist','monteur_ingepland','wil_annuleren','bruto_deal','mail_gepland','remote_thuis')
    -- v98: niet-belbare leads (afgemeld / toestemming nodig) nooit in de wachtrij
    AND public.lead_belstatus_basis(l.afgemeld_at, l.opt_in_at, l.rechtsvorm, v_doelgroep, v_rvmodus) IN ('ok','kvk_check')
    AND (
      (l.status = 'terugbelafspraak' AND (
        (l.assigned_to = auth.uid() AND (l.next_contact_date IS NULL OR l.next_contact_date <= now()))
        OR (NOT v_board AND l.next_contact_date IS NOT NULL AND l.next_contact_date <= now() - interval '24 hours')
      ))
      OR (l.status <> 'terugbelafspraak' AND (l.next_contact_date IS NULL OR l.next_contact_date <= now()))
    )
    AND (l.locked_by IS NULL OR l.locked_by = auth.uid())
    AND (NOT v_board OR l.assigned_to IS NULL OR l.assigned_to = auth.uid())
  ORDER BY
    (l.status = 'terugbelafspraak' AND l.assigned_to = auth.uid()) DESC,
    (l.locked_by = auth.uid()) DESC NULLS LAST,
    -- v98: leads met bevestigde rechtsvorm eerst, KvK-check daarna
    (l.rechtsvorm IS NOT NULL AND l.rechtsvorm <> 'onbekend') DESC,
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

-- KLAAR.
