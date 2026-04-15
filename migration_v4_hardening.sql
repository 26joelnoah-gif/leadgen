-- =====================================================
-- MIGRATION V4: Backend Hardening & Business Logic
-- Run this SQL in your Supabase SQL Editor
-- =====================================================

-- 1. Ensure all leads have a valid phone format (basic check)
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_phone_length_check;
ALTER TABLE public.leads ADD CONSTRAINT leads_phone_length_check CHECK (char_length(phone) >= 8);

-- 2. Ensure payout periods are logical
ALTER TABLE public.payouts DROP CONSTRAINT IF EXISTS payouts_period_valid;
ALTER TABLE public.payouts ADD CONSTRAINT payouts_period_valid CHECK (period_end >= period_start);

-- 3. AUTOMATIC ACTIVITY LOGGING (Triggers)
-- This ensures that status changes are ALWAYS logged, even if the frontend fails.

CREATE OR REPLACE FUNCTION public.log_lead_status_change()
RETURNS TRIGGER AS $$
BEGIN
    IF (OLD.status IS DISTINCT FROM NEW.status) THEN
        INSERT INTO public.activities (lead_id, user_id, action, notes, created_at)
        VALUES (
            NEW.id,
            COALESCE(auth.uid(), NEW.assigned_to), -- Fallback to assigned user if systemic change
            'status_change',
            'Status automatisch gewijzigd van ' || OLD.status || ' naar ' || NEW.status,
            NOW()
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_log_lead_status_change ON public.leads;
CREATE TRIGGER tr_log_lead_status_change
    AFTER UPDATE OF status ON public.leads
    FOR EACH ROW
    EXECUTE FUNCTION public.log_lead_status_change();

-- 4. PERFORMANCE VIEWS
-- Aggregated view for the leaderboard and reports

CREATE OR REPLACE VIEW public.vw_agent_performance AS
SELECT 
    p.id as user_id,
    p.full_name,
    COUNT(a.id) FILTER (WHERE a.action = 'call') as total_calls,
    COUNT(l.id) FILTER (WHERE l.status = 'afspraak_gemaakt') as total_appointments,
    COUNT(l.id) FILTER (WHERE l.status = 'deal') as total_deals,
    DATE_TRUNC('day', a.created_at) as activity_date
FROM public.profiles p
LEFT JOIN public.activities a ON a.user_id = p.id
LEFT JOIN public.leads l ON l.assigned_to = p.id
GROUP BY p.id, p.full_name, DATE_TRUNC('day', a.created_at);

-- 5. SYSTEM SETTINGS TABLE (More 'correct' than localStorage)
CREATE TABLE IF NOT EXISTS public.system_settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    updated_by UUID REFERENCES public.profiles(id)
);

-- Seed with default settings if empty
INSERT INTO public.system_settings (key, value)
VALUES ('global_config', '{"deal_value": 50, "appointment_value": 25, "monthly_target": 20}')
ON CONFLICT (key) DO NOTHING;

-- 6. RLS FOR SYSTEM SETTINGS
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "System settings are viewable by all" ON public.system_settings
    FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Only admins can update system settings" ON public.system_settings
    FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- 7. CONSISTENCY CHECK: Ensure all leads have lead_list_id slot
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'leads' AND COLUMN_NAME = 'lead_list_id') THEN
        ALTER TABLE public.leads ADD COLUMN lead_list_id UUID REFERENCES public.lead_lists(id) ON DELETE SET NULL;
    END IF;
END $$;
