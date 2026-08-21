-- =====================================================
-- MIGRATION V17: Routing-logica opgeschoond
-- (GERUND op 2026-08-20 via Claude — al toegepast op Supabase)
-- 1. Leads blijven in hun projectlijst; disposities maken
--    GEEN lijsten meer aan. Uitkomst = status + call_log.
-- 2. Dubbele DB-trigger (v9) verwijderd.
-- 3. Nieuwe afboekreden: onjuiste_timing. Ook 'cold' officieel toegestaan.
-- 4. flow_settings versimpeld: alleen toewijzing + notitie-tag per reden.
-- =====================================================

-- 1. Status-constraint uitbreiden
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_status_check;
ALTER TABLE public.leads ADD CONSTRAINT leads_status_check CHECK (status IN (
  'new', 'later_bellen', 'mailen', 'voicemail',
  'terugbelafspraak', 'geen_gehoor', 'verkeerd_nummer',
  'geen_interesse', 'onjuiste_timing', 'afspraak_gemaakt', 'deal', 'cold'
));

-- 2. Dubbele routing-trigger weg (client is nu de enige plek met dispositie-logica)
DROP TRIGGER IF EXISTS tr_lead_flow_automation ON public.leads;
DROP FUNCTION IF EXISTS public.handle_lead_flow();

-- 3. flow_settings versimpelen: beschrijving erbij, lijstnamen zijn niet meer relevant
ALTER TABLE public.flow_settings ADD COLUMN IF NOT EXISTS description TEXT;

DELETE FROM public.flow_settings WHERE disposition_type = 'geen_interesse_niet_bellen';

INSERT INTO public.flow_settings (disposition_type, target_list_name, auto_assign_to, append_agent_note, is_active, description) VALUES
  ('deal',             NULL, 'agent', true,  true, 'Lead blijft in de projectlijst met status Deal. Blijft op naam van de beller (voor verdiensten).'),
  ('afspraak_gemaakt', NULL, 'agent', true,  true, 'Lead blijft in de projectlijst met status Afspraak. Blijft op naam van de beller.'),
  ('terugbelafspraak', NULL, 'agent', false, true, 'Lead krijgt een terugbelmoment en verschijnt bij TBA''s van de beller. Blijft in de projectlijst.'),
  ('later_bellen',     NULL, 'agent', false, true, 'Lead komt na de gekozen datum automatisch terug in de belwachtrij.'),
  ('geen_gehoor',      NULL, 'none',  false, true, 'Poging geteld; lead komt na 2-3 dagen terug in de belwachtrij.'),
  ('geen_interesse',   NULL, 'none',  true,  true, 'Lead is afgerond met status Geen interesse. Geen notitie verplicht.'),
  ('onjuiste_timing',  NULL, 'none',  true,  true, 'Lead is nu niet relevant maar blijft bewaard om later opnieuw te benaderen.'),
  ('verkeerd_nummer',  NULL, 'none',  true,  true, 'Lead is afgerond met status Foutieve info.')
ON CONFLICT (disposition_type) DO UPDATE SET
  target_list_name = EXCLUDED.target_list_name,
  auto_assign_to = EXCLUDED.auto_assign_to,
  append_agent_note = EXCLUDED.append_agent_note,
  is_active = EXCLUDED.is_active,
  description = EXCLUDED.description;
