-- =====================================================
-- MIGRATION V18: Manager-rol + projectmanagers
-- (GERUND op 2026-08-21 via Claude)
--
-- Een manager wordt door de admin aan één of meer projecten
-- (lead_lists) gekoppeld en ziet alleen dáárvan de bellers,
-- gesprekken en statistieken. Een manager kan bellers
-- (employees) toevoegen en toewijzen aan zijn projectlijsten.
-- De admin kan per manager "leads beheren" aanzetten
-- (profiles.can_manage_leads) zodat de manager ook leads mag
-- importeren in zijn eigen projecten.
--
-- Rolwijziging (bijv. employee -> manager) gebeurt door de
-- admin via profiles.role; nieuwe signups blijven ALTIJD
-- 'employee' (handle_new_user blijft ongemoeid, dus geen
-- privilege-escalatie via signup-metadata).
-- =====================================================

-- 1. Rol 'manager' toestaan
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (role = ANY (ARRAY['employee'::text, 'manager'::text, 'admin'::text]));

-- 2. Per-manager vlag: mag leads beheren/importeren in eigen projecten
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS can_manage_leads boolean NOT NULL DEFAULT false;

-- 3. Koppeltabel manager <-> project (lead_list)
CREATE TABLE IF NOT EXISTS public.project_managers (
  lead_list_id uuid NOT NULL REFERENCES public.lead_lists(id) ON DELETE CASCADE,
  manager_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (lead_list_id, manager_id)
);

ALTER TABLE public.project_managers ENABLE ROW LEVEL SECURITY;

-- Iedereen in de org mag koppelingen zien (nodig voor admin-UI en manager-dashboard);
-- alleen admin mag koppelen/ontkoppelen.
DROP POLICY IF EXISTS "project_managers_select" ON public.project_managers;
CREATE POLICY "project_managers_select" ON public.project_managers
  FOR SELECT USING (
    manager_id IN (
      SELECT id FROM public.profiles
      WHERE organization_id IS NOT DISTINCT FROM public.my_org_id()
    )
  );

DROP POLICY IF EXISTS "project_managers_insert" ON public.project_managers;
CREATE POLICY "project_managers_insert" ON public.project_managers
  FOR INSERT WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "project_managers_delete" ON public.project_managers;
CREATE POLICY "project_managers_delete" ON public.project_managers
  FOR DELETE USING (public.is_admin());

-- 4. Helper: lijsten die ik als manager beheer
CREATE OR REPLACE FUNCTION public.my_managed_list_ids()
RETURNS uuid[]
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$ SELECT COALESCE(array_agg(lead_list_id), '{}') FROM public.project_managers WHERE manager_id = auth.uid(); $$;

-- 5. RLS: manager ziet en beheert zijn eigen projectlijsten
DROP POLICY IF EXISTS "lead_lists_select" ON public.lead_lists;
CREATE POLICY "lead_lists_select" ON public.lead_lists
  FOR SELECT USING (
    organization_id IS NOT DISTINCT FROM public.my_org_id()
    AND (
      public.is_admin()
      OR created_by = auth.uid()
      OR assigned_to = auth.uid()
      OR assigned_team_id = ANY (public.my_team_ids())
      OR id = ANY (public.my_managed_list_ids())
    )
  );

-- Manager mag zijn lijsten updaten (o.a. beller toewijzen via assigned_to)
DROP POLICY IF EXISTS "lead_lists_update" ON public.lead_lists;
CREATE POLICY "lead_lists_update" ON public.lead_lists
  FOR UPDATE USING (
    organization_id IS NOT DISTINCT FROM public.my_org_id()
    AND (
      public.is_admin()
      OR created_by = auth.uid()
      OR assigned_to = auth.uid()
      OR id = ANY (public.my_managed_list_ids())
    )
  );

-- 6. RLS: manager ziet leads in zijn projecten (en mag ze bewerken
--    — de UI laat bewerken alleen toe als can_manage_leads aan staat)
DROP POLICY IF EXISTS "leads_select" ON public.leads;
CREATE POLICY "leads_select" ON public.leads
  FOR SELECT USING (
    organization_id IS NOT DISTINCT FROM public.my_org_id()
    AND (
      public.is_admin()
      OR assigned_to = auth.uid()
      OR created_by = auth.uid()
      OR lead_list_id = ANY (public.my_list_ids())
      OR lead_list_id = ANY (public.my_managed_list_ids())
    )
  );

DROP POLICY IF EXISTS "leads_update" ON public.leads;
CREATE POLICY "leads_update" ON public.leads
  FOR UPDATE USING (
    organization_id IS NOT DISTINCT FROM public.my_org_id()
    AND (
      public.is_admin()
      OR assigned_to = auth.uid()
      OR created_by = auth.uid()
      OR lead_list_id = ANY (public.my_list_ids())
      OR lead_list_id = ANY (public.my_managed_list_ids())
    )
  )
  WITH CHECK (organization_id IS NOT DISTINCT FROM public.my_org_id());
