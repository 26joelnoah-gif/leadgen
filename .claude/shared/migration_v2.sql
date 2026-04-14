-- 🛠️ LEADGEN - Architecture Upgrade: Lead Lists & Locking
-- Run this SQL in your Supabase SQL Editor: https://zboyxwwrbtpjnlgquhzs.supabase.co

-- 1. Add missing columns to leads table for locking and grouping
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS lead_list_id UUID REFERENCES public.lead_lists(id) ON DELETE SET NULL;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS locked_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS call_status TEXT DEFAULT 'available';

-- 2. Add assigned_to to lead_lists so entire lists can be assigned to agents
ALTER TABLE public.lead_lists ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- 3. Create a unique index for locking logic to be atomic (optional but recommended)
CREATE INDEX IF NOT EXISTS leads_locking_idx ON public.leads (locked_by, locked_at);

-- 4. Initial test data (optional)
-- INSERT INTO public.lead_lists (name, description) VALUES ('Warme leads april', 'Nagebelde leads van maart');
