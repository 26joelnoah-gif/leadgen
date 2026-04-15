-- =====================================================
-- LEADGEN v11 — MULTI-TENANT (Phase 2)
-- Run this in Supabase SQL Editor
-- =====================================================

-- 1. ORGANIZATIONS TABLE
CREATE TABLE IF NOT EXISTS public.organizations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'starter', 'pro', 'enterprise')),
  max_users INT DEFAULT 5,
  max_leads INT DEFAULT 1000,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. KOPPEL PROFILES AAN ORGANIZATION
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL;

-- 3. KOPPEL LEADS AAN ORGANIZATION
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

-- 4. KOPPEL LEAD_LISTS AAN ORGANIZATION
ALTER TABLE public.lead_lists
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

-- 5. INDEXES
CREATE INDEX IF NOT EXISTS idx_profiles_org ON public.profiles(organization_id);
CREATE INDEX IF NOT EXISTS idx_leads_org ON public.leads(organization_id);
CREATE INDEX IF NOT EXISTS idx_lead_lists_org ON public.lead_lists(organization_id);
CREATE INDEX IF NOT EXISTS idx_orgs_slug ON public.organizations(slug);

-- 6. RLS OP ORGANIZATIONS
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_select_own" ON public.organizations
  FOR SELECT USING (
    id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
  );

CREATE POLICY "org_update_owner" ON public.organizations
  FOR UPDATE USING (owner_id = auth.uid());

CREATE POLICY "org_insert_anyone" ON public.organizations
  FOR INSERT WITH CHECK (true);

-- 7. UPDATE RLS VOOR LEADS (tenant isolation)
DROP POLICY IF EXISTS "leads_select" ON public.leads;
DROP POLICY IF EXISTS "leads_insert" ON public.leads;
DROP POLICY IF EXISTS "leads_update" ON public.leads;
DROP POLICY IF EXISTS "leads_delete" ON public.leads;

CREATE POLICY "leads_select_org" ON public.leads
  FOR SELECT USING (
    organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
    OR organization_id IS NULL
  );

CREATE POLICY "leads_insert_org" ON public.leads
  FOR INSERT WITH CHECK (
    organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
    OR organization_id IS NULL
  );

CREATE POLICY "leads_update_org" ON public.leads
  FOR UPDATE USING (
    organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
    OR organization_id IS NULL
  );

CREATE POLICY "leads_delete_org" ON public.leads
  FOR DELETE USING (
    organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
    OR organization_id IS NULL
  );

-- 8. UPDATE TIMESTAMP TRIGGER
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS orgs_updated_at ON public.organizations;
CREATE TRIGGER orgs_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =====================================================
-- KLAAR. Bestaande data werkt nog (organization_id = NULL).
-- =====================================================
