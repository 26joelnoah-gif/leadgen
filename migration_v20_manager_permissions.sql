-- =====================================================
-- MIGRATION V20: Rechten per manager
--
-- De admin bepaalt per manager wat hij mag zien en doen
-- (instelbaar via het "Projecten van ..."-scherm op Admin → Team):
--   can_manage_leads  (v18)  leads importeren/bewerken in eigen projecten
--   can_view_rates           projecttarieven + berekende kosten per beller zien
--   can_manage_team          bellers aanmaken en toewijzen aan projecten
--   can_export_data          CSV-export op het manager-dashboard
--   can_edit_flows           dispositie-flows aanpassen (gelden voor iedereen!)
--   kpi_only                 alleen KPI's/uitkomsten zien, geen individuele
--                            gesprekken of leadgegevens
-- Standaardwaarden zo gekozen dat bestaande managers niets verliezen
-- (team + export aan) en niets extra's krijgen (tarieven/flows uit).
-- =====================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS can_view_rates  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_manage_team boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS can_export_data boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS can_edit_flows  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS kpi_only        boolean NOT NULL DEFAULT false;

-- Flows: naast admins mogen ook managers met can_edit_flows de
-- flow_settings wijzigen. (SELECT stond al open voor iedereen.)
DROP POLICY IF EXISTS "Only admins manage settings" ON public.flow_settings;
CREATE POLICY "Admins and permitted managers manage settings" ON public.flow_settings
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND (role = 'admin' OR (role = 'manager' AND can_edit_flows))
    )
  );
