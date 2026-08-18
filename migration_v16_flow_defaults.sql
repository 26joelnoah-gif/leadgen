-- =====================================================
-- MIGRATION V16: Standaard routing per dispositie
-- (GERUND op 2026-08-18 via Claude)
-- Deals/afspraken eindigen op de juiste plek, terugbel/later
-- gaat naar een persoonlijke lijst van de beller.
-- =====================================================

CREATE UNIQUE INDEX IF NOT EXISTS flow_settings_disposition_key ON public.flow_settings (disposition_type);

INSERT INTO public.flow_settings (disposition_type, target_list_name, auto_assign_to, append_agent_note, is_active) VALUES
  ('deal',              '🏆 Deals',                      'agent', true,  true),
  ('afspraak_gemaakt',  '📅 Afspraken',                  'agent', true,  true),
  ('terugbelafspraak',  '☎️ Terugbellen — {{agent}}',    'agent', false, true),
  ('later_bellen',      '⏳ Later bellen — {{agent}}',   'agent', false, true),
  ('geen_interesse',    '🚫 Geen interesse',             'none',  true,  true),
  ('verkeerd_nummer',   '⚠️ Foutieve gegevens',          'none',  true,  true)
ON CONFLICT (disposition_type) DO NOTHING;
-- Bewust GEEN regel voor 'geen_gehoor': die leads blijven in hun lijst voor herbellen.
