-- ============================================================================
-- v70 (2026-09-14): Mailstatus terug van de bron + keuze tussen twee mailsoorten
-- ----------------------------------------------------------------------------
-- 1. campaign_mail_services.mail_types: welke mailsoorten de beller mag kiezen
--    in het belscherm. mail_type blijft de standaardkeuze.
-- 2. lead_mail_status: hoe ver de bron (bijv. MarketingKiezer) komt met de mail
--    die voor een lead is verstuurd. Eén rij per lead + bron + mailsoort.
--    De bron post elke stap naar de Edge Function 'mailstatus' (eigen sleutel,
--    verify_jwt = false). Alleen die functie schrijft (service role); iedereen
--    binnen de organisatie mag lezen.
--    Stappen: gemaild -> link_geklikt -> offerte_open -> getekend -> betaald.
--    Elke stap heeft een eigen kolom, zodat een melding die te laat of dubbel
--    binnenkomt nooit een verdere stap terugdraait (status_rank bewaakt dat).
-- ============================================================================

-- 1. Mailsoorten per project
ALTER TABLE public.campaign_mail_services
  ADD COLUMN IF NOT EXISTS mail_types text[] NOT NULL DEFAULT ARRAY['introductie','aanmelden']::text[];

ALTER TABLE public.campaign_mail_services DROP CONSTRAINT IF EXISTS campaign_mail_services_mail_types_check;
ALTER TABLE public.campaign_mail_services ADD CONSTRAINT campaign_mail_services_mail_types_check
  CHECK (array_length(mail_types, 1) BETWEEN 1 AND 10);

-- 2. Status van een verstuurde mail
CREATE TABLE IF NOT EXISTS public.lead_mail_status (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id         uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  source          text NOT NULL CHECK (source ~ '^[A-Z][A-Z0-9_]{1,39}$'),
  mail_soort      text NOT NULL CHECK (mail_soort ~ '^[a-z][a-z0-9_]{1,39}$'),
  organization_id uuid,
  campaign_id     uuid REFERENCES public.campaigns(id) ON DELETE SET NULL,
  email           text,
  bureau          text,
  offerte_url     text,
  status          text NOT NULL CHECK (status ~ '^[a-z][a-z0-9_]{1,39}$'),
  status_rank     smallint NOT NULL DEFAULT 0,
  status_op       timestamptz NOT NULL DEFAULT now(),
  gemaild_op      timestamptz,
  geklikt_op      timestamptz,
  offerte_open_op timestamptz,
  getekend_op     timestamptz,
  betaald_op      timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (lead_id, source, mail_soort)
);

CREATE INDEX IF NOT EXISTS lead_mail_status_lead ON public.lead_mail_status (lead_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS lead_mail_status_campaign ON public.lead_mail_status (campaign_id, status);

ALTER TABLE public.lead_mail_status ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lead_mail_status_select ON public.lead_mail_status;
CREATE POLICY lead_mail_status_select ON public.lead_mail_status
  FOR SELECT TO authenticated
  USING (NOT (organization_id IS DISTINCT FROM public.my_org_id()));
-- Geen INSERT/UPDATE/DELETE-policy: alleen service role (Edge Function mailstatus).

-- 3. Realtime, zodat het belscherm de status live bijwerkt (zoals offertes in v65)
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'lead_mail_status') then
    alter publication supabase_realtime add table public.lead_mail_status;
  end if;
end $$;
