-- Apply in Supabase SQL Editor to enable Personal Saved Notes & Public Tunnels.
-- Preserves all existing rooms as 'shared'; default for new rooms is 'shared'.
BEGIN;
ALTER TABLE public.rooms ADD COLUMN IF NOT EXISTS visibility TEXT;
UPDATE public.rooms SET visibility = 'shared' WHERE visibility IS NULL;
ALTER TABLE public.rooms ALTER COLUMN visibility SET DEFAULT 'shared';
ALTER TABLE public.rooms ALTER COLUMN visibility SET NOT NULL;
ALTER TABLE public.rooms DROP CONSTRAINT IF EXISTS rooms_visibility_check;
ALTER TABLE public.rooms ADD CONSTRAINT rooms_visibility_check
  CHECK (visibility IN ('personal', 'shared'));
COMMIT;
