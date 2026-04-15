-- =====================================================
-- LEADGEN - MASTER DATABASE SCHEMA
-- This file contains the complete, idempotent setup.
-- =====================================================

-- 0. Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. PROFILES
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
    email TEXT NOT NULL,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'employee' CHECK (role IN ('employee', 'admin')),
    show_appointments_in_earnings BOOLEAN DEFAULT TRUE,
    show_deals_in_earnings BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. CHAT CHANNELS
CREATE TABLE IF NOT EXISTS public.chat_channels (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. LEAD LISTS
CREATE TABLE IF NOT EXISTS public.lead_lists (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. LEADS
CREATE TABLE IF NOT EXISTS public.leads (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    phone TEXT NOT NULL CHECK (char_length(phone) >= 8),
    email TEXT,
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'new' CHECK (status IN (
        'new', 'later_bellen', 'mailen', 'voicemail',
        'terugbelafspraak', 'geen_gehoor', 'verkeerd_nummer',
        'geen_interesse', 'afspraak_gemaakt', 'deal', 'cold'
    )),
    contact_attempts INT DEFAULT 0,
    next_contact_date TIMESTAMPTZ,
    lead_source TEXT DEFAULT 'cold',
    decision_maker BOOLEAN DEFAULT FALSE,
    company_size TEXT,
    lead_score INT DEFAULT 0,
    locked_by UUID REFERENCES public.profiles(id),
    locked_at TIMESTAMPTZ,
    call_status TEXT DEFAULT 'available',
    assigned_to UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    lead_list_id UUID REFERENCES public.lead_lists(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

-- 5. MESSAGES
CREATE TABLE IF NOT EXISTS public.messages (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    text TEXT NOT NULL,
    user_name TEXT NOT NULL,
    is_admin BOOLEAN DEFAULT FALSE,
    channel_id UUID REFERENCES public.chat_channels(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. ACTIVITIES
CREATE TABLE IF NOT EXISTS public.activities (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL NOT NULL,
    action TEXT NOT NULL,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. LEAD LIST ITEMS (Many-to-Many)
CREATE TABLE IF NOT EXISTS public.lead_list_items (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    lead_list_id UUID REFERENCES public.lead_lists(id) ON DELETE CASCADE NOT NULL,
    lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE NOT NULL,
    added_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(lead_list_id, lead_id)
);

-- 8. PAYOUTS
CREATE TABLE IF NOT EXISTS public.payouts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL CHECK (period_end >= period_start),
    deals_count INT DEFAULT 0,
    appointments_count INT DEFAULT 0,
    deal_payout DECIMAL(10,2) DEFAULT 0 CHECK (deal_payout >= 0),
    appointment_payout DECIMAL(10,2) DEFAULT 0 CHECK (appointment_payout >= 0),
    is_billable BOOLEAN DEFAULT FALSE,
    payout_status TEXT DEFAULT 'pending' CHECK (payout_status IN ('pending', 'approved', 'paid')),
    payment_term_days INT DEFAULT 14,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. PERFORMANCE INDEXES
CREATE INDEX IF NOT EXISTS activities_user_action_date_idx ON public.activities(user_id, action, created_at DESC);
CREATE INDEX IF NOT EXISTS leads_assigned_to_status_idx ON public.leads(assigned_to, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS leads_lead_list_id_idx ON public.leads(lead_list_id);
CREATE INDEX IF NOT EXISTS messages_channel_created_idx ON public.messages(channel_id, created_at DESC);

-- 10. ROW LEVEL SECURITY (RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payouts ENABLE ROW LEVEL SECURITY;

-- Select Policies
CREATE POLICY "Profiles viewable by all" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Leads viewable by assigned or admin" ON public.leads FOR SELECT 
    USING (assigned_to = auth.uid() OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "Activities viewable by all" ON public.activities FOR SELECT USING (true);
CREATE POLICY "Messages viewable by all" ON public.messages FOR SELECT USING (true);

-- Insert/Update Policies (Harden)
CREATE POLICY "Users insert own messages" ON public.messages FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins manage everything" ON public.leads FOR ALL 
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "Users update assigned leads" ON public.leads FOR UPDATE 
    USING (assigned_to = auth.uid()) WITH CHECK (assigned_to = auth.uid());

-- 11. AUTOMATION TRIGGERS

-- A. Auto-update updated_at
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_leads_updated BEFORE UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER tr_payouts_updated BEFORE UPDATE ON public.payouts FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- B. Auto-log status changes
CREATE OR REPLACE FUNCTION public.log_status_change()
RETURNS TRIGGER AS $$
BEGIN
    IF (OLD.status IS DISTINCT FROM NEW.status) THEN
        INSERT INTO public.activities (lead_id, user_id, action, notes)
        VALUES (NEW.id, COALESCE(auth.uid(), NEW.assigned_to), 'status_change', 'Status naar: ' || NEW.status);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER tr_leads_status_log AFTER UPDATE OF status ON public.leads FOR EACH ROW EXECUTE FUNCTION public.log_status_change();

-- C. Auto-profile creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, full_name, role)
    VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email), 'employee');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();