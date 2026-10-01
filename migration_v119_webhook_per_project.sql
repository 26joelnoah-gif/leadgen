-- ReachConnect v119 (01-10-2026) - mailingservice per project instelbaar.
-- Toegepast op Supabase in losse stukken (apply_migration liep een paar keer
-- in een timeout); dit bestand is het geheel, idempotent.
--
-- Waarom: een nieuwe bron koppelen vroeg code (MAIL_SOURCES) EN twee Supabase
-- secrets. Nu zet een admin de webhook-URL, de token en de JSON-body gewoon in
-- de projectinstellingen. Niets ingevuld = terugval op de oude secrets, zodat
-- bestaande koppelingen blijven werken.

ALTER TABLE public.campaign_mail_services
  ADD COLUMN IF NOT EXISTS webhook_url   text,
  ADD COLUMN IF NOT EXISTS stop_url      text,
  ADD COLUMN IF NOT EXISTS body_template jsonb;

-- Alleen https en een gewone domeinnaam: geen http, geen kaal IP-adres, geen
-- interne host. De Edge Functions controleren dit nog een keer (veiligeUrl).
ALTER TABLE public.campaign_mail_services DROP CONSTRAINT IF EXISTS campaign_mail_services_webhook_url_check;
ALTER TABLE public.campaign_mail_services ADD CONSTRAINT campaign_mail_services_webhook_url_check
  CHECK (webhook_url IS NULL OR (webhook_url ~ '^https://[a-z0-9.-]+\.[a-z]{2,}(/|$)' AND length(webhook_url) <= 500));
ALTER TABLE public.campaign_mail_services DROP CONSTRAINT IF EXISTS campaign_mail_services_stop_url_check;
ALTER TABLE public.campaign_mail_services ADD CONSTRAINT campaign_mail_services_stop_url_check
  CHECK (stop_url IS NULL OR (stop_url ~ '^https://[a-z0-9.-]+\.[a-z]{2,}(/|$)' AND length(stop_url) <= 500));

-- De token staat APART. Alleen een admin mag deze tabel lezen of schrijven;
-- de Edge Functions lezen hem met de service role. Een beller of manager die
-- de projectinstellingen opvraagt krijgt hem dus nooit mee.
CREATE TABLE IF NOT EXISTS public.campaign_mail_secrets (
  campaign_id uuid PRIMARY KEY REFERENCES public.campaigns(id) ON DELETE CASCADE,
  token       text NOT NULL CHECK (length(token) BETWEEN 8 AND 500),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid REFERENCES public.profiles(id)
);
ALTER TABLE public.campaign_mail_secrets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS campaign_mail_secrets_select ON public.campaign_mail_secrets;
CREATE POLICY campaign_mail_secrets_select ON public.campaign_mail_secrets
  FOR SELECT TO authenticated USING ((SELECT is_admin()));
DROP POLICY IF EXISTS campaign_mail_secrets_insert ON public.campaign_mail_secrets;
CREATE POLICY campaign_mail_secrets_insert ON public.campaign_mail_secrets
  FOR INSERT TO authenticated WITH CHECK ((SELECT is_admin()));
DROP POLICY IF EXISTS campaign_mail_secrets_update ON public.campaign_mail_secrets;
CREATE POLICY campaign_mail_secrets_update ON public.campaign_mail_secrets
  FOR UPDATE TO authenticated USING ((SELECT is_admin())) WITH CHECK ((SELECT is_admin()));
DROP POLICY IF EXISTS campaign_mail_secrets_delete ON public.campaign_mail_secrets;
CREATE POLICY campaign_mail_secrets_delete ON public.campaign_mail_secrets
  FOR DELETE TO authenticated USING ((SELECT is_admin()));

-- Standaard body-template = precies wat de functies tot nu toe stuurden.
UPDATE public.campaign_mail_services
SET body_template = jsonb_build_object(
      'mail', '{{mail}}', 'lead_id', '{{lead_id}}', 'email', '{{email}}',
      'bedrijfsnaam', '{{bedrijfsnaam}}', 'contactpersoon', '{{contactpersoon}}',
      'stad', '{{stad}}', 'website', '{{website}}',
      'beller', jsonb_build_object('naam', '{{beller_naam}}', 'telefoon', '{{beller_telefoon}}'))
WHERE body_template IS NULL;

-- URL's zijn geen geheim, die vullen we alvast in; alleen de token moet nog
-- met de hand in de projectinstellingen.
UPDATE public.campaign_mail_services SET
  webhook_url = 'https://beautyinfo.nl/api/reachconnect/mail',
  stop_url    = 'https://beautyinfo.nl/api/reachconnect/stop'
WHERE source = 'BEAUTYINFO' AND webhook_url IS NULL;

UPDATE public.campaign_mail_services SET
  webhook_url = 'https://marketingkiezer.nl/api/leadgen/mail',
  stop_url    = 'https://marketingkiezer.nl/api/leadgen/stop'
WHERE source = 'MARKETINGKIEZER' AND webhook_url IS NULL;
