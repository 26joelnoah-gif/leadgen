-- ReachConnect v118 (01-10-2026) - tweede mailbron: BEAUTYINFO
--
-- De Mailingservice was al generiek: de bron van een project staat in
-- public.campaign_mail_services.source en de URL + sleutel staan alleen in
-- Supabase secrets MAILSERVICE_<BRON>_URL / _KEY. Voor BeautyInfo is dus geen
-- nieuwe code in de Edge Functions nodig, alleen deze twee dingen.
--
-- 1) De standaard voor mail_types klopte niet meer: daar stond 'aanmelden',
--    terwijl de sleutel bij de bron 'aanmelding' is (zie v73). Alleen de
--    standaard voor nieuwe rijen; bestaande projecten blijven zoals ze staan.
ALTER TABLE public.campaign_mail_services
  ALTER COLUMN mail_types SET DEFAULT ARRAY['introductie','aanmelding']::text[];

-- 2) Mailingservice aan voor het project BEAUTYINFO. BeautyInfo kent geen
--    infomail: alleen 'aanmelding' (aanmeldmail met afrekenlink) en
--    'opvolging' (herinnering).
INSERT INTO public.campaign_mail_services (campaign_id, enabled, source, mail_type, mail_types, follow_up_days)
SELECT c.id, true, 'BEAUTYINFO', 'aanmelding', ARRAY['aanmelding','opvolging']::text[], 5
FROM public.campaigns c WHERE c.name = 'BEAUTYINFO'
ON CONFLICT (campaign_id) DO UPDATE SET
  enabled = EXCLUDED.enabled, source = EXCLUDED.source, mail_type = EXCLUDED.mail_type,
  mail_types = EXCLUDED.mail_types, follow_up_days = EXCLUDED.follow_up_days, updated_at = now();

-- Nog nodig buiten deze migratie (Supabase > Edge Functions > Secrets):
--   MAILSERVICE_BEAUTYINFO_URL = https://beautyinfo.nl/api/reachconnect/mail
--   MAILSERVICE_BEAUTYINFO_KEY = <sleutel uit het BeautyInfo-dashboard>
-- De stop-route leidt mailstop zelf af (.../mail -> .../stop).
