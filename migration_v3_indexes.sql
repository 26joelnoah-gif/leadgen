-- =====================================================
-- MIGRATION V3: Performance Indexes
-- Run this SQL in your Supabase SQL Editor
-- =====================================================

-- Indexes for activities table (most queried table)
CREATE INDEX IF NOT EXISTS activities_user_id_idx ON public.activities(user_id);
CREATE INDEX IF NOT EXISTS activities_action_idx ON public.activities(action);
CREATE INDEX IF NOT EXISTS activities_created_at_idx ON public.activities(created_at DESC);
CREATE INDEX IF NOT EXISTS activities_lead_id_idx ON public.activities(lead_id);

-- Composite index for common query pattern: user + action + date
CREATE INDEX IF NOT EXISTS activities_user_action_date_idx ON public.activities(user_id, action, created_at DESC);

-- Indexes for leads table
CREATE INDEX IF NOT EXISTS leads_status_idx ON public.leads(status);
CREATE INDEX IF NOT EXISTS leads_assigned_to_idx ON public.leads(assigned_to);
CREATE INDEX IF NOT EXISTS leads_deleted_at_idx ON public.leads(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS leads_lead_list_id_idx ON public.leads(lead_list_id);
CREATE INDEX IF NOT EXISTS leads_locking_idx ON public.leads(locked_by, locked_at);

-- Composite index for common dashboard query: assigned_to + status + deleted_at
CREATE INDEX IF NOT EXISTS leads_assign_status_active_idx ON public.leads(assigned_to, status) WHERE deleted_at IS NULL;

-- Indexes for lead_list_items table
CREATE INDEX IF NOT EXISTS lead_list_items_lead_id_idx ON public.lead_list_items(lead_id);
CREATE INDEX IF NOT EXISTS lead_list_items_list_id_idx ON public.lead_list_items(lead_list_id);

-- Indexes for messages table
CREATE INDEX IF NOT EXISTS messages_channel_id_idx ON public.messages(channel_id);
CREATE INDEX IF NOT EXISTS messages_created_at_idx ON public.messages(created_at DESC);

-- Indexes for chat_channels
CREATE INDEX IF NOT EXISTS chat_channels_created_by_idx ON public.chat_channels(created_by);

-- Indexes for payouts
CREATE INDEX IF NOT EXISTS payouts_user_id_idx ON public.payouts(user_id);
CREATE INDEX IF NOT EXISTS payouts_status_idx ON public.payouts(payout_status);

-- Index for profiles (used in joins)
CREATE INDEX IF NOT EXISTS profiles_role_idx ON public.profiles(role);

-- =====================================================
-- UPDATED_AT TRIGGER for leads table
-- =====================================================
CREATE OR REPLACE FUNCTION public.handle_leads_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_leads_updated ON public.leads;
CREATE TRIGGER on_leads_updated
    BEFORE UPDATE ON public.leads
    FOR EACH ROW EXECUTE FUNCTION public.handle_leads_updated_at();

-- =====================================================
-- RLS POLICY FIXES
-- =====================================================

-- Fix messages INSERT to require user_id = auth.uid() (prevents impersonation)
DROP POLICY IF EXISTS "Users can insert messages" ON public.messages;
CREATE POLICY "Users can insert messages" ON public.messages
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Add UPDATE policy for messages (needed for edit functionality)
CREATE POLICY "Users can update own messages" ON public.messages
    FOR UPDATE USING (auth.uid() = user_id);

-- Add DELETE policy for messages (user can delete own)
CREATE POLICY "Users can delete own messages" ON public.messages
    FOR DELETE USING (auth.uid() = user_id);

-- Fix profiles INSERT - only via trigger (prevent manual inserts)
DROP POLICY IF EXISTS "Admins can insert profiles" ON public.profiles;
CREATE POLICY "Profiles are viewable by authenticated users" ON public.profiles
    FOR SELECT USING (auth.role() = 'authenticated');

-- Add UPDATE policy for profiles (users can update own profile)
CREATE POLICY "Users can update own profile" ON public.profiles
    FOR UPDATE USING (auth.uid() = id);

-- Add UPDATE/DELETE policies for activities (for GDPR cleanup)
CREATE POLICY "Users can update own activities" ON public.activities
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own activities" ON public.activities
    FOR DELETE USING (auth.uid() = user_id);

-- =====================================================
-- lead_list_id COLUMN FIX (add to leads if missing from base schema)
-- =====================================================
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'leads' AND column_name = 'lead_list_id') THEN
        ALTER TABLE public.leads ADD COLUMN lead_list_id UUID REFERENCES public.lead_lists(id) ON DELETE SET NULL;
    END IF;
END $$;

-- =====================================================
-- CONSTRAINT FIXES
-- =====================================================

-- Add CHECK constraint for call_status if missing
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'leads_call_status_check') THEN
        ALTER TABLE public.leads ADD CONSTRAINT leads_call_status_check
            CHECK (call_status IS NULL OR call_status IN ('available', 'called', 'reached', 'no_answer'));
    END IF;
END $$;

-- Add CHECK constraints for payouts (prevent negative values)
ALTER TABLE public.payouts DROP CONSTRAINT IF EXISTS positive_payouts;
ALTER TABLE public.payouts ADD CONSTRAINT positive_payouts
    CHECK (deal_payout >= 0 AND appointment_payout >= 0 AND payment_term_days >= 0);

COMMENT ON INDEX activities_user_action_date_idx IS 'Composite index for user activity queries with action filter and date sorting';
COMMENT ON INDEX leads_assign_status_active_idx IS 'Composite index for dashboard lead queries: assigned user + status + active only';
