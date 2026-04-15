-- =====================================================
-- MIGRATION V10: Enhanced Visibility & RLS for Teams
-- =====================================================

-- 1. Drop old restrictive policy
DROP POLICY IF EXISTS "Leads viewable by assigned or admin" ON public.leads;

-- 2. Create flexible policy for Leads
-- Allows visibility if:
-- A. User is Admin
-- B. Lead is directly assigned to user
-- C. Lead belongs to a list that is assigned to a team the user belongs to
CREATE POLICY "Leads access policy" ON public.leads FOR SELECT 
    USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
        OR assigned_to = auth.uid()
        OR lead_list_id IN (
            SELECT id FROM public.lead_lists 
            WHERE assigned_team_id IN (
                SELECT team_id FROM public.team_members WHERE profile_id = auth.uid()
            )
        )
    );

-- 3. Update UPDATE policy as well to allow claiming leads from team pools
DROP POLICY IF EXISTS "Users update assigned leads" ON public.leads;
CREATE POLICY "Leads update policy" ON public.leads FOR UPDATE
    USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
        OR assigned_to = auth.uid()
        OR (
            assigned_to IS NULL 
            AND lead_list_id IN (
                SELECT id FROM public.lead_lists 
                WHERE assigned_team_id IN (
                    SELECT team_id FROM public.team_members WHERE profile_id = auth.uid()
                )
            )
        )
    )
    WITH CHECK (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
        OR assigned_to = auth.uid()
        OR (
            -- Allow claiming: setting assigned_to to self if it was null
            lead_list_id IN (
                SELECT id FROM public.lead_lists 
                WHERE assigned_team_id IN (
                    SELECT team_id FROM public.team_members WHERE profile_id = auth.uid()
                )
            )
        )
    );

-- 4. Ensure lead_lists visibility for team members
DROP POLICY IF EXISTS "Lead lists visibility" ON public.lead_lists;
CREATE POLICY "Lead lists visibility" ON public.lead_lists FOR SELECT
    USING (
        deleted_at IS NULL 
        AND (
            EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
            OR assigned_team_id IS NULL -- Global lists
            OR assigned_team_id IN (
                SELECT team_id FROM public.team_members WHERE profile_id = auth.uid()
            )
        )
    );
