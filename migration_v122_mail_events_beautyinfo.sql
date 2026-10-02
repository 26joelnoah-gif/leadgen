-- ============================================================================
-- v122 (2026-10-02): statusupdates van BeautyInfo (en elke andere bron) ruw
-- bewaren + meer weten per gemailde lead
-- ----------------------------------------------------------------------------
-- Aanleiding: BeautyInfo stuurt vanaf nu 19 verschillende statusupdates naar de
-- Edge Function mailstatus (mail bezorgd/geopend, klant op de pagina, bij het
-- betalen, betaald, abonnement, enz.), met een event_id (voor dubbele
-- berichten) en occurred_at (echte volgorde). De bestaande tabel
-- lead_mail_status heeft maar 5 vaste stappen. Daarom:
-- 1. public.lead_mail_events: elke update die binnenkomt, ruw en compleet.
--    Uniek op (source, event_id), zodat een herhaalpoging van de bron nooit
--    twee keer verwerkt wordt. Alleen de Edge Function schrijft.
-- 2. Extra kolommen op lead_mail_status (de samenvatting per lead + bron +
--    mailsoort, waar bord/belscherm/rapportage op draaien):
--    laatste_event (+_op): de nieuwste gebeurtenis op occurred_at, ook als die
--      geen stap vooruit is (bijv. bounced of pagina_verlaten);
--    fase: mail | bezoek | betaling | klant | einde (voortgangsbalk);
--    pagina_actief_op / pagina_verlaten_op: samen bepalen ze of de klant NU op
--      de aanmeldpagina is (actief_op > verlaten_op), onafhankelijk van de
--      volgorde waarin de twee berichten binnenkomen;
--    actie_nodig (+_op): bounced | mail_mislukt | checkout_verlaten |
--      betaling_mislukt | abonnement_opgezegd = terugbellen aan te raden.
-- De funnel (status_rank 1-5) blijft zoals hij was; MarketingKiezer merkt niets.
-- ============================================================================

-- 1. Ruwe events
CREATE TABLE IF NOT EXISTS public.lead_mail_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id         uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  source          text NOT NULL CHECK (source ~ '^[A-Z][A-Z0-9_]{1,39}$'),
  mail_soort      text CHECK (mail_soort IS NULL OR mail_soort ~ '^[a-z][a-z0-9_]{1,39}$'),
  event_id        text CHECK (event_id IS NULL OR length(event_id) BETWEEN 1 AND 80),
  status          text NOT NULL CHECK (status ~ '^[a-z][a-z0-9_]{1,39}$'),
  stage           text CHECK (stage IS NULL OR stage ~ '^[a-z][a-z0-9_]{1,39}$'),
  occurred_at     timestamptz NOT NULL DEFAULT now(),
  details         jsonb,
  organization_id uuid,
  campaign_id     uuid REFERENCES public.campaigns(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Dubbele berichten: dezelfde bron met hetzelfde event_id komt er maar een keer in.
CREATE UNIQUE INDEX IF NOT EXISTS lead_mail_events_bron_event
  ON public.lead_mail_events (source, event_id) WHERE event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS lead_mail_events_lead
  ON public.lead_mail_events (lead_id, occurred_at DESC);

ALTER TABLE public.lead_mail_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lead_mail_events_select ON public.lead_mail_events;
-- v101-regel: functies in een (SELECT ...) zodat ze 1x per query draaien.
CREATE POLICY lead_mail_events_select ON public.lead_mail_events
  FOR SELECT TO authenticated
  USING (NOT (organization_id IS DISTINCT FROM (SELECT public.my_org_id())));
-- Geen INSERT/UPDATE/DELETE-policy: alleen service role (Edge Function mailstatus).

REVOKE ALL ON public.lead_mail_events FROM anon;

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'lead_mail_events') then
    alter publication supabase_realtime add table public.lead_mail_events;
  end if;
end $$;

-- 2. Samenvatting per lead: meer dan alleen de funnelstap
ALTER TABLE public.lead_mail_status
  ADD COLUMN IF NOT EXISTS laatste_event       text,
  ADD COLUMN IF NOT EXISTS laatste_event_op    timestamptz,
  ADD COLUMN IF NOT EXISTS fase                text,
  ADD COLUMN IF NOT EXISTS pagina_actief_op    timestamptz,
  ADD COLUMN IF NOT EXISTS pagina_verlaten_op  timestamptz,
  ADD COLUMN IF NOT EXISTS actie_nodig         text,
  ADD COLUMN IF NOT EXISTS actie_nodig_op      timestamptz;

ALTER TABLE public.lead_mail_status DROP CONSTRAINT IF EXISTS lead_mail_status_fase_check;
ALTER TABLE public.lead_mail_status ADD CONSTRAINT lead_mail_status_fase_check
  CHECK (fase IS NULL OR fase IN ('mail','bezoek','betaling','klant','einde'));

ALTER TABLE public.lead_mail_status DROP CONSTRAINT IF EXISTS lead_mail_status_actie_check;
ALTER TABLE public.lead_mail_status ADD CONSTRAINT lead_mail_status_actie_check
  CHECK (actie_nodig IS NULL OR actie_nodig ~ '^[a-z][a-z0-9_]{1,39}$');

-- Bestaande rijen: laatste_event = de huidige status, zodat de UI niets leegs toont.
UPDATE public.lead_mail_status
   SET laatste_event = status, laatste_event_op = status_op
 WHERE laatste_event IS NULL;
