-- =====================================================
-- v126 (2026-10-05): e-mailadres/naam van een account wijzigen door admin
-- De wijziging zelf gaat via de Edge Function manage-password (action
-- "account", service role), want auth.users is niet via SQL te bewerken.
-- Hier alleen: een kolom in het log om vast te leggen WAT er veranderde.
-- method krijgt de waarde 'account'.
-- =====================================================

ALTER TABLE public.password_reset_log
  ADD COLUMN IF NOT EXISTS details text;

COMMENT ON COLUMN public.password_reset_log.details IS
  'v126: bij method=account: welke velden veranderden (e-mail/naam, oud -> nieuw)';
