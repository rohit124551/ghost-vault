-- ============================================================================
-- Migration: Universal Ingestion Gateway & Dedicated API Scope
-- Run this in Supabase SQL Editor → New Query → Run
-- ============================================================================

-- 1. Add discord_webhook_url column to rooms table if not present
ALTER TABLE public.rooms ADD COLUMN IF NOT EXISTS discord_webhook_url TEXT;

-- 2. Add allowed_origins column for per-project CORS domain whitelisting
ALTER TABLE public.rooms ADD COLUMN IF NOT EXISTS allowed_origins TEXT;

-- 3. Update visibility check to allow 'api' projects alongside 'personal' and 'shared'
ALTER TABLE public.rooms DROP CONSTRAINT IF EXISTS rooms_visibility_check;
ALTER TABLE public.rooms ADD CONSTRAINT rooms_visibility_check CHECK (visibility IN ('personal', 'shared', 'api'));

-- 4. Comments for documentation
COMMENT ON COLUMN public.rooms.discord_webhook_url IS 'Optional Discord webhook URL for forwarding ingested payloads';
COMMENT ON COLUMN public.rooms.allowed_origins IS 'Comma-separated list of allowed web origins for CORS domain whitelisting';
COMMENT ON COLUMN public.rooms.visibility IS 'Access scope: personal (scratchpad), shared (public tunnel), api (developer webhook inbox)';
