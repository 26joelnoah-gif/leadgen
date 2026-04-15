-- =====================================================
-- MIGRATION V8: Soft Delete for Lead Lists & Recycle Bin
-- =====================================================

-- 1. Add deleted_at to lead_lists
ALTER TABLE public.lead_lists ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- 2. Add Index for performance
CREATE INDEX IF NOT EXISTS idx_lead_lists_deleted_at ON public.lead_lists(deleted_at);

-- 3. Update visibility policy for Lead Lists (respect soft delete)
DROP POLICY IF EXISTS "Lead lists visibility" ON public.lead_lists;
CREATE POLICY "Lead lists visibility" ON public.lead_lists 
    FOR SELECT 
    USING (
        (deleted_at IS NULL OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
    );

-- 4. Comment for clarity
COMMENT ON COLUMN public.lead_lists.deleted_at IS 'Timestamp for soft deletion. If null, the list is active.';
