-- ============================================================================
-- v69 (2026-09-11): Mailingservice per project
-- ----------------------------------------------------------------------------
-- Een beller klikt bij de afboekingen op "Mailingservice". LEADGEN laat de
-- mail versturen door de BRON van dat project (bijv. MarketingKiezer via
-- /api/leadgen/mail) en boekt de lead af op 'mail_verstuurd'.
--
-- Regels:
-- * 'mail_verstuurd' is GEEN eindstatus: de lead komt op next_contact_date
--   (standaard +5 dagen) vanzelf terug in de wachtrij om op te volgen.
--   Telt niet als deal (Payouts/XP/Dashboard gebruiken het niet).
-- * Waar de mail vandaan komt staat per project in campaign_mail_services.source
--   (bijv. 'MARKETINGKIEZER'). De URL en sleutel van een bron staan NIET in de
--   database maar in Supabase secrets: MAILSERVICE_<SOURCE>_URL en
--   MAILSERVICE_<SOURCE>_KEY. Zo kan niemand via de DB de sleutel naar een
--   andere server laten sturen.
-- * Alleen admin zet de Mailingservice aan/uit (projectinstellingen).
-- * mailservice_logs: elke poging (gelukt/mislukt). Alleen de Edge Function
--   (service role) schrijft; admin ziet alles, een beller alleen de eigen rijen.
-- ============================================================================

-- 1. Status 'mail_verstuurd' toestaan (lijst = huidige live constraint + nieuw)
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_status_check;
ALTER TABLE public.leads ADD CONSTRAINT leads_status_check CHECK (status = ANY (ARRAY[
  'new','later_bellen','mailen','voicemail','terugbelafspraak','geen_gehoor',
  'verkeerd_nummer','geen_interesse','onjuiste_timing','afspraak_gemaakt','deal',
  'cold','blacklist','monteur_ingepland','wil_annuleren','bruto_deal',
  'offerte_verzonden','gebeld','geaccepteerd','actief','afgewezen',
  'mail_verstuurd'
]::text[]));

-- 2. Mailingservice per project
CREATE TABLE IF NOT EXISTS public.campaign_mail_services (
  campaign_id     uuid PRIMARY KEY REFERENCES public.campaigns(id) ON DELETE CASCADE,
  enabled         boolean NOT NULL DEFAULT false,
  source          text NOT NULL CHECK (source ~ '^[A-Z][A-Z0-9_]{1,39}$'),
  mail_type       text NOT NULL DEFAULT 'introductie' CHECK (mail_type ~ '^[a-z][a-z0-9_]{1,39}$'),
  follow_up_days  integer NOT NULL DEFAULT 5 CHECK (follow_up_days BETWEEN 1 AND 60),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  updated_by      uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

ALTER TABLE public.campaign_mail_services ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS campaign_mail_services_select ON public.campaign_mail_services;
CREATE POLICY campaign_mail_services_select ON public.campaign_mail_services
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.campaigns c
    WHERE c.id = campaign_mail_services.campaign_id
      AND NOT (c.organization_id IS DISTINCT FROM public.my_org_id())
  ));

DROP POLICY IF EXISTS campaign_mail_services_write ON public.campaign_mail_services;
CREATE POLICY campaign_mail_services_write ON public.campaign_mail_services
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 3. Log van verstuurde mails (audit + rem op misbruik)
CREATE TABLE IF NOT EXISTS public.mailservice_logs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at     timestamptz NOT NULL DEFAULT now(),
  agent_id       uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  lead_id        uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  campaign_id    uuid REFERENCES public.campaigns(id) ON DELETE SET NULL,
  organization_id uuid,
  source         text NOT NULL,
  mail_type      text NOT NULL,
  email          text NOT NULL,
  ok             boolean NOT NULL,
  error          text
);
CREATE INDEX IF NOT EXISTS mailservice_logs_agent_time ON public.mailservice_logs (agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS mailservice_logs_lead_time ON public.mailservice_logs (lead_id, created_at DESC);

ALTER TABLE public.mailservice_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mailservice_logs_select ON public.mailservice_logs;
CREATE POLICY mailservice_logs_select ON public.mailservice_logs
  FOR SELECT TO authenticated
  USING (public.is_admin() OR agent_id = auth.uid());
-- Geen INSERT/UPDATE/DELETE-policy: alleen service role (Edge Function mailingservice).
