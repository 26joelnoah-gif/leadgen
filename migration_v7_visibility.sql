-- =====================================================
-- MIGRATION V7: Team-aware Lead Visibility & Dynamic Routing
-- =====================================================

-- 1. VIEW FOR TEAM-AWARE LEAD VISIBILITY
-- This view shows leads that are either assigned directly to an agent
-- or belong to a list assigned to a team the agent is a member of.
CREATE OR REPLACE VIEW public.vw_leads_with_teams AS
SELECT 
    l.*,
    ll.assigned_team_id
FROM public.leads l
LEFT JOIN public.lead_lists ll ON l.lead_list_id = ll.id;

-- 2. HELPER FUNCTION TO CHECK LEAD ACCESS
CREATE OR REPLACE FUNCTION public.can_access_lead(p_lead_id UUID, p_user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.leads l
        LEFT JOIN public.lead_lists ll ON l.lead_list_id = ll.id
        WHERE l.id = p_lead_id
        AND (
            l.assigned_to = p_user_id 
            OR l.created_by = p_user_id
            OR EXISTS (
                SELECT 1 FROM public.team_members tm
                WHERE tm.team_id = ll.assigned_team_id
                AND tm.profile_id = p_user_id
            )
            OR EXISTS (
                SELECT 1 FROM public.profiles p
                WHERE p.id = p_user_id AND p.role = 'admin'
            )
        )
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
