-- =====================================================
-- MIGRATION V111: laatste login + laatst actief per account
--
-- Waarom: in Admin > Team was niet te zien wanneer iemand voor het
-- laatst ingelogd heeft of voor het laatst echt aan het werk was.
--
-- Twee losse dingen, bewust uit elkaar gehouden:
--  * LAATSTE LOGIN komt uit auth.users.last_sign_in_at. Dat houdt Supabase
--    zelf al bij, dus dit werkt ook met terugwerkende kracht en er hoeft
--    niets extra weggeschreven te worden. De browser kan niet bij auth.users,
--    dus het gaat via de functie public.team_aanwezigheid() (security definer).
--  * LAATST ACTIEF = nieuwe kolom profiles.last_seen_at. Wordt automatisch
--    gezet door een trigger op activity_pings (de klik-heartbeat uit v43,
--    schrijft elke ~60s een rij zolang er geklikt wordt) en op call_logs
--    (elk gesprek en elke bord-actie). Dus geen enkele extra write uit de
--    frontend: een openstaand maar verlaten tabblad schuift "laatst actief"
--    niet op, want zonder clicks komt er geen ping.
-- =====================================================

BEGIN;

-- 1. Kolom -------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;

COMMENT ON COLUMN public.profiles.last_seen_at IS
  'v111: laatste moment waarop deze medewerker echt iets deed (klik-heartbeat of gesprek). Wordt gezet door triggers op activity_pings en call_logs.';

CREATE INDEX IF NOT EXISTS profiles_last_seen_idx
  ON public.profiles(last_seen_at DESC NULLS LAST);

-- 2. Bijhouden via triggers -------------------------------------------
-- Eén functie voor beide tabellen: neemt user_id uit de nieuwe rij en
-- schuift last_seen_at alleen vooruit, nooit terug (late of nagestuurde
-- rijen kunnen de tijd dus niet verpesten).
-- De kolom met "wie" heet niet overal hetzelfde: activity_pings.user_id,
-- call_logs.agent_id. Die naam geven we als argument aan de trigger mee.
CREATE OR REPLACE FUNCTION public.profielen_last_seen_bij()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_wie uuid;
  v_wanneer timestamptz;
BEGIN
  v_wie := NULLIF(to_jsonb(NEW) ->> COALESCE(TG_ARGV[0], 'user_id'), '')::uuid;
  IF v_wie IS NULL THEN
    RETURN NEW;
  END IF;

  v_wanneer := COALESCE(NULLIF(to_jsonb(NEW) ->> 'created_at', '')::timestamptz, now());

  UPDATE public.profiles
     SET last_seen_at = v_wanneer
   WHERE id = v_wie
     AND (last_seen_at IS NULL OR last_seen_at < v_wanneer);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_activity_pings_last_seen ON public.activity_pings;
CREATE TRIGGER tr_activity_pings_last_seen
  AFTER INSERT ON public.activity_pings
  FOR EACH ROW EXECUTE FUNCTION public.profielen_last_seen_bij('user_id');

DROP TRIGGER IF EXISTS tr_call_logs_last_seen ON public.call_logs;
CREATE TRIGGER tr_call_logs_last_seen
  AFTER INSERT ON public.call_logs
  FOR EACH ROW EXECUTE FUNCTION public.profielen_last_seen_bij('agent_id');

-- 3. Eenmalige backfill -----------------------------------------------
-- Zodat het overzicht meteen gevuld is met wat we al weten, in plaats van
-- pas vanaf nu. Hoogste van: laatste klik-heartbeat, laatste gesprek.
WITH laatste AS (
  SELECT user_id, max(created_at) AS op
    FROM public.activity_pings
   GROUP BY user_id
  UNION ALL
  SELECT agent_id AS user_id, max(created_at) AS op
    FROM public.call_logs
   WHERE agent_id IS NOT NULL
   GROUP BY agent_id
), samen AS (
  SELECT user_id, max(op) AS op FROM laatste GROUP BY user_id
)
UPDATE public.profiles p
   SET last_seen_at = s.op
  FROM samen s
 WHERE s.user_id = p.id
   AND (p.last_seen_at IS NULL OR p.last_seen_at < s.op);

-- 4. Uitlezen voor admin en manager -----------------------------------
-- Geeft per account de laatste login (uit auth.users), laatst actief
-- (profiles.last_seen_at) en wanneer het account is aangemaakt. Alleen
-- een admin of manager binnen dezelfde organisatie krijgt rijen terug;
-- een beller die de functie aanroept krijgt alleen zijn eigen rij.
CREATE OR REPLACE FUNCTION public.team_aanwezigheid()
RETURNS TABLE (
  user_id uuid,
  laatste_login timestamptz,
  laatst_actief timestamptz,
  account_sinds timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'pg_temp'
AS $$
  WITH mij AS (
    SELECT role, organization_id FROM public.profiles WHERE id = auth.uid()
  )
  SELECT p.id,
         u.last_sign_in_at,
         p.last_seen_at,
         p.created_at
    FROM public.profiles p
    LEFT JOIN auth.users u ON u.id = p.id
   WHERE (SELECT auth.uid()) IS NOT NULL
     AND (
       p.id = (SELECT auth.uid())
       OR (
         (SELECT role FROM mij) IN ('admin', 'manager')
         AND (
           NOT (p.organization_id IS DISTINCT FROM (SELECT organization_id FROM mij))
           OR p.organization_id IN (SELECT public.my_owned_org_ids())
         )
       )
     );
$$;

-- v101-regel: security definer-functies niet open voor anon/public
REVOKE ALL ON FUNCTION public.team_aanwezigheid() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.team_aanwezigheid() FROM anon;
GRANT EXECUTE ON FUNCTION public.team_aanwezigheid() TO authenticated;

REVOKE ALL ON FUNCTION public.profielen_last_seen_bij() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.profielen_last_seen_bij() FROM anon;

COMMIT;
