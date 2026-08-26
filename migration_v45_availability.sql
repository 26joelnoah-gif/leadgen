-- =====================================================
-- MIGRATION V45: Beschikbaarheid / Roosters (GERUND op 2026-08-26 via Claude)
-- Wekelijkse beschikbaarheid per medewerker, in te vullen op /roosters.
-- Iedereen vult zijn eigen beschikbaarheid in (7 dagen, aan/uit + van/tot +
-- notitie). Admin en managers met can_manage_team zien het teamoverzicht
-- van hun organisatie en mogen ook namens iemand anders invullen.
-- =====================================================

CREATE TABLE IF NOT EXISTS public.availability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES public.organizations(id),
  week_start date NOT NULL, -- maandag van de betreffende week
  day_of_week smallint NOT NULL CHECK (day_of_week BETWEEN 0 AND 6), -- 0=maandag ... 6=zondag
  available boolean NOT NULL DEFAULT false,
  start_time time,
  end_time time,
  note text,
  submitted_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, week_start, day_of_week)
);

CREATE INDEX IF NOT EXISTS idx_availability_user_week ON public.availability (user_id, week_start);
CREATE INDEX IF NOT EXISTS idx_availability_org_week ON public.availability (organization_id, week_start);

ALTER TABLE public.availability ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS availability_updated_at ON public.availability;
CREATE TRIGGER availability_updated_at
  BEFORE UPDATE ON public.availability
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- SELECT: eigen rijen, admin, of manager met can_manage_team binnen dezelfde org
DROP POLICY IF EXISTS "availability_select" ON public.availability;
CREATE POLICY "availability_select" ON public.availability
  FOR SELECT USING (
    user_id = auth.uid()
    OR public.is_admin()
    OR (
      organization_id IS NOT DISTINCT FROM public.my_org_id()
      AND EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'manager' AND can_manage_team = true
      )
    )
  );

DROP POLICY IF EXISTS "availability_insert" ON public.availability;
CREATE POLICY "availability_insert" ON public.availability
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    OR public.is_admin()
    OR (
      organization_id IS NOT DISTINCT FROM public.my_org_id()
      AND EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'manager' AND can_manage_team = true
      )
    )
  );

DROP POLICY IF EXISTS "availability_update" ON public.availability;
CREATE POLICY "availability_update" ON public.availability
  FOR UPDATE USING (
    user_id = auth.uid()
    OR public.is_admin()
    OR (
      organization_id IS NOT DISTINCT FROM public.my_org_id()
      AND EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'manager' AND can_manage_team = true
      )
    )
  );

DROP POLICY IF EXISTS "availability_delete" ON public.availability;
CREATE POLICY "availability_delete" ON public.availability
  FOR DELETE USING (
    user_id = auth.uid() OR public.is_admin()
  );
