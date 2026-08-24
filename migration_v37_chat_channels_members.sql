-- =====================================================
-- MIGRATION V37: Chat kanalen per project + kanaal-leden
-- (UITGEVOERD op 2026-08-24 via Claude/Cowork op project zboyxwwrbtpjnlgquhzs
--  - maar vertrouw dit comment nooit blind: check information_schema)
--
-- Kanalen kunnen aan een campagne (project) gekoppeld worden, meerdere
-- kanalen per project mag. Een "restricted" kanaal is alleen zichtbaar
-- voor expliciete leden (chat_channel_members); admin en de manager(s)
-- van de gekoppelde campagne mogen leden toevoegen/verwijderen.
-- Niet-restricted kanalen (bestaand gedrag) blijven org-breed zichtbaar.
-- =====================================================

ALTER TABLE public.chat_channels ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.chat_channels ADD COLUMN IF NOT EXISTS campaign_id uuid REFERENCES public.campaigns(id) ON DELETE CASCADE;
ALTER TABLE public.chat_channels ADD COLUMN IF NOT EXISTS restricted boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_chat_channels_campaign_id ON public.chat_channels(campaign_id);

CREATE TABLE IF NOT EXISTS public.chat_channel_members (
  channel_id uuid NOT NULL REFERENCES public.chat_channels(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  added_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  added_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (channel_id, user_id)
);
ALTER TABLE public.chat_channel_members ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.can_manage_chat_channel(p_channel_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.chat_channels c
      WHERE c.id = p_channel_id AND c.created_by = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.chat_channels c
      JOIN public.campaign_managers cm ON cm.campaign_id = c.campaign_id
      WHERE c.id = p_channel_id AND cm.manager_id = auth.uid()
    );
$$;

CREATE OR REPLACE FUNCTION public.can_access_chat_channel(p_channel_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT p_channel_id IS NULL
    OR NOT EXISTS (SELECT 1 FROM public.chat_channels c WHERE c.id = p_channel_id AND c.restricted)
    OR public.can_manage_chat_channel(p_channel_id)
    OR EXISTS (
      SELECT 1 FROM public.chat_channel_members m
      WHERE m.channel_id = p_channel_id AND m.user_id = auth.uid()
    );
$$;

GRANT EXECUTE ON FUNCTION public.can_manage_chat_channel(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_chat_channel(uuid) TO authenticated;

-- chat_channels policies
DROP POLICY IF EXISTS "chat_channels_select_org" ON public.chat_channels;
CREATE POLICY "chat_channels_select_org" ON public.chat_channels
  FOR SELECT USING (
    (organization_id IS NULL OR organization_id IS NOT DISTINCT FROM public.my_org_id())
    AND public.can_access_chat_channel(id)
  );

DROP POLICY IF EXISTS "chat_channels_insert" ON public.chat_channels;
CREATE POLICY "chat_channels_insert" ON public.chat_channels
  FOR INSERT WITH CHECK (
    public.is_admin()
    OR (campaign_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.campaign_managers cm
      WHERE cm.campaign_id = chat_channels.campaign_id AND cm.manager_id = auth.uid()
    ))
  );

DROP POLICY IF EXISTS "chat_channels_update" ON public.chat_channels;
CREATE POLICY "chat_channels_update" ON public.chat_channels
  FOR UPDATE USING (public.can_manage_chat_channel(id));

DROP POLICY IF EXISTS "chat_channels_delete" ON public.chat_channels;
CREATE POLICY "chat_channels_delete" ON public.chat_channels
  FOR DELETE USING (public.is_admin() OR created_by = auth.uid());

-- chat_channel_members policies
DROP POLICY IF EXISTS "chat_channel_members_select" ON public.chat_channel_members;
CREATE POLICY "chat_channel_members_select" ON public.chat_channel_members
  FOR SELECT USING (public.can_access_chat_channel(channel_id));

DROP POLICY IF EXISTS "chat_channel_members_insert" ON public.chat_channel_members;
CREATE POLICY "chat_channel_members_insert" ON public.chat_channel_members
  FOR INSERT WITH CHECK (public.can_manage_chat_channel(channel_id));

DROP POLICY IF EXISTS "chat_channel_members_delete" ON public.chat_channel_members;
CREATE POLICY "chat_channel_members_delete" ON public.chat_channel_members
  FOR DELETE USING (public.can_manage_chat_channel(channel_id) OR user_id = auth.uid());

-- messages policies: kanaal-toegang bovenop de bestaande org-scope
DROP POLICY IF EXISTS "messages_select_org" ON public.messages;
CREATE POLICY "messages_select_org" ON public.messages
  FOR SELECT USING (
    user_id IN (
      SELECT id FROM public.profiles
      WHERE organization_id IS NOT DISTINCT FROM public.my_org_id()
    )
    AND public.can_access_chat_channel(channel_id)
  );

DROP POLICY IF EXISTS "messages_insert" ON public.messages;
CREATE POLICY "messages_insert" ON public.messages
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    AND public.can_access_chat_channel(channel_id)
  );

-- Trigger: maker wordt automatisch lid van zijn eigen kanaal
CREATE OR REPLACE FUNCTION public.add_channel_creator_as_member()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF NEW.created_by IS NOT NULL THEN
    INSERT INTO public.chat_channel_members (channel_id, user_id, added_by)
    VALUES (NEW.id, NEW.created_by, NEW.created_by)
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_add_channel_creator_as_member ON public.chat_channels;
CREATE TRIGGER trg_add_channel_creator_as_member
AFTER INSERT ON public.chat_channels
FOR EACH ROW EXECUTE FUNCTION public.add_channel_creator_as_member();
