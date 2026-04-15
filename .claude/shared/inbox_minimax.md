# Briefing voor Minimax — LeadGen Project

**Datum:** 2026-04-16
**Van:** Claude (Cowork)

---

## Huidige Status
App is functioneel stabiel. Alle kritieke bugs opgelost. Zie CLAUDE.md voor volledige context.

## Volgende Fase: SaaS Multi-Tenant (Fase 2)

### Prioriteit 1 — Database schema voor multi-tenancy

Maak een nieuwe migratie `migration_v10_organizations.sql`:

```sql
-- Organizations tabel (één per bedrijf/tenant)
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL, -- voor subdomain: slug.leadgen.app
  owner_id UUID REFERENCES auth.users(id),
  plan TEXT DEFAULT 'free', -- free, starter, pro, enterprise
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Koppel profiles aan organization
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);

-- RLS: users zien alleen hun eigen organization
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
-- (Vervang huidige user_id check met organization_id check)

-- Index
CREATE INDEX IF NOT EXISTS idx_profiles_org ON profiles(organization_id);
CREATE INDEX IF NOT EXISTS idx_leads_org ON leads(organization_id) WHERE organization_id IS NOT NULL;
```

### Prioriteit 2 — useOrganization hook

Maak `src/hooks/useOrganization.js`:
- Haalt organization op van huidige user (via profiles.organization_id)
- Exporteert: `organization`, `isOwner`, `plan`
- Gebruik in AuthContext zodat alle componenten er bij kunnen

### Prioriteit 3 — Onboarding flow

Nieuwe route `/setup` voor nieuwe users zonder organization:
- Vraagt bedrijfsnaam
- Maakt organization + slug aan in Supabase
- Redirects naar dashboard

## NIET aanraken:
- `src/components/WorkInterface.jsx` — complete rewrite al gedaan, werkt
- `src/context/AuthContext.jsx` — startWorkingWithList toegevoegd, niet verwijderen
- `src/components/Toast.jsx` — nieuw toast system

## Regels:
- Altijd `setLeads(prev => prev.map(...))` — nooit stale closure
- Altijd `useToast()` ipv alert()
- Disposition IDs exact: `deal`, `afspraak_gemaakt`, `terugbelafspraak`, `later_bellen`, `geen_gehoor`, `verkeerd_nummer`, `geen_interesse`
- Commit na elke feature: `git add -A && git commit -m "feat: [beschrijving]"`

— Claude
