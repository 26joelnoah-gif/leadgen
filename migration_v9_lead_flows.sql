-- =====================================================
-- MIGRATION V9: Lead Flow Automation
-- =====================================================

-- 1. Create Team Tables (if missing)
CREATE TABLE IF NOT EXISTS public.teams (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    created_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.team_members (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    team_id UUID REFERENCES public.teams(id) ON DELETE CASCADE,
    profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(team_id, profile_id)
);

-- 2. Create Flow Settings Table
CREATE TABLE IF NOT EXISTS public.flow_settings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    disposition_type TEXT NOT NULL UNIQUE, -- e.g. 'geen_gehoor', 'geen_interesse'
    target_list_id UUID REFERENCES public.lead_lists(id) ON DELETE SET NULL,
    target_list_name TEXT, -- cache name for UI
    auto_assign_to TEXT DEFAULT 'none', -- 'none', 'agent', 'admin', 'team'
    append_agent_note BOOLEAN DEFAULT TRUE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Initial Flow Data
INSERT INTO public.flow_settings (disposition_type, target_list_name, auto_assign_to)
VALUES 
    ('geen_gehoor', 'Retry List', 'none'),
    ('later_bellen', 'Callback Queue', 'agent'),
    ('verkeerd_nummer', 'Archive / Junk', 'none'),
    ('geen_interesse', 'Closed - Negative', 'none'),
    ('geen_interesse_niet_bellen', 'Blacklist', 'none')
ON CONFLICT (disposition_type) DO NOTHING;

-- 4. Automation Trigger Function
CREATE OR REPLACE FUNCTION public.handle_lead_flow()
RETURNS TRIGGER AS $$
DECLARE
    flow_rule RECORD;
BEGIN
    -- Only trigger if status has changed
    IF (OLD.status IS DISTINCT FROM NEW.status) THEN
        -- Find a rule for this status
        SELECT * INTO flow_rule FROM public.flow_settings 
        WHERE disposition_type = NEW.status AND is_active = TRUE;

        IF FOUND THEN
            -- A. Move to target list if defined
            IF flow_rule.target_list_id IS NOT NULL THEN
                NEW.lead_list_id = flow_rule.target_list_id;
            END IF;

            -- B. Handle Auto-Assignment
            IF flow_rule.auto_assign_to = 'none' THEN
                NEW.assigned_to = NULL;
            ELSIF flow_rule.auto_assign_to = 'agent' THEN
                -- Keep current assigned_to (usually the caller)
                NULL; 
            ELSIF flow_rule.auto_assign_to = 'admin' THEN
                -- Reset assignment for admin review pool
                NEW.assigned_to = NULL;
            END IF;
            
            -- C. Log the automated move in activities
            INSERT INTO public.activities (lead_id, user_id, action, notes)
            VALUES (NEW.id, COALESCE(auth.uid(), NEW.assigned_to), 'flow_move', 'Automatisch verplaatst naar: ' || COALESCE(flow_rule.target_list_name, 'Systeem Lijst'));
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Attach Trigger
DROP TRIGGER IF EXISTS tr_lead_flow_automation ON public.leads;
CREATE TRIGGER tr_lead_flow_automation 
    BEFORE UPDATE ON public.leads 
    FOR EACH ROW 
    EXECUTE FUNCTION public.handle_lead_flow();
