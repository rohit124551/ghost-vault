alter table public.messages add column if not exists delivered_at timestamptz;
alter table public.messages add column if not exists seen_at timestamptz;

ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS is_thread_reply boolean NOT NULL DEFAULT false;
