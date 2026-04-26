-- Run this in your Supabase SQL editor to set up Friday's database

-- Memory table (persistent notes and facts)
CREATE TABLE IF NOT EXISTS friday_memory (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'freddy',
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, key)
);

-- Conversation history table
CREATE TABLE IF NOT EXISTS friday_history (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'freddy',
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for speed
CREATE INDEX IF NOT EXISTS idx_memory_user ON friday_memory(user_id);
CREATE INDEX IF NOT EXISTS idx_history_user ON friday_history(user_id, created_at);
