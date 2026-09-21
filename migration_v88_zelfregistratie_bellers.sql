-- =====================================================
-- LEADGEN v88 — zelfregistratie bellers + betaling via Mollie (21-09-2026)
-- =====================================================
-- Publieke aanmeldpagina /aanmelden: iemand die als beller (medewerker)
-- wil werken maakt zelf een kaal account aan, vinkt aan dat hij als
-- medewerker aan de slag wil, en betaalt eenmalig €50 via Mollie.
-- Pas zodra Mollie de betaling bevestigt (webhook mollie-webhook) wordt
-- het account actief (is_active = true) en kan diegene inloggen.
--
-- Iemand die later zelf klanten/projecten wil aannemen (dus als een soort
-- eigen "admin") regelt dat NIET via deze aanmeldpagina - dat gaat via
-- rechtstreeks contact met de beheerder (noah.ando1@icloud.com). Er is
-- bewust geen zelfbediening-upgrade-knop voor gebouwd.
--
-- Het aanmaken van het account + de betaling loopt volledig via twee
-- Edge Functions (signup-freelancer, mollie-webhook) met de service-role
-- key, nooit via de publieke supabase.auth.signUp vanuit de browser -
-- zo kan de anon key nooit gebruikt worden om zelf een actief account
-- te forceren. Deze migratie voegt daar bovenop nog een DB-trigger toe
-- die is_active/payment_status/paid_at op profiles hard beschermt: alleen
-- een admin of de service-role (Edge Functions) mag die velden wijzigen,
-- nooit de ingelogde gebruiker zelf - anders zou iemand die net een kaal,
-- nog-niet-betaald account heeft simpelweg zichzelf kunnen activeren via
-- een directe API-call (de bestaande profiles_update-policy staat
-- "id = auth.uid()" toe, dus zonder deze trigger zou dat werken).
-- =====================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS signup_source text,
  ADD COLUMN IF NOT EXISTS payment_status text CHECK (payment_status IN ('pending', 'paid')),
  ADD COLUMN IF NOT EXISTS paid_at timestamptz;

COMMENT ON COLUMN public.profiles.signup_source IS 'v88: ''self_service'' voor accounts aangemaakt via /aanmelden, NULL voor door een admin/manager aangemaakte accounts';
COMMENT ON COLUMN public.profiles.payment_status IS 'v88: alleen relevant voor signup_source=self_service. pending tot Mollie de €50 bevestigt, dan paid.';

CREATE TABLE IF NOT EXISTS public.signup_payments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  mollie_payment_id text UNIQUE NOT NULL,
  amount numeric(10,2) NOT NULL DEFAULT 50.00,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'paid', 'failed', 'expired', 'canceled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_signup_payments_profile ON public.signup_payments(profile_id);
CREATE INDEX IF NOT EXISTS idx_signup_payments_mollie_id ON public.signup_payments(mollie_payment_id);

ALTER TABLE public.signup_payments ENABLE ROW LEVEL SECURITY;

-- Alleen admins zien dit in de app (bv. later een overzicht). Het aanmaken/
-- bijwerken loopt uitsluitend via de Edge Functions met de service-role key,
-- die RLS toch al bypassen - er is bewust geen INSERT/UPDATE-policy voor
-- ingelogde gebruikers.
DROP POLICY IF EXISTS "signup_payments_select_admin" ON public.signup_payments;
CREATE POLICY "signup_payments_select_admin" ON public.signup_payments
  FOR SELECT USING (public.is_admin());

-- Hergebruikt de generieke update_updated_at() uit v11 (organizations).
DROP TRIGGER IF EXISTS signup_payments_updated_at ON public.signup_payments;
CREATE TRIGGER signup_payments_updated_at
  BEFORE UPDATE ON public.signup_payments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Beveiligingstrigger: is_active / payment_status / paid_at op profiles
-- mogen alleen wijzigen door een admin (public.is_admin()) of door een
-- Edge Function met de service-role key. Een gewone ingelogde gebruiker
-- (inclusief een self-service account dat nog niet betaald heeft) kan
-- dus nooit zichzelf activeren via een directe update-call, ook al staat
-- de bestaande profiles_update-policy "id = auth.uid()" toe.
CREATE OR REPLACE FUNCTION public.tr_protect_payment_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF (NEW.is_active IS DISTINCT FROM OLD.is_active
      OR NEW.payment_status IS DISTINCT FROM OLD.payment_status
      OR NEW.paid_at IS DISTINCT FROM OLD.paid_at)
     AND NOT public.is_admin()
     AND auth.role() IS DISTINCT FROM 'service_role' THEN
    NEW.is_active := OLD.is_active;
    NEW.payment_status := OLD.payment_status;
    NEW.paid_at := OLD.paid_at;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS tr_protect_payment_fields ON public.profiles;
CREATE TRIGGER tr_protect_payment_fields
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.tr_protect_payment_fields();

-- =====================================================
-- KLAAR. Geen wijziging aan handle_new_user() nodig: self-service accounts
-- worden NIET via de publieke supabase.auth.signUp aangemaakt, maar via de
-- Edge Function signup-freelancer (admin.auth.admin.createUser), die meteen
-- daarna zelf is_active=false, payment_status='pending' en signup_source
-- zet met de service-role key. Bestaande door-admin-aangemaakte accounts
-- (Admin.jsx, Manager.jsx, NewProjectWizard) blijven ongewijzigd werken:
-- signup_source/payment_status blijven daar NULL en is_active blijft
-- gewoon standaard true.
-- =====================================================
