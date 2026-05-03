-- SnapVault — Supabase Schema (EXACT per spec)
-- Run this in your Supabase SQL Editor

-- ── Rooms (temp share links) ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rooms (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token       TEXT UNIQUE NOT NULL,        -- e.g. "x9k2"
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  expires_at  TIMESTAMPTZ,                 -- nullable = no auto-expire
  view_once   BOOLEAN DEFAULT FALSE,       -- auto-revoke after first file received
  note        TEXT,                        -- optional purpose/note for the room
  is_active   BOOLEAN DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS rooms_token_idx ON rooms(token);

-- RLS: server uses service_role (bypasses RLS), so no owner constraint on rooms
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
-- No public read policy — all access via service_role on the backend


-- ── Uploads (all files — owner screenshots + guest uploads) ───────────────────
CREATE TABLE IF NOT EXISTS uploads (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id              UUID,              -- null if uploaded by guest
  room_id               UUID REFERENCES rooms(id) ON DELETE SET NULL,
  file_name             TEXT NOT NULL,     -- custom name set by uploader
  cloudinary_url        TEXT NOT NULL,
  cloudinary_public_id  TEXT,
  file_type             TEXT,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  expires_at            TIMESTAMPTZ        -- optional auto-delete
);

CREATE INDEX IF NOT EXISTS uploads_owner_idx   ON uploads(owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS uploads_room_idx    ON uploads(room_id, created_at ASC);

-- RLS: backend uses service_role for all writes; owner reads their own via JWT
ALTER TABLE uploads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner reads own uploads" ON uploads
  FOR SELECT USING (auth.uid() = owner_id);

-- Note: All writes happen via service_role key (server-side), bypassing RLS


-- ── Messages (two-way chat per room) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id     UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  sender      TEXT NOT NULL,       -- 'guest' or 'owner'
  type        TEXT NOT NULL,       -- 'text' | 'image' | 'file'
  content     TEXT,                -- text message content
  file_url    TEXT,                -- Cloudinary URL
  file_name   TEXT,
  file_size   BIGINT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS messages_room_idx ON messages(room_id, created_at ASC);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
-- All read/write via service_role key on backend, bypassing RLS
