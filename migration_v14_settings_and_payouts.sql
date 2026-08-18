-- =====================================================
-- LEADGEN v14 — tarieven naar de database + payouts-policies
-- =====================================================
-- Twee problemen:
--
-- 1. De uitbetalingstarieven (deal, afspraak, maanddoel) stonden in
--    localStorage. Die zijn per browser, dus jij en je beller konden
--    verschillende bedragen zien voor hetzelfde werk, en na het wissen
--    van je browsergegevens stonden ze weer op de standaardwaarde.
--
-- 2. public.payouts had RLS aan met NUL policies, net als teams,
--    team_members en flow_settings voor v12. De Payouts-pagina kon
--    daardoor niets lezen of schrijven.
-- =====================================================

-- -----------------------------------------------------
-- 1. INSTELLINGEN PER ORGANISATIE
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.org_settings (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  deal_value        NUMERIC(10,2) NOT NULL DEFAULT 50  CHECK (deal_value >= 0),
  appointment_value NUMERIC(10,2) NOT NULL DEFAULT 15  CHECK (appointment_value >= 0),
  monthly_target    INT           NOT NULL DEFAULT 10  CHECK (monthly_target >= 0),
  updated_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_by        UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);

-- Eén rij per organisatie. Zolang er nog geen organisaties zijn draait
-- alles op organization_id NULL; de partiële index zorgt dat ook daar
-- maar één rij van kan bestaan.
CREATE UNIQUE INDEX IF NOT EXISTS org_settings_org_uniq
  ON public.org_settings (organization_id)
  WHERE organization_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS org_settings_singleton_uniq
  ON public.org_settings ((organization_id IS NULL))
  WHERE organization_id IS NULL;

-- Startrij met de waarden die tot nu toe de standaard waren.
INSERT INTO public.org_settings (organization_id, deal_value, appointment_value, monthly_target)
SELECT NULL, 50, 15, 10
WHERE NOT EXISTS (SELECT 1 FROM public.org_settings WHERE organization_id IS NULL);

DROP TRIGGER IF EXISTS org_settings_updated_at ON public.org_settings;
CREATE TRIGGER org_settings_updated_at
  BEFORE UPDATE ON public.org_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.org_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS org_settings_select ON public.org_settings;
DROP POLICY IF EXISTS org_settings_insert ON public.org_settings;
DROP POLICY IF EXISTS org_settings_update ON public.org_settings;

-- Iedereen in de organisatie mag de tarieven lezen: een beller moet
-- kunnen zien waar zijn verdiensten op gebaseerd zijn.
CREATE POLICY org_settings_select ON public.org_settings
  FOR SELECT TO authenticated
  USING (organization_id IS NOT DISTINCT FROM public.my_org_id());

-- Alleen een admin mag ze wijzigen.
CREATE POLICY org_settings_insert ON public.org_settings
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin()
    AND organization_id IS NOT DISTINCT FROM public.my_org_id()
  );

CREATE POLICY org_settings_update ON public.org_settings
  FOR UPDATE TO authenticated
  USING (
    public.is_admin()
    AND organization_id IS NOT DISTINCT FROM public.my_org_id()
  )
  WITH CHECK (organization_id IS NOT DISTINCT FROM public.my_org_id());

-- -----------------------------------------------------
-- 2. PAYOUTS — had RLS aan zonder enkele policy
-- -----------------------------------------------------
ALTER TABLE public.payouts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS payouts_select ON public.payouts;
DROP POLICY IF EXISTS payouts_write  ON public.payouts;

-- Een medewerker ziet zijn eigen uitbetalingen, een admin die van het
-- hele team.
CREATE POLICY payouts_select ON public.payouts
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

-- Aanmaken, aanpassen en afvinken is voorbehouden aan de admin:
-- niemand keurt zijn eigen uitbetaling goed.
CREATE POLICY payouts_write ON public.payouts
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE INDEX IF NOT EXISTS payouts_user_period_idx
  ON public.payouts (user_id, period_start DESC);
