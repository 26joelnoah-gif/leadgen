-- LEADGEN v95 (2026-09-22): bellers mogen voortaan zelf het belscript en de
-- projectinfo van hun eigen project(en) bewerken (was admin/manager-only).
-- Reden: Noah wil per project een los tabblad kunnen neerzetten dat de
-- beller ook zelf mag aanpassen. Alleen geldig binnen het project(en) waar
-- de beller daadwerkelijk aan hangt (via een lead_list in my_list_ids()) -
-- geen wereldwijde schrijfrechten op andermans briefings.
DROP POLICY IF EXISTS campaign_briefings_write ON public.campaign_briefings;
CREATE POLICY campaign_briefings_write ON public.campaign_briefings FOR ALL TO authenticated USING (
  is_admin()
  OR EXISTS (
    SELECT 1 FROM public.campaign_managers cm
    WHERE cm.campaign_id = campaign_briefings.campaign_id AND cm.manager_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.lead_lists ll
    WHERE ll.campaign_id = campaign_briefings.campaign_id AND ll.id = ANY (public.my_list_ids())
  )
) WITH CHECK (
  is_admin()
  OR EXISTS (
    SELECT 1 FROM public.campaign_managers cm
    WHERE cm.campaign_id = campaign_briefings.campaign_id AND cm.manager_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.lead_lists ll
    WHERE ll.campaign_id = campaign_briefings.campaign_id AND ll.id = ANY (public.my_list_ids())
  )
);
