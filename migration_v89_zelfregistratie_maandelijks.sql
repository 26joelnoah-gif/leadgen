-- =====================================================
-- LEADGEN v89 — zelfregistratie-betaling wordt maandelijks/opzegbaar
-- (correctie op v88, zelfde dag: Noah bedoelde €50 per maand, niet eenmalig)
-- =====================================================
-- Mollie recurring werkt met een customer + een eerste betaling
-- (sequenceType 'first') die een mandaat zet, daarna een subscription die
-- elke maand automatisch afschrijft. Opzeggen = admin zet iemand inactief
-- in Admin > Team (bestaande knop), wat nu ook de Mollie-subscription
-- annuleert via de nieuwe Edge Function cancel-subscription, zodat er
-- nooit doorbetaald wordt aan iemand die geen toegang meer heeft.
-- =====================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS mollie_customer_id text,
  ADD COLUMN IF NOT EXISTS mollie_subscription_id text;

CREATE INDEX IF NOT EXISTS idx_profiles_mollie_customer ON public.profiles(mollie_customer_id);

ALTER TABLE public.signup_payments
  ADD COLUMN IF NOT EXISTS sequence_type text NOT NULL DEFAULT 'first' CHECK (sequence_type IN ('first', 'recurring'));

COMMENT ON COLUMN public.profiles.mollie_customer_id IS 'v89: Mollie customer id, gebruikt om latere (recurring) webhook-calls terug te koppelen aan het profiel';
COMMENT ON COLUMN public.profiles.mollie_subscription_id IS 'v89: actieve Mollie subscription (EUR 50/maand). NULL = geen actief abonnement (nog niet gestart of opgezegd).';

-- =====================================================
-- KLAAR. tr_protect_payment_fields (v88) blijft ongewijzigd van toepassing:
-- mollie_customer_id/mollie_subscription_id zijn NIET in die trigger
-- opgenomen (alleen is_active/payment_status/paid_at), dus die worden
-- gewoon door de Edge Functions (service-role) bijgewerkt zoals de rest
-- van het profiel.
-- =====================================================
