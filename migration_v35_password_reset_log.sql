-- =====================================================
-- MIGRATION V35: audit-log voor wachtwoordwijzigingen
--
-- Wachtwoorden worden gezet via de Edge Function "manage-password"
-- (service-role, auth.admin.updateUserById - de enige toegestane manier,
-- auth.users kan niet via SQL/migratie beschreven worden). Deze tabel
-- logt wie wanneer wiens wachtwoord heeft gewijzigd; alleen admins kunnen
-- de log lezen. Alleen de Edge Function (service role) schrijft erin -
-- er is bewust geen insert-policy voor 'authenticated'.
-- =====================================================

CREATE TABLE IF NOT EXISTS public.password_reset_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  target_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  target_email text,
  method text NOT NULL DEFAULT 'manual', -- 'manual' | 'generated' | 'self'
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.password_reset_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS password_reset_log_select ON public.password_reset_log;
CREATE POLICY password_reset_log_select ON public.password_reset_log
  FOR SELECT USING (public.is_admin());
