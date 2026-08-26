-- =====================================================
-- MIGRATION V46: Roosters - zichtbaarheid aangescherpt/verruimd (GERUND op 2026-08-26 via Claude)
-- Wens Noah: iedereen ziet alleen zijn eigen rooster; management (elke
-- manager), admin en recruitment zien de roosters van iedereen; een andere
-- organisatie mag nooit roosters van deze organisatie zien (ook admin niet
-- org-overstijgend). Eerdere versie beperkte het teamoverzicht tot managers
-- met can_manage_team en liet admin org-overstijgend meelezen.
-- =====================================================

DROP POLICY IF EXISTS "availability_select" ON public.availability;
CREATE POLICY "availability_select" ON public.availability
  FOR SELECT USING (
    organization_id IS NOT DISTINCT FROM public.my_org_id()
    AND (
      user_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role IN ('admin', 'manager', 'recruiter')
      )
    )
  );

-- Invullen namens iemand anders blijft beperkt tot admin en managers die ook
-- daadwerkelijk het team mogen beheren (can_manage_team) - alleen "zien" is
-- verruimd naar alle managers + recruitment, niet het bewerken van andermans rij.
DROP POLICY IF EXISTS "availability_insert" ON public.availability;
CREATE POLICY "availability_insert" ON public.availability
  FOR INSERT WITH CHECK (
    organization_id IS NOT DISTINCT FROM public.my_org_id()
    AND (
      user_id = auth.uid()
      OR public.is_admin()
      OR EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'manager' AND can_manage_team = true
      )
    )
  );

DROP POLICY IF EXISTS "availability_update" ON public.availability;
CREATE POLICY "availability_update" ON public.availability
  FOR UPDATE USING (
    organization_id IS NOT DISTINCT FROM public.my_org_id()
    AND (
      user_id = auth.uid()
      OR public.is_admin()
      OR EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'manager' AND can_manage_team = true
      )
    )
  );

DROP POLICY IF EXISTS "availability_delete" ON public.availability;
CREATE POLICY "availability_delete" ON public.availability
  FOR DELETE USING (
    organization_id IS NOT DISTINCT FROM public.my_org_id()
    AND (user_id = auth.uid() OR public.is_admin())
  );
