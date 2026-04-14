-- BUG #5 FIX: Update profile names + fix RLS check
-- Run this in Supabase SQL Editor: https://zboyxwwrbtpjnlgquhzs.supabase.co

-- Fix namen
UPDATE public.profiles SET full_name = 'Admin' WHERE email = 'admin2@test.com' AND (full_name IS NULL OR full_name = '' OR full_name = 'admin2@test.com');
UPDATE public.profiles SET full_name = 'Werk Nemer' WHERE email = 'werk@nemer.com' AND (full_name IS NULL OR full_name = '' OR full_name = 'werk@nemer.com');

-- Verifieer
SELECT id, email, full_name, role FROM public.profiles;
