-- ============================================================================
-- v78 (2026-09-16): Mailinglijst - mails bewaren en later versturen
-- ----------------------------------------------------------------------------
-- In de Mailingservice-popup (belscherm en leadbord) kan de beller kiezen voor
-- "Bewaren in mailinglijst" in plaats van direct versturen. De mail (welke
-- soort, naar welk adres, met welke naam eronder) staat dan klaar in
-- public.mail_queue en de lead gaat op status 'mail_gepland'. Op de
-- Leads-pagina staat een weergave "Mailinglijst" waar de mails per stuk of in
-- een keer alsnog verstuurd worden (via de Edge Function mailingservice met
-- queue_id). Pas na een gelukte verzending gaat de lead op 'mail_verstuurd'.
--
-- Regels:
-- * Alleen wie de mail bewaarde mag hem versturen of verwijderen, plus admin
--   en de managers van het project. Iedereen in de organisatie mag de lijst
--   wel ZIEN (zodat je weet wat er klaarstaat).
-- * 'mail_gepland' is geen eindstatus en geen deal. De lead heeft geen
--   opvolgdatum zolang de mail niet weg is; hij hoort dus niet in de wachtrij.
-- * De Edge Function (service role) zet de rij op 'verzonden'; de app zelf
--   mag een rij alleen aanmaken, aanpassen (adres/naam) en verwijderen.
-- ============================================================================

-- 1. Status 'mail_gepland' toestaan (lijst = huidige live constraint + nieuw)
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_status_check;
ALTER TABLE public.leads ADD CONSTRAINT leads_status_check CHECK (status = ANY (ARRAY[
  'new','later_bellen','mailen','voicemail','terugbelafspraak','geen_gehoor',
  'verkeerd_nummer','geen_interesse','onjuiste_timing','afspraak_gemaakt','deal',
  'cold','blacklist','monteur_ingepland','wil_annuleren','bruto_deal',
  'offerte_verzonden','gebeld','geaccepteerd','actief','afgewezen',
  'mail_verstuurd','mail_gepland'
]::text[]));

-- 2. De mailinglijst
CREATE TABLE IF NOT EXISTS public.mail_queue (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  agent_id        uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  lead_id         uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  lead_list_id    uuid REFERENCES public.lead_lists(id) ON DELETE SET NULL,
  campaign_id     uuid REFERENCES public.campaigns(id) ON DELETE CASCADE,
  organization_id uuid,
  source          text NOT NULL,
  mail_type       text NOT NULL CHECK (mail_type ~ '^[a-z][a-z0-9_]{1,39}$'),
  email           text NOT NULL,
  contactpersoon  text,
  beller_naam     text,
  status          text NOT NULL DEFAULT 'open' CHECK (status IN ('open','verzonden')),
  sent_at         timestamptz,
  sent_by         uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  log_id          uuid REFERENCES public.mailservice_logs(id) ON DELETE SET NULL
);
-- Per lead en mailsoort maar een open mail tegelijk
CREATE UNIQUE INDEX IF NOT EXISTS mail_queue_open_uniek
  ON public.mail_queue (lead_id, mail_type) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS mail_queue_list_status ON public.mail_queue (lead_list_id, status, created_at);
CREATE INDEX IF NOT EXISTS mail_queue_agent ON public.mail_queue (agent_id, status);

ALTER TABLE public.mail_queue ENABLE ROW LEVEL SECURITY;

-- Mag deze gebruiker aan deze rij zitten? Eigenaar, admin of manager van het project.
CREATE OR REPLACE FUNCTION public.mail_queue_kan_beheren(p_agent uuid, p_campaign uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p_agent = auth.uid()
      OR public.is_admin()
      OR EXISTS (SELECT 1 FROM public.campaign_managers cm WHERE cm.campaign_id = p_campaign AND cm.manager_id = auth.uid());
$$;

DROP POLICY IF EXISTS mail_queue_select ON public.mail_queue;
CREATE POLICY mail_queue_select ON public.mail_queue
  FOR SELECT TO authenticated
  USING (NOT (organization_id IS DISTINCT FROM public.my_org_id()) OR agent_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS mail_queue_insert ON public.mail_queue;
CREATE POLICY mail_queue_insert ON public.mail_queue
  FOR INSERT TO authenticated
  WITH CHECK (agent_id = auth.uid() AND status = 'open');

DROP POLICY IF EXISTS mail_queue_update ON public.mail_queue;
CREATE POLICY mail_queue_update ON public.mail_queue
  FOR UPDATE TO authenticated
  USING (status = 'open' AND public.mail_queue_kan_beheren(agent_id, campaign_id))
  WITH CHECK (status = 'open');

DROP POLICY IF EXISTS mail_queue_delete ON public.mail_queue;
CREATE POLICY mail_queue_delete ON public.mail_queue
  FOR DELETE TO authenticated
  USING (status = 'open' AND public.mail_queue_kan_beheren(agent_id, campaign_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mail_queue TO authenticated;

-- Live bijwerken van de mailinglijst
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.mail_queue;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3. Wachtrij: een lead met een geplande mail komt NIET terug in de belwachtrij
--    zolang de mail niet weg is (claim_next_lead slaat 'mail_gepland' over).
--    Toegepast als aparte migratie v78_claim_next_lead_skip_mail_gepland:
DO $$
DECLARE def text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO def
  FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname = 'claim_next_lead';
  IF def IS NULL THEN RAISE EXCEPTION 'claim_next_lead niet gevonden'; END IF;
  IF def NOT LIKE '%''mail_gepland''%' THEN
    def := replace(def,
      $s$'wil_annuleren','bruto_deal')$s$,
      $s$'wil_annuleren','bruto_deal','mail_gepland')$s$);
    IF def NOT LIKE '%''mail_gepland''%' THEN RAISE EXCEPTION 'statuslijst in claim_next_lead niet gevonden'; END IF;
    EXECUTE def;
  END IF;
END $$;
