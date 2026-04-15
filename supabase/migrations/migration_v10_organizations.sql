-- Migration V10: Organizations (Multi-Tenant SaaS)
-- Datum: 2026-04-16

-- Organizations tabel (één per bedrijf/tenant)
CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL, -- voor subdomain: slug.leadgen.app
  owner_id UUID REFERENCES auth.users(id),
  plan TEXT DEFAULT 'free', -- free, starter, pro, enterprise
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Koppel profiles aan organization
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL;

-- Index voor snelle lookups
CREATE INDEX IF NOT EXISTS idx_organizations_slug ON organizations(slug);
CREATE INDEX IF NOT EXISTS idx_profiles_org ON profiles(organization_id);

-- RLS policies voor organizations
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

-- Users kunnen alleen hun eigen organization zien
CREATE POLICY "Users can view own organization"
  ON organizations FOR SELECT
  USING (owner_id = auth.uid() OR id IN (SELECT organization_id FROM profiles WHERE id = auth.uid()));

-- Alleen owner kan organization aanpassen
CREATE POLICY "Owner can update organization"
  ON organizations FOR UPDATE
  USING (owner_id = auth.uid());

-- Iedereen in de org kan profiles zien
CREATE POLICY "Org members can view profiles"
  ON profiles FOR SELECT
  USING (organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid()));

-- RLS voor leads - organization based
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Leads visible to org members"
  ON leads FOR SELECT
  USING (
    organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid())
    OR assigned_to = auth.uid()
    OR created_by = auth.uid()
  );

CREATE POLICY "Leads editable by org members"
  ON leads FOR UPDATE
  USING (
    organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid())
    OR assigned_to = auth.uid()
    OR created_by = auth.uid()
  );

-- Function om updated_at bij te werken
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger voor organizations updated_at
CREATE TRIGGER organizations_updated_at
  BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Trigger voor profiles updated_at
CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Functie om organization aan te maken voor nieuwe gebruiker
CREATE OR REPLACE FUNCTION create_organization_for_user(
  p_name TEXT,
  p_slug TEXT,
  p_owner_id UUID
)
RETURNS UUID AS $$
DECLARE
  v_org_id UUID;
BEGIN
  -- Check of slug al bestaat
  IF EXISTS (SELECT 1 FROM organizations WHERE slug = p_slug) THEN
    RAISE EXCEPTION 'Slug already exists';
  END IF;

  -- Maak organization
  INSERT INTO organizations (name, slug, owner_id)
  VALUES (p_name, p_slug, p_owner_id)
  RETURNING id INTO v_org_id;

  -- Update profile met organization_id
  UPDATE profiles SET organization_id = v_org_id WHERE id = p_owner_id;

  RETURN v_org_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;