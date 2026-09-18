-- LEADGEN v78 (2026-09-16): beller met importrecht kan zelf een nieuwe leadlijst aanmaken.
-- Probleem: ImportLeadsModal doet insert().select().single() op lead_lists. Voor een niet-admin
-- faalde dat met "new row violates row-level security policy", omdat de SELECT-policy alleen via
-- my_managed_list_ids()/my_list_ids() kijkt (stable functies) en die de zojuist ingevoegde rij
-- in dezelfde statement nog niet zien.
-- Fix: lijsten die je zelf aanmaakt zijn altijd direct zichtbaar (created_by = auth.uid()).
-- UITGEVOERD op 16-09-2026 via Supabase MCP (migratie v78_lead_lists_select_own_created), getest als Corne.

drop policy if exists lead_lists_select on public.lead_lists;
create policy lead_lists_select on public.lead_lists
  for select using (
    (not (organization_id is distinct from public.my_org_id()))
    and (
      public.is_admin()
      or created_by = (select auth.uid())
      or id = any (public.my_list_ids())
      or id = any (public.my_managed_list_ids())
    )
  );
