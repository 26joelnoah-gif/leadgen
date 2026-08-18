-- =====================================================
-- MIGRATION V15: Vergoedingen, payouts, netto afspraken & prijzen
-- (GERUND op 2026-08-18 via Claude)
-- Product owner stelt tarieven en targets in via Admin > Verdiensten.
-- =====================================================

-- 1. PAYOUT RULES: één regel per organisatie (NULL = globale default)
CREATE TABLE IF NOT EXISTS public.payout_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid UNIQUE NULLS NOT DISTINCT REFERENCES public.organizations(id),
  rate_per_appointment numeric(10,2) NOT NULL DEFAULT 25,
  rate_per_deal numeric(10,2) NOT NULL DEFAULT 50,
  min_calls_per_day integer NOT NULL DEFAULT 0,
  min_calls_for_payout integer NOT NULL DEFAULT 0,
  min_avg_call_seconds integer NOT NULL DEFAULT 0,
  updated_by uuid REFERENCES public.profiles(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.payout_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payout_rules_select_org" ON public.payout_rules
  FOR SELECT USING (organization_id IS NOT DISTINCT FROM public.my_org_id());
CREATE POLICY "payout_rules_write_admin" ON public.payout_rules
  FOR ALL USING (public.is_admin() AND organization_id IS NOT DISTINCT FROM public.my_org_id())
  WITH CHECK (public.is_admin() AND organization_id IS NOT DISTINCT FROM public.my_org_id());

INSERT INTO public.payout_rules (organization_id, rate_per_appointment, rate_per_deal, min_calls_per_day, min_calls_for_payout)
VALUES (NULL, 25, 50, 0, 0)
ON CONFLICT (organization_id) DO NOTHING;

-- 2. PAYOUTS: de tabel waar Payouts.jsx tegen praat (bestond nog niet!)
CREATE TABLE IF NOT EXISTS public.payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES public.organizations(id),
  period_start date,
  period_end date,
  deals_count integer NOT NULL DEFAULT 0,
  appointments_count integer NOT NULL DEFAULT 0,
  deal_payout numeric(10,2) NOT NULL DEFAULT 0,
  appointment_payout numeric(10,2) NOT NULL DEFAULT 0,
  is_billable boolean NOT NULL DEFAULT false,
  billable_approved_at timestamptz,
  payout_status text NOT NULL DEFAULT 'pending',
  payment_term_days integer NOT NULL DEFAULT 14,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.payouts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payouts_select_self_or_admin" ON public.payouts
  FOR SELECT USING (
    user_id = auth.uid()
    OR (public.is_admin() AND organization_id IS NOT DISTINCT FROM public.my_org_id())
  );
CREATE POLICY "payouts_write_admin" ON public.payouts
  FOR ALL USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 3. NETTO AFSPRAKEN: goedkeuring op leads (netto = doorgegaan/gekwalificeerd)
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS appointment_approved boolean,
  ADD COLUMN IF NOT EXISTS appointment_approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS appointment_approved_by uuid REFERENCES public.profiles(id);

-- 4. PRIJZEN: door owner instelbare wedstrijden/bonussen
CREATE TABLE IF NOT EXISTS public.prizes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id),
  name text NOT NULL,
  description text,
  metric text NOT NULL DEFAULT 'calls' CHECK (metric IN ('calls','appointments','deals')),
  target_value integer NOT NULL DEFAULT 0,
  reward_label text,
  period text NOT NULL DEFAULT 'week' CHECK (period IN ('day','week','month')),
  active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.prizes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "prizes_select_org" ON public.prizes
  FOR SELECT USING (organization_id IS NOT DISTINCT FROM public.my_org_id());
CREATE POLICY "prizes_write_admin" ON public.prizes
  FOR ALL USING (public.is_admin() AND organization_id IS NOT DISTINCT FROM public.my_org_id())
  WITH CHECK (public.is_admin() AND organization_id IS NOT DISTINCT FROM public.my_org_id());
