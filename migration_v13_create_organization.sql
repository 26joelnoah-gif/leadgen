-- =====================================================
-- LEADGEN v13 — organisatie aanmaken in één transactie
-- =====================================================
-- Zonder dit stapt de aanmaker naar een nieuwe organization_id terwijl alle
-- bestaande leads en lijsten op NULL blijven staan. Die vallen dan buiten de
-- RLS-policies uit v12 en lijken verdwenen.

CREATE OR REPLACE FUNCTION public.create_organization(p_name text, p_slug text)
RETURNS public.organizations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_org public.organizations;
  v_uid uuid := auth.uid();
  v_is_first boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Niet ingelogd';
  END IF;

  IF (SELECT organization_id FROM public.profiles WHERE id = v_uid) IS NOT NULL THEN
    RAISE EXCEPTION 'Je hoort al bij een organisatie';
  END IF;

  SELECT NOT EXISTS (SELECT 1 FROM public.organizations) INTO v_is_first;

  INSERT INTO public.organizations (name, slug, owner_id)
  VALUES (p_name, p_slug, v_uid)
  RETURNING * INTO v_org;

  UPDATE public.profiles SET organization_id = v_org.id WHERE id = v_uid;

  -- Alleen bij de allereerste organisatie: bestaande losse data adopteren,
  -- zodat een bestaande installatie niets kwijtraakt.
  IF v_is_first THEN
    UPDATE public.profiles   SET organization_id = v_org.id WHERE organization_id IS NULL;
    UPDATE public.leads      SET organization_id = v_org.id WHERE organization_id IS NULL;
    UPDATE public.lead_lists SET organization_id = v_org.id WHERE organization_id IS NULL;
  END IF;

  RETURN v_org;
END $$;

REVOKE EXECUTE ON FUNCTION public.create_organization(text, text) FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.create_organization(text, text) TO authenticated;
