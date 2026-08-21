-- =====================================================
-- MIGRATION V19: Tarieven per project (GERUND op 2026-08-21 via Claude)
--
-- Elk project (lead_list) kan eigen tarieven krijgen:
--   * rate_per_appointment  (€ per netto afspraak)
--   * rate_per_deal         (€ per deal)
--   * rate_per_hour         (€ per uur effectieve beltijd, uit call_logs)
-- NULL = terugvallen op het standaardtarief in payout_rules.
-- payout_rules krijgt ook rate_per_hour (default 0 = uit).
--
-- Beveiliging: lead_lists is ook updatebaar door bellers/managers
-- (assigned_to, naam, enz.), maar tarieven mogen ALLEEN door de
-- admin gewijzigd worden -> trigger blokkeert dat voor anderen.
-- =====================================================

ALTER TABLE public.lead_lists
  ADD COLUMN IF NOT EXISTS rate_per_appointment numeric(10,2),
  ADD COLUMN IF NOT EXISTS rate_per_deal numeric(10,2),
  ADD COLUMN IF NOT EXISTS rate_per_hour numeric(10,2);

ALTER TABLE public.payout_rules
  ADD COLUMN IF NOT EXISTS rate_per_hour numeric(10,2) NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.protect_list_rates()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF NOT public.is_admin() AND (
    NEW.rate_per_appointment IS DISTINCT FROM OLD.rate_per_appointment
    OR NEW.rate_per_deal IS DISTINCT FROM OLD.rate_per_deal
    OR NEW.rate_per_hour IS DISTINCT FROM OLD.rate_per_hour
  ) THEN
    RAISE EXCEPTION 'Alleen een admin mag projecttarieven wijzigen';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_protect_list_rates ON public.lead_lists;
CREATE TRIGGER tr_protect_list_rates
  BEFORE UPDATE ON public.lead_lists
  FOR EACH ROW EXECUTE FUNCTION public.protect_list_rates();
