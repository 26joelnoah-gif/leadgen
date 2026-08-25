-- =====================================================
-- MIGRATION V41: eigen afboekredenen (custom_dispositions)
-- (UITGEVOERD op 2026-08-25 via Claude/Cowork op project zboyxwwrbtpjnlgquhzs
--  - maar vertrouw dit comment nooit blind: check information_schema)
--
-- leads.status heeft een harde CHECK-constraint met een vaste set
-- technische statussen; die kan niet vrij uitgebreid worden zonder
-- claim_next_lead, XP, payouts en rapportage overal mee te moeten trekken.
-- Daarom: een eigen afboekreden is een LABEL bovenop een van de bestaande
-- "geen succes"-statussen (base_status) - de technische afhandeling
-- (wachtrij/cooldown/toewijzing via flow_settings) blijft precies zoals
-- die al is voor die basisstatus. Alleen de knoptekst en de notitie zijn
-- eigen aan de reden.
-- =====================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.custom_dispositions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL CHECK (length(trim(label)) > 0),
  base_status text NOT NULL CHECK (base_status = ANY (ARRAY['geen_interesse','onjuiste_timing','geen_gehoor','verkeerd_nummer','blacklist'])),
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.custom_dispositions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS custom_dispositions_select ON public.custom_dispositions;
CREATE POLICY custom_dispositions_select ON public.custom_dispositions
  FOR SELECT USING (true);

DROP POLICY IF EXISTS custom_dispositions_write ON public.custom_dispositions;
CREATE POLICY custom_dispositions_write ON public.custom_dispositions
  FOR ALL TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'manager' AND p.can_edit_flows)
  )
  WITH CHECK (
    public.is_admin()
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'manager' AND p.can_edit_flows)
  );

-- Traceerbaar welke eigen reden een gesprek kreeg (naast de vrije notitie-tekst)
ALTER TABLE public.call_logs ADD COLUMN IF NOT EXISTS custom_disposition_id uuid REFERENCES public.custom_dispositions(id) ON DELETE SET NULL;

COMMIT;
