-- =====================================================
-- MIGRATION V6: Advanced Lead Flow & Team Management
-- =====================================================

-- 1. TEAM MANAGEMENT
CREATE TABLE IF NOT EXISTS public.teams (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
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

-- 2. DYNAMIC FLOW SETTINGS
CREATE TABLE IF NOT EXISTS public.flow_settings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    disposition_type TEXT NOT NULL UNIQUE, -- e.g. 'deal', 'afspraak', 'wrong_info'
    target_list_id UUID REFERENCES public.lead_lists(id),
    target_list_name TEXT, -- Fallback used if target_list_id is null (dynamic creation)
    auto_assign_to TEXT DEFAULT 'none',-- 'none', 'agent', 'admin', 'team'
    auto_assign_team_id UUID REFERENCES public.teams(id),
    append_agent_note BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. EXPAND LEAD_LISTS TO SUPPORT TEAMS
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'lead_lists' AND COLUMN_NAME = 'assigned_team_id') THEN
        ALTER TABLE public.lead_lists ADD COLUMN assigned_team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL;
    END IF;
END $$;

-- 4. SEED INITIAL FLOW RULES
INSERT INTO public.flow_settings (disposition_type, target_list_name, auto_assign_to, append_agent_note)
VALUES 
('deal', '💰 DEALS & AFSPRAKEN', 'none', true),
('afspraak_gemaakt', '💰 DEALS & AFSPRAKEN', 'none', true),
('verkeerde_info', '🚫 VERKEERDE INFO', 'none', false),
('later_bellen', 'LATER BELLEN', 'agent', true),
('geen_interesse', '📉 Geen interesse', 'none', false)
ON CONFLICT (disposition_type) DO NOTHING;

-- 5. ACCESS POLICIES
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flow_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teams viewable by all" ON public.teams FOR SELECT USING (true);
CREATE POLICY "Admins manage teams" ON public.teams FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Members viewable by all" ON public.team_members FOR SELECT USING (true);
CREATE POLICY "Admins manage members" ON public.team_members FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Settings viewable by all" ON public.flow_settings FOR SELECT USING (true);
CREATE POLICY "Only admins manage settings" ON public.flow_settings FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));
