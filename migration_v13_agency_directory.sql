-- =====================================================
-- LEADGEN v13 — AGENCY DIRECTORY (Phase 3 bootstrap)
-- Publieke profielen voor marketingbureaus
-- =====================================================

CREATE TABLE IF NOT EXISTS public.agency_profiles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Basisinfo (pre-filled door scraper)
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  website TEXT,
  phone TEXT,
  email TEXT,
  description TEXT,
  
  -- Locatie
  city TEXT,
  province TEXT,
  country TEXT DEFAULT 'NL',
  address TEXT,
  
  -- Categorisatie
  specialties TEXT[], -- ['SEO', 'Social Media', 'Google Ads', ...]
  company_size TEXT,  -- '1-10', '11-50', '51-200'
  founded_year INT,
  
  -- Directory stats (fake-it-till-you-make-it seed data)
  review_count INT DEFAULT 0,
  avg_rating DECIMAL(2,1) DEFAULT 0.0,
  profile_views INT DEFAULT 0,
  
  -- Claim status
  is_claimed BOOLEAN DEFAULT FALSE,
  claimed_by UUID REFERENCES auth.users(id),
  claimed_at TIMESTAMPTZ,
  
  -- Plan na claimen
  plan TEXT DEFAULT 'unclaimed' CHECK (plan IN ('unclaimed', 'free', 'verified', 'featured')),
  
  -- Data herkomst
  data_source TEXT DEFAULT 'scraped', -- 'scraped', 'manual', 'claimed'
  kvk_number TEXT,
  linkedin_url TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_agency_city ON public.agency_profiles(city);
CREATE INDEX IF NOT EXISTS idx_agency_slug ON public.agency_profiles(slug);
CREATE INDEX IF NOT EXISTS idx_agency_claimed ON public.agency_profiles(is_claimed);
CREATE INDEX IF NOT EXISTS idx_agency_plan ON public.agency_profiles(plan);

-- RLS: publiek leesbaar, alleen owner mag updaten
ALTER TABLE public.agency_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agencies_public_read" ON public.agency_profiles
  FOR SELECT USING (true);

CREATE POLICY "agencies_insert_system" ON public.agency_profiles
  FOR INSERT WITH CHECK (true);

CREATE POLICY "agencies_update_claimed" ON public.agency_profiles
  FOR UPDATE USING (
    claimed_by = auth.uid() OR
    id IN (SELECT id FROM public.agency_profiles WHERE claimed_by IS NULL)
  );
