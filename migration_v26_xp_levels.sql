-- =====================================================
-- MIGRATION V26: ervaringspunten (XP) voor bellers
-- (UITGEVOERD op 2026-08-22 via Claude/Cowork op project zboyxwwrbtpjnlgquhzs
--  - maar vertrouw dit comment nooit blind: check pg_proc)
--
-- XP wordt in de database berekend zodat de punten later (bijv. op een
-- outbound-marktplaats) verifieerbaar zijn en niet in de client te
-- manipuleren. Regels per afgehandeld gesprek, gewogen naar de lead:
--   koude lead 1 XP - warme lead (referral/linkedin) 3 XP - beslisser 10 XP
--   resultaatbonus: terugbelafspraak +5, afspraak +15, deal +25
--   geen contact (geen gehoor / voicemail / verkeerd nummer) = 0 XP
-- De level-curve en titels leven in de app (src/utils/xpUtils.js).
-- =====================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.xp_for(p_disposition text, p_lead_source text, p_decision_maker boolean)
RETURNS integer
LANGUAGE sql IMMUTABLE
AS $$
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
          ELSE 0
        END)
  END;
$$;

CREATE OR REPLACE FUNCTION public.xp_leaderboard()
RETURNS TABLE(agent_id uuid, full_name text, xp bigint)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT cl.agent_id, p.full_name,
         COALESCE(SUM(public.xp_for(cl.disposition, l.lead_source, l.decision_maker)), 0)::bigint AS xp
  FROM public.call_logs cl
  JOIN public.profiles p ON p.id = cl.agent_id
  LEFT JOIN public.leads l ON l.id = cl.lead_id
  WHERE p.organization_id IS NOT DISTINCT FROM public.my_org_id()
    AND p.role = 'employee'
  GROUP BY cl.agent_id, p.full_name
  ORDER BY xp DESC;
$$;

COMMIT;
