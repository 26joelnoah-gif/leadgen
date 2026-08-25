-- =====================================================
-- MIGRATION V43: activity_pings (intensiteit / ingelogde tijd)
--
-- Doel: per medewerker kunnen zien hoeveel er geklikt/gewerkt wordt,
-- en "ingelogde tijd" pas laten meetellen als er binnen een tijdvak
-- minimaal X acties waren (drempel instelbaar in de admin-UI).
--
-- Lichte heartbeat i.p.v. 1 rij per klik: de frontend telt clicks
-- lokaal en flusht elke ~60s (alleen als het tabblad zichtbaar is)
-- 1 rij met het aantal clicks in dat venster. Bij geen enkele click
-- wordt niets geschreven, dus een openstaand-maar-verlaten tabblad
-- vervuilt de tabel niet.
-- =====================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.activity_pings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  organization_id uuid,
  click_count integer NOT NULL DEFAULT 0 CHECK (click_count >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS activity_pings_user_created_idx
  ON public.activity_pings(user_id, created_at DESC);

ALTER TABLE public.activity_pings ENABLE ROW LEVEL SECURITY;

-- Iedereen mag alleen eigen pings wegschrijven
DROP POLICY IF EXISTS activity_pings_insert_own ON public.activity_pings;
CREATE POLICY activity_pings_insert_own ON public.activity_pings FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Zien: admin ziet alles binnen zijn org, iedereen ziet zijn eigen pings.
-- (Zelfde schaal als call_logs_select_scoped in v25 - manager-scope kan later
-- toegevoegd worden zodra teamleden-koppeling generiek beschikbaar is.)
DROP POLICY IF EXISTS activity_pings_select_scoped ON public.activity_pings;
CREATE POLICY activity_pings_select_scoped ON public.activity_pings FOR SELECT USING (
  user_id = auth.uid()
  OR (is_admin() AND (NOT (organization_id IS DISTINCT FROM my_org_id())))
);

COMMIT;
