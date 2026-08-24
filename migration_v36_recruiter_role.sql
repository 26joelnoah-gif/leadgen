-- =====================================================
-- MIGRATION V36: Recruiter-rol + sollicitanten-tracking
-- (GERUND op 2026-08-24 via Claude/Cowork op project zboyxwwrbtpjnlgquhzs
--  - maar vertrouw dit comment nooit blind: check pg_policies/information_schema)
--
-- Voegt een lichte 'recruiter'-rol toe die volledig hergebruikt wat er al
-- staat: campaigns > lead_lists > leads, call_logs, flow_settings/TBA-logica.
-- Een sollicitant IS een lead (name/phone/email/function/notes/lead_source
-- passen prima), een sollicitatieproject IS een campagne met type
-- 'recruitment'. Alle RLS (my_list_ids/my_managed_list_ids/claim_next_lead/
-- call_logs) is al role-agnostic (leunt op assigned_to/created_by/
-- campaign_managers), dus daar hoefde niets aan te veranderen.
--
-- Bij het aanmaken van een recruiter-account (Admin.jsx handleAddEmployee)
-- wordt automatisch één campagne (type='recruitment') + één lead_list
-- ('Sollicitanten', assigned_to = de recruiter) aangemaakt, zodat de
-- recruiter meteen zelf sollicitanten kan toevoegen en bellen.
-- =====================================================

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (role = ANY (ARRAY['employee'::text, 'manager'::text, 'admin'::text, 'recruiter'::text]));

ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'sales';
ALTER TABLE public.campaigns DROP CONSTRAINT IF EXISTS campaigns_type_check;
ALTER TABLE public.campaigns ADD CONSTRAINT campaigns_type_check
  CHECK (type = ANY (ARRAY['sales'::text, 'recruitment'::text]));
