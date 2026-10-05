-- ============================================================================
-- MIGRATION V125 (2026-10-05)
-- RECRUITER MAAKT PLANNING-ACCOUNTS AAN EN GEEFT ZE LATER EEN FUNCTIE
--
-- Wens Noah: een recruiter (met het recht "Accounts aanmaken", v107) mag een
-- aangenomen sollicitant alvast een account geven voor de rooster-app. Dat is
-- ALTIJD een planning-account (alleen rooster, geen leads). Zodra die persoon
-- echt begint, geeft de recruiter het account een functie: beller,
-- backoffice of accountmanager. Nooit manager, admin of recruiter.
--
-- 1. nieuw_account_afronden: een niet-admin mag nu ook 'planning' uitdelen;
--    een recruiter mag ALLEEN 'planning' (de rest blijft zoals v107).
-- 2. Nieuwe RPC account_functie_wijzigen(p_user, p_role): zet de rol van een
--    bestaand account in dezelfde organisatie. Bewaking:
--      * aanroeper is actief en is admin, manager of heeft can_create_users;
--      * doelaccount zit in dezelfde organisatie, is niet verwijderd en is
--        niet de aanroeper zelf;
--      * een niet-admin mag alleen een account aanpassen dat nu planning,
--        beller, backoffice, accountmanager of extern is (nooit een admin,
--        manager of recruiter "omlaag halen"), en mag alleen planning, beller,
--        backoffice of accountmanager uitdelen.
--    profiles_update laat alleen admin andermans profiel aanpassen, vandaar
--    opnieuw een SECURITY DEFINER-functie met eigen controle (zoals v107).
-- 3. Logtabel account_functie_log: wie gaf wie welke functie (alleen admin leest).
-- 4. BUG UIT V107 GEFIXT: trigger guard_profile_privileges op profiles weigerde
--    ELKE rolwijziging door een niet-admin, dus nieuw_account_afronden kon voor
--    een manager/recruiter nooit een accountmanager- of backoffice-account
--    afronden (alleen 'employee' = ongewijzigde rol lukte). De trigger slaat nu
--    over als de vlag leadgen.systeem='1' staat; beide RPC's zetten die vlag
--    alleen rond hun eigen UPDATE en halen hem daarna weer weg. Een directe
--    UPDATE op profiles.role door een niet-admin blijft geweigerd (getest).
--
-- TOEGEPAST op zboyxwwrbtpjnlgquhzs op 05-10-2026 in losse statements (de
-- MCP-tool liep vast op het hele script in een keer).
-- ============================================================================

-- ---------- 1. nieuw_account_afronden: planning erbij, recruiter alleen planning ----------

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
  v_n        integer;
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

  -- v125: een recruiter maakt alleen planning-accounts (rooster-app) aan.
  IF NOT v_is_admin AND v_maker.role = 'recruiter' AND v_rol <> 'planning' THEN
    RAISE EXCEPTION 'Als recruiter maak je alleen een planning-account aan; geef het later een functie via Accounts';
  END IF;

  IF NOT v_is_admin AND v_rol NOT IN ('employee', 'backoffice', 'accountmanager', 'planning') THEN
    RAISE EXCEPTION 'Je mag alleen een beller-, backoffice-, accountmanager- of planning-account aanmaken';
  END IF;

  -- v125: de controle hierboven is de bewaking; de trigger guard_profile_privileges
  -- (die een niet-admin geen rol laat zetten) wordt met deze vlag overgeslagen.
  PERFORM set_config('leadgen.systeem', '1', true);
  UPDATE public.profiles
     SET role            = v_rol,
         organization_id = v_maker.organization_id
   WHERE id = p_user
     AND role = 'employee'
     AND created_at > now() - interval '15 minutes';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  PERFORM set_config('leadgen.systeem', '', true);

  IF v_n = 0 THEN
    RAISE EXCEPTION 'Dit account kan niet meer worden bijgewerkt (niet nieuw genoeg of al ingesteld)';
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.nieuw_account_afronden(uuid, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.nieuw_account_afronden(uuid, text) TO authenticated;

-- ---------- 3. Logtabel ----------

CREATE TABLE IF NOT EXISTS public.account_functie_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  target_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  van_rol text,
  naar_rol text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.account_functie_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS account_functie_log_select ON public.account_functie_log;
CREATE POLICY account_functie_log_select ON public.account_functie_log
  FOR SELECT USING ((SELECT public.is_admin()));
-- Geen insert-policy: alleen de functie hieronder (security definer) schrijft.

-- ---------- 4. guard_profile_privileges laat systeemupdates door ----------

CREATE OR REPLACE FUNCTION public.guard_profile_privileges()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  -- v125: systeemupdates vanuit onze eigen RPC's (nieuw_account_afronden,
  -- account_functie_wijzigen) doen hun eigen controle en zetten deze vlag.
  IF public.leadgen_systeem() THEN RETURN NEW; END IF;

  IF (NEW.role IS DISTINCT FROM OLD.role
      OR NEW.organization_id IS DISTINCT FROM OLD.organization_id)
     AND NOT public.is_admin() THEN
    IF NOT (NEW.role = OLD.role AND OLD.organization_id IS NULL) THEN
      RAISE EXCEPTION 'Geen rechten om role of organization_id te wijzigen';
    END IF;
  END IF;

  IF NOT public.is_admin() AND (
    NEW.can_manage_leads IS DISTINCT FROM OLD.can_manage_leads OR
    NEW.can_view_rates   IS DISTINCT FROM OLD.can_view_rates OR
    NEW.can_manage_team  IS DISTINCT FROM OLD.can_manage_team OR
    NEW.can_export_data  IS DISTINCT FROM OLD.can_export_data OR
    NEW.can_edit_flows   IS DISTINCT FROM OLD.can_edit_flows OR
    NEW.kpi_only         IS DISTINCT FROM OLD.kpi_only OR
    NEW.can_manage_queue IS DISTINCT FROM OLD.can_manage_queue OR
    NEW.is_active        IS DISTINCT FROM OLD.is_active
  ) THEN
    RAISE EXCEPTION 'Geen rechten om rechten-instellingen te wijzigen';
  END IF;

  RETURN NEW;
END
$function$;

-- ---------- 2. account_functie_wijzigen ----------

CREATE OR REPLACE FUNCTION public.account_functie_wijzigen(p_user uuid, p_role text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_maker    public.profiles;
  v_doel     public.profiles;
  v_rol      text := nullif(trim(p_role), '');
  v_is_admin boolean;
BEGIN
  IF v_rol IS NULL THEN
    RAISE EXCEPTION 'Kies een functie';
  END IF;

  SELECT * INTO v_maker FROM public.profiles WHERE id = auth.uid();
  IF v_maker.id IS NULL THEN
    RAISE EXCEPTION 'Niet ingelogd';
  END IF;
  IF v_maker.is_active IS false OR v_maker.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Dit account is niet actief';
  END IF;

  v_is_admin := (v_maker.role = 'admin');

  IF NOT (v_is_admin OR v_maker.role = 'manager' OR coalesce(v_maker.can_create_users, false)) THEN
    RAISE EXCEPTION 'Je hebt geen recht om accounts een functie te geven';
  END IF;

  IF p_user = v_maker.id THEN
    RAISE EXCEPTION 'Je kunt je eigen functie niet wijzigen';
  END IF;

  SELECT * INTO v_doel FROM public.profiles WHERE id = p_user AND deleted_at IS NULL;
  IF v_doel.id IS NULL THEN
    RAISE EXCEPTION 'Account niet gevonden';
  END IF;
  IF v_doel.organization_id IS DISTINCT FROM v_maker.organization_id THEN
    RAISE EXCEPTION 'Dit account hoort niet bij jouw organisatie';
  END IF;

  IF NOT v_is_admin THEN
    IF v_doel.role NOT IN ('planning', 'employee', 'backoffice', 'accountmanager', 'extern') THEN
      RAISE EXCEPTION 'De functie van een admin, manager of recruiter kun je niet wijzigen';
    END IF;
    IF v_rol NOT IN ('planning', 'employee', 'backoffice', 'accountmanager') THEN
      RAISE EXCEPTION 'Je mag alleen planning, beller, backoffice of accountmanager uitdelen';
    END IF;
  ELSE
    IF v_rol NOT IN ('admin', 'manager', 'recruiter', 'planning', 'employee', 'backoffice', 'accountmanager', 'extern') THEN
      RAISE EXCEPTION 'Onbekende functie: %', v_rol;
    END IF;
  END IF;

  IF v_doel.role = v_rol THEN
    RETURN; -- niets te doen
  END IF;

  -- vlag zodat guard_profile_privileges deze (gecontroleerde) rolwijziging doorlaat
  PERFORM set_config('leadgen.systeem', '1', true);
  UPDATE public.profiles SET role = v_rol WHERE id = p_user;
  PERFORM set_config('leadgen.systeem', '', true);

  INSERT INTO public.account_functie_log (actor_id, target_id, van_rol, naar_rol)
  VALUES (v_maker.id, p_user, v_doel.role, v_rol);
END;
$function$;

REVOKE ALL ON FUNCTION public.account_functie_wijzigen(uuid, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.account_functie_wijzigen(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.account_functie_wijzigen(uuid, text) IS
  'v125: geeft een bestaand account in de eigen organisatie een andere functie. Niet-admin: alleen planning/beller/backoffice/accountmanager, nooit admin/manager/recruiter.';

-- KLAAR.
