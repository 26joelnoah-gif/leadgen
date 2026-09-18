-- ============================================================================
-- v83 (2026-09-18): Mailinglijst - mails automatisch later versturen
-- TOEGEPAST op zboyxwwrbtpjnlgquhzs als v81_mail_queue_send_at (18-09-2026).
-- ----------------------------------------------------------------------------
-- De beller kiest in de Mailingservice-popup een moment ("Later versturen").
-- Dat komt in mail_queue.send_at. Een pg_cron-job roept elke 5 minuten de
-- Edge Function mailqueue-runner aan; die verstuurt alle open rijen waarvan
-- send_at voorbij is, maar ALLEEN op werkdagen tussen 08:00 en 18:00 (NL).
-- Buiten dat venster blijft alles staan tot de eerstvolgende werkdag.
-- send_at = null betekent: handmatig versturen vanuit de Mailinglijst (v78).
--
-- Mislukt het versturen (geen geldig adres, bron niet bereikbaar, al gemaild),
-- dan gaat de rij op status 'fout' met de reden. De lead blijft op
-- 'mail_gepland' en de rij blijft zichtbaar in de Mailinglijst, zodat iemand
-- hem kan herstellen ("Opnieuw") of verwijderen. Niets verdwijnt stilletjes.
--
-- Beveiliging van de runner: geen ingelogde gebruiker, maar een sleutel in
-- Supabase Vault (mailqueue_cron_key). De cron stuurt hem mee als header,
-- de Edge Function leest hem via public.mailqueue_cron_key() (alleen
-- service_role) en vergelijkt. Geen handmatige secret nodig.
-- ============================================================================

-- 1. Kolommen
ALTER TABLE public.mail_queue
  ADD COLUMN IF NOT EXISTS send_at         timestamptz,
  ADD COLUMN IF NOT EXISTS attempts        integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_error      text;

ALTER TABLE public.mail_queue DROP CONSTRAINT IF EXISTS mail_queue_status_check;
ALTER TABLE public.mail_queue ADD CONSTRAINT mail_queue_status_check
  CHECK (status IN ('open','verzonden','fout'));

CREATE INDEX IF NOT EXISTS mail_queue_due ON public.mail_queue (send_at) WHERE status = 'open' AND send_at IS NOT NULL;

-- 2. RLS: een rij met status 'fout' mag ook aangepast (opnieuw op 'open') en
--    verwijderd worden door de eigenaar, admin of manager.
DROP POLICY IF EXISTS mail_queue_update ON public.mail_queue;
CREATE POLICY mail_queue_update ON public.mail_queue
  FOR UPDATE TO authenticated
  USING (status IN ('open','fout') AND public.mail_queue_kan_beheren(agent_id, campaign_id))
  WITH CHECK (status = 'open');

DROP POLICY IF EXISTS mail_queue_delete ON public.mail_queue;
CREATE POLICY mail_queue_delete ON public.mail_queue
  FOR DELETE TO authenticated
  USING (status IN ('open','fout') AND public.mail_queue_kan_beheren(agent_id, campaign_id));

-- 3. Sleutel voor de runner in Vault (eenmalig aanmaken)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'mailqueue_cron_key') THEN
    PERFORM vault.create_secret(encode(gen_random_bytes(32), 'hex'), 'mailqueue_cron_key', 'LEADGEN v83: sleutel waarmee pg_cron de Edge Function mailqueue-runner aanroept');
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.mailqueue_cron_key()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, vault AS $$
  SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'mailqueue_cron_key' LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.mailqueue_cron_key() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mailqueue_cron_key() TO service_role, postgres;

-- 4. De cron roept de runner aan (alleen als er iets klaarstaat, scheelt calls)
CREATE OR REPLACE FUNCTION public.mail_queue_kick()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, vault AS $$
DECLARE
  sleutel text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.mail_queue WHERE status = 'open' AND send_at IS NOT NULL AND send_at <= now()) THEN
    RETURN;
  END IF;
  SELECT public.mailqueue_cron_key() INTO sleutel;
  IF sleutel IS NULL THEN RAISE WARNING 'mail_queue_kick: geen sleutel in vault'; RETURN; END IF;
  PERFORM net.http_post(
    url := 'https://zboyxwwrbtpjnlgquhzs.supabase.co/functions/v1/mailqueue-runner',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-mailqueue-key', sleutel),
    body := jsonb_build_object('bron', 'pg_cron'),
    timeout_milliseconds := 120000);
END $$;
REVOKE ALL ON FUNCTION public.mail_queue_kick() FROM PUBLIC, anon, authenticated;

-- Elke 5 minuten, ma-vr, 06:00-16:59 UTC (dekt 08:00-18:00 NL in zomer en
-- winter ruim); de runner zelf controleert het exacte NL-venster.
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'leadgen-mailqueue-runner';
SELECT cron.schedule('leadgen-mailqueue-runner', '*/5 6-16 * * 1-5', $$SELECT public.mail_queue_kick()$$);
