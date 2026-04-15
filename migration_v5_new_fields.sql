-- =====================================================
-- MIGRATION V5: Extended Lead Information Fields
-- Run this SQL in your Supabase SQL Editor
-- =====================================================

-- 1. Add Address & Company Details
ALTER TABLE public.leads 
ADD COLUMN IF NOT EXISTS address TEXT,
ADD COLUMN IF NOT EXISTS house_number TEXT,
ADD COLUMN IF NOT EXISTS postal_code TEXT,
ADD COLUMN IF NOT EXISTS city TEXT,
ADD COLUMN IF NOT EXISTS contact_person TEXT,
ADD COLUMN IF NOT EXISTS function TEXT,
ADD COLUMN IF NOT EXISTS website TEXT;

-- 2. Add Index for searching (Performance)
CREATE INDEX IF NOT EXISTS idx_leads_city ON public.leads(city);
CREATE INDEX IF NOT EXISTS idx_leads_contact_person ON public.leads(contact_person);

-- 3. Comments for documentation
COMMENT ON COLUMN public.leads.address IS 'Straatnaam van de lead';
COMMENT ON COLUMN public.leads.house_number IS 'Huisnummer en eventuele toevoeging';
COMMENT ON COLUMN public.leads.postal_code IS 'Postcode van de vestiging';
COMMENT ON COLUMN public.leads.city IS 'Vestigingsplaats';
COMMENT ON COLUMN public.leads.contact_person IS 'Naam van de primaire contactpersoon';
COMMENT ON COLUMN public.leads.function IS 'Functie van de contactpersoon';
COMMENT ON COLUMN public.leads.website IS 'Website URL van het bedrijf';
