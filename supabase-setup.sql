-- =====================================================
-- LEADGEN - Supabase Database Setup
-- =====================================================
-- Run this SQL in your Supabase SQL Editor
-- =====================================================

-- 1. Create profiles table
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
    email TEXT NOT NULL,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'employee' CHECK (role IN ('employee', 'admin')),
    show_appointments_in_earnings BOOLEAN DEFAULT TRUE,
    show_deals_in_earnings BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Create leads table
CREATE TABLE IF NOT EXISTS public.leads (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT,
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'new' CHECK (status IN (
        'new', 'later_bellen', 'mailen', 'voicemail',
        'terugbelafspraak', 'geen_gehoor', 'verkeerd_nummer',
        'geen_interesse', 'afspraak_gemaakt', 'deal', 'cold'
    )),
    contact_attempts INT DEFAULT 0,
    next_contact_date TIMESTAMPTZ,
    lead_source TEXT, -- 'linkedin', 'referral', 'cold'
    decision_maker BOOLEAN DEFAULT FALSE,
    company_size TEXT, -- '1-10', '11-50', '51+'
    lead_score INT DEFAULT 0,
    assigned_to UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Create messages table for real-time chat
CREATE TABLE IF NOT EXISTS public.messages (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    text TEXT NOT NULL,
    user_name TEXT NOT NULL,
    is_admin BOOLEAN DEFAULT FALSE,
    channel_id UUID REFERENCES public.chat_channels(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3b. Create chat channels table
CREATE TABLE IF NOT EXISTS public.chat_channels (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Create activities table
CREATE TABLE IF NOT EXISTS public.activities (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL NOT NULL,
    action TEXT NOT NULL,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Create lead_lists table
CREATE TABLE IF NOT EXISTS public.lead_lists (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Create lead_list_items table (many-to-many)
CREATE TABLE IF NOT EXISTS public.lead_list_items (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    lead_list_id UUID REFERENCES public.lead_lists(id) ON DELETE CASCADE NOT NULL,
    lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE NOT NULL,
    added_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(lead_list_id, lead_id)
);

-- 6. Create payouts table
CREATE TABLE IF NOT EXISTS public.payouts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    deals_count INT DEFAULT 0,
    appointments_count INT DEFAULT 0,
    deal_payout DECIMAL(10,2) DEFAULT 0,
    appointment_payout DECIMAL(10,2) DEFAULT 0,
    is_billable BOOLEAN DEFAULT FALSE,
    billable_approved_at TIMESTAMPTZ,
    approved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    payout_status TEXT DEFAULT 'pending' CHECK (payout_status IN ('pending', 'approved', 'paid')),
    payment_term_days INT DEFAULT 14,
    paid_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================
-- Row Level Security (RLS)
-- =====================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_list_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payouts ENABLE ROW LEVEL SECURITY;
-- Profiles: everyone can read, only admins can update
CREATE POLICY "Profiles are viewable by authenticated users" ON public.profiles
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Users can update own profile" ON public.profiles
    FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Admins can insert profiles" ON public.profiles
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Leads: employees see assigned leads, admins see all
CREATE POLICY "Employees can view assigned leads" ON public.leads
    FOR SELECT USING (
        assigned_to = auth.uid() OR
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    );

CREATE POLICY "Users can insert leads" ON public.leads
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Users can update leads" ON public.leads
    FOR UPDATE USING (
        assigned_to = auth.uid() OR
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    );

-- Activities: employees see own, admins see all
CREATE POLICY "Users can view own activities" ON public.activities
    FOR SELECT USING (
        user_id = auth.uid() OR
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    );

CREATE POLICY "Users can insert activities" ON public.activities
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Messages: all authenticated users can view and post
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Messages are viewable by authenticated users" ON public.messages
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Users can insert messages" ON public.messages
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Chat channels: all authenticated users can view, only admins can create
ALTER TABLE public.chat_channels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Chat channels are viewable by authenticated users" ON public.chat_channels
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Admins can create chat channels" ON public.chat_channels
    FOR INSERT WITH CHECK (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    );

CREATE POLICY "Admins can delete chat channels" ON public.chat_channels
    FOR DELETE USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    );

-- Lead lists: admins can manage, employees can view
CREATE POLICY "Lead lists viewable by authenticated users" ON public.lead_lists
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Admins can insert lead lists" ON public.lead_lists
    FOR INSERT WITH CHECK (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    );

CREATE POLICY "Admins can update lead lists" ON public.lead_lists
    FOR UPDATE USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    );

CREATE POLICY "Admins can delete lead lists" ON public.lead_lists
    FOR DELETE USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    );

-- Lead list items: viewable by all authenticated, manageable by admins
CREATE POLICY "Lead list items viewable by authenticated users" ON public.lead_list_items
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Users can insert lead list items" ON public.lead_list_items
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Users can delete own lead list items" ON public.lead_list_items
    FOR DELETE USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    );

-- Payouts: employees see own, admins see all
CREATE POLICY "Users can view own payouts" ON public.payouts
    FOR SELECT USING (
        user_id = auth.uid() OR
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    );

CREATE POLICY "Admins can manage payouts" ON public.payouts
    FOR ALL USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    );

-- =====================================================
-- Functions
-- =====================================================

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, full_name, role)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
        'employee'
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for auto profile creation
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =====================================================
-- Sample Data (optional - remove for production)
-- =====================================================

-- To create a test admin user:
-- 1. Go to Supabase Dashboard > Authentication > Users
-- 2. Create a new user or invite one
-- 3. Update their role in the profiles table to 'admin'
-- 4. Then you can insert leads assigned to them

-- Example insert for testing (run after creating a user):
-- INSERT INTO public.leads (name, phone, email, status, created_by)
-- VALUES ('Test Lead', '0612345678', 'test@example.com', 'new', '<your-user-id>');